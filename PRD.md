# PRD: @moleculer/agents — Phase 1 (Core)

## 1. Overview
- **Goal:** Add AI agent capabilities to the Moleculer microservices framework. The package allows any Moleculer service to function as an AI agent with minimal code.
- **Scope:** Phase 1 — core components: schema converter, LLM adapters (OpenAI, Anthropic, Fake), LLMService mixin, AgentMixin (ReAct loop), MemoryMixin (conversation history + compaction)
- **NOT in scope:** OrchestratorMixin (Phase 2), streaming, durable execution, MCP, vector store
- **Architecture:** Single npm package (`@moleculer/agents`), TypeScript source, dual build (CJS + ESM + type declarations), Moleculer mixins and adapters
- **Moleculer version:** `0.15.0-beta` (latest beta)

## 2. Existing system
- Empty repo, no existing code (greenfield)
- package.json, tsconfig files, eslint/prettier/vitest config and CLAUDE.md already exist
- CLAUDE.md contains the full specification and coding conventions — **MUST be read before starting work!**

## 3. Database schema
N/A — no database, conversation history is stored in Moleculer cacher (Redis).

## 4. API contracts
No REST API. The package exports Moleculer actions via mixins.

### Actions added by AgentMixin:

**`run` action:**
```typescript
params: {
  task: { type: "string" },          // Task description
  sessionId: { type: "string", optional: true }  // Optional session for history
}
// Returns: string — the agent's final response
```

**`chat` action:**
```typescript
params: {
  message: { type: "string" },       // The user's message
  sessionId: { type: "string" }      // Required session ID
}
// Returns: string — the agent's response
```

### Actions added by LLMService:

**`chat` action:**
```typescript
params: {
  messages: { type: "array" },       // OpenAI format messages
  tools: { type: "array", optional: true },      // Converted tool schemas (provider format)
  toolSchemas: { type: "array", optional: true }  // Raw fastest-validator schemas (adapter converts)
}
// Returns: LLMResponse — { content, finish_reason, tool_calls } OpenAI format (internal standard)
```

## 5. File structure
```
src/
  index.ts              # Main export: { AgentMixin, MemoryMixin, LLMService, Adapters }
  types.ts              # Shared interfaces (LLMResponse, AgentSettings, ToolSchema, ToolCall, etc.)
  agent.mixin.ts        # AgentMixin factory function
  memory.mixin.ts       # MemoryMixin factory function
  llm.service.ts        # LLMService mixin factory function
  schema-converter.ts   # fastest-validator → JSON Schema converter
  adapters/
    index.ts            # Registry: resolve(), register(), adapter dict
    base.ts             # BaseAdapter abstract class
    openai.ts           # OpenAIAdapter (OpenAI + compatible APIs)
    anthropic.ts        # AnthropicAdapter (Anthropic Claude API)
    fake.ts             # FakeAdapter (for testing)
test/
  unit/
    schema-converter.spec.ts
    agent.mixin.spec.ts
    memory.mixin.spec.ts
    adapters/
      openai.spec.ts
      anthropic.spec.ts
      fake.spec.ts
  integration/
    agent-flow.test.ts     # Full agent flow with FakeAdapter
```

## 6. Naming conventions
- **Language:** TypeScript (`.ts` files everywhere)
- **Module system:** ES Modules (`import`/`export`), NOT CommonJS
- **Import style:** Explicit `.ts` extension: `import Foo from "./foo.ts"`
- **Type-only import:** `import type { Foo } from "./types.ts"`
- **Variables/methods:** camelCase (`runReActLoop`, `toolSchemas`, `loadHistory`)
- **Classes/Interfaces:** PascalCase (`BaseAdapter`, `OpenAIAdapter`, `LLMResponse`)
- **Constants:** UPPER_CASE (`DEFAULT_MAX_ITERATIONS`)
- **Filenames:** dot-case (`agent.mixin.ts`, `schema-converter.ts`)
- **Private methods:** underscore prefix (`_validateToolCall`)
- **Strings:** Double quotes (`"hello"`)
- **Indentation:** Tabs (4 space visual width)
- **Line endings:** Semicolons required
- **Max line length:** 100 characters
- **Trailing comma:** NONE
- **Arrow function:** Single param no paren: `x => x`

## 7. Environment variables
N/A at package level. The developer provides API keys in their own service settings.

## 8. Dependencies

**Runtime (dependencies):**
- `lodash` — utility functions

**Dev only (devDependencies):**
- `openai` — ^4.0.0 (OpenAI SDK, lazy-loaded)
- `@anthropic-ai/sdk` — ^0.30.0 (Anthropic SDK, lazy-loaded)
- `moleculer` — ^0.15.0-beta (peer dep, for testing)
- `typescript` — ^5.9.3
- `vitest` — ^4.0.18 (test framework)
- `@vitest/coverage-v8` — ^4.0.18
- `eslint` — ^9.39.2

**Peer dependencies:**
- `moleculer` — ^0.15.0-beta

## 9. Testing plan

**Test framework:** Vitest (NOT Jest!)
**Run:** `npm test`
**Test files:** TypeScript (`.spec.ts` / `.test.ts`)

**IMPORTANT:** All tests use `FakeAdapter` — NEVER call a real LLM API in tests!

### Unit tests (test/unit/)

**schema-converter.spec.ts:**
- String, number, boolean type param conversion
- Object with nested properties
- Array with items
- Enum conversion
- Email, url, date, uuid → string + format
- Unknown type ignored (warning log)
- Description field passthrough
- Optional/required handling (fastest-validator: default required, JSON Schema: default optional)

**agent.mixin.spec.ts:**
- Tool schema generation from service actions (only those with description)
- `run` action creation
- `chat` action creation
- ReAct loop: stops on LLM "stop" response
- ReAct loop: tool call execution and continuation
- ReAct loop: max iterations limit
- Tool call security: unknown tool rejection
- Default no-op `loadHistory` and `saveHistory`

**memory.mixin.spec.ts:**
- `loadHistory` returns `[]` for empty session
- `saveHistory` + `loadHistory` round-trip
- TTL configuration
- `compactConversation` default sliding window

**adapters/*.spec.ts:**
- OpenAI: fastest-validator schema → OpenAI function calling schema conversion
- OpenAI: response pass-through (already in OpenAI format)
- Anthropic: fastest-validator schema → Anthropic tool schema conversion
- Anthropic: Anthropic response → OpenAI format conversion
- Fake: returns predefined responses
- Fake: tool call simulation

### Integration tests (test/integration/)

**agent-flow.test.ts:**
- Full agent lifecycle with FakeAdapter:
  1. ServiceBroker creation
  2. LLM service (with FakeAdapter)
  3. Agent service (AgentMixin + MemoryMixin)
  4. `agent.run` call → tool call → final answer
  5. `agent.chat` multi-turn conversation
  6. Compaction trigger on long history

## 10. Deployment
N/A — this is an npm package, not a deployed service. Published via `npm publish` under the moleculerjs org scope.

## 11. Milestones and tasks

### Phase 1: Foundations (schema + adapters)

- **Task 1.1: Schema Converter + Types** — Implement the `src/types.ts` and `src/schema-converter.ts` modules. `types.ts` contains all shared interfaces: `LLMResponse`, `ToolCall`, `AgentSettings`, `ToolSchema`, etc. (see CLAUDE.md "Types & Interfaces" section). `schema-converter.ts` converts fastest-validator param definitions to JSON Schema format. Export a `moleculerParamsToJsonSchema(params)` function that transforms a Moleculer action params object into a JSON Schema `{ type: "object", properties, required }` object. Supported types: string, number, boolean, object (nested props), array (items), enum, email/url/date/uuid (→ string + format description in description field). The `description` field is passed through. In fastest-validator every param is required by default — in JSON Schema this goes into the `required` array, unless `optional: true`. For unknown types, log a warning and skip the param. Write unit tests in `test/unit/schema-converter.spec.ts` with Vitest. **Check CLAUDE.md for exact coding conventions** (TypeScript, ES modules, tabs, double quotes, file header, import style)!

- **Task 1.2: Base Adapter + Registry** — Implement `src/adapters/base.ts` (BaseAdapter abstract class) and `src/adapters/index.ts` (registry). BaseAdapter: `constructor(opts?)`, `init(service)` (stores this.service, this.broker, this.logger), abstract `chat(messages, tools): Promise<LLMResponse>`, abstract `convertToolSchema(name, description, params): unknown`, `stop()`. The `index.ts` follows the Moleculer adapter pattern: `Adapters` dict, `resolve(opt)` factory (string name or object config), `register(name, value)`. Export: `export default Object.assign(Adapters, { resolve, register })`. See CLAUDE.md "Abstract adapter class pattern" section!

- **Task 1.3: OpenAI Adapter** — Implement `src/adapters/openai.ts`. OpenAIAdapter extends BaseAdapter. In `init()`, lazy SDK loading (`createRequire` from `node:module` → `require("openai")`) with try/catch, on missing package `(this as any).broker.fatal(...)`. `convertToolSchema(name, description, moleculerParams)` uses the `moleculerParamsToJsonSchema` function, then wraps in OpenAI function calling format: `{ type: "function", function: { name, description, parameters: jsonSchema } }`. `chat(messages, tools)` calls the API via OpenAI SDK and returns the response (trivial since it's already in OpenAI format). Constructor options: `{ apiKey, model, baseURL }`. Write unit tests in `test/unit/adapters/openai.spec.ts` (mocked SDK, schema conversion testing).

- **Task 1.4: Anthropic Adapter** — Implement `src/adapters/anthropic.ts`. AnthropicAdapter extends BaseAdapter. Lazy SDK (`createRequire` → `require("@anthropic-ai/sdk")`). `convertToolSchema` converts to Anthropic tool format: `{ name, description, input_schema: jsonSchema }`. The `chat` method calls via Anthropic SDK (`messages.create`), then converts the response to OpenAI format: `stop_reason: "end_turn"` → `finish_reason: "stop"`, `stop_reason: "tool_use"` → `finish_reason: "tool_calls"`, `tool_use` type content blocks → `tool_calls` array. Constructor options: `{ apiKey, model }`. Write unit tests in `test/unit/adapters/anthropic.spec.ts` (mocked SDK, response conversion).

- **Task 1.5: Fake Adapter** — Implement `src/adapters/fake.ts`. FakeAdapter extends BaseAdapter, for testing. Constructor takes a `responses` array. Each `chat()` call returns the next element (round-robin). If the responses element is an object `{ content, tool_calls }`: tool_calls response. If string: `{ content: string, finish_reason: "stop" }`. `convertToolSchema` wraps schema-converter result in OpenAI format (like the OpenAI adapter). Write unit tests in `test/unit/adapters/fake.spec.ts`.

### Phase 2: Mixins (Agent + Memory + LLMService)

- **Task 2.1: LLMService mixin** — Implement `src/llm.service.ts`. Factory function: `export default function LLMService(mixinOpts?)`. The mixin resolves `this.settings.adapter` via the Adapters registry in the `created()` hook, then calls `adapter.init(this)`. The `stopped()` hook calls `adapter.stop()`. Single action: `chat` — accepts `{ messages, tools?, toolSchemas? }`. If `toolSchemas` is present (fastest-validator format array, each element `{ name, description, params }`), it converts each via `adapter.convertToolSchema`. Then calls `adapter.chat(messages, convertedTools)`. Returns the result unchanged. Write unit tests with FakeAdapter in `test/unit/llm.service.spec.ts`.

- **Task 2.2: AgentMixin** — Implement `src/agent.mixin.ts`. Factory function: `export default function AgentMixin(mixinOpts?)`. In the `created()` hook, iterates over the service schema `actions` and builds a ToolSchema list from those that have a `description` field (fastest-validator format: `{ name, description, params }`). The `run` and `chat` meta-actions should NOT be included in the tool schema list! Adds two actions: `run` and `chat` (parameters: see PRD section 4). Both call the `runReActLoop` method. `runReActLoop(task, sessionId)`: (1) `this.loadHistory(sessionId)`, (2) if `settings.agent.instructions` exists, add system message, (3) append user message, (4) for loop up to `maxIterations`: if history.length > maxHistoryMessages: `this.compactConversation(history)`, then `broker.call(llm.chat, { messages: history, toolSchemas: this.toolSchemas })`, (5) if `finish_reason === "stop"` → `this.saveHistory(sessionId, history)` + return content, (6) if `finish_reason === "tool_calls"` → for each tool_call: whitelist check, `broker.call(\`${this.name}.${name}\`, args)`, append assistant message + tool result to history, (7) at loop end: `throw new Error("Max iterations reached")`. Default no-op methods: `loadHistory` → `[]`, `saveHistory` → void, `compactConversation` → history unchanged. Defaults: `maxIterations: 10`, `maxHistoryMessages: 50`. Write unit tests (with mock broker.call).

- **Task 2.3: MemoryMixin** — Implement `src/memory.mixin.ts`. Factory function: `export default function MemoryMixin(mixinOpts?)`. Overrides AgentMixin's no-op methods: `loadHistory(sessionId)` → if no sessionId, return `[]`, otherwise `this.broker.cacher.get(key)` (key: `agent:history:${this.name}:${sessionId}`), if null → `[]`. `saveHistory(sessionId, history)` → if no sessionId, return, otherwise `this.broker.cacher.set(key, history, ttl)` (TTL: `this.settings.agent.historyTtl || 3600`). `compactConversation(history)` → if `history.length <= maxHistoryMessages`, return unchanged. Otherwise: keep the first message if system role, and the last N messages. Write unit tests with Moleculer MemoryCacher in `test/unit/memory.mixin.spec.ts`.

### Phase 3: Integration and index

- **Task 3.1: Main index.ts + integration tests** — Implement `src/index.ts`: `export { default as AgentMixin } from "./agent.mixin.ts"`, etc. Exports: `AgentMixin`, `MemoryMixin`, `LLMService`, `Adapters`, and all interface/type re-exports from types. Write integration tests in `test/integration/agent-flow.test.ts` with Vitest: (1) ServiceBroker `{ logger: false, cacher: "Memory" }`, (2) LLM service with FakeAdapter (responses: first a tool_call that invokes one of the agent's tool actions, then a stop response with the tool result), (3) Agent service with AgentMixin + MemoryMixin (with at least one action with description), (4) `broker.call("test-agent.run", { task: "test" })` → tool was called, response is correct, (5) `broker.call("test-agent.chat", { message: "hello", sessionId: "s1" })` → multi-turn works, (6) Compaction test. Fully self-contained, no external dependencies.
