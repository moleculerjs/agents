# @moleculer/agents

AI agent capabilities for the [Moleculer](https://moleculer.services) microservices framework.

Turn any Moleculer service into an AI agent by adding a mixin. Your existing service actions automatically become LLM tools — no manual schema definitions needed.

## Key Insight

A Moleculer action definition is structurally identical to an LLM tool definition. Just add a `description` field and the conversion is automatic:

```typescript
// This Moleculer action...
actions: {
  getWeather: {
    description: "Get current weather for a city",
    params: {
      city: { type: "string", description: "City name" }
    },
    async handler(ctx) { /* ... */ }
  }
}

// ...automatically becomes an LLM tool that AI agents can call.
```

## What Moleculer Gives You for Free

No new infrastructure needed — the framework already provides everything an AI agent system requires:

- **Agent discovery** — Service Registry knows which agents are alive and what they can do
- **Load balancing** — Multiple agent instances are automatically balanced
- **Fault tolerance** — Circuit breaker, retry, timeout at action level
- **Event coordination** — Native pub/sub for agent-to-agent events
- **Distributed transport** — NATS, Redis, Kafka for multi-node agent networks
- **Observability** — Built-in distributed tracing and metrics

## Installation

```bash
npm install @moleculer/agents
```

**Peer dependency:**
```bash
npm install moleculer
```

**For OpenAI adapter:**
```bash
npm install openai
```

**For Anthropic adapter:**
```bash
npm install @anthropic-ai/sdk
```

## Quick Start

### 1. Create an LLM service

The LLM service wraps a provider adapter and makes it callable by agents:

```typescript
import { LLMService } from "@moleculer/agents";

export default {
  name: "llm.openai",
  mixins: [LLMService()],
  settings: {
    adapter: "OpenAI",
    apiKey: process.env.OPENAI_API_KEY,
    model: "gpt-4o"
  }
};
```

### 2. Create an agent service

Add `AgentMixin` to any service. Actions with a `description` field automatically become tools:

```typescript
import { AgentMixin } from "@moleculer/agents";

export default {
  name: "weather-agent",
  mixins: [AgentMixin()],

  settings: {
    agent: {
      description: "Weather assistant",
      instructions: "Help users with weather questions. Be concise.",
      llm: "llm.openai"
    }
  },

  actions: {
    getCurrent: {
      description: "Get current weather for a city",
      params: {
        city: { type: "string", description: "City name" }
      },
      async handler(ctx) {
        const data = await fetchWeatherAPI(ctx.params.city);
        return { temp: data.temp, condition: data.condition };
      }
    },

    getForecast: {
      description: "Multi-day weather forecast",
      params: {
        city: { type: "string", description: "City name" },
        days: { type: "number", description: "Number of days (1-7)" }
      },
      async handler(ctx) {
        return await fetchForecastAPI(ctx.params.city, ctx.params.days);
      }
    }
  }
};
```

### 3. Use the agent

```typescript
// One-shot task
const result = await broker.call("weather-agent.run", {
  task: "What's the weather like in Budapest?"
});

// Multi-turn conversation (requires MemoryMixin, see below)
const response = await broker.call("weather-agent.chat", {
  message: "What about tomorrow?",
  sessionId: "user-123"
});
```

## Conversation Memory

Add `MemoryMixin` for multi-turn conversations. It stores history in Moleculer's cacher (works with Redis, Memory, or any other cacher):

```typescript
import { AgentMixin, MemoryMixin } from "@moleculer/agents";

export default {
  name: "assistant",
  mixins: [MemoryMixin(), AgentMixin()],

  settings: {
    agent: {
      description: "General assistant with memory",
      instructions: "You are a helpful assistant. Remember the conversation context.",
      llm: "llm.openai",
      historyTtl: 1800,        // Remember for 30 minutes
      maxHistoryMessages: 100  // Keep last 100 messages (sliding window)
    }
  },

  actions: {
    // ... your tool actions
  }
};
```

**Important:** Your broker must have a cacher configured:
```typescript
const broker = new ServiceBroker({
  cacher: "Memory"  // or "Redis" for distributed environments
});
```

The `chat` action uses `sessionId` to maintain separate conversations:
```typescript
// User A's conversation
await broker.call("assistant.chat", { message: "Hi!", sessionId: "user-a" });
await broker.call("assistant.chat", { message: "What did I just say?", sessionId: "user-a" });

// User B's separate conversation
await broker.call("assistant.chat", { message: "Hello!", sessionId: "user-b" });
```

## LLM Adapters

### OpenAI (+ compatible APIs)

Works with OpenAI, OpenRouter, Together, Groq, Fireworks, and any OpenAI-compatible API:

```typescript
import { LLMService } from "@moleculer/agents";

// Standard OpenAI
export default {
  name: "llm.openai",
  mixins: [LLMService()],
  settings: {
    adapter: "OpenAI",
    apiKey: process.env.OPENAI_API_KEY,
    model: "gpt-4o"
  }
};

// OpenRouter (or any compatible API)
export default {
  name: "llm.openrouter",
  mixins: [LLMService()],
  settings: {
    adapter: {
      type: "OpenAI",
      apiKey: process.env.OPENROUTER_API_KEY,
      model: "anthropic/claude-sonnet-4-20250514",
      baseURL: "https://openrouter.ai/api/v1"
    }
  }
};
```

> **Note:** Requires `npm install openai`

### Anthropic

```typescript
export default {
  name: "llm.anthropic",
  mixins: [LLMService()],
  settings: {
    adapter: "Anthropic",
    apiKey: process.env.ANTHROPIC_API_KEY,
    model: "claude-sonnet-4-20250514"
  }
};
```

> **Note:** Requires `npm install @anthropic-ai/sdk`

### Fake (for testing)

Deterministic adapter that returns scripted responses — no API calls:

```typescript
import { LLMService, Adapters } from "@moleculer/agents";

const adapter = new Adapters.Fake({
  responses: [
    // Tool call response
    {
      content: null,
      finish_reason: "tool_calls",
      tool_calls: [{
        id: "call_1",
        type: "function",
        function: {
          name: "getCurrent",
          arguments: JSON.stringify({ city: "Budapest" })
        }
      }]
    },
    // Final text response
    "The weather in Budapest is 18°C and sunny."
  ]
});

export default {
  name: "llm.test",
  mixins: [LLMService()],
  settings: { adapter }
};
```

### Custom Adapter

Register your own adapter for any LLM provider:

```typescript
import { Adapters } from "@moleculer/agents";
import BaseAdapter from "@moleculer/agents/src/adapters/base.ts";

class MyCustomAdapter extends BaseAdapter {
  async chat(messages, tools) {
    // Call your provider, return OpenAI-format response
    return { content: "...", finish_reason: "stop" };
  }

  convertToolSchema(name, description, params) {
    // Convert Moleculer params to your provider's format
    return { /* ... */ };
  }
}

Adapters.register("MyCustom", MyCustomAdapter);
```

## Agent Settings Reference

```typescript
settings: {
  agent: {
    // Required
    description: string,     // What this agent does (used for discovery)
    llm: string,             // Name of the LLM service (e.g., "llm.openai")

    // Optional
    instructions: string,    // System prompt for the agent
    maxIterations: number,   // Max ReAct loop iterations (default: 10)
    historyTtl: number,      // Session history TTL in seconds (default: 3600)
    maxHistoryMessages: number // Sliding window size (default: 50)
  }
}
```

## Supported Parameter Types

Only these fastest-validator types are converted to tool schemas. Actions using unsupported types will have those params excluded with a warning:

| Type | JSON Schema | Notes |
|------|-------------|-------|
| `string` | `string` | |
| `number` | `number` | |
| `boolean` | `boolean` | |
| `object` | `object` | Nested `properties` or `props` supported |
| `array` | `array` | With `items` definition |
| `enum` | string + `enum` | Values from `.values` array |
| `email` | `string` | Format hint in description |
| `url` | `string` | Format hint in description |
| `date` | `string` | Format hint in description |
| `uuid` | `string` | Format hint in description |

The `description` field on both actions and individual params is critical — it's what the LLM uses to understand the tool. **Actions without `description` are not exposed as tools.**

## How It Works

The `AgentMixin` implements a **ReAct (Reason + Act) loop**:

1. User sends a task via `run` or `chat` action
2. Agent loads conversation history (if MemoryMixin is present)
3. Agent sends the task + available tools to the LLM
4. If the LLM returns a **tool call**: execute the action, feed the result back to the LLM, repeat
5. If the LLM returns a **text response**: save history and return to the user
6. If max iterations exceeded: throw an error

```
User → run("What's the weather?")
         │
         ▼
    ┌─── ReAct Loop ───┐
    │                   │
    │  LLM: "I need to  │
    │  call getCurrent"  │
    │       │           │
    │       ▼           │
    │  Execute tool     │
    │  getCurrent()     │
    │       │           │
    │       ▼           │
    │  LLM: "It's 18°C  │
    │  and sunny"       │
    │                   │
    └───────────────────┘
         │
         ▼
    Return "It's 18°C and sunny"
```

## Examples

Runnable examples are in the [`examples/`](./examples) directory:

```bash
# Simple agent with tool calling
npx tsx examples/simple-agent.ts

# Multi-turn chat with conversation memory
npx tsx examples/multi-turn-chat.ts
```

## Development

```bash
# Install dependencies
npm install

# Run tests
npm test

# Run unit tests only
npm run test:unit

# Type check
npm run check

# Build (CJS + ESM + types)
npm run build

# Lint
npm run lint
```

## Requirements

- Node.js >= 22
- Moleculer >= 0.15.0-beta

## License

MIT
