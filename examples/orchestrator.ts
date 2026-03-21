/*
 * Orchestrator Example
 *
 * Demonstrates multi-agent coordination with an orchestrator
 * that delegates tasks to sub-agents (weather + calculator).
 *
 * Run: npx tsx examples/orchestrator.ts
 *
 * Set OPENAI_API_KEY or ANTHROPIC_API_KEY to use a real LLM,
 * otherwise falls back to FakeAdapter with scripted responses.
 */

import { ServiceBroker } from "moleculer";
import { AgentMixin, OrchestratorMixin, LLMService } from "../src/index.ts";
import { createAdapter } from "./helpers/create-adapter.ts";

// --- 1. Create broker ---
const broker = new ServiceBroker({
	logger: {
		type: "Console",
		options: { level: "info" }
	}
});

// --- 2. LLM service for sub-agents ---
const { adapter: subAdapter } = createAdapter({
	fakeResponses: [
		"Sunny, 25°C in Paris for the next 3 days.",
		"42"
	]
});

broker.createService({
	name: "llm.sub",
	mixins: [LLMService()],
	settings: { adapter: subAdapter }
});

// --- 3. Sub-agent: weather ---
broker.createService({
	name: "weather-agent",
	mixins: [AgentMixin()],
	settings: {
		agent: {
			description: "Weather assistant — current weather and forecasts",
			instructions: "Help users with weather questions. Be concise.",
			llm: "llm.sub"
		}
	},
	actions: {
		getCurrent: {
			description: "Get current weather for a city",
			params: {
				city: { type: "string", description: "City name" }
			},
			handler(ctx) {
				console.log(`  [weather-agent] getCurrent("${ctx.params.city}")`);
				return { city: ctx.params.city, temp: 25, condition: "sunny" };
			}
		}
	}
});

// --- 4. Sub-agent: calculator ---
broker.createService({
	name: "calculator-agent",
	mixins: [AgentMixin()],
	settings: {
		agent: {
			description: "Calculator — performs arithmetic operations",
			instructions: "Perform calculations accurately.",
			llm: "llm.sub"
		}
	},
	actions: {
		add: {
			description: "Add two numbers",
			params: {
				a: { type: "number", description: "First number" },
				b: { type: "number", description: "Second number" }
			},
			handler(ctx) {
				console.log(`  [calculator-agent] add(${ctx.params.a}, ${ctx.params.b})`);
				return ctx.params.a + ctx.params.b;
			}
		}
	}
});

// --- 5. Orchestrator LLM ---
const { adapter: orchAdapter } = createAdapter({
	fakeResponses: [
		// LLM decides to call planTrip tool
		{
			content: null,
			finish_reason: "tool_calls" as const,
			tool_calls: [
				{
					id: "call_1",
					type: "function" as const,
					function: {
						name: "planTrip",
						arguments: JSON.stringify({ destination: "Paris", days: 3 })
					}
				}
			]
		},
		// LLM returns final answer
		"Your trip to Paris is planned! Weather: Sunny, 25°C. Enjoy your 3-day trip!"
	]
});

broker.createService({
	name: "llm.orch",
	mixins: [LLMService()],
	settings: { adapter: orchAdapter }
});

// --- 6. Orchestrator service (direct strategy) ---
broker.createService({
	name: "trip-planner",
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	mixins: [OrchestratorMixin(), AgentMixin()] as any[],
	settings: {
		agent: {
			description: "Trip planner — coordinates weather and calculation agents",
			instructions: "Plan trips by delegating to weather and calculator agents.",
			llm: "llm.orch",
			strategy: "direct"
		}
	},
	actions: {
		planTrip: {
			description: "Plan a complete trip to a destination",
			params: {
				destination: { type: "string", description: "Destination city" },
				days: { type: "number", description: "Number of days" }
			},
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			async handler(this: any, ctx: any) {
				console.log(
					`  [trip-planner] planTrip("${ctx.params.destination}", ${ctx.params.days})`
				);
				const weather = await this.delegateTo(
					"weather-agent",
					`Weather in ${ctx.params.destination} for ${ctx.params.days} days`
				);
				return `Weather: ${weather}`;
			}
		}
	}
});

// --- 7. Start and run ---
async function main() {
	await broker.start();

	console.log("\n--- Discovering agents ---\n");

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const services = (broker as any).getLocalService("trip-planner");
	const agents = services.discoverAgents();
	console.log("Discovered agents:", JSON.stringify(agents, null, 2));

	console.log("\n--- Running orchestrator ---\n");

	const result = await broker.call("trip-planner.run", {
		task: "Plan a trip to Paris for 3 days"
	});

	console.log(`\n--- Orchestrator response ---\n${result}\n`);

	await broker.stop();
}

main().catch(console.error);
