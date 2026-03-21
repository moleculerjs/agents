# PRD: @moleculer/agents — Phase 2 (OrchestratorMixin)

## 1. Overview
- **Goal:** Add multi-agent coordination — an orchestrator service can discover and delegate tasks to other agent services
- **Scope:** OrchestratorMixin, direct + LLM-router strategy, integration tests, README update, orchestrator example
- **Prerequisite:** Phase 1 complete — AgentMixin, MemoryMixin, LLMService, adapters all working

## 2. Existing system

Components completed in Phase 1 (do NOT modify, only use):
- `AgentMixin` — ReAct loop, tool schema extraction, run/chat actions (`src/agent.mixin.ts`)
- `MemoryMixin` — conversation history in cacher (`src/memory.mixin.ts`)
- `LLMService` — adapter wrapper service (`src/llm.service.ts`)
- Adapters: OpenAI, Anthropic, Fake + registry (`src/adapters/`)
- Types: `LLMResponse`, `ToolCall`, `AgentSettings`, `ToolSchema` (`src/types.ts`)
- Schema converter: fastest-validator → JSON Schema (`src/schema-converter.ts`)

The existing `AgentSettings` interface already has a `strategy` field: `"direct" | "llm-router"`.

## 3. New files

```
src/
  orchestrator.mixin.ts   # OrchestratorMixin factory function
  types.ts                # Extend: DiscoveredAgent interface
test/
  unit/
    orchestrator.mixin.spec.ts
  integration/
    orchestrator.test.ts   # Multi-agent E2E test
examples/
  orchestrator.ts          # Runnable orchestrator example
```

## 4. OrchestratorMixin specification

### Factory function

```typescript
export default function OrchestratorMixin(mixinOpts?: OrchestratorMixinOptions)
```

**Options:**
```typescript
interface OrchestratorMixinOptions {
  // No options needed for now, but the factory pattern is preserved
}
```

### New type (add to `types.ts`)

```typescript
export interface DiscoveredAgent {
  name: string;
  description: string;
  actions: string[];  // Action names available as tools
}
```

### Methods

#### `discoverAgents(): DiscoveredAgent[]`

Queries the Moleculer service registry for all agent services:

1. Call `this.broker.registry.getServiceList({ withActions: true })` (Moleculer 0.15 API)
2. Filter: only services that have a `settings.agent` object AND `settings.agent.description`
3. Exclude self (services matching `this.name`)
4. Build `DiscoveredAgent` object from each found service:
   - `name`: service name
   - `description`: `settings.agent.description`
   - `actions`: action names from that service which have a `description` field (similar to how AgentMixin filters) — BUT filter out the `run` and `chat` meta-actions
5. Return the array

**IMPORTANT:** In Moleculer 0.15, `getServiceList` returns settings from remote nodes as well, so this works in distributed environments. Check the Moleculer 0.15 source for the exact API (look for the appropriate method on broker.registry or broker object, e.g. `this.broker.registry.getServiceList` or `this.broker.getLocalNodeInfo`). If the Moleculer 0.15 API is unclear, use `this.broker.call("$node.services", { withActions: true })` internal action which also returns all service info.

#### `delegateTo(agentName: string, task: string, sessionId?: string): Promise<string>`

Simple wrapper:
```typescript
return this.broker.call(`${agentName}.run`, { task, sessionId });
```

### Settings

OrchestratorMixin does not add new fields under the existing `settings.agent` scope — the `strategy` field already exists in the `AgentSettings` interface.

### How the orchestrator works

OrchestratorMixin must be used TOGETHER with AgentMixin and optionally MemoryMixin:

```typescript
mixins: [MemoryMixin(), OrchestratorMixin(), AgentMixin()]
```

The orchestrator service can have **its own actions** (which appear as tools for the LLM), and these actions can call `this.delegateTo()` to delegate to other agents.

**Direct strategy example:**
```typescript
actions: {
  planTrip: {
    description: "Plan a complete trip",
    params: {
      destination: { type: "string", description: "Destination city" },
      days: { type: "number", description: "Number of days" }
    },
    async handler(ctx) {
      const [weather, hotels] = await Promise.all([
        this.delegateTo("weather-agent", `Weather in ${ctx.params.destination} for ${ctx.params.days} days`),
        this.delegateTo("hotel-agent", `Hotels in ${ctx.params.destination} for ${ctx.params.days} nights`)
      ]);
      return `Weather: ${weather}\nHotels: ${hotels}`;
    }
  }
}
```

**LLM-router strategy:** In the orchestrator's `created()` hook, if `settings.agent.strategy === "llm-router"`, it automatically generates an extra tool (`_routeToAgent`) for the LLM. This tool:
- Parameters: `{ agentName: "string", task: "string" }`
- Description: contains the list of available agents (from discovery)
- Handler: calls `this.delegateTo(agentName, task)`
- The AgentMixin ReAct loop automatically invokes it if the LLM decides to

The `_routeToAgent` tool description must include the discovered agents list and descriptions so the LLM knows which agent to delegate to. Discovery happens in the `started()` hook (when other services are already registered), and refreshes on `$services.changed` event.

## 5. Testing plan

### Unit tests (`test/unit/orchestrator.mixin.spec.ts`)

Vitest, FakeAdapter, ServiceBroker `{ logger: false }`.

- **discoverAgents**: Create a broker with 3 services (2 agents + 1 non-agent), verify that `discoverAgents()` returns only the agent services and excludes self
- **delegateTo**: Mock agent service, verify that `broker.call("agent-name.run", { task })` is called
- **LLM-router _routeToAgent tool**: Verify that with `strategy: "llm-router"`, toolSchemas contains a `_routeToAgent` tool
- **Direct strategy**: Verify that with `strategy: "direct"`, NO `_routeToAgent` tool is generated

### Integration test (`test/integration/orchestrator.test.ts`)

Full multi-agent E2E:

1. Broker creation `{ logger: false, cacher: "Memory" }`
2. LLM service with FakeAdapter
3. 2 sub-agent services (weather-agent, calculator-agent) — with AgentMixin, with their own tool actions
4. 1 orchestrator service — AgentMixin + OrchestratorMixin, direct strategy
5. Test: `broker.call("orchestrator.run", { task: "..." })` → orchestrator action calls `delegateTo` → sub-agent responds → orchestrator returns result
6. Test: `discoverAgents()` returns correct list

### Runnable example (`examples/orchestrator.ts`)

Register in the example runner (`examples/index.ts` under `orchestrator` key).

The example:
- 1 LLM service (auto adapter detection via `create-adapter` helper)
- 2 sub-agents (weather + calculator)
- 1 orchestrator (direct strategy) — `planTrip` action that delegates to sub-agents
- Call: `orchestrator.run({ task: "Plan a trip to Paris for 3 days" })`

## 6. README update

Add a "Multi-Agent Orchestration" section to the existing README after the "Conversation Memory" section, covering:
- OrchestratorMixin usage
- `discoverAgents()` and `delegateTo()` methods
- Direct strategy example
- LLM-router strategy example (brief)

## 7. Index.ts update

Export `OrchestratorMixin` and the `DiscoveredAgent` type from `src/index.ts`:

```typescript
export { default as OrchestratorMixin } from "./orchestrator.mixin.ts";
export type { ..., DiscoveredAgent } from "./types.ts";
```

## 8. Coding conventions

Same as Phase 1 — see CLAUDE.md! TypeScript, ES modules, tabs, double quotes, Vitest, file headers, etc.
