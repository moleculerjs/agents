# PRD: @moleculer/agents — Phase 1 (Core)

## 1. Áttekintés
- **Cél:** AI agent képességek hozzáadása a Moleculer microservices framework-höz. A csomag lehetővé teszi, hogy bármilyen Moleculer service AI agent-ként működjön minimális kóddal.
- **Scope:** Phase 1 — core komponensek: schema konverter, LLM adapterek (OpenAI, Anthropic, Fake), LLMService mixin, AgentMixin (ReAct loop), MemoryMixin (conversation history + compaction)
- **NOT in scope:** OrchestratorMixin (Phase 2), streaming, durable execution, MCP, vector store
- **Architektúra:** Egyetlen npm csomag (`@moleculer/agents`), TypeScript forráskód, dual build (CJS + ESM + type declarations), Moleculer mixin-ek és adapter-ek
- **Moleculer verzió:** `0.15.0-beta` (legújabb béta)

## 2. Meglévő rendszer
- Üres repo, nincs meglévő kód (greenfield)
- package.json, tsconfig-ok, eslint/prettier/vitest config és CLAUDE.md már létezik
- A CLAUDE.md tartalmazza a teljes specifikációt és coding konvenciókat — **KÖTELEZŐ elolvasni munka előtt!**

## 3. Adatbázis schema
N/A — nincs adatbázis, a conversation history Moleculer cacher-ben (Redis) tárolódik.

## 4. API kontraktusok
Nincs REST API. A csomag Moleculer action-öket exportál mixin-eken keresztül.

### AgentMixin által hozzáadott action-ök:

**`run` action:**
```typescript
params: {
  task: { type: "string" },          // A feladat leírása
  sessionId: { type: "string", optional: true }  // Opcionális session a history-hoz
}
// Returns: string — az agent végső válasza
```

**`chat` action:**
```typescript
params: {
  message: { type: "string" },       // A felhasználó üzenete
  sessionId: { type: "string" }      // Kötelező session ID
}
// Returns: string — az agent válasza
```

### LLMService által hozzáadott action-ök:

**`chat` action:**
```typescript
params: {
  messages: { type: "array" },       // OpenAI format messages
  tools: { type: "array", optional: true },      // Konvertált tool schemas (provider formátumban)
  toolSchemas: { type: "array", optional: true }  // Nyers fastest-validator schemas (adapter konvertálja)
}
// Returns: LLMResponse — { content, finish_reason, tool_calls } OpenAI formátum (belső standard)
```

## 5. Fájl struktúra
```
src/
  index.ts              # Fő export: { AgentMixin, MemoryMixin, LLMService, Adapters }
  types.ts              # Shared interfaces (LLMResponse, AgentSettings, ToolSchema, ToolCall, stb.)
  agent.mixin.ts        # AgentMixin factory function
  memory.mixin.ts       # MemoryMixin factory function
  llm.service.ts        # LLMService mixin factory function
  schema-converter.ts   # fastest-validator → JSON Schema konverter
  adapters/
    index.ts            # Registry: resolve(), register(), adapter dict
    base.ts             # BaseAdapter abstract class
    openai.ts           # OpenAIAdapter (OpenAI + kompatibilis API-k)
    anthropic.ts        # AnthropicAdapter (Anthropic Claude API)
    fake.ts             # FakeAdapter (teszteléshez)
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
    agent-flow.test.ts     # Teljes agent flow FakeAdapter-rel
```

## 6. Naming konvenciók
- **Nyelv:** TypeScript (`.ts` fájlok mindenhol)
- **Modul rendszer:** ES Modules (`import`/`export`), NEM CommonJS
- **Import stílus:** Explicit `.ts` kiterjesztés: `import Foo from "./foo.ts"`
- **Type-only import:** `import type { Foo } from "./types.ts"`
- **Változók/metódusok:** camelCase (`runReActLoop`, `toolSchemas`, `loadHistory`)
- **Osztályok/Interface-ek:** PascalCase (`BaseAdapter`, `OpenAIAdapter`, `LLMResponse`)
- **Konstansok:** UPPER_CASE (`DEFAULT_MAX_ITERATIONS`)
- **Fájlnevek:** dot-case (`agent.mixin.ts`, `schema-converter.ts`)
- **Privát metódusok:** underscore prefix (`_validateToolCall`)
- **String-ek:** Double quotes (`"hello"`)
- **Indentáció:** Tabs (4 space visual width)
- **Sorvég:** Semicolons kötelező
- **Max sor:** 100 karakter
- **Trailing comma:** NINCS
- **Arrow function:** Single param no paren: `x => x`

## 7. Környezeti változók
N/A a csomag szintjén. A fejlesztő a saját service settings-ében adja meg az API kulcsokat.

## 8. Függőségek

**Runtime (dependencies):**
- `lodash` — utility functions

**Dev only (devDependencies):**
- `openai` — ^4.0.0 (OpenAI SDK, lazy-loaded)
- `@anthropic-ai/sdk` — ^0.30.0 (Anthropic SDK, lazy-loaded)
- `moleculer` — ^0.15.0-beta (peer dep, teszteléshez)
- `typescript` — ^5.9.3
- `vitest` — ^4.0.18 (test framework)
- `@vitest/coverage-v8` — ^4.0.18
- `eslint` — ^9.39.2

**Peer dependencies:**
- `moleculer` — ^0.15.0-beta

## 9. Tesztelési terv

**Test framework:** Vitest (NEM Jest!)
**Futtatás:** `npm test`
**Teszt fájlok:** TypeScript (`.spec.ts` / `.test.ts`)

**FONTOS:** Minden teszt a `FakeAdapter`-t használja — SOHA ne hívj valódi LLM API-t tesztben!

### Unit tesztek (test/unit/)

**schema-converter.spec.ts:**
- String, number, boolean típusú param konverzió
- Object nested properties-szel
- Array items-szel
- Enum konverzió
- Email, url, date, uuid → string + format
- Ismeretlen típus ignorálása (warning log)
- Description mező átadása
- Optional/required kezelés (fastest-validator: default required, JSON Schema: default optional)

**agent.mixin.spec.ts:**
- Tool schema generálás service action-ökből (csak description-nel rendelkezők)
- `run` action létrehozása
- `chat` action létrehozása
- ReAct loop: LLM "stop" válaszra megáll
- ReAct loop: tool call végrehajtás és folytatás
- ReAct loop: max iterations limit
- Tool call security: ismeretlen tool elutasítása
- Default no-op `loadHistory` és `saveHistory`

**memory.mixin.spec.ts:**
- `loadHistory` üres session-re `[]` ad vissza
- `saveHistory` + `loadHistory` round-trip
- TTL beállítás
- `compactConversation` default sliding window

**adapters/*.spec.ts:**
- OpenAI: fastest-validator schema → OpenAI function calling schema konverzió
- OpenAI: response pass-through (már OpenAI formátumú)
- Anthropic: fastest-validator schema → Anthropic tool schema konverzió
- Anthropic: Anthropic response → OpenAI formátum konverzió
- Fake: előre definiált válasz visszaadása
- Fake: tool call szimuláció

### Integrációs tesztek (test/integration/)

**agent-flow.test.ts:**
- Teljes agent lifecycle FakeAdapter-rel:
  1. ServiceBroker létrehozás
  2. LLM service (FakeAdapter-rel)
  3. Agent service (AgentMixin + MemoryMixin)
  4. `agent.run` hívás → tool call → final answer
  5. `agent.chat` multi-turn conversation
  6. Compaction trigger hosszú history-nál

## 10. Deploy
N/A — ez egy npm csomag, nem deployolt service. `npm publish` a moleculerjs org scope-jával.

## 11. Milestone-ok és task-ok

### Phase 1: Alapok (schema + adapters)

- **Task 1.1: Schema Converter + Types** — Implementáld a `src/types.ts` és `src/schema-converter.ts` modulokat. A `types.ts` tartalmazza az összes shared interface-t: `LLMResponse`, `ToolCall`, `AgentSettings`, `ToolSchema`, stb. (lásd CLAUDE.md "Types & Interfaces" szekció). A `schema-converter.ts` a fastest-validator param definíciókat konvertálja JSON Schema formátumra. Exportáljon egy `moleculerParamsToJsonSchema(params)` függvényt, ami a Moleculer action params objektumot JSON Schema `{ type: "object", properties, required }` objektummá alakítja. Támogatott típusok: string, number, boolean, object (nested props), array (items), enum, email/url/date/uuid (→ string + format leírás a description-ben). A `description` mezőt átadja. A fastest-validatorban minden param default required — a JSON Schema-ban ez a `required` tömbbe kerül, kivéve ha `optional: true`. Ismeretlen típusoknál logoljon warning-ot és hagyja ki a paramot. Írj hozzá unit teszteket `test/unit/schema-converter.spec.ts`-be Vitest-tel. **Nézd meg a CLAUDE.md-t a pontos coding konvenciókért** (TypeScript, ES modules, tabs, double quotes, file header, import style)!

- **Task 1.2: Base Adapter + Registry** — Implementáld a `src/adapters/base.ts` (BaseAdapter abstract class) és `src/adapters/index.ts` (registry) fájlokat. A BaseAdapter: `constructor(opts?)`, `init(service)` (elmenti this.service, this.broker, this.logger), abstract `chat(messages, tools): Promise<LLMResponse>`, abstract `convertToolSchema(name, description, params): unknown`, `stop()`. Az `index.ts` a Moleculer adapter pattern-t követi: `Adapters` dict, `resolve(opt)` factory (string név vagy object config), `register(name, value)`. Export: `export default Object.assign(Adapters, { resolve, register })`. Lásd a CLAUDE.md "Abstract adapter class pattern" szekciót!

- **Task 1.3: OpenAI Adapter** — Implementáld a `src/adapters/openai.ts`-t. Az OpenAIAdapter extends BaseAdapter. Az `init()` metódusban lazy SDK betöltés (`createRequire` from `node:module` → `require("openai")`) try/catch-csel, hiányzó csomagnál `(this as any).broker.fatal(...)`. A `convertToolSchema(name, description, moleculerParams)` a `moleculerParamsToJsonSchema` függvényt használja, majd OpenAI function calling formátumba csomagolja: `{ type: "function", function: { name, description, parameters: jsonSchema } }`. A `chat(messages, tools)` az OpenAI SDK-val hívja az API-t és visszaadja a választ (triviális mert már OpenAI formátumú). Konstruktor opciók: `{ apiKey, model, baseURL }`. Írj unit teszteket `test/unit/adapters/openai.spec.ts`-be (mockolt SDK, schema konverzió tesztelés).

- **Task 1.4: Anthropic Adapter** — Implementáld a `src/adapters/anthropic.ts`-t. Az AnthropicAdapter extends BaseAdapter. Lazy SDK (`createRequire` → `require("@anthropic-ai/sdk")`). A `convertToolSchema` az Anthropic tool formátumra konvertál: `{ name, description, input_schema: jsonSchema }`. A `chat` metódus az Anthropic SDK-val hív (`messages.create`), majd a választ OpenAI formátumra konvertálja: `stop_reason: "end_turn"` → `finish_reason: "stop"`, `stop_reason: "tool_use"` → `finish_reason: "tool_calls"`, content blokkok közül `tool_use` típusúak → `tool_calls` tömb. Konstruktor opciók: `{ apiKey, model }`. Írj unit teszteket `test/unit/adapters/anthropic.spec.ts`-be (mockolt SDK, response konverzió).

- **Task 1.5: Fake Adapter** — Implementáld a `src/adapters/fake.ts`-t. FakeAdapter extends BaseAdapter, teszteléshez. Konstruktorban kap egy `responses` tömböt. Minden `chat()` hívásra a következő elemet adja vissza (round-robin). Ha a responses elem object `{ content, tool_calls }` formában: tool_calls-os válasz. Ha string: `{ content: string, finish_reason: "stop" }`. A `convertToolSchema` a schema-converter eredményét OpenAI formátumba csomagolja (mint az OpenAI adapter). Írj unit teszteket `test/unit/adapters/fake.spec.ts`-be.

### Phase 2: Mixin-ek (Agent + Memory + LLMService)

- **Task 2.1: LLMService mixin** — Implementáld a `src/llm.service.ts`-t. Factory function: `export default function LLMService(mixinOpts?)`. A mixin `created()` hook-ban a `this.settings.adapter`-t resolve-olja az Adapters registry-vel, majd `adapter.init(this)`. A `stopped()` hook-ban `adapter.stop()`. Egyetlen action: `chat` — fogadja `{ messages, tools?, toolSchemas? }`. Ha `toolSchemas` van (fastest-validator formátum tömb, minden elem `{ name, description, params }`), az adapter `convertToolSchema`-jával konvertálja mindegyiket. Aztán `adapter.chat(messages, convertedTools)`. Eredményt változatlanul visszaadja. Írj unit tesztet FakeAdapter-rel `test/unit/llm.service.spec.ts`-be.

- **Task 2.2: AgentMixin** — Implementáld a `src/agent.mixin.ts`-t. Factory function: `export default function AgentMixin(mixinOpts?)`. A mixin `created()` hook-ban végigmegy a service schema `actions`-jein, és azokból amelyeknek van `description` mezőjük, ToolSchema listát generál (fastest-validator formátumban: `{ name, description, params }`). A `run` és `chat` meta-action-öket NE vegye bele a tool schema listába! Hozzáad két action-t: `run` és `chat` (paraméterek: lásd PRD 4. szekció). Mindkettő a `runReActLoop` methods-t hívja. A `runReActLoop(task, sessionId)`: (1) `this.loadHistory(sessionId)`, (2) ha van `settings.agent.instructions`, system message hozzáadása, (3) user message hozzáfűzése, (4) for loop `maxIterations`-ig: ha history.length > maxHistoryMessages: `this.compactConversation(history)`, majd `broker.call(llm.chat, { messages: history, toolSchemas: this.toolSchemas })`, (5) ha `finish_reason === "stop"` → `this.saveHistory(sessionId, history)` + return content, (6) ha `finish_reason === "tool_calls"` → minden tool_call-ra: whitelist ellenőrzés, `broker.call(\`${this.name}.${name}\`, args)`, assistant message + tool result hozzáfűzése history-hoz, (7) loop végén: `throw new Error("Max iterations reached")`. Default no-op methods: `loadHistory` → `[]`, `saveHistory` → void, `compactConversation` → history változatlanul. Defaults: `maxIterations: 10`, `maxHistoryMessages: 50`. Írj unit teszteket (mock broker.call-lal).

- **Task 2.3: MemoryMixin** — Implementáld a `src/memory.mixin.ts`-t. Factory function: `export default function MemoryMixin(mixinOpts?)`. Felülírja az AgentMixin no-op metódusait: `loadHistory(sessionId)` → ha nincs sessionId, return `[]`, különben `this.broker.cacher.get(key)` (key: `agent:history:${this.name}:${sessionId}`), ha null → `[]`. `saveHistory(sessionId, history)` → ha nincs sessionId, return, különben `this.broker.cacher.set(key, history, ttl)` (TTL: `this.settings.agent.historyTtl || 3600`). `compactConversation(history)` → ha `history.length <= maxHistoryMessages`, return változatlanul. Különben: tartsd meg az első üzenetet ha system role, és az utolsó N üzenetet. Írj unit tesztet Moleculer MemoryCacher-rel `test/unit/memory.mixin.spec.ts`-be.

### Phase 3: Integráció és index

- **Task 3.1: Main index.ts + integrációs tesztek** — Implementáld a `src/index.ts`-t: `export { default as AgentMixin } from "./agent.mixin.ts"`, stb. Exportok: `AgentMixin`, `MemoryMixin`, `LLMService`, `Adapters`, és a types-ból az összes interface/type re-export. Írj integrációs tesztet `test/integration/agent-flow.test.ts`-be Vitest-tel: (1) ServiceBroker `{ logger: false, cacher: "Memory" }`, (2) LLM service FakeAdapter-rel (válaszok: először tool_call amiben meghívja az agent egy tool action-jét, aztán stop válasz a tool eredményével), (3) Agent service AgentMixin + MemoryMixin-nel (legyen benne legalább egy action description-nel), (4) `broker.call("test-agent.run", { task: "test" })` → tool meghívódott, válasz helyes, (5) `broker.call("test-agent.chat", { message: "hello", sessionId: "s1" })` → multi-turn működés, (6) Compaction teszt. Teljesen self-contained, nincs külső dependency.
