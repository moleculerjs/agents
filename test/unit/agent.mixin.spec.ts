/*
 * @moleculer/agents
 * Copyright (c) 2026 MoleculerJS (https://github.com/moleculerjs/agents)
 * MIT Licensed
 */

import { describe, expect, it, afterAll, beforeAll, vi } from "vitest";
import { ServiceBroker } from "moleculer";
import AgentMixin from "../../src/agent.mixin.ts";

describe("Test AgentMixin", () => {
	const broker = new ServiceBroker({ logger: false });

	beforeAll(() => broker.start());
	afterAll(() => broker.stop());

	describe("Tool schema generation", () => {
		it("should generate tool schemas from actions with description", async () => {
			const svc = broker.createService({
				name: "tool-gen-1",
				mixins: [AgentMixin()],
				settings: { agent: { llm: "llm", description: "test" } },
				actions: {
					withDesc: {
						description: "Has description",
						params: { id: { type: "number" } },
						handler() {
							return "ok";
						}
					},
					noDesc: {
						params: { id: { type: "number" } },
						handler() {
							return "ok";
						}
					}
				}
			});
			await broker.waitForServices("tool-gen-1");

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const schemas = (svc as any).toolSchemas;
			expect(schemas).toHaveLength(1);
			expect(schemas[0]).toEqual({
				name: "withDesc",
				description: "Has description",
				params: { id: { type: "number" } }
			});

			await broker.destroyService(svc);
		});

		it("should exclude run and chat from tool schemas", async () => {
			const svc = broker.createService({
				name: "tool-gen-2",
				mixins: [AgentMixin()],
				settings: { agent: { llm: "llm", description: "test" } },
				actions: {
					myAction: {
						description: "Custom action",
						params: {},
						handler() {
							return "ok";
						}
					}
				}
			});
			await broker.waitForServices("tool-gen-2");

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const schemas = (svc as any).toolSchemas;
			const names = schemas.map((s: { name: string }) => s.name);
			expect(names).not.toContain("run");
			expect(names).not.toContain("chat");
			expect(names).toContain("myAction");

			await broker.destroyService(svc);
		});

		it("should handle actions with no params", async () => {
			const svc = broker.createService({
				name: "tool-gen-3",
				mixins: [AgentMixin()],
				settings: { agent: { llm: "llm", description: "test" } },
				actions: {
					noParams: {
						description: "No params action",
						handler() {
							return "ok";
						}
					}
				}
			});
			await broker.waitForServices("tool-gen-3");

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const schemas = (svc as any).toolSchemas;
			expect(schemas[0].params).toEqual({});

			await broker.destroyService(svc);
		});
	});

	describe("Actions", () => {
		it("should create run and chat actions", async () => {
			const svc = broker.createService({
				name: "action-test",
				mixins: [AgentMixin()],
				settings: { agent: { llm: "llm", description: "test" } },
				actions: {}
			});
			await broker.waitForServices("action-test");

			// Verify actions are registered in the broker registry
			const runEndpoint = broker.registry.getActionEndpoints("action-test.run");
			expect(runEndpoint).toBeDefined();

			const chatEndpoint = broker.registry.getActionEndpoints("action-test.chat");
			expect(chatEndpoint).toBeDefined();

			await broker.destroyService(svc);
		});
	});

	describe("ReAct loop", () => {
		it("should stop on finish_reason=stop", async () => {
			const mockCall = vi.fn().mockResolvedValue({
				content: "Final answer",
				finish_reason: "stop"
			});

			const svc = broker.createService({
				name: "react-stop",
				mixins: [AgentMixin()],
				settings: { agent: { llm: "mock-llm", description: "test" } },
				actions: {}
			});
			await broker.waitForServices("react-stop");

			// Replace broker.call for this test
			const origCall = broker.call.bind(broker);
			broker.call = vi.fn().mockImplementation((action: string, ...args: unknown[]) => {
				if (action === "mock-llm.chat") return mockCall(...args);
				return origCall(action, ...args);
			});

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const result = await (svc as any).runReActLoop("Hello");
			expect(result).toBe("Final answer");

			broker.call = origCall;
			await broker.destroyService(svc);
		});

		it("should execute tool calls and continue loop", async () => {
			let llmCallCount = 0;
			const mockCall = vi.fn().mockImplementation(() => {
				llmCallCount++;
				if (llmCallCount === 1) {
					return {
						content: null,
						finish_reason: "tool_calls",
						tool_calls: [
							{
								id: "tc_1",
								type: "function",
								function: { name: "ping", arguments: "{}" }
							}
						]
					};
				}
				return { content: "Done after tool", finish_reason: "stop" };
			});

			const svc = broker.createService({
				name: "react-tool",
				mixins: [AgentMixin()],
				settings: { agent: { llm: "mock-llm2", description: "test" } },
				actions: {
					ping: {
						description: "Ping",
						params: {},
						handler() {
							return "pong";
						}
					}
				}
			});
			await broker.waitForServices("react-tool");

			const origCall = broker.call.bind(broker);
			broker.call = vi.fn().mockImplementation((action: string, ...args: unknown[]) => {
				if (action === "mock-llm2.chat") return mockCall(...args);
				return origCall(action, ...args);
			});

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const result = await (svc as any).runReActLoop("Do ping");
			expect(result).toBe("Done after tool");
			expect(llmCallCount).toBe(2);

			broker.call = origCall;
			await broker.destroyService(svc);
		});

		it("should throw on max iterations", async () => {
			const mockCall = vi.fn().mockResolvedValue({
				content: null,
				finish_reason: "tool_calls",
				tool_calls: [
					{
						id: "tc_loop",
						type: "function",
						function: { name: "ping", arguments: "{}" }
					}
				]
			});

			const svc = broker.createService({
				name: "react-max",
				mixins: [AgentMixin()],
				settings: {
					agent: {
						llm: "mock-llm3",
						description: "test",
						maxIterations: 2
					}
				},
				actions: {
					ping: {
						description: "Ping",
						params: {},
						handler() {
							return "pong";
						}
					}
				}
			});
			await broker.waitForServices("react-max");

			const origCall = broker.call.bind(broker);
			broker.call = vi.fn().mockImplementation((action: string, ...args: unknown[]) => {
				if (action === "mock-llm3.chat") return mockCall(...args);
				return origCall(action, ...args);
			});

			await expect(
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				(svc as any).runReActLoop("loop")
			).rejects.toThrow("Max iterations reached");

			broker.call = origCall;
			await broker.destroyService(svc);
		});

		it("should reject unknown tool calls", async () => {
			let llmCallCount = 0;
			const mockCall = vi.fn().mockImplementation(() => {
				llmCallCount++;
				if (llmCallCount === 1) {
					return {
						content: null,
						finish_reason: "tool_calls",
						tool_calls: [
							{
								id: "tc_bad",
								type: "function",
								function: { name: "hacker", arguments: "{}" }
							}
						]
					};
				}
				return { content: "Recovered", finish_reason: "stop" };
			});

			const svc = broker.createService({
				name: "react-security",
				mixins: [AgentMixin()],
				settings: { agent: { llm: "mock-llm4", description: "test" } },
				actions: {
					safeOnly: {
						description: "Safe action",
						params: {},
						handler() {
							return "safe";
						}
					}
				}
			});
			await broker.waitForServices("react-security");

			const origCall = broker.call.bind(broker);
			broker.call = vi.fn().mockImplementation((action: string, ...args: unknown[]) => {
				if (action === "mock-llm4.chat") return mockCall(...args);
				return origCall(action, ...args);
			});

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const result = await (svc as any).runReActLoop("Try hacking");
			expect(result).toBe("Recovered");

			broker.call = origCall;
			await broker.destroyService(svc);
		});
	});

	describe("Default no-op methods", () => {
		it("should return empty array from loadHistory", async () => {
			const svc = broker.createService({
				name: "noop-1",
				mixins: [AgentMixin()],
				settings: { agent: { llm: "llm", description: "test" } },
				actions: {}
			});
			await broker.waitForServices("noop-1");

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const history = await (svc as any).loadHistory("session-1");
			expect(history).toEqual([]);

			await broker.destroyService(svc);
		});

		it("should no-op saveHistory", async () => {
			const svc = broker.createService({
				name: "noop-2",
				mixins: [AgentMixin()],
				settings: { agent: { llm: "llm", description: "test" } },
				actions: {}
			});
			await broker.waitForServices("noop-2");

			// Should not throw
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			await (svc as any).saveHistory("session-1", [{ role: "user", content: "hi" }]);

			await broker.destroyService(svc);
		});

		it("should return history unchanged from compactConversation", async () => {
			const svc = broker.createService({
				name: "noop-3",
				mixins: [AgentMixin()],
				settings: { agent: { llm: "llm", description: "test" } },
				actions: {}
			});
			await broker.waitForServices("noop-3");

			const input = [
				{ role: "user", content: "hi" },
				{ role: "assistant", content: "hello" }
			];
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const result = await (svc as any).compactConversation(input);
			expect(result).toBe(input);

			await broker.destroyService(svc);
		});
	});

	describe("Unknown finish_reason", () => {
		it("should return content on unknown finish_reason with content", async () => {
			const mockCall = vi.fn().mockResolvedValue({
				content: "Truncated response",
				finish_reason: "length"
			});

			const svc = broker.createService({
				name: "react-unknown-fr",
				mixins: [AgentMixin()],
				settings: { agent: { llm: "mock-llm5", description: "test" } },
				actions: {}
			});
			await broker.waitForServices("react-unknown-fr");

			const origCall = broker.call.bind(broker);
			broker.call = vi.fn().mockImplementation((action: string, ...args: unknown[]) => {
				if (action === "mock-llm5.chat") return mockCall(...args);
				return origCall(action, ...args);
			});

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const result = await (svc as any).runReActLoop("Hello");
			expect(result).toBe("Truncated response");

			broker.call = origCall;
			await broker.destroyService(svc);
		});
	});

	describe("saveHistory on max iterations", () => {
		it("should save history before throwing max iterations error", async () => {
			let savedHistory: unknown[] | null = null;
			const mockCall = vi.fn().mockResolvedValue({
				content: null,
				finish_reason: "tool_calls",
				tool_calls: [
					{
						id: "tc_save",
						type: "function",
						function: { name: "ping", arguments: "{}" }
					}
				]
			});

			const svc = broker.createService({
				name: "react-save-max",
				mixins: [AgentMixin()],
				settings: {
					agent: {
						llm: "mock-llm6",
						description: "test",
						maxIterations: 1
					}
				},
				actions: {
					ping: {
						description: "Ping",
						params: {},
						handler() {
							return "pong";
						}
					}
				},
				methods: {
					async saveHistory(_sessionId?: string, _history?: unknown[]) {
						savedHistory = _history || null;
					}
				}
			});
			await broker.waitForServices("react-save-max");

			const origCall = broker.call.bind(broker);
			broker.call = vi.fn().mockImplementation((action: string, ...args: unknown[]) => {
				if (action === "mock-llm6.chat") return mockCall(...args);
				return origCall(action, ...args);
			});

			await expect(
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				(svc as any).runReActLoop("loop", "sess-1")
			).rejects.toThrow("Max iterations reached");

			expect(savedHistory).not.toBeNull();
			expect(Array.isArray(savedHistory)).toBe(true);

			broker.call = origCall;
			await broker.destroyService(svc);
		});
	});
});
