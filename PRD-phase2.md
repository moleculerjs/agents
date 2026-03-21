# PRD: @moleculer/agents — Phase 2 (OrchestratorMixin)

## 1. Áttekintés
- **Cél:** Multi-agent koordináció hozzáadása — egy orchestrator service felfedezheti és delegálhat feladatokat más agent service-eknek
- **Scope:** OrchestratorMixin, direct + LLM-router strategy, integrációs tesztek, README frissítés, orchestrator example
- **Előfeltétel:** Phase 1 kész — AgentMixin, MemoryMixin, LLMService, adapters mind működnek

## 2. Meglévő rendszer

A Phase 1-ben elkészült komponensek (NEM kell módosítani, csak használni):
- `AgentMixin` — ReAct loop, tool schema extraction, run/chat action-ök (`src/agent.mixin.ts`)
- `MemoryMixin` — conversation history cacher-ben (`src/memory.mixin.ts`)
- `LLMService` — adapter wrapper service (`src/llm.service.ts`)
- Adapters: OpenAI, Anthropic, Fake + registry (`src/adapters/`)
- Types: `LLMResponse`, `ToolCall`, `AgentSettings`, `ToolSchema` (`src/types.ts`)
- Schema converter: fastest-validator → JSON Schema (`src/schema-converter.ts`)

A meglévő `AgentSettings` interface-ben már van `strategy` mező: `"direct" | "llm-router"`.

## 3. Új fájlok

```
src/
  orchestrator.mixin.ts   # OrchestratorMixin factory function
  types.ts                # Bővíteni: DiscoveredAgent interface
test/
  unit/
    orchestrator.mixin.spec.ts
  integration/
    orchestrator.test.ts   # Multi-agent E2E teszt
examples/
  orchestrator.ts          # Futtatható orchestrator példa
```

## 4. OrchestratorMixin specifikáció

### Factory function

```typescript
export default function OrchestratorMixin(mixinOpts?: OrchestratorMixinOptions)
```

**Options:**
```typescript
interface OrchestratorMixinOptions {
  // Nincs szükség opciókra egyelőre, de a factory pattern megmarad
}
```

### Új típus (`types.ts`-be)

```typescript
export interface DiscoveredAgent {
  name: string;
  description: string;
  actions: string[];  // Action nevek amik tool-ként elérhetőek
}
```

### Methods

#### `discoverAgents(): DiscoveredAgent[]`

Lekérdezi a Moleculer service registry-ből az összes agent service-t:

1. `this.broker.registry.getServiceList({ withActions: true })` hívás (Moleculer 0.15 API)
2. Szűrés: csak azok a service-ek amelyeknek van `settings.agent` objektuma ÉS van `settings.agent.description`
3. Kiszűri önmagát (`this.name`-mel egyező service-ek)
4. Minden talált service-ből `DiscoveredAgent` objektumot épít:
   - `name`: service neve
   - `description`: `settings.agent.description`
   - `actions`: az adott service action-jei közül azok neve amelyeknek van `description` mezőjük (hasonlóan ahogy az AgentMixin szűr) — DE a `run` és `chat` meta-action-öket kiszűri
5. Visszaadja a tömböt

**FONTOS:** A Moleculer 0.15-ben a `getServiceList` a remote node-ok settings-eit is visszaadja, tehát ez elosztott környezetben is működik. Nézd meg a Moleculer 0.15 forráskódját a pontos API-ért (a broker.registry vagy broker object-en kell keresni a megfelelő metódust, pl. `this.broker.registry.getServiceList` vagy `this.broker.getLocalNodeInfo`). Ha a Moleculer 0.15 API nem egyértelmű, használd a `this.broker.call("$node.services", { withActions: true })` belső action-t ami szintén visszaadja az összes service infót.

#### `delegateTo(agentName: string, task: string, sessionId?: string): Promise<string>`

Egyszerű wrapper:
```typescript
return this.broker.call(`${agentName}.run`, { task, sessionId });
```

### Settings

Az OrchestratorMixin a meglévő `settings.agent` scope alá nem ad új mezőket — a `strategy` mező már létezik az `AgentSettings` interface-ben.

### Hogyan működik az orchestrator

Az OrchestratorMixin-t az AgentMixin-nel és opcionálisan a MemoryMixin-nel EGYÜTT kell használni:

```typescript
mixins: [MemoryMixin(), OrchestratorMixin(), AgentMixin()]
```

Az orchestrator service-nek lehetnek **saját action-jei** (amik tool-ként jelennek meg az LLM számára), és ezek az action-ok hívhatják a `this.delegateTo()` metódust más agent-ekhez delegáláshoz.

**Direct strategy példa:**
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

**LLM-router strategy:** Az orchestrator `created()` hook-jában ha `settings.agent.strategy === "llm-router"`, automatikusan generál egy extra tool-t (`_routeToAgent`) az LLM számára. Ez a tool:
- Paraméterek: `{ agentName: "string", task: "string" }`
- Description: tartalmazza az elérhető agent-ek listáját (discovery-ből)
- Handler: meghívja `this.delegateTo(agentName, task)`
- Az AgentMixin ReAct loop-ja automatikusan meghívja ha az LLM úgy dönt

A `_routeToAgent` tool description-jébe bele kell írni a felfedezett agent-ek listáját és leírását, hogy az LLM tudja melyikhez delegáljon. A discovery a `started()` hook-ban történik (amikor a többi service már regisztrált), és `$services.changed` event-re frissül.

## 5. Tesztelési terv

### Unit tesztek (`test/unit/orchestrator.mixin.spec.ts`)

Vitest, FakeAdapter, ServiceBroker `{ logger: false }`.

- **discoverAgents**: Hozz létre broker-t 3 service-szel (2 agent + 1 nem-agent), ellenőrizd hogy a `discoverAgents()` csak az agent service-eket adja vissza, és kiszűri önmagát
- **delegateTo**: Mock agent service, ellenőrizd hogy `broker.call("agent-name.run", { task })` hívódik meg
- **LLM-router _routeToAgent tool**: Ellenőrizd hogy `strategy: "llm-router"` esetén a toolSchemas tartalmaz egy `_routeToAgent` tool-t
- **Direct strategy**: Ellenőrizd hogy `strategy: "direct"` esetén NEM generálódik `_routeToAgent` tool

### Integrációs teszt (`test/integration/orchestrator.test.ts`)

Teljes multi-agent E2E:

1. Broker létrehozás `{ logger: false, cacher: "Memory" }`
2. LLM service FakeAdapter-rel
3. 2 sub-agent service (weather-agent, calculator-agent) — AgentMixin-nel, saját tool action-ökkel
4. 1 orchestrator service — AgentMixin + OrchestratorMixin, direct strategy
5. Teszt: `broker.call("orchestrator.run", { task: "..." })` → az orchestrator action-je meghívja `delegateTo`-t → a sub-agent válaszol → orchestrator visszaadja az eredményt
6. Teszt: `discoverAgents()` helyes listát ad

### Futtatható example (`examples/orchestrator.ts`)

Regisztráld az example runner-be (`examples/index.ts`-be `orchestrator` kulcs alatt).

A példa:
- 1 LLM service (auto adapter detection a `create-adapter` helper-rel)
- 2 sub-agent (weather + calculator)
- 1 orchestrator (direct strategy) — `planTrip` action ami delegál a sub-agent-ekhez
- Hívás: `orchestrator.run({ task: "Plan a trip to Paris for 3 days" })`

## 6. README frissítés

A meglévő README-be adj hozzá egy "Multi-Agent Orchestration" szekciót a "Conversation Memory" szekció után, ami bemutatja:
- OrchestratorMixin használatát
- `discoverAgents()` és `delegateTo()` metódusokat
- Direct strategy példát
- LLM-router strategy példát (röviden)

## 7. Index.ts frissítés

Az `src/index.ts`-ből exportáld az `OrchestratorMixin`-t és a `DiscoveredAgent` típust is:

```typescript
export { default as OrchestratorMixin } from "./orchestrator.mixin.ts";
export type { ..., DiscoveredAgent } from "./types.ts";
```

## 8. Coding konvenciók

Ugyanazok mint Phase 1-ben — lásd a CLAUDE.md-t! TypeScript, ES modules, tabs, double quotes, Vitest, file headers, etc.
