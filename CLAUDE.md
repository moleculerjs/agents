# @moleculer/agents — AI Agent Capabilities for Moleculer

## What is this project?

An npm package that adds AI agent capabilities to the [Moleculer](https://moleculer.services) microservices framework. It leverages the structural similarity between Moleculer action definitions and LLM tool definitions to enable automatic conversion — any Moleculer service can become an AI agent with minimal code.

**Target Moleculer version:** `0.15.0-beta` (latest beta)

**Core insight:** A Moleculer action's `params` definition is structurally identical to an LLM tool definition. Adding a `description` field to an action is enough to make it available as an AI tool.

```typescript
// Moleculer action — already exists in any Moleculer service
actions: {
  getWeather: {
    description: "Get current weather for a city",
    params: {
      city: { type: "string", description: "City name" }
    },
    async handler(ctx) { /* ... */ }
  }
}

// This can be automatically converted to an LLM tool schema
```

## What Moleculer already provides (no new code needed)

- **Agent discovery** — Service Registry knows which services are alive and what they can do
- **Capability routing** — `broker.call("agent.run", task)` with built-in load balancing
- **Event-driven coordination** — Native pub/sub events
- **Fault tolerance** — Circuit breaker, retry, timeout at action level
- **Scaling** — Multiple instances → automatic load balancing
- **Observability** — Distributed tracing (Jaeger/Zipkin) + Prometheus metrics
- **Transporters** — NATS, Redis, Kafka for inter-node communication
- **Settings replication** — Service settings (including agent config) are replicated to all nodes via the registry

## Architecture

```
Clients (REST / Discord / CLI)
        │
        ▼
  Moleculer Broker
        │
  ┌─────┴──────────────────────────────┐
  │                                    │
  ▼                                    ▼
trip-planner (Orchestrator)       llm.openai
  │  OrchestratorMixin             LLMAdapter
  │  AgentMixin                        │
  │                                    │
  ├──► weather-agent ◄─────────────────┤
  │    AgentMixin                      │
  │    getCurrent / getForecast ───────┤
  │                                    │
  ├──► hotel-agent ◄───────────────────┤
  │    AgentMixin                      │
  │    search / details ───────────────┤
  │                                    │
  └──► transport-agent ◄──────────────┘
       AgentMixin
       routes / prices

  Every agent is an independent Moleculer service.
  The broker handles discovery, load balancing, fault tolerance.
```

## Components to build

### 1. `AgentMixin` — The core (service → agent conversion)

A Moleculer mixin that turns any service into an AI agent. It:

- Scans the service's own actions for ones with a `description` field
- Keeps these schemas in **native fastest-validator format** (does NOT convert to JSON Schema — that's the adapter's job)
- Adds two meta-actions: `run` (one-shot task) and `chat` (multi-turn conversation)
- Implements a ReAct loop that calls the LLM, executes tool calls, and repeats until done

**Key design decisions:**
- The `run` action takes `{ task: string, sessionId?: string }` — one-shot execution
- The `chat` action takes `{ message: string, sessionId: string }` — multi-turn conversation
- Both use the same internal `runReActLoop()` method — the difference is semantic (DX clarity)
- Default no-op `loadHistory()` and `saveHistory()` methods — returns `[]` and does nothing. The MemoryMixin overrides these with real implementations. This means AgentMixin works standalone for stateless agents.
- Default no-op `compactConversation(history)` method — returns history unchanged. Can be overridden by a compaction mixin.
- **Tool call security:** Before executing a tool call from the LLM, validate that `toolCall.function.name` exists in the generated tool schemas whitelist. The broker call uses `this.name` as prefix (`${this.name}.${toolCall.function.name}`) so agents can only call their own actions.

**Supported param types (strict subset):**
Only these fastest-validator types are supported for tool schemas. Actions using other types will have those params excluded from the tool schema with a warning log.

| fastest-validator type | Notes |
|---|---|
| `string` | Basic string |
| `number` | Integer or float |
| `boolean` | True/false |
| `object` | With nested `properties` or `props` |
| `array` | With `items` definition |
| `enum` | List of allowed values |
| `email` | Mapped to string (hint for LLM) |
| `url` | Mapped to string (hint for LLM) |
| `date` | Mapped to string (hint for LLM) |
| `uuid` | Mapped to string (hint for LLM) |

The `description` field on both actions and individual params is critical — it's what the LLM uses to understand the tool. Actions without `description` are excluded from tool schemas entirely.

### 2. LLM Adapters — Provider abstraction

LLM providers are implemented as **adapters** (not separate services). Following the Moleculer adapter pattern (see `@moleculer/channels`, `@moleculer/workflows`):

- Abstract base adapter class with methods: `chat(messages, tools)`, `convertToolSchema(moleculerSchema)`, etc.
- Each provider adapter handles:
  1. Converting fastest-validator schemas to the provider's tool format
  2. Making the API call
  3. Converting the response back to **OpenAI format** (the internal standard)
- Provider SDK packages are **devDependencies** — dynamically imported in `init()`, with `broker.fatal()` if missing

**Internal response format (OpenAI standard):**
All adapters must return responses normalized to OpenAI's format:
```typescript
interface LLMResponse {
  content: string | null;
  finish_reason: "stop" | "tool_calls";
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: {
      name: string;
      arguments: string;  // JSON string
    };
  }>;
}
```

**Adapters to implement:**
- `OpenAIAdapter` — For OpenAI API (also works with OpenRouter, Together, Groq, Fireworks, and any OpenAI-compatible API)
- `AnthropicAdapter` — For Anthropic Claude API (needs schema + response conversion)
- `FakeAdapter` — For testing: returns predefined responses, simulates tool calls

**Adapter registry pattern:**
```typescript
// src/adapters/index.ts
import BaseAdapter from "./base.ts";
import OpenAIAdapter from "./openai.ts";
import AnthropicAdapter from "./anthropic.ts";
import FakeAdapter from "./fake.ts";

const Adapters = {
  Base: BaseAdapter,
  OpenAI: OpenAIAdapter,
  Anthropic: AnthropicAdapter,
  Fake: FakeAdapter
};

function resolve(opt?: string | object): BaseAdapter { /* ... */ }
function register(name: string, value: typeof BaseAdapter) { Adapters[name] = value; }
export default Object.assign(Adapters, { resolve, register });
```

### 3. `MemoryMixin` — Conversation history

Stores conversation history using Moleculer's built-in cacher (Redis recommended for distributed environments).

- `loadHistory(sessionId)` — Returns message array from cache, or `[]`
- `saveHistory(sessionId, history)` — Saves to cache with TTL
- Cache key format: `agent:history:{serviceName}:{sessionId}`
- Default TTL: 1 hour (configurable via `settings.agent.historyTtl`)

### 4. Context Window Compaction

The `compactConversation(history)` method is called before each LLM call when history exceeds a threshold. **This must be in the MVP** — without it, long conversations crash with context overflow.

**Default strategy:** Sliding window — keep the system message + last N messages (configurable via `settings.agent.maxHistoryMessages`, default: 50).

**Extensible:** Developers can override `compactConversation()` with a custom mixin for smarter strategies (LLM summarization, token counting, etc.). We may provide additional compaction mixins in the future.

### 5. `OrchestratorMixin` — Multi-agent coordination (NOT in Phase 1)

Enables a service to discover and delegate tasks to other agent services.

**`discoverAgents()` method:**
- Queries the Moleculer service registry for services with `settings.agent` defined
- Works across distributed nodes (settings are replicated via registry)
- Returns: `[{ name, description, actions }]`

**Routing strategies:**
- `strategy: "direct"` — Developer explicitly calls `this.delegateTo("agent-name", task)`. Zero overhead.
- `strategy: "llm-router"` — LLM decides which agent to use. Opt-in.

### 6. `LLMService` — Service wrapper for LLM adapters

A standard Moleculer service mixin that wraps an LLM adapter and exposes it as broker-callable actions:

```typescript
// Usage: the developer creates a service like this
import { LLMService } from "@moleculer/agents";

export default {
  name: "llm.openai",
  mixins: [LLMService()],
  settings: {
    adapter: "OpenAI",  // or new OpenAIAdapter({...})
    apiKey: process.env.OPENAI_API_KEY,
    model: "gpt-4o"
  }
};
```

The `LLMService` mixin exposes:
- `chat` action — Takes `{ messages, tools?, toolSchemas? }`, delegates to adapter
- The adapter handles schema conversion and response normalization

**Agent → LLM connection:** The `AgentMixin` calls the LLM via `broker.call(\`${this.settings.agent.llm}.chat\`, { messages, toolSchemas })`. The `toolSchemas` contain the native fastest-validator schemas; the LLM service's adapter converts them.

## Full example — Weather agent service

```typescript
import { AgentMixin, MemoryMixin } from "@moleculer/agents";

export default {
  name: "weather-agent",
  mixins: [AgentMixin(), MemoryMixin()],

  settings: {
    agent: {
      description: "Weather assistant — current weather and forecasts",
      instructions: "Help users with weather questions. Be concise and friendly.",
      llm: "llm.openai",       // Name of the LLM service to use
      memory: true,
      maxIterations: 10,
      historyTtl: 1800,         // 30 min
      maxHistoryMessages: 50    // Sliding window size
    }
  },

  actions: {
    // "run" and "chat" are automatically added by AgentMixin

    getCurrent: {
      description: "Get current weather for a city",
      params: {
        city: { type: "string", description: "City name" }
      },
      async handler(ctx) {
        const data = await fetchWeatherAPI(ctx.params.city);
        return { temp: data.temp, condition: data.condition, city: ctx.params.city };
      }
    },

    getForecast: {
      description: "Multi-day weather forecast",
      params: {
        city: { type: "string", description: "City name" },
        days: { type: "number", default: 5, description: "Number of days (1-7)" }
      },
      async handler(ctx) {
        return await fetchForecastAPI(ctx.params.city, ctx.params.days);
      }
    }
  }
};
```

## Project structure

```
src/
  index.ts              # Public API exports: { AgentMixin, MemoryMixin, LLMService, Adapters }
  types.ts              # Shared interfaces and types (LLMResponse, AgentSettings, etc.)
  agent.mixin.ts        # AgentMixin — ReAct loop, tool schema extraction, run/chat actions
  memory.mixin.ts       # MemoryMixin — conversation history via Moleculer cacher
  llm.service.ts        # LLMService mixin — wraps adapter as Moleculer service
  schema-converter.ts   # fastest-validator params → JSON Schema converter
  adapters/
    index.ts            # Adapter registry (resolve, register)
    base.ts             # BaseAdapter — abstract class, defines interface
    openai.ts           # OpenAIAdapter — OpenAI API + compatible providers
    anthropic.ts        # AnthropicAdapter — Anthropic Claude API
    fake.ts             # FakeAdapter — deterministic responses for testing
test/
  unit/
    agent.mixin.spec.ts
    memory.mixin.spec.ts
    schema-converter.spec.ts
    adapters/
      openai.spec.ts
      anthropic.spec.ts
      fake.spec.ts
  integration/
    agent-flow.test.ts     # Full agent flow with FakeAdapter
```

## Coding conventions

These are mandatory — all code MUST follow these conventions exactly. The project follows the same patterns as `moleculerjs/workflows`.

### Language & Module System
- **TypeScript** — all source files are `.ts`
- **ES Modules** — use `import`/`export`, NOT `require`/`module.exports`
- **Explicit `.ts` extensions in imports**: `import Foo from "./foo.ts"` (required for ESM + node16 module resolution)
- **Type-only imports** where applicable: `import type { Foo } from "./types.ts"`
- **Dual build output**: CJS + ESM + type declarations (handled by tsconfig)
- **`strict: false`** in tsconfig (matching Moleculer convention)

### Formatting (enforced by Prettier)
- **Tabs** for indentation (tab width: 4 spaces visual)
- **Double quotes** for strings (`"hello"`, not `'hello'`)
- **Semicolons** required at end of every statement
- **Max line width:** 100 characters
- **No trailing commas** in arrays/objects
- **Bracket spacing:** `{ key: value }` (spaces inside braces)
- **Arrow functions:** No parens for single param: `x => x` (not `(x) => x`)

### Naming
- `camelCase` for variables and functions: `getAdapter()`, `toolSchemas`
- `PascalCase` for classes and interfaces/types: `BaseAdapter`, `OpenAIAdapter`, `LLMResponse`
- `UPPER_CASE` for constants: `DEFAULT_MAX_ITERATIONS`
- Private methods: underscore prefix: `_connect()`, `_validateToolCall()`

### File headers
Every source file must start with:
```typescript
/*
 * @moleculer/agents
 * Copyright (c) 2026 MoleculerJS (https://github.com/moleculerjs/agents)
 * MIT Licensed
 */
```

### Utility library
- Use `lodash` for utility functions (`_.defaultsDeep`, `_.isString`, `_.isObject`, etc.)
- Import as: `import _ from "lodash";`

### Types & Interfaces
Define all shared types in `src/types.ts`:
```typescript
export interface LLMResponse {
  content: string | null;
  finish_reason: "stop" | "tool_calls";
  tool_calls?: ToolCall[];
}

export interface ToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export interface AgentSettings {
  description: string;
  instructions?: string;
  llm: string;
  memory?: boolean;
  maxIterations?: number;
  historyTtl?: number;
  maxHistoryMessages?: number;
  strategy?: "direct" | "llm-router";
}

export interface ToolSchema {
  name: string;
  description: string;
  params: Record<string, unknown>;  // fastest-validator format
}
```

### Mixin pattern
Moleculer mixins in this project are **factory functions** that return a schema object:
```typescript
import _ from "lodash";

export default function AgentMixin(mixinOpts?: AgentMixinOptions) {
  mixinOpts = _.defaultsDeep(mixinOpts, {
    // defaults
  });

  const schema = {
    settings: { /* ... */ },
    actions: { /* ... */ },
    methods: { /* ... */ },
    created() { /* ... */ },
    async started() { /* ... */ }
  };

  return schema;
}
```

### Abstract adapter class pattern
```typescript
export default abstract class BaseAdapter {
  opts: Record<string, unknown>;
  service?: unknown;
  broker?: unknown;
  logger?: unknown;

  constructor(opts?: Record<string, unknown>) {
    this.opts = opts || {};
  }

  init(service: unknown) {
    this.service = service;
    // ...
  }

  abstract chat(messages: unknown[], tools?: unknown[]): Promise<LLMResponse>;
  abstract convertToolSchema(name: string, description: string, params: unknown): unknown;
}
```

### Concrete adapter pattern (lazy-loading SDK)
```typescript
let OpenAI: unknown;

export default class OpenAIAdapter extends BaseAdapter {
  constructor(opts?: OpenAIAdapterOptions) {
    super(opts);
  }

  init(service: unknown) {
    super.init(service);
    try {
      OpenAI = require("openai");  // Dynamic require for lazy-loading
    } catch (err) {
      (this as any).broker.fatal(
        "The 'openai' package is missing! Please install it with 'npm install openai --save' command.",
        err,
        true
      );
    }
  }
}
```

**Note on lazy-loading:** Even though the project uses ES modules, SDK lazy-loading uses `require()` (via `createRequire` from `node:module`) because dynamic `import()` is async and can't be used in synchronous `init()`. Follow the exact pattern from `moleculerjs/workflows`.

### Testing
- **Vitest** test framework (NOT Jest)
- Unit tests: `test/unit/*.spec.ts`
- Integration tests: `test/integration/*.test.ts`
- Use `ServiceBroker` with `{ logger: false }` in tests
- Use `FakeAdapter` for tests — never call real LLM APIs in tests
- Test pattern:
```typescript
import { describe, expect, it } from "vitest";
import { ServiceBroker } from "moleculer";

describe("Test AgentMixin", () => {
  it("should generate tool schemas from actions", () => {
    // ...
    expect(result).toEqual(expected);
  });
});
```

### Error handling
- Use `broker.fatal()` for missing dependencies (with install instructions)
- Use Moleculer's built-in error classes where appropriate
- Throw `new Error("Max iterations reached")` when ReAct loop exceeds limit

### Logging
```typescript
this.logger.debug("Tool schemas generated", { count: schemas.length });
this.logger.info("Agent started", { name: this.name });
this.logger.warn("Unsupported param type", { type, action: actionName });
this.logger.error("LLM call failed", err);
```

## Development

```bash
# Install dependencies
npm install

# Type check (no emit)
npm run check

# Run all tests
npm test

# Run unit tests only
npm run test:unit

# Run integration tests only
npm run test:integration

# Build (CJS + ESM + types)
npm run build

# Lint
npm run lint
```

## Streaming

**NOT in MVP scope.** The client waits for the full ReAct loop to complete. If a call takes too long, increase the Moleculer action timeout:
```typescript
actions: {
  run: {
    timeout: 120000,  // 2 minutes
    // ...
  }
}
```

Streaming will be added in a future phase.

## What is NOT in scope

- **OrchestratorMixin** — Phase 2
- **MCP protocol support** — Handled by a separate package
- **Vector store / long-term memory** — Future phase
- **Agent monitoring dashboard** — Future phase
- **Durable execution (Bull/BullMQ)** — Future phase
