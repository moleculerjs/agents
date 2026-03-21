/*
 * @moleculer/agents
 * Copyright (c) 2026 MoleculerJS (https://github.com/moleculerjs/agents)
 * MIT Licensed
 */

import { describe, expect, it, afterAll, beforeAll } from "vitest";
import { ServiceBroker } from "moleculer";
import AgentMixin from "../../src/agent.mixin.ts";
import OrchestratorMixin from "../../src/orchestrator.mixin.ts";
import LLMService from "../../src/llm.service.ts";
import FakeAdapter from "../../src/adapters/fake.ts";

describe("OrchestratorMixin E2E", () => {
	const broker = new ServiceBroker({ logger: false, cacher: "Memory" });

	beforeAll(() => broker.start());
	afterAll(() => broker.stop());

	it("should discover agent services and filter out non-agents and self", async () => {
		// LLM service (not an agent)
		const llmSvc = broker.createService({
			name: "llm.orch1",
			mixins: [LLMService()],
			settings: { adapter: new FakeAdapter({ responses: ["done"] }) }
		});

		// Sub-agent: weather
		const weatherSvc = broker.createService({
			name: "weather-agent",
			mixins: [AgentMixin()],
			settings: {
				agent: {
					llm: "llm.orch1",
					description: "Weather assistant"
				}
			},
			actions: {
				getCurrent: {
					description: "Get current weather",
					params: { city: { type: "string", description: "City" } },
					async handler() {
						return { temp: 22, condition: "sunny" };
					}
				}
			}
		});

		// Sub-agent: calculator
		const calcSvc = broker.createService({
			name: "calculator-agent",
			mixins: [AgentMixin()],
			settings: {
				agent: {
					llm: "llm.orch1",
					description: "Calculator assistant"
				}
			},
			actions: {
				add: {
					description: "Add two numbers",
					params: {
						a: { type: "number", description: "First number" },
						b: { type: "number", description: "Second number" }
					},
					async handler(ctx: { params: { a: number; b: number } }) {
						return ctx.params.a + ctx.params.b;
					}
				}
			}
		});

		// Plain service (no agent settings)
		const plainSvc = broker.createService({
			name: "plain-service",
			actions: {
				doSomething: {
					async handler() {
						return "ok";
					}
				}
			}
		});

		// Orchestrator
		const orchSvc = broker.createService({
			name: "orchestrator",
			mixins: [OrchestratorMixin(), AgentMixin()],
			settings: {
				agent: {
					llm: "llm.orch1",
					description: "Trip planner orchestrator",
					strategy: "direct"
				}
			},
			actions: {}
		});

		await broker.waitForServices([
			"llm.orch1",
			"weather-agent",
			"calculator-agent",
			"plain-service",
			"orchestrator"
		]);

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const agents = (orchSvc as any).discoverAgents();

		// Should find weather-agent and calculator-agent, but NOT self, plain-service, or llm service
		expect(agents).toHaveLength(2);

		const names = agents.map((a: { name: string }) => a.name).sort();
		expect(names).toEqual(["calculator-agent", "weather-agent"]);

		const weather = agents.find((a: { name: string }) => a.name === "weather-agent");
		expect(weather.description).toBe("Weather assistant");
		expect(weather.actions).toEqual(["getCurrent"]);

		const calc = agents.find((a: { name: string }) => a.name === "calculator-agent");
		expect(calc.description).toBe("Calculator assistant");
		expect(calc.actions).toEqual(["add"]);

		await broker.destroyService(orchSvc);
		await broker.destroyService(plainSvc);
		await broker.destroyService(calcSvc);
		await broker.destroyService(weatherSvc);
		await broker.destroyService(llmSvc);
	});

	it("should delegate task to sub-agent via delegateTo", async () => {
		const subAdapter = new FakeAdapter({
			responses: ["The weather in Paris is 20°C and cloudy."]
		});

		const llmSvc = broker.createService({
			name: "llm.orch2",
			mixins: [LLMService()],
			settings: { adapter: subAdapter }
		});

		const weatherSvc = broker.createService({
			name: "weather-agent-2",
			mixins: [AgentMixin()],
			settings: {
				agent: {
					llm: "llm.orch2",
					description: "Weather assistant"
				}
			},
			actions: {
				getCurrent: {
					description: "Get current weather",
					params: { city: { type: "string", description: "City" } },
					async handler() {
						return { temp: 20, condition: "cloudy" };
					}
				}
			}
		});

		const orchSvc = broker.createService({
			name: "orchestrator-2",
			mixins: [OrchestratorMixin(), AgentMixin()],
			settings: {
				agent: {
					llm: "llm.orch2",
					description: "Orchestrator",
					strategy: "direct"
				}
			},
			actions: {}
		});

		await broker.waitForServices(["llm.orch2", "weather-agent-2", "orchestrator-2"]);

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const result = await (orchSvc as any).delegateTo(
			"weather-agent-2",
			"What is the weather in Paris?"
		);

		expect(result).toBe("The weather in Paris is 20°C and cloudy.");

		await broker.destroyService(orchSvc);
		await broker.destroyService(weatherSvc);
		await broker.destroyService(llmSvc);
	});

	it("should run full orchestrator flow with direct strategy", async () => {
		// Sub-agent LLM: weather-agent will respond with this
		const subAdapter = new FakeAdapter({
			responses: ["Sunny, 25°C in Paris."]
		});

		const llmSvc = broker.createService({
			name: "llm.orch3",
			mixins: [LLMService()],
			settings: { adapter: subAdapter }
		});

		const weatherSvc = broker.createService({
			name: "weather-agent-3",
			mixins: [AgentMixin()],
			settings: {
				agent: {
					llm: "llm.orch3",
					description: "Weather assistant"
				}
			},
			actions: {
				getCurrent: {
					description: "Get current weather",
					params: { city: { type: "string", description: "City" } },
					async handler() {
						return { temp: 25, condition: "sunny" };
					}
				}
			}
		});

		// Orchestrator LLM: first calls planTrip tool, then returns final answer
		const orchAdapter = new FakeAdapter({
			responses: [
				{
					content: null,
					tool_calls: [
						{
							id: "call_plan",
							type: "function" as const,
							function: {
								name: "planTrip",
								arguments: JSON.stringify({
									destination: "Paris",
									days: 3
								})
							}
						}
					]
				},
				"Trip planned! Weather in Paris: Sunny, 25°C."
			]
		});

		const orchLlmSvc = broker.createService({
			name: "llm.orch3b",
			mixins: [LLMService()],
			settings: { adapter: orchAdapter }
		});

		const orchSvc = broker.createService({
			name: "orchestrator-3",
			mixins: [OrchestratorMixin(), AgentMixin()],
			settings: {
				agent: {
					llm: "llm.orch3b",
					description: "Trip planner",
					strategy: "direct"
				}
			},
			actions: {
				planTrip: {
					description: "Plan a complete trip",
					params: {
						destination: { type: "string", description: "Destination city" },
						days: { type: "number", description: "Number of days" }
					},
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					async handler(this: any, ctx: any) {
						const weather = await this.delegateTo(
							"weather-agent-3",
							`Weather in ${ctx.params.destination} for ${ctx.params.days} days`
						);
						return `Weather: ${weather}`;
					}
				}
			}
		});

		await broker.waitForServices([
			"llm.orch3",
			"llm.orch3b",
			"weather-agent-3",
			"orchestrator-3"
		]);

		const result = await broker.call("orchestrator-3.run", {
			task: "Plan a trip to Paris for 3 days"
		});

		expect(result).toBe("Trip planned! Weather in Paris: Sunny, 25°C.");

		await broker.destroyService(orchSvc);
		await broker.destroyService(orchLlmSvc);
		await broker.destroyService(weatherSvc);
		await broker.destroyService(llmSvc);
	});

	it("should generate _routeToAgent tool for llm-router strategy", async () => {
		const adapter = new FakeAdapter({ responses: ["done"] });

		const llmSvc = broker.createService({
			name: "llm.orch4",
			mixins: [LLMService()],
			settings: { adapter }
		});

		const weatherSvc = broker.createService({
			name: "weather-agent-4",
			mixins: [AgentMixin()],
			settings: {
				agent: {
					llm: "llm.orch4",
					description: "Weather assistant"
				}
			},
			actions: {
				getCurrent: {
					description: "Get current weather",
					params: { city: { type: "string", description: "City" } },
					async handler() {
						return { temp: 22 };
					}
				}
			}
		});

		const orchSvc = broker.createService({
			name: "orchestrator-4",
			mixins: [OrchestratorMixin(), AgentMixin()],
			settings: {
				agent: {
					llm: "llm.orch4",
					description: "LLM router orchestrator",
					strategy: "llm-router"
				}
			},
			actions: {}
		});

		await broker.waitForServices(["llm.orch4", "weather-agent-4", "orchestrator-4"]);

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const toolSchemas = (orchSvc as any).toolSchemas;
		const routeTool = toolSchemas.find(
			(ts: { name: string }) => ts.name === "_routeToAgent"
		);

		expect(routeTool).toBeDefined();
		expect(routeTool.description).toContain("weather-agent-4");
		expect(routeTool.description).toContain("Weather assistant");
		expect(routeTool.params.agentName).toBeDefined();
		expect(routeTool.params.task).toBeDefined();

		await broker.destroyService(orchSvc);
		await broker.destroyService(weatherSvc);
		await broker.destroyService(llmSvc);
	});

	it("should NOT generate _routeToAgent tool for direct strategy", async () => {
		const adapter = new FakeAdapter({ responses: ["done"] });

		const llmSvc = broker.createService({
			name: "llm.orch5",
			mixins: [LLMService()],
			settings: { adapter }
		});

		const orchSvc = broker.createService({
			name: "orchestrator-5",
			mixins: [OrchestratorMixin(), AgentMixin()],
			settings: {
				agent: {
					llm: "llm.orch5",
					description: "Direct orchestrator",
					strategy: "direct"
				}
			},
			actions: {}
		});

		await broker.waitForServices(["llm.orch5", "orchestrator-5"]);

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const toolSchemas = (orchSvc as any).toolSchemas;
		const routeTool = toolSchemas.find(
			(ts: { name: string }) => ts.name === "_routeToAgent"
		);

		expect(routeTool).toBeUndefined();

		await broker.destroyService(orchSvc);
		await broker.destroyService(llmSvc);
	});

	it("should update _routeToAgent on $services.changed event", async () => {
		const adapter = new FakeAdapter({ responses: ["done"] });

		const llmSvc = broker.createService({
			name: "llm.orch6",
			mixins: [LLMService()],
			settings: { adapter }
		});

		const orchSvc = broker.createService({
			name: "orchestrator-6",
			mixins: [OrchestratorMixin(), AgentMixin()],
			settings: {
				agent: {
					llm: "llm.orch6",
					description: "Dynamic orchestrator",
					strategy: "llm-router"
				}
			},
			actions: {}
		});

		await broker.waitForServices(["llm.orch6", "orchestrator-6"]);

		// Initially no agents to route to, so no _routeToAgent
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		let toolSchemas = (orchSvc as any).toolSchemas;
		let routeTool = toolSchemas.find(
			(ts: { name: string }) => ts.name === "_routeToAgent"
		);
		expect(routeTool).toBeUndefined();

		// Add a new agent service
		const newAgent = broker.createService({
			name: "new-agent",
			mixins: [AgentMixin()],
			settings: {
				agent: {
					llm: "llm.orch6",
					description: "Dynamically added agent"
				}
			},
			actions: {
				doWork: {
					description: "Do some work",
					params: {},
					async handler() {
						return "done";
					}
				}
			}
		});

		await broker.waitForServices(["new-agent"]);

		// Emit $services.changed to trigger update
		broker.broadcastLocal("$services.changed");

		// Now _routeToAgent should be present
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		toolSchemas = (orchSvc as any).toolSchemas;
		routeTool = toolSchemas.find(
			(ts: { name: string }) => ts.name === "_routeToAgent"
		);
		expect(routeTool).toBeDefined();
		expect(routeTool.description).toContain("new-agent");

		await broker.destroyService(newAgent);
		await broker.destroyService(orchSvc);
		await broker.destroyService(llmSvc);
	});
});
