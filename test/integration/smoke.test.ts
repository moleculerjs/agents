/*
 * @moleculer/agents
 * Copyright (c) 2026 MoleculerJS (https://github.com/moleculerjs/agents)
 * MIT Licensed
 */

/**
 * Smoke test: Full agent lifecycle importing from the public API (src/index.ts).
 * Verifies the entire system works end-to-end, not just individual parts.
 */

import { describe, expect, it, afterAll, beforeAll } from "vitest";
import { ServiceBroker } from "moleculer";
import { AgentMixin, MemoryMixin, LLMService, Adapters } from "../../src/index.ts";

describe("Smoke test — full agent lifecycle via public API", () => {
	const broker = new ServiceBroker({ logger: false, cacher: "Memory" });

	beforeAll(() => broker.start());
	afterAll(() => broker.stop());

	it("should export all expected symbols from index.ts", () => {
		expect(typeof AgentMixin).toBe("function");
		expect(typeof MemoryMixin).toBe("function");
		expect(typeof LLMService).toBe("function");
		expect(typeof Adapters).toBe("object");
		expect(typeof Adapters.resolve).toBe("function");
		expect(typeof Adapters.register).toBe("function");
		expect(Adapters.Base).toBeDefined();
		expect(Adapters.OpenAI).toBeDefined();
		expect(Adapters.Anthropic).toBeDefined();
		expect(Adapters.Fake).toBeDefined();
	});

	it("should complete run action with tool call via FakeAdapter", async () => {
		const adapter = new Adapters.Fake({
			responses: [
				{
					content: null,
					tool_calls: [
						{
							id: "tc_1",
							type: "function" as const,
							function: {
								name: "add",
								arguments: '{"a":2,"b":3}'
							}
						}
					]
				},
				"The result is 5."
			]
		});

		const llmSvc = broker.createService({
			name: "llm.smoke",
			mixins: [LLMService()],
			settings: { adapter }
		});

		const agentSvc = broker.createService({
			name: "calc-agent",
			mixins: [MemoryMixin(), AgentMixin()],
			settings: {
				agent: {
					llm: "llm.smoke",
					description: "Calculator agent",
					instructions: "You are a calculator."
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
						return { result: ctx.params.a + ctx.params.b };
					}
				}
			}
		});

		await broker.waitForServices(["llm.smoke", "calc-agent"]);

		// Run action
		const result = await broker.call("calc-agent.run", {
			task: "What is 2 + 3?",
			sessionId: "smoke-run"
		});
		expect(result).toBe("The result is 5.");

		// Verify tool was called with correct schema
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const internalAdapter = (llmSvc as any)._adapter as InstanceType<typeof Adapters.Fake>;
		expect(internalAdapter.calls).toHaveLength(2);
		const firstCall = internalAdapter.calls[0];
		expect(firstCall.tools).toHaveLength(1);
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		expect((firstCall.tools as any)[0].function.name).toBe("add");

		// Verify tool result was passed back to LLM
		const secondCall = internalAdapter.calls[1];
		const toolMsg = (secondCall.messages as { role: string; content: string }[]).find(
			m => m.role === "tool"
		);
		expect(toolMsg).toBeDefined();
		expect(toolMsg!.content).toContain("result");
		expect(toolMsg!.content).toContain("5");

		await broker.destroyService(agentSvc);
		await broker.destroyService(llmSvc);
	});

	it("should complete multi-turn chat with memory persistence", async () => {
		const adapter = new Adapters.Fake({
			responses: ["Hi there!", "Your name is Alice."]
		});

		const llmSvc = broker.createService({
			name: "llm.smoke2",
			mixins: [LLMService()],
			settings: { adapter }
		});

		const agentSvc = broker.createService({
			name: "chat-smoke-agent",
			mixins: [MemoryMixin(), AgentMixin()],
			settings: {
				agent: {
					llm: "llm.smoke2",
					description: "Conversational agent",
					instructions: "You are a friendly chatbot."
				}
			},
			actions: {}
		});

		await broker.waitForServices(["llm.smoke2", "chat-smoke-agent"]);

		// First turn
		const r1 = await broker.call("chat-smoke-agent.chat", {
			message: "My name is Alice",
			sessionId: "smoke-chat"
		});
		expect(r1).toBe("Hi there!");

		// Second turn — should include previous history
		const r2 = await broker.call("chat-smoke-agent.chat", {
			message: "What is my name?",
			sessionId: "smoke-chat"
		});
		expect(r2).toBe("Your name is Alice.");

		// Verify history in cacher
		const history = (await broker.cacher!.get(
			"agent:history:chat-smoke-agent:smoke-chat"
		)) as { role: string; content: string }[];
		expect(history).toBeDefined();
		// system + user("My name is Alice") + assistant("Hi there!") +
		// user("What is my name?") + assistant("Your name is Alice.")
		expect(history).toHaveLength(5);
		expect(history[0].role).toBe("system");
		expect(history[0].content).toBe("You are a friendly chatbot.");

		// Verify second LLM call received full history
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const internalAdapter = (llmSvc as any)._adapter as InstanceType<typeof Adapters.Fake>;
		const secondCallMsgs = internalAdapter.calls[1].messages as {
			role: string;
			content: string;
		}[];
		const userMsgs = secondCallMsgs.filter(m => m.role === "user");
		expect(userMsgs).toHaveLength(2);
		expect(userMsgs[0].content).toBe("My name is Alice");
		expect(userMsgs[1].content).toBe("What is my name?");

		await broker.destroyService(agentSvc);
		await broker.destroyService(llmSvc);
	});

	it("should resolve adapter by string name via Adapters.resolve", () => {
		const adapter = Adapters.resolve("Fake");
		expect(adapter).toBeInstanceOf(Adapters.Fake);
	});

	it("should resolve adapter by instance via Adapters.resolve", () => {
		const instance = new Adapters.Fake({ responses: [] });
		const resolved = Adapters.resolve(instance);
		expect(resolved).toBe(instance);
	});
});
