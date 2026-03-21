/*
 * Multi-Turn Chat Example
 *
 * Demonstrates conversation memory using MemoryMixin.
 * The agent remembers previous messages in the same session.
 *
 * Run: npx tsx examples/multi-turn-chat.ts
 *
 * Set OPENAI_API_KEY or ANTHROPIC_API_KEY to use a real LLM,
 * otherwise falls back to FakeAdapter with scripted responses.
 */

import { ServiceBroker } from "moleculer";
import { AgentMixin, MemoryMixin, LLMService } from "../src/index.ts";
import { createAdapter } from "./helpers/create-adapter.ts";

const broker = new ServiceBroker({
	logger: {
		type: "Console",
		options: { level: "info" }
	},
	cacher: "Memory" // Required for MemoryMixin
});

// --- LLM service ---
const { adapter } = createAdapter({
	fakeResponses: [
		// First chat message response
		"Hello! I'm your math assistant. What would you like to calculate?",
		// Second message: LLM calls the "add" tool
		{
			content: null,
			finish_reason: "tool_calls" as const,
			tool_calls: [
				{
					id: "call_1",
					type: "function" as const,
					function: {
						name: "add",
						arguments: JSON.stringify({ a: 5, b: 3 })
					}
				}
			]
		},
		// After tool result, LLM gives final answer
		"5 + 3 = 8. Would you like to do another calculation?",
		// Third message response (agent remembers context)
		"Since you previously asked about 5 + 3, I know you're interested in addition. Yes, 8 + 2 = 10!"
	]
});

broker.createService({
	name: "llm",
	mixins: [LLMService()],
	settings: { adapter }
});

// --- Math agent with memory ---
broker.createService({
	name: "math-agent",
	mixins: [MemoryMixin(), AgentMixin()],

	settings: {
		agent: {
			description: "Math assistant with memory",
			instructions:
				"You are a helpful math assistant. Remember the context of the conversation.",
			llm: "llm",
			historyTtl: 600, // Remember for 10 minutes
			maxHistoryMessages: 100
		}
	},

	actions: {
		add: {
			description: "Add two numbers together",
			params: {
				a: { type: "number", description: "First number" },
				b: { type: "number", description: "Second number" }
			},
			handler(ctx) {
				console.log(`  [Tool called] add(${ctx.params.a}, ${ctx.params.b})`);
				return { result: ctx.params.a + ctx.params.b };
			}
		},

		multiply: {
			description: "Multiply two numbers",
			params: {
				a: { type: "number", description: "First number" },
				b: { type: "number", description: "Second number" }
			},
			handler(ctx) {
				console.log(`  [Tool called] multiply(${ctx.params.a}, ${ctx.params.b})`);
				return { result: ctx.params.a * ctx.params.b };
			}
		}
	}
});

async function main() {
	await broker.start();
	const sessionId = "session-123";

	console.log("\n--- Multi-turn chat with memory ---\n");

	// Turn 1: Greeting
	console.log("User: Hi there!");
	const r1 = await broker.call("math-agent.chat", {
		message: "Hi there!",
		sessionId
	});
	console.log(`Agent: ${r1}\n`);

	// Turn 2: Ask a calculation (triggers tool use)
	console.log("User: What is 5 + 3?");
	const r2 = await broker.call("math-agent.chat", {
		message: "What is 5 + 3?",
		sessionId
	});
	console.log(`Agent: ${r2}\n`);

	// Turn 3: Follow-up (agent should remember previous context)
	console.log("User: And what if I add 2 more to that?");
	const r3 = await broker.call("math-agent.chat", {
		message: "And what if I add 2 more to that?",
		sessionId
	});
	console.log(`Agent: ${r3}\n`);

	await broker.stop();
}

main().catch(console.error);
