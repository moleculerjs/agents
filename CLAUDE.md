# @moleculer/agents — AI Agent Capabilities for Moleculer

## What is this project?

An npm package that adds AI agent capabilities to the [Moleculer](https://moleculer.services) microservices framework. It leverages the structural similarity between Moleculer action definitions and LLM tool definitions to enable automatic conversion — any Moleculer service can become an AI agent with minimal code.

**Core insight:** A Moleculer action's `params` definition is structurally identical to an LLM tool definition. Adding a `description` field to an action is enough to make it available as an AI tool.

```javascript
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

LLM providers are implemented as **adapters** (not separate services). Following the Moleculer adapter pattern (see `@moleculer/channels`, `@moleculer/database`):

- Base adapter class with abstract methods: `chat(messages, tools)`, `convertToolSchema(moleculerSchema)`, etc.
- Each provider adapter handles:
  1. Converting fastest-validator schemas to the provider's tool format
  2. Making the API call
  3. Converting the response back to **OpenAI format** (the internal standard)
- Provider SDK packages are **devDependencies** — lazy-loaded with `require()` in `init()`, with `broker.fatal()` if missing

**Internal response format (OpenAI standard):**
All adapters must return responses normalized to OpenAI's format:
```javascript
{
  content: "text response" | null,
  finish_reason: "stop" | "tool_calls",
  tool_calls: [
    {
      id: "call_xxx",
      type: "function",
      function: {
        name: "actionName",
        arguments: '{"param": "value"}'  // JSON string
      }
    }
  ]
}
```

**Adapters to implement:**
- `OpenAIAdapter` — For OpenAI API (also works with OpenRouter, Together, Groq, Fireworks, and any OpenAI-compatible API)
- `AnthropicAdapter` — For Anthropic Claude API (needs schema + response conversion)
- `FakeAdapter` — For testing: returns predefined responses, simulates tool calls

**Adapter registry pattern:**
```javascript
// src/adapters/index.js
const Adapters = {
  Base: require("./base"),
  OpenAI: require("./openai"),
  Anthropic: require("./anthropic"),
  Fake: require("./fake")
};

function resolve(opt) { /* ... */ }
function register(name, value) { Adapters[name] = value; }
module.exports = Object.assign(Adapters, { resolve, register });
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

### 5. `OrchestratorMixin` — Multi-agent coordination

Enables a service to discover and delegate tasks to other agent services.

**`discoverAgents()` method:**
- Queries the Moleculer service registry for services with `settings.agent` defined
- Works across distributed nodes (settings are replicated via registry)
- Returns: `[{ name, description, actions }]`

**Routing strategies:**
- `strategy: "direct"` — Developer explicitly calls `this.delegateTo("agent-name", task)`. Zero overhead, works for most use cases where the orchestrator knows which sub-agent to call.
- `strategy: "llm-router"` — Sends the task + available agents list to the LLM, which decides which agent to use. More flexible but costs an extra LLM call. Opt-in.

**`delegateTo(agentName, task, sessionId)` method:**
- Calls `broker.call(\`${agentName}.run\`, { task, sessionId })`

### 6. `LLMService` — Service wrapper for LLM adapters

A standard Moleculer service that wraps an LLM adapter and exposes it as broker-callable actions:

```javascript
// Usage: the developer creates a service like this
module.exports = {
  name: "llm.openai",
  mixins: [LLMService],
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

```javascript
const { AgentMixin, MemoryMixin } = require("@moleculer/agents");

module.exports = {
  name: "weather-agent",
  mixins: [AgentMixin, MemoryMixin],

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

## Full example — Orchestrator service

```javascript
const { AgentMixin, MemoryMixin, OrchestratorMixin } = require("@moleculer/agents");

module.exports = {
  name: "trip-planner",
  mixins: [AgentMixin, MemoryMixin, OrchestratorMixin],

  settings: {
    agent: {
      description: "Trip planner — coordinates weather, hotel, and transport agents",
      instructions: `You are a trip planning orchestrator.
        Coordinate specialized agents (weather-agent, hotel-agent, transport-agent)
        to create comprehensive travel plans.`,
      llm: "llm.openai",
      strategy: "direct"       // Explicit agent delegation (no extra LLM call)
    }
  },

  actions: {
    planTrip: {
      description: "Create a complete travel plan",
      params: {
        destination: { type: "string", description: "Travel destination" },
        startDate: { type: "string", description: "Start date (YYYY-MM-DD)" },
        days: { type: "number", description: "Number of days" }
      },
      async handler(ctx) {
        const { destination, startDate, days } = ctx.params;

        // Call sub-agents in parallel
        const [weather, hotels, transport] = await Promise.all([
          this.delegateTo("weather-agent",
            `Weather in ${destination} from ${startDate} for ${days} days`),
          this.delegateTo("hotel-agent",
            `Hotels in ${destination} from ${startDate} for ${days} nights`),
          this.delegateTo("transport-agent",
            `Transport options to ${destination}`)
        ]);

        // Synthesize results
        return await this.runReActLoop(
          `Synthesize these results into a single travel plan:\n\n` +
          `Weather: ${weather}\nHotel: ${hotels}\nTransport: ${transport}`
        );
      }
    }
  }
};
```

## Project structure

```
src/
  index.js              # Public API exports: { AgentMixin, MemoryMixin, OrchestratorMixin, LLMService, Adapters }
  agent.mixin.js         # AgentMixin — ReAct loop, tool schema extraction, run/chat actions
  memory.mixin.js        # MemoryMixin — conversation history via Moleculer cacher
  orchestrator.mixin.js  # OrchestratorMixin — agent discovery + delegation
  llm.service.js         # LLMService mixin — wraps adapter as Moleculer service
  schema-converter.js    # fastest-validator params → provider-neutral intermediate format
  adapters/
    index.js             # Adapter registry (resolve, register)
    base.js              # BaseAdapter — abstract class, defines interface
    openai.js            # OpenAIAdapter — OpenAI API + compatible providers
    anthropic.js         # AnthropicAdapter — Anthropic Claude API
    fake.js              # FakeAdapter — deterministic responses for testing
test/
  unit/
    agent.mixin.spec.js
    memory.mixin.spec.js
    orchestrator.mixin.spec.js
    schema-converter.spec.js
    adapters/
      openai.spec.js
      anthropic.spec.js
      fake.spec.js
  integration/
    weather-agent.test.js    # Full agent flow with FakeAdapter
    orchestrator.test.js     # Multi-agent orchestration test
```

## Coding conventions (Moleculer standard)

These are mandatory — all code MUST follow these conventions exactly:

### Formatting
- **Tabs** for indentation (tab width: 4 spaces visual)
- **Double quotes** for strings (`"use strict"`, not `'use strict'`)
- **Semicolons** required at end of every statement
- **Max line width:** 100 characters
- **No trailing commas** in arrays/objects
- **Bracket spacing:** `{ key: value }` (spaces inside braces)
- **Arrow functions:** No parens for single param: `x => x` (not `(x) => x`)

### Naming
- `camelCase` for variables and functions: `getAdapter()`, `toolSchemas`
- `PascalCase` for classes: `BaseAdapter`, `OpenAIAdapter`
- `UPPER_CASE` for constants: `DEFAULT_MAX_ITERATIONS`
- Private methods: underscore prefix: `_connect()`, `_validateToolCall()`

### File headers
Every source file must start with:
```javascript
/*
 * @moleculer/agents
 * Copyright (c) 2026 MoleculerJS (https://github.com/moleculerjs/agents)
 * MIT Licensed
 */

"use strict";
```

### Module system
- **CommonJS** (`require` / `module.exports`), NOT ES modules
- Use `lodash` for utility functions (`_.defaultsDeep`, `_.isString`, `_.isObject`, etc.)

### JSDoc
Add JSDoc comments to all public methods:
```javascript
/**
 * Execute the ReAct loop for a given task.
 *
 * @param {String} task - The task description
 * @param {String} [sessionId] - Optional session ID for conversation history
 * @returns {Promise<String>} The agent's final response
 */
async runReActLoop(task, sessionId) { /* ... */ }
```

### Mixin pattern
Moleculer mixins are **factory functions** that return a schema object:
```javascript
module.exports = function AgentMixin(mixinOpts) {
  mixinOpts = _.defaultsDeep(mixinOpts, {
    // defaults
  });

  return {
    settings: { /* ... */ },
    actions: { /* ... */ },
    methods: { /* ... */ },
    created() { /* ... */ },
    async started() { /* ... */ }
  };
};
```

### Adapter pattern
Adapters extend a base class:
```javascript
class OpenAIAdapter extends BaseAdapter {
  constructor(opts) {
    super(opts);
  }

  init(service) {
    super.init(service);
    try {
      OpenAI = require("openai");
    } catch (err) {
      this.broker.fatal(
        "The 'openai' package is missing! Please install it with 'npm install openai --save' command.",
        err,
        true
      );
    }
  }
}
```

### Testing
- **Jest** test framework
- Unit tests: `test/unit/*.spec.js`
- Integration tests: `test/integration/*.test.js`
- Use `ServiceBroker` with `{ logger: false }` in tests
- Use `FakeAdapter` for tests — never call real LLM APIs in tests
- Test naming: `describe("Test AgentMixin", () => { it("should ...", ...) })`

### Error handling
- Use `broker.fatal()` for missing dependencies (with install instructions)
- Use Moleculer's built-in error classes where appropriate
- Throw `Error("Max iterations reached")` when ReAct loop exceeds limit

### Logging
```javascript
this.logger.debug("Tool schemas generated", { count: schemas.length });
this.logger.info("Agent started", { name: this.name });
this.logger.warn("Unsupported param type", { type, action: actionName });
this.logger.error("LLM call failed", err);
```

## Development

```bash
# Install dependencies
npm install

# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Lint
npm run lint
```

## Streaming

**NOT in MVP scope.** The client waits for the full ReAct loop to complete. If a call takes too long, increase the Moleculer action timeout:
```javascript
actions: {
  run: {
    timeout: 120000,  // 2 minutes
    // ...
  }
}
```

Streaming will be added in a future phase.

## What is NOT in scope

- **MCP protocol support** — Handled by a separate package
- **Vector store / long-term memory** — Future phase
- **Agent monitoring dashboard** — Future phase
- **Durable execution (Bull/BullMQ)** — Future phase
