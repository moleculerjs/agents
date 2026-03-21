/*
 * @moleculer/agents
 * Copyright (c) 2026 MoleculerJS (https://github.com/moleculerjs/agents)
 * MIT Licensed
 */

import { describe, expect, it, afterAll, beforeAll, vi } from "vitest";
import { ServiceBroker } from "moleculer";
import AgentMixin from "../../src/agent.mixin.ts";
import OrchestratorMixin from "../../src/orchestrator.mixin.ts";

describe("Test OrchestratorMixin", () => {
	const broker = new ServiceBroker({ logger: false });

	beforeAll(() => broker.start());
	afterAll(() => broker.stop());

	describe("discoverAgents", () => {
		it("should return only agent services and filter out self and non-agents", async () => {
			// Agent service 1
			const agent1 = broker.createService({
				name: "weather-agent",
				mixins: [AgentMixin()],
				settings: {
					agent: {
						llm: "llm",
						description: "Weather assistant"
					}
				},
				actions: {
					getCurrent: {
						description: "Get current weather",
						params: { city: { type: "string", description: "City" } },
						handler() {
							return "sunny";
						}
					}
				}
			});

			// Agent service 2
			const agent2 = broker.createService({
				name: "calc-agent",
				mixins: [AgentMixin()],
				settings: {
					agent: {
						llm: "llm",
						description: "Calculator"
					}
				},
				actions: {
					add: {
						description: "Add numbers",
						params: {
							a: { type: "number" },
							b: { type: "number" }
						},
						handler() {
							return 0;
						}
					}
				}
			});

			// Non-agent service
			const plain = broker.createService({
				name: "plain-service",
				actions: {
					doStuff: {
						handler() {
							return "ok";
						}
					}
				}
			});

			// Orchestrator (should filter itself out)
			const orch = broker.createService({
				name: "my-orchestrator",
				mixins: [OrchestratorMixin(), AgentMixin()],
				settings: {
					agent: {
						llm: "llm",
						description: "Orchestrator",
						strategy: "direct"
					}
				},
				actions: {}
			});

			await broker.waitForServices([
				"weather-agent",
				"calc-agent",
				"plain-service",
				"my-orchestrator"
			]);

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const agents = (orch as any).discoverAgents();

			expect(agents).toHaveLength(2);

			const names = agents.map((a: { name: string }) => a.name).sort();
			expect(names).toEqual(["calc-agent", "weather-agent"]);

			// Verify actions are populated correctly (run/chat excluded)
			const weather = agents.find((a: { name: string }) => a.name === "weather-agent");
			expect(weather.description).toBe("Weather assistant");
			expect(weather.actions).toEqual(["getCurrent"]);

			const calc = agents.find((a: { name: string }) => a.name === "calc-agent");
			expect(calc.description).toBe("Calculator");
			expect(calc.actions).toEqual(["add"]);

			await broker.destroyService(orch);
			await broker.destroyService(plain);
			await broker.destroyService(agent2);
			await broker.destroyService(agent1);
		});
	});

	describe("delegateTo", () => {
		it("should call broker.call with agent-name.run", async () => {
			const mockAgent = broker.createService({
				name: "mock-agent",
				mixins: [AgentMixin()],
				settings: {
					agent: { llm: "llm", description: "Mock" }
				},
				actions: {
					run: {
						handler() {
							return "mock result";
						}
					}
				}
			});

			const orch = broker.createService({
				name: "orch-delegate",
				mixins: [OrchestratorMixin(), AgentMixin()],
				settings: {
					agent: {
						llm: "llm",
						description: "Orchestrator",
						strategy: "direct"
					}
				},
				actions: {}
			});

			await broker.waitForServices(["mock-agent", "orch-delegate"]);

			const callSpy = vi.spyOn(broker, "call");

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const result = await (orch as any).delegateTo("mock-agent", "Do something");

			expect(result).toBe("mock result");
			expect(callSpy).toHaveBeenCalledWith("mock-agent.run", {
				task: "Do something",
				sessionId: undefined
			});

			callSpy.mockRestore();
			await broker.destroyService(orch);
			await broker.destroyService(mockAgent);
		});
	});

	describe("_routeToAgent tool generation", () => {
		it("should include _routeToAgent in toolSchemas for llm-router strategy", async () => {
			const agent = broker.createService({
				name: "router-sub-agent",
				mixins: [AgentMixin()],
				settings: {
					agent: {
						llm: "llm",
						description: "Sub agent for routing"
					}
				},
				actions: {
					doWork: {
						description: "Do work",
						params: {},
						handler() {
							return "done";
						}
					}
				}
			});

			const orch = broker.createService({
				name: "orch-router",
				mixins: [OrchestratorMixin(), AgentMixin()],
				settings: {
					agent: {
						llm: "llm",
						description: "Router orchestrator",
						strategy: "llm-router"
					}
				},
				actions: {}
			});

			await broker.waitForServices(["router-sub-agent", "orch-router"]);

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const toolSchemas = (orch as any).toolSchemas;
			const routeTool = toolSchemas.find(
				(ts: { name: string }) => ts.name === "_routeToAgent"
			);

			expect(routeTool).toBeDefined();
			expect(routeTool.description).toContain("router-sub-agent");
			expect(routeTool.description).toContain("Sub agent for routing");
			expect(routeTool.params.agentName).toBeDefined();
			expect(routeTool.params.task).toBeDefined();

			await broker.destroyService(orch);
			await broker.destroyService(agent);
		});
	});

	describe("Direct strategy", () => {
		it("should NOT generate _routeToAgent tool for direct strategy", async () => {
			const orch = broker.createService({
				name: "orch-direct",
				mixins: [OrchestratorMixin(), AgentMixin()],
				settings: {
					agent: {
						llm: "llm",
						description: "Direct orchestrator",
						strategy: "direct"
					}
				},
				actions: {}
			});

			await broker.waitForServices(["orch-direct"]);

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const toolSchemas = (orch as any).toolSchemas;
			const routeTool = toolSchemas.find(
				(ts: { name: string }) => ts.name === "_routeToAgent"
			);

			expect(routeTool).toBeUndefined();

			await broker.destroyService(orch);
		});
	});
});
