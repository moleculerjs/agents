/*
 * @moleculer/agents
 * Copyright (c) 2026 MoleculerJS (https://github.com/moleculerjs/agents)
 * MIT Licensed
 */

import { describe, expect, it, afterAll, beforeAll } from "vitest";
import { ServiceBroker } from "moleculer";
import AgentMixin from "../../src/agent.mixin.ts";
import MemoryMixin from "../../src/memory.mixin.ts";
import LLMService from "../../src/llm.service.ts";
import FakeAdapter from "../../src/adapters/fake.ts";

describe("AgentMixin E2E", () => {
	const broker = new ServiceBroker({ logger: false, cacher: "Memory" });

	beforeAll(() => broker.start());
	afterAll(() => broker.stop());

	it("should run a simple task with stop response", async () => {
		const adapter = new FakeAdapter({
			responses: ["The weather is sunny in Budapest."]
		});

		const llmSvc = broker.createService({
			name: "llm.test1",
			mixins: [LLMService()],
			settings: { adapter }
		});

		const agentSvc = broker.createService({
			name: "weather-agent-1",
			mixins: [AgentMixin()],
			settings: {
				agent: {
					llm: "llm.test1",
					description: "Weather agent",
					instructions: "You are a weather assistant."
				}
			},
			actions: {
				getCurrent: {
					description: "Get current weather for a city",
					params: {
						city: { type: "string", description: "City name" }
					},
					async handler() {
						return { temp: 22, condition: "sunny" };
					}
				}
			}
		});

		await broker.waitForServices(["llm.test1", "weather-agent-1"]);

		const result = await broker.call("weather-agent-1.run", {
			task: "What is the weather?"
		});

		expect(result).toBe("The weather is sunny in Budapest.");

		await broker.destroyService(agentSvc);
		await broker.destroyService(llmSvc);
	});

	it("should generate tool schemas from actions with descriptions", async () => {
		const adapter = new FakeAdapter({ responses: ["done"] });

		const llmSvc = broker.createService({
			name: "llm.test2",
			mixins: [LLMService()],
			settings: { adapter }
		});

		const agentSvc = broker.createService({
			name: "schema-agent",
			mixins: [AgentMixin()],
			settings: {
				agent: { llm: "llm.test2", description: "Test agent" }
			},
			actions: {
				withDesc: {
					description: "An action with description",
					params: { id: { type: "number" } },
					async handler() {
						return "ok";
					}
				},
				withoutDesc: {
					params: { id: { type: "number" } },
					async handler() {
						return "ok";
					}
				}
			}
		});

		await broker.waitForServices(["llm.test2", "schema-agent"]);

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const toolSchemas = (agentSvc as any).toolSchemas;
		expect(toolSchemas).toHaveLength(1);
		expect(toolSchemas[0].name).toBe("withDesc");
		expect(toolSchemas[0].description).toBe("An action with description");

		await broker.destroyService(agentSvc);
		await broker.destroyService(llmSvc);
	});

	it("should execute tool calls in ReAct loop", async () => {
		const adapter = new FakeAdapter({
			responses: [
				// First response: LLM wants to call a tool
				{
					content: null,
					tool_calls: [
						{
							id: "call_1",
							type: "function" as const,
							function: {
								name: "getCurrent",
								arguments: '{"city":"Budapest"}'
							}
						}
					]
				},
				// Second response: LLM gives final answer
				"The temperature in Budapest is 22°C and sunny."
			]
		});

		const llmSvc = broker.createService({
			name: "llm.test3",
			mixins: [LLMService()],
			settings: { adapter }
		});

		const agentSvc = broker.createService({
			name: "weather-agent-3",
			mixins: [AgentMixin()],
			settings: {
				agent: {
					llm: "llm.test3",
					description: "Weather agent",
					instructions: "You are a weather assistant."
				}
			},
			actions: {
				getCurrent: {
					description: "Get current weather for a city",
					params: {
						city: { type: "string", description: "City name" }
					},
					async handler(ctx: { params: { city: string } }) {
						return {
							temp: 22,
							condition: "sunny",
							city: ctx.params.city
						};
					}
				}
			}
		});

		await broker.waitForServices(["llm.test3", "weather-agent-3"]);

		const result = await broker.call("weather-agent-3.run", {
			task: "What is the weather in Budapest?"
		});

		expect(result).toBe("The temperature in Budapest is 22°C and sunny.");

		// Verify the LLM received tool schemas
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const internalAdapter = (llmSvc as any)._adapter as FakeAdapter;
		const lastCall = internalAdapter.calls[0];
		expect(lastCall.tools).toBeDefined();
		expect(lastCall.tools).toHaveLength(1);
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		expect((lastCall.tools as any)[0].function.name).toBe("getCurrent");

		// Verify second LLM call includes tool result in messages
		const secondCall = internalAdapter.calls[1];
		const toolMsg = (secondCall.messages as { role: string }[]).find(m => m.role === "tool");
		expect(toolMsg).toBeDefined();

		await broker.destroyService(agentSvc);
		await broker.destroyService(llmSvc);
	});

	it("should reject unknown tool calls", async () => {
		const adapter = new FakeAdapter({
			responses: [
				{
					content: null,
					tool_calls: [
						{
							id: "call_bad",
							type: "function" as const,
							function: {
								name: "hackerTool",
								arguments: "{}"
							}
						}
					]
				},
				"I couldn't use that tool."
			]
		});

		const llmSvc = broker.createService({
			name: "llm.test4",
			mixins: [LLMService()],
			settings: { adapter }
		});

		const agentSvc = broker.createService({
			name: "secure-agent",
			mixins: [AgentMixin()],
			settings: {
				agent: {
					llm: "llm.test4",
					description: "Secure agent"
				}
			},
			actions: {
				safeAction: {
					description: "A safe action",
					params: {},
					async handler() {
						return "safe";
					}
				}
			}
		});

		await broker.waitForServices(["llm.test4", "secure-agent"]);

		const result = await broker.call("secure-agent.run", {
			task: "Do something"
		});

		expect(result).toBe("I couldn't use that tool.");

		// Verify the tool result contains an error
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const internalAdapter = (llmSvc as any)._adapter as FakeAdapter;
		const secondCall = internalAdapter.calls[1];
		const toolMsg = (secondCall.messages as { role: string; content: string }[]).find(
			m => m.role === "tool"
		);
		expect(toolMsg).toBeDefined();
		expect(toolMsg!.content).toContain("Unknown tool");

		await broker.destroyService(agentSvc);
		await broker.destroyService(llmSvc);
	});

	it("should throw when max iterations exceeded", async () => {
		// Always returns tool calls, never stops
		const toolCallResponse = {
			content: null,
			tool_calls: [
				{
					id: "call_loop",
					type: "function" as const,
					function: {
						name: "ping",
						arguments: "{}"
					}
				}
			]
		};

		const adapter = new FakeAdapter({
			responses: [toolCallResponse]
		});

		const llmSvc = broker.createService({
			name: "llm.test5",
			mixins: [LLMService()],
			settings: { adapter }
		});

		const agentSvc = broker.createService({
			name: "loop-agent",
			mixins: [AgentMixin()],
			settings: {
				agent: {
					llm: "llm.test5",
					description: "Loop agent",
					maxIterations: 3
				}
			},
			actions: {
				ping: {
					description: "Ping action",
					params: {},
					async handler() {
						return "pong";
					}
				}
			}
		});

		await broker.waitForServices(["llm.test5", "loop-agent"]);

		await expect(broker.call("loop-agent.run", { task: "loop forever" })).rejects.toThrow(
			"Max iterations reached"
		);

		await broker.destroyService(agentSvc);
		await broker.destroyService(llmSvc);
	});

	it("should use chat action with sessionId", async () => {
		const adapter = new FakeAdapter({
			responses: ["Hello! How can I help?", "Sure, here is more info."]
		});

		const llmSvc = broker.createService({
			name: "llm.test6",
			mixins: [LLMService()],
			settings: { adapter }
		});

		const agentSvc = broker.createService({
			name: "chat-agent",
			mixins: [AgentMixin()],
			settings: {
				agent: {
					llm: "llm.test6",
					description: "Chat agent",
					instructions: "Be helpful."
				}
			},
			actions: {
				search: {
					description: "Search for information",
					params: {
						query: { type: "string", description: "Search query" }
					},
					async handler() {
						return "search results";
					}
				}
			}
		});

		await broker.waitForServices(["llm.test6", "chat-agent"]);

		const result1 = await broker.call("chat-agent.chat", {
			message: "Hello",
			sessionId: "session-1"
		});
		expect(result1).toBe("Hello! How can I help?");

		const result2 = await broker.call("chat-agent.chat", {
			message: "Tell me more",
			sessionId: "session-1"
		});
		expect(result2).toBe("Sure, here is more info.");

		await broker.destroyService(agentSvc);
		await broker.destroyService(llmSvc);
	});

	it("should add system message from instructions", async () => {
		const adapter = new FakeAdapter({ responses: ["ok"] });

		const llmSvc = broker.createService({
			name: "llm.test7",
			mixins: [LLMService()],
			settings: { adapter }
		});

		const agentSvc = broker.createService({
			name: "sys-agent",
			mixins: [AgentMixin()],
			settings: {
				agent: {
					llm: "llm.test7",
					description: "System msg agent",
					instructions: "You are a helpful bot."
				}
			},
			actions: {}
		});

		await broker.waitForServices(["llm.test7", "sys-agent"]);

		await broker.call("sys-agent.run", { task: "Hi" });

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const internalAdapter = (llmSvc as any)._adapter as FakeAdapter;
		const messages = internalAdapter.calls[0].messages as {
			role: string;
			content: string;
		}[];
		expect(messages[0].role).toBe("system");
		expect(messages[0].content).toBe("You are a helpful bot.");
		expect(messages[1].role).toBe("user");
		expect(messages[1].content).toBe("Hi");

		await broker.destroyService(agentSvc);
		await broker.destroyService(llmSvc);
	});

	it("should handle multiple tool calls in a single response", async () => {
		const adapter = new FakeAdapter({
			responses: [
				{
					content: null,
					tool_calls: [
						{
							id: "call_a",
							type: "function" as const,
							function: {
								name: "getCurrent",
								arguments: '{"city":"Budapest"}'
							}
						},
						{
							id: "call_b",
							type: "function" as const,
							function: {
								name: "getCurrent",
								arguments: '{"city":"London"}'
							}
						}
					]
				},
				"Budapest: 22°C, London: 15°C"
			]
		});

		const llmSvc = broker.createService({
			name: "llm.test8",
			mixins: [LLMService()],
			settings: { adapter }
		});

		const agentSvc = broker.createService({
			name: "multi-tool-agent",
			mixins: [AgentMixin()],
			settings: {
				agent: {
					llm: "llm.test8",
					description: "Multi tool agent"
				}
			},
			actions: {
				getCurrent: {
					description: "Get current weather",
					params: {
						city: { type: "string", description: "City" }
					},
					async handler(ctx: { params: { city: string } }) {
						const temps: Record<string, number> = {
							Budapest: 22,
							London: 15
						};
						return {
							temp: temps[ctx.params.city] || 20,
							city: ctx.params.city
						};
					}
				}
			}
		});

		await broker.waitForServices(["llm.test8", "multi-tool-agent"]);

		const result = await broker.call("multi-tool-agent.run", {
			task: "Compare weather"
		});

		expect(result).toBe("Budapest: 22°C, London: 15°C");

		// Verify both tool results are in the second call's messages
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const internalAdapter = (llmSvc as any)._adapter as FakeAdapter;
		const secondCall = internalAdapter.calls[1];
		const toolMsgs = (secondCall.messages as { role: string }[]).filter(m => m.role === "tool");
		expect(toolMsgs).toHaveLength(2);

		await broker.destroyService(agentSvc);
		await broker.destroyService(llmSvc);
	});

	it("should handle tool execution errors gracefully", async () => {
		const adapter = new FakeAdapter({
			responses: [
				{
					content: null,
					tool_calls: [
						{
							id: "call_err",
							type: "function" as const,
							function: {
								name: "failAction",
								arguments: "{}"
							}
						}
					]
				},
				"Sorry, the action failed."
			]
		});

		const llmSvc = broker.createService({
			name: "llm.test9",
			mixins: [LLMService()],
			settings: { adapter }
		});

		const agentSvc = broker.createService({
			name: "error-agent",
			mixins: [AgentMixin()],
			settings: {
				agent: {
					llm: "llm.test9",
					description: "Error handling agent"
				}
			},
			actions: {
				failAction: {
					description: "An action that fails",
					params: {},
					async handler() {
						throw new Error("Something went wrong");
					}
				}
			}
		});

		await broker.waitForServices(["llm.test9", "error-agent"]);

		const result = await broker.call("error-agent.run", {
			task: "Do something"
		});

		expect(result).toBe("Sorry, the action failed.");

		// Verify error was sent back as tool result
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const internalAdapter = (llmSvc as any)._adapter as FakeAdapter;
		const secondCall = internalAdapter.calls[1];
		const toolMsg = (secondCall.messages as { role: string; content: string }[]).find(
			m => m.role === "tool"
		);
		expect(toolMsg!.content).toContain("Something went wrong");

		await broker.destroyService(agentSvc);
		await broker.destroyService(llmSvc);
	});

	it("should call compactConversation when history exceeds max", async () => {
		let compactCalled = false;

		const adapter = new FakeAdapter({ responses: ["done"] });

		const llmSvc = broker.createService({
			name: "llm.test10",
			mixins: [LLMService()],
			settings: { adapter }
		});

		const agentSvc = broker.createService({
			name: "compact-agent",
			mixins: [AgentMixin()],
			settings: {
				agent: {
					llm: "llm.test10",
					description: "Compact agent",
					maxHistoryMessages: 3
				}
			},
			actions: {},
			methods: {
				// Override loadHistory to return a long history
				// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars
				async loadHistory(_sessionId: any) {
					return [
						{ role: "system", content: "instructions" },
						{ role: "user", content: "msg1" },
						{ role: "assistant", content: "reply1" },
						{ role: "user", content: "msg2" },
						{ role: "assistant", content: "reply2" }
					];
				},
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				async compactConversation(history: any[]) {
					compactCalled = true;
					// Keep system + last 2
					const system = history.filter(
						// eslint-disable-next-line @typescript-eslint/no-explicit-any
						(m: any) => m.role === "system"
					);
					const rest = history.filter(
						// eslint-disable-next-line @typescript-eslint/no-explicit-any
						(m: any) => m.role !== "system"
					);
					return [...system, ...rest.slice(-2)];
				}
			}
		});

		await broker.waitForServices(["llm.test10", "compact-agent"]);

		await broker.call("compact-agent.run", { task: "trigger compact" });

		expect(compactCalled).toBe(true);

		await broker.destroyService(agentSvc);
		await broker.destroyService(llmSvc);
	});

	it("should persist history with MemoryMixin across multi-turn chat", async () => {
		const adapter = new FakeAdapter({
			responses: ["Hello! How can I help?", "The weather is sunny."]
		});

		const llmSvc = broker.createService({
			name: "llm.mem1",
			mixins: [LLMService()],
			settings: { adapter }
		});

		const agentSvc = broker.createService({
			name: "mem-agent-1",
			mixins: [MemoryMixin(), AgentMixin()],
			settings: {
				agent: {
					llm: "llm.mem1",
					description: "Memory agent",
					instructions: "You are a helpful assistant."
				}
			},
			actions: {
				getCurrent: {
					description: "Get weather",
					params: { city: { type: "string", description: "City" } },
					async handler() {
						return { temp: 22 };
					}
				}
			}
		});

		await broker.waitForServices(["llm.mem1", "mem-agent-1"]);

		// First chat
		const result1 = await broker.call("mem-agent-1.chat", {
			message: "Hello",
			sessionId: "persist-session"
		});
		expect(result1).toBe("Hello! How can I help?");

		// Verify history was saved to cacher
		const saved = await broker.cacher!.get("agent:history:mem-agent-1:persist-session");
		expect(saved).toBeDefined();
		expect(Array.isArray(saved)).toBe(true);
		// Should contain: system + user("Hello") + assistant("Hello! How can I help?")
		const savedArr = saved as { role: string; content: string }[];
		expect(savedArr.length).toBe(3);
		expect(savedArr[0].role).toBe("system");
		expect(savedArr[1].role).toBe("user");
		expect(savedArr[1].content).toBe("Hello");
		expect(savedArr[2].role).toBe("assistant");
		expect(savedArr[2].content).toBe("Hello! How can I help?");

		// Second chat — should load previous history and append
		const result2 = await broker.call("mem-agent-1.chat", {
			message: "What is the weather?",
			sessionId: "persist-session"
		});
		expect(result2).toBe("The weather is sunny.");

		// Verify the full history was saved after the second call
		const saved2 = await broker.cacher!.get("agent:history:mem-agent-1:persist-session");
		const savedArr2 = saved2 as { role: string; content: string }[];
		// system + user(Hello) + assistant(Hello!...) + user(Weather?) + assistant(Sunny.)
		expect(savedArr2.length).toBe(5);
		expect(savedArr2[0].role).toBe("system");
		expect(savedArr2[1].content).toBe("Hello");
		expect(savedArr2[2].content).toBe("Hello! How can I help?");
		expect(savedArr2[3].content).toBe("What is the weather?");
		expect(savedArr2[4].content).toBe("The weather is sunny.");

		await broker.destroyService(agentSvc);
		await broker.destroyService(llmSvc);
	});

	it("should trigger compaction with MemoryMixin on long history", async () => {
		const adapter = new FakeAdapter({ responses: ["compacted reply"] });

		const llmSvc = broker.createService({
			name: "llm.mem2",
			mixins: [LLMService()],
			settings: { adapter }
		});

		// Pre-populate a long history in the cacher
		const longHistory = [
			{ role: "system", content: "instructions" },
			{ role: "user", content: "u1" },
			{ role: "assistant", content: "a1" },
			{ role: "user", content: "u2" },
			{ role: "assistant", content: "a2" },
			{ role: "user", content: "u3" },
			{ role: "assistant", content: "a3" },
			{ role: "user", content: "u4" },
			{ role: "assistant", content: "a4" }
		];
		await broker.cacher!.set("agent:history:compact-mem-agent:compact-sess", longHistory, 3600);

		const agentSvc = broker.createService({
			name: "compact-mem-agent",
			mixins: [MemoryMixin(), AgentMixin()],
			settings: {
				agent: {
					llm: "llm.mem2",
					description: "Compact memory agent",
					instructions: "instructions",
					maxHistoryMessages: 5
				}
			},
			actions: {}
		});

		await broker.waitForServices(["llm.mem2", "compact-mem-agent"]);

		const result = await broker.call("compact-mem-agent.chat", {
			message: "new message",
			sessionId: "compact-sess"
		});
		expect(result).toBe("compacted reply");

		// Verify saved history was compacted
		// 9 existing + 1 new user msg = 10 > maxHistoryMessages=5 → compaction triggered
		// After compaction: system + last 4 from the 10, then assistant reply appended
		const saved = await broker.cacher!.get("agent:history:compact-mem-agent:compact-sess");
		const savedArr = saved as { role: string; content: string }[];
		// Compacted to 5, then +1 assistant = 6, but compaction happens before LLM call
		// so saved result is: compacted(5) + assistant("compacted reply") = 6
		expect(savedArr.length).toBeLessThanOrEqual(6);
		// System message should be preserved
		expect(savedArr[0].role).toBe("system");
		expect(savedArr[0].content).toBe("instructions");
		// Last message should be the assistant reply
		expect(savedArr[savedArr.length - 1].role).toBe("assistant");
		expect(savedArr[savedArr.length - 1].content).toBe("compacted reply");
		// The new user message should be in the saved history
		const userMsgs = savedArr.filter(m => m.role === "user" && m.content === "new message");
		expect(userMsgs.length).toBe(1);

		await broker.destroyService(agentSvc);
		await broker.destroyService(llmSvc);
	});

	it("should not duplicate system message on subsequent chats", async () => {
		const adapter = new FakeAdapter({
			responses: ["first", "second"]
		});

		const llmSvc = broker.createService({
			name: "llm.mem3",
			mixins: [LLMService()],
			settings: { adapter }
		});

		const agentSvc = broker.createService({
			name: "sysdup-agent",
			mixins: [MemoryMixin(), AgentMixin()],
			settings: {
				agent: {
					llm: "llm.mem3",
					description: "System dup test agent",
					instructions: "Be helpful."
				}
			},
			actions: {}
		});

		await broker.waitForServices(["llm.mem3", "sysdup-agent"]);

		await broker.call("sysdup-agent.chat", {
			message: "hi",
			sessionId: "sysdup-sess"
		});
		await broker.call("sysdup-agent.chat", {
			message: "hello again",
			sessionId: "sysdup-sess"
		});

		// Verify the saved history has exactly ONE system message
		const saved = await broker.cacher!.get("agent:history:sysdup-agent:sysdup-sess");
		const savedArr = saved as { role: string }[];
		const systemMsgs = savedArr.filter(m => m.role === "system");
		expect(systemMsgs).toHaveLength(1);

		await broker.destroyService(agentSvc);
		await broker.destroyService(llmSvc);
	});
});
