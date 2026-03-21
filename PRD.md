# PRD: @moleculer/agents — Phase 1 (Core)

## 1. Áttekintés
- **Cél:** AI agent képességek hozzáadása a Moleculer microservices framework-höz. A csomag lehetővé teszi, hogy bármilyen Moleculer service AI agent-ként működjön minimális kóddal.
- **Scope:** Phase 1 — core komponensek: schema konverter, LLM adapterek (OpenAI, Anthropic, Fake), LLMService mixin, AgentMixin (ReAct loop), MemoryMixin (conversation history + compaction)
- **NOT in scope:** OrchestratorMixin (Phase 2), streaming, durable execution, MCP, vector store
- **Architektúra:** Egyetlen npm csomag (`@moleculer/agents`), CommonJS modulok, Moleculer mixin-ek és adapter-ek

## 2. Meglévő rendszer
- Üres repo, nincs meglévő kód (greenfield)
- package.json és CLAUDE.md már létezik
- A CLAUDE.md tartalmazza a teljes specifikációt és coding konvenciókat — **KÖTELEZŐ elolvasni munka előtt!**

## 3. Adatbázis schema
N/A — nincs adatbázis, a conversation history Moleculer cacher-ben (Redis) tárolódik.

## 4. API kontraktusok
Nincs REST API. A csomag Moleculer action-öket exportál mixin-eken keresztül.

### AgentMixin által hozzáadott action-ök:

**`run` action:**
```javascript
params: {
  task: { type: "string" },          // A feladat leírása
  sessionId: { type: "string", optional: true }  // Opcionális session a history-hoz
}
// Returns: String — az agent végső válasza
```

**`chat` action:**
```javascript
params: {
  message: { type: "string" },       // A felhasználó üzenete
  sessionId: { type: "string" }      // Kötelező session ID
}
// Returns: String — az agent válasza
```

### LLMService által hozzáadott action-ök:

**`chat` action:**
```javascript
params: {
  messages: { type: "array" },       // OpenAI format messages
  tools: { type: "array", optional: true },      // Konvertált tool schemas (provider formátumban)
  toolSchemas: { type: "array", optional: true }  // Nyers fastest-validator schemas (adapter konvertálja)
}
// Returns: { content, finish_reason, tool_calls } — OpenAI formátum (belső standard)
```

## 5. Fájl struktúra
```
src/
  index.js              # Fő export: { AgentMixin, MemoryMixin, LLMService, Adapters }
  agent.mixin.js         # AgentMixin factory function
  memory.mixin.js        # MemoryMixin factory function
  llm.service.js         # LLMService mixin factory function
  schema-converter.js    # fastest-validator → JSON Schema konverter
  adapters/
    index.js             # Registry: resolve(), register(), adapter dict
    base.js              # BaseAdapter osztály (abstract)
    openai.js            # OpenAIAdapter (OpenAI + kompatibilis API-k)
    anthropic.js         # AnthropicAdapter (Anthropic Claude API)
    fake.js              # FakeAdapter (teszteléshez)
test/
  unit/
    schema-converter.spec.js
    agent.mixin.spec.js
    memory.mixin.spec.js
    adapters/
      openai.spec.js
      anthropic.spec.js
      fake.spec.js
  integration/
    agent-flow.test.js      # Teljes agent flow FakeAdapter-rel
```

## 6. Naming konvenciók
- **Változók/metódusok:** camelCase (`runReActLoop`, `toolSchemas`, `loadHistory`)
- **Osztályok:** PascalCase (`BaseAdapter`, `OpenAIAdapter`)
- **Konstansok:** UPPER_CASE (`DEFAULT_MAX_ITERATIONS`)
- **Fájlnevek:** kebab-case (`agent.mixin.js`, `schema-converter.js`)
- **Privát metódusok:** underscore prefix (`_validateToolCall`)
- **Modulok:** CommonJS (`require` / `module.exports`)
- **String-ek:** Double quotes (`"use strict"`)
- **Indentáció:** Tabs (4 space width)
- **Sorvég:** Semicolons kötelező
- **Max sor:** 100 karakter
- **Trailing comma:** NINCS
- **Arrow function:** Single param no paren: `x => x`

## 7. Környezeti változók
N/A a csomag szintjén. A fejlesztő a saját service settings-ében adja meg az API kulcsokat:
```javascript
settings: {
  apiKey: process.env.OPENAI_API_KEY,
  model: "gpt-4o"
}
```

## 8. Függőségek

**Runtime (dependencies):**
- `lodash` — utility functions (_.defaultsDeep, _.isString, stb.)

**Dev only (devDependencies):**
- `openai` — ^4.0.0 (OpenAI SDK, lazy-loaded)
- `@anthropic-ai/sdk` — ^0.30.0 (Anthropic SDK, lazy-loaded)
- `moleculer` — ^0.14.35 (peer dep, teszteléshez)
- `jest` — ^29.7.0 (test framework)
- `eslint` — ^8.56.0 (linter)

**Peer dependencies:**
- `moleculer` — ^0.14.0 || ^0.15.0

## 9. Tesztelési terv

**Test framework:** Jest
**Futtatás:** `npm test`

**FONTOS:** Minden teszt a `FakeAdapter`-t használja — SOHA ne hívj valódi LLM API-t tesztben!

### Unit tesztek (test/unit/)

**schema-converter.spec.js:**
- String, number, boolean típusú param konverzió
- Object nested properties-szel
- Array items-szel
- Enum konverzió
- Email, url, date, uuid → string + format
- Ismeretlen típus ignorálása (warning log)
- Description mező átadása
- Optional/required kezelés (fastest-validator: default required, JSON Schema: default optional)

**agent.mixin.spec.js:**
- Tool schema generálás service action-ökből (csak description-nel rendelkezők)
- `run` action létrehozása
- `chat` action létrehozása
- ReAct loop: LLM "stop" válaszra megáll
- ReAct loop: tool call végrehajtás és folytatás
- ReAct loop: max iterations limit
- Tool call security: ismeretlen tool elutasítása
- Default no-op `loadHistory` és `saveHistory`

**memory.mixin.spec.js:**
- `loadHistory` üres session-re `[]` ad vissza
- `saveHistory` + `loadHistory` round-trip
- TTL beállítás
- `compactConversation` default sliding window

**adapters/*.spec.js:**
- OpenAI: fastest-validator schema → OpenAI function calling schema konverzió
- OpenAI: response pass-through (már OpenAI formátumú)
- Anthropic: fastest-validator schema → Anthropic tool schema konverzió
- Anthropic: Anthropic response → OpenAI formátum konverzió
- Fake: előre definiált válasz visszaadása
- Fake: tool call szimuláció

### Integrációs tesztek (test/integration/)

**agent-flow.test.js:**
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

- **Task 1.1: Schema Converter** — Implementáld a `src/schema-converter.js` modult. Ez a fastest-validator param definíciókat konvertálja JSON Schema formátumra. A konverter egy `moleculerParamsToJsonSchema(params)` függvényt exportál, ami a Moleculer action params objektumot JSON Schema `properties` + `required` objektummá alakítja. Támogatott típusok: string, number, boolean, object (nested props), array (items), enum, email/url/date/uuid (→ string). A `description` mezőt átadja. A fastest-validatorban minden param default required — a JSON Schema-ban ez a `required` tömbbe kerül, kivéve ha `optional: true`. Ismeretlen típusoknál logoljon warning-ot és hagyja ki a paramot. Írj hozzá unit teszteket `test/unit/schema-converter.spec.js`-be. Nézd meg a CLAUDE.md-t a pontos coding konvenciókért (tabs, double quotes, semicolons, JSDoc, file header)!

- **Task 1.2: Base Adapter + Registry** — Implementáld a `src/adapters/base.js` (BaseAdapter osztály) és `src/adapters/index.js` (registry) fájlokat. A BaseAdapter egy abstract osztály: `constructor(opts)`, `init(service)` (elmenti this.service, this.broker, this.logger), `chat(messages, tools)` (throw "not implemented"), `convertToolSchema(moleculerParams)` (throw "not implemented"), `stop()`. Az `index.js` a Moleculer adapter pattern-t követi: `Adapters` dict, `resolve(opt)` factory (string név vagy object config), `register(name, value)`. Lásd a CLAUDE.md "Adapter pattern" szekciót a pontos mintához!

- **Task 1.3: OpenAI Adapter** — Implementáld a `src/adapters/openai.js`-t. Az OpenAIAdapter extends BaseAdapter. Az `init()` metódusban lazy `require("openai")` try/catch-csel, hiányzó csomagnál `this.broker.fatal("The 'openai' package is missing! Please install it with 'npm install openai --save' command.", err, true)`. A `convertToolSchema(moleculerParams)` a schema-converter.js `moleculerParamsToJsonSchema` függvényét használja a konverzióhoz, majd az eredményt OpenAI function calling formátumba csomagolja (`{ type: "function", function: { name, description, parameters } }`). A `chat(messages, tools)` az OpenAI SDK-val hívja az API-t és visszaadja a választ OpenAI formátumban (ez az adapter-nél triviális mert már OpenAI formátumú). Konstruktor opciók: `{ apiKey, model, baseURL }` — a baseURL lehetővé teszi OpenRouter és más kompatibilis API-k használatát. Írj unit teszteket (a tényleges API hívást mockold, a schema konverziót teszteld ténylegesen).

- **Task 1.4: Anthropic Adapter** — Implementáld a `src/adapters/anthropic.js`-t. Az AnthropicAdapter extends BaseAdapter. Lazy `require("@anthropic-ai/sdk")`. A `convertToolSchema` az Anthropic tool formátumra konvertál (az Anthropic `input_schema`-t vár, ami standard JSON Schema — tehát a schema-converter eredménye közvetlenül használható, csak a wrapper struktúra más). A `chat` metódus az Anthropic SDK-val hív, majd a választ OpenAI formátumra konvertálja: `stop_reason: "end_turn"` → `finish_reason: "stop"`, `stop_reason: "tool_use"` → `finish_reason: "tool_calls"`, és a `content` blokkok közül a `tool_use` típusúakat `tool_calls` tömbbe alakítja. Konstruktor opciók: `{ apiKey, model }`. Írj unit teszteket (mockolt SDK, schema + response konverzió tesztelése).

- **Task 1.5: Fake Adapter** — Implementáld a `src/adapters/fake.js`-t. A FakeAdapter extends BaseAdapter, teszteléshez. Konstruktorban kap egy `responses` tömböt — minden `chat()` hívásra a következő elemet adja vissza a tömbből. Ha a responses elem egy object `{ content, tool_calls }` formában, azt tool_calls-os válaszként adja vissza. Ha string, azt `{ content: string, finish_reason: "stop" }` formában. A `convertToolSchema` egyszerűen a schema-converter eredményét adja vissza OpenAI formátumban (ugyanúgy mint az OpenAI adapter). Írj unit teszteket.

### Phase 2: Mixin-ek (Agent + Memory + LLMService)

- **Task 2.1: LLMService mixin** — Implementáld a `src/llm.service.js`-t. Ez egy Moleculer mixin factory function: `module.exports = function LLMService(mixinOpts)`. A mixin `created()` hook-ban a `settings.adapter`-t resolve-olja az Adapters registry-vel (`Adapters.resolve()`), majd `init(this)` hívással inicializálja. A `started()` hook-ban opcionális connect logika. A `stopped()` hook-ban `adapter.stop()`. Egyetlen action-t ad hozzá: `chat` — fogadja a `{ messages, tools?, toolSchemas? }` paramétereket. Ha `toolSchemas` van (nyers fastest-validator formátum), az adapter `convertToolSchema`-jával konvertálja. Aztán az adapter `chat(messages, convertedTools)` metódusát hívja. Eredményt változtatás nélkül visszaadja. Írj unit tesztet FakeAdapter-rel.

- **Task 2.2: AgentMixin** — Implementáld a `src/agent.mixin.js`-t. Factory function: `module.exports = function AgentMixin(mixinOpts)`. A mixin a `created()` hook-ban végigmegy a service schema `actions`-jein, és azokból amelyeknek van `description` mezőjük, tool schema listát generál. A tool schemákat fastest-validator formátumban tárolja (NEM konvertálja JSON Schema-ra — azt az adapter csinálja). Hozzáad két action-t: `run` (params: `{ task: "string", sessionId: { type: "string", optional: true } }`) és `chat` (params: `{ message: "string", sessionId: "string" }`). Mindkettő a `runReActLoop` metódust hívja. A `runReActLoop(task, sessionId)` metódus: (1) `loadHistory(sessionId)`, (2) hozzáfűzi a user message-et, (3) for loop `maxIterations`-ig: hívja `broker.call(\`${this.settings.agent.llm}.chat\`, { messages: history, toolSchemas: this.toolSchemas })`, (4) ha `finish_reason === "stop"` → saveHistory + return content, (5) ha `finish_reason === "tool_calls"` → minden tool_call-ra: ellenőrzés hogy a tool név benne van-e a whitelist-ben (this.toolSchemas-ból generált nevek), ha igen `broker.call(\`${this.name}.${toolCall.function.name}\`, JSON.parse(toolCall.function.arguments))`, eredmény hozzáfűzése a history-hoz tool message-ként. (6) Iteráció előtt `compactConversation(history)` hívás ha a history hossz meghaladja a `maxHistoryMessages`-t. (7) Ha a loop kimerül: `throw new Error("Max iterations reached")`. A system message a `settings.agent.instructions`-ből jön (ha van). Default értékek: `maxIterations: 10`, `maxHistoryMessages: 50`. A `loadHistory`, `saveHistory`, `compactConversation` default no-op implementációk (üres tömb, semmi, változatlan history). Írj unit teszteket FakeAdapter-rel (mock broker.call). **FONTOS:** A `run` és `chat` action-ök NE legyenek benne a tool schema whitelist-ben — csak a fejlesztő által definiált action-ök!

- **Task 2.3: MemoryMixin** — Implementáld a `src/memory.mixin.js`-t. Factory function: `module.exports = function MemoryMixin(mixinOpts)`. A mixin felülírja az AgentMixin no-op `loadHistory` és `saveHistory` metódusait. `loadHistory(sessionId)`: ha nincs sessionId, return `[]`. Különben `this.broker.cacher.get(\`agent:history:${this.name}:${sessionId}\`)` — ha null, return `[]`. `saveHistory(sessionId, history)`: ha nincs sessionId, return. Különben `this.broker.cacher.set(key, history, ttl)` — TTL: `this.settings.agent.historyTtl || 3600`. A `compactConversation(history)` felülírás: ha `history.length <= maxHistoryMessages` (default 50), return változatlanul. Különben: tartsd meg az első üzenetet (system message ha van), és az utolsó N üzenetet. Írj unit tesztet (Moleculer MemoryCacher-rel, nem kell Redis).

### Phase 3: Integráció és index

- **Task 3.1: Main index.js + integrációs tesztek** — Implementáld a `src/index.js`-t ami exportálja a publikus API-t: `module.exports = { AgentMixin, MemoryMixin, LLMService, Adapters }`. (Az OrchestratorMixin Phase 2-ben jön, most még nincs.) Írj integrációs tesztet `test/integration/agent-flow.test.js`-be ami egy teljes agent lifecycle-t tesztel: (1) ServiceBroker létrehozás `{ logger: false, cacher: "Memory" }`, (2) LLM service létrehozás FakeAdapter-rel (előre definiált válaszokkal: először tool_call, aztán stop), (3) Agent service létrehozás AgentMixin + MemoryMixin-nel (legyen benne legalább egy action description-nel mint tool), (4) `broker.call("test-agent.run", { task: "test" })` → ellenőrizd hogy a tool meghívódott és a végső válasz helyes, (5) `broker.call("test-agent.chat", { message: "hello", sessionId: "s1" })` → ellenőrizd multi-turn működést (második chat hívás ugyanazzal a sessionId-val emlékezzen az előzőre), (6) Hosszú history compaction tesztelés. A teszt teljesen self-contained legyen, ne függjön külső service-től vagy API-tól.
