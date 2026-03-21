/*
 * Simple Agent Example
 *
 * Demonstrates a basic weather agent that can look up weather
 * and forecasts using tool calling.
 *
 * Run: npx tsx examples/simple-agent.ts
 *
 * Set OPENAI_API_KEY or ANTHROPIC_API_KEY to use a real LLM,
 * otherwise falls back to FakeAdapter with scripted responses.
 */

import { ServiceBroker } from "moleculer";
import { AgentMixin, LLMService } from "../src/index.ts";
import { createAdapter } from "./helpers/create-adapter.ts";

// --- 1. Create broker ---
const broker = new ServiceBroker({
	logger: {
		type: "Console",
		options: { level: "info" }
	}
});

// --- 2. Create LLM service ---
const { adapter } = createAdapter({
	fakeResponses: [
		// First call: LLM decides to call the "getCurrent" tool
		{
			content: null,
			finish_reason: "tool_calls" as const,
			tool_calls: [
				{
					id: "call_1",
					type: "function" as const,
					function: {
						name: "getCurrent",
						arguments: JSON.stringify({ city: "Budapest" })
					}
				}
			]
		},
		// Second call: LLM returns the final answer using the tool result
		"The current weather in Budapest is 18°C and sunny. Perfect for a walk!"
	]
});

broker.createService({
	name: "llm",
	mixins: [LLMService()],
	settings: { adapter }
});

// --- 3. Create weather agent service ---
broker.createService({
	name: "weather-agent",
	mixins: [AgentMixin()],

	settings: {
		agent: {
			description: "Weather assistant",
			instructions:
				"You are a helpful weather assistant. Use the available tools to look up weather information.",
			llm: "llm"
		}
	},

	actions: {
		getCurrent: {
			description: "Get current weather for a city",
			params: {
				city: { type: "string", description: "City name" }
			},
			handler(ctx) {
				// In a real agent, this would call a weather API
				console.log(`  [Tool called] getCurrent("${ctx.params.city}")`);
				return {
					city: ctx.params.city,
					temp: 18,
					condition: "sunny",
					humidity: 45
				};
			}
		},

		getForecast: {
			description: "Get multi-day weather forecast",
			params: {
				city: { type: "string", description: "City name" },
				days: { type: "number", description: "Number of days (1-7)" }
			},
			handler(ctx) {
				console.log(
					`  [Tool called] getForecast("${ctx.params.city}", ${ctx.params.days})`
				);
				return {
					city: ctx.params.city,
					forecast: Array.from({ length: ctx.params.days }, (_, i) => ({
						day: i + 1,
						temp: 15 + Math.round(Math.random() * 10),
						condition: ["sunny", "cloudy", "rainy"][i % 3]
					}))
				};
			}
		}
	}
});

// --- 4. Start and run ---
async function main() {
	await broker.start();

	console.log("\n--- Running weather agent ---\n");

	const result = await broker.call("weather-agent.run", {
		task: "What's the weather like in Budapest?"
	});

	console.log(`\n--- Agent response ---\n${result}\n`);

	await broker.stop();
}

main().catch(console.error);
