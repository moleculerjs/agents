/*
 * @moleculer/agents
 * Copyright (c) 2026 MoleculerJS (https://github.com/moleculerjs/agents)
 * MIT Licensed
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import OpenAIAdapter from "../../../src/adapters/openai.ts";
import Adapters from "../../../src/adapters/index.ts";

function createMockClient() {
	return {
		chat: {
			completions: {
				create: vi.fn()
			}
		}
	};
}

describe("Test OpenAIAdapter", () => {
	let adapter: OpenAIAdapter;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let mockClient: any;
	const mockService = {
		broker: {
			fatal: vi.fn()
		},
		logger: {
			info: vi.fn(),
			warn: vi.fn(),
			debug: vi.fn(),
			error: vi.fn()
		}
	};

	beforeEach(() => {
		vi.clearAllMocks();
		adapter = new OpenAIAdapter({
			apiKey: "test-api-key",
			model: "gpt-4o",
			baseURL: "https://api.openai.com/v1"
		});
		adapter.init(mockService);
		mockClient = createMockClient();
		adapter.client = mockClient;
	});

	it("should set opts in constructor", () => {
		const a = new OpenAIAdapter({ apiKey: "key1", model: "gpt-4" });
		expect(a.opts).toEqual({ apiKey: "key1", model: "gpt-4" });
	});

	it("should set default empty opts", () => {
		const a = new OpenAIAdapter();
		expect(a.opts).toEqual({});
	});

	it("should initialize client on init", () => {
		const a = new OpenAIAdapter({ apiKey: "key" });
		a.init(mockService);
		expect(a.client).toBeDefined();
	});

	it("should set service, broker, logger on init", () => {
		expect(adapter.service).toBe(mockService);
		expect(adapter.broker).toBe(mockService.broker);
		expect(adapter.logger).toBe(mockService.logger);
	});

	it("should be registered in Adapters registry", () => {
		expect(Adapters.OpenAI).toBe(OpenAIAdapter);
	});

	describe("convertToolSchema", () => {
		it("should convert simple params to OpenAI function calling format", () => {
			const result = adapter.convertToolSchema("getWeather", "Get weather for a city", {
				city: { type: "string", description: "City name" }
			});

			expect(result).toEqual({
				type: "function",
				function: {
					name: "getWeather",
					description: "Get weather for a city",
					parameters: {
						type: "object",
						properties: {
							city: { type: "string", description: "City name" }
						},
						required: ["city"]
					}
				}
			});
		});

		it("should convert multiple params with optional field", () => {
			const result = adapter.convertToolSchema("search", "Search items", {
				query: { type: "string", description: "Search query" },
				limit: { type: "number", description: "Max results", optional: true }
			});

			expect(result).toEqual({
				type: "function",
				function: {
					name: "search",
					description: "Search items",
					parameters: {
						type: "object",
						properties: {
							query: { type: "string", description: "Search query" },
							limit: { type: "number", description: "Max results" }
						},
						required: ["query"]
					}
				}
			});
		});

		it("should convert enum params", () => {
			const result = adapter.convertToolSchema("setStatus", "Set status", {
				status: { type: "enum", values: ["active", "inactive"] }
			});

			expect(result).toEqual({
				type: "function",
				function: {
					name: "setStatus",
					description: "Set status",
					parameters: {
						type: "object",
						properties: {
							status: { type: "string", enum: ["active", "inactive"] }
						},
						required: ["status"]
					}
				}
			});
		});

		it("should convert nested object params", () => {
			const result = adapter.convertToolSchema("createUser", "Create a user", {
				user: {
					type: "object",
					properties: {
						name: { type: "string", description: "User name" },
						age: { type: "number" }
					}
				}
			});

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const fn = (result as any).function;
			expect(fn.name).toBe("createUser");
			expect(fn.parameters.properties.user).toEqual({
				type: "object",
				properties: {
					name: { type: "string", description: "User name" },
					age: { type: "number" }
				},
				required: ["name", "age"]
			});
		});

		it("should convert array params", () => {
			const result = adapter.convertToolSchema("addTags", "Add tags", {
				tags: {
					type: "array",
					items: { type: "string" }
				}
			});

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const fn = (result as any).function;
			expect(fn.parameters.properties.tags).toEqual({
				type: "array",
				items: { type: "string" }
			});
		});
	});

	describe("chat", () => {
		it("should call OpenAI API and return response with stop", async () => {
			mockClient.chat.completions.create.mockResolvedValue({
				choices: [
					{
						message: {
							content: "Hello! How can I help?",
							tool_calls: null
						},
						finish_reason: "stop"
					}
				]
			});

			const result = await adapter.chat([{ role: "user", content: "Hi" }]);

			expect(result).toEqual({
				content: "Hello! How can I help?",
				finish_reason: "stop"
			});

			expect(mockClient.chat.completions.create).toHaveBeenCalledWith({
				model: "gpt-4o",
				messages: [{ role: "user", content: "Hi" }]
			});
		});

		it("should pass tools when provided", async () => {
			mockClient.chat.completions.create.mockResolvedValue({
				choices: [
					{
						message: {
							content: "Sure!",
							tool_calls: null
						},
						finish_reason: "stop"
					}
				]
			});

			const tools = [
				{
					type: "function",
					function: {
						name: "getWeather",
						description: "Get weather",
						parameters: { type: "object", properties: {} }
					}
				}
			];

			await adapter.chat([{ role: "user", content: "Hi" }], tools);

			expect(mockClient.chat.completions.create).toHaveBeenCalledWith({
				model: "gpt-4o",
				messages: [{ role: "user", content: "Hi" }],
				tools
			});
		});

		it("should not pass tools when empty array", async () => {
			mockClient.chat.completions.create.mockResolvedValue({
				choices: [
					{
						message: { content: "Ok", tool_calls: null },
						finish_reason: "stop"
					}
				]
			});

			await adapter.chat([{ role: "user", content: "Hi" }], []);

			expect(mockClient.chat.completions.create).toHaveBeenCalledWith({
				model: "gpt-4o",
				messages: [{ role: "user", content: "Hi" }]
			});
		});

		it("should return tool_calls in response", async () => {
			mockClient.chat.completions.create.mockResolvedValue({
				choices: [
					{
						message: {
							content: null,
							tool_calls: [
								{
									id: "call_123",
									type: "function",
									function: {
										name: "getWeather",
										arguments: '{"city":"London"}'
									}
								}
							]
						},
						finish_reason: "tool_calls"
					}
				]
			});

			const result = await adapter.chat([{ role: "user", content: "Weather in London?" }]);

			expect(result).toEqual({
				content: null,
				finish_reason: "tool_calls",
				tool_calls: [
					{
						id: "call_123",
						type: "function",
						function: {
							name: "getWeather",
							arguments: '{"city":"London"}'
						}
					}
				]
			});
		});

		it("should handle multiple tool calls", async () => {
			mockClient.chat.completions.create.mockResolvedValue({
				choices: [
					{
						message: {
							content: null,
							tool_calls: [
								{
									id: "call_1",
									type: "function",
									function: {
										name: "getWeather",
										arguments: '{"city":"London"}'
									}
								},
								{
									id: "call_2",
									type: "function",
									function: {
										name: "getWeather",
										arguments: '{"city":"Paris"}'
									}
								}
							]
						},
						finish_reason: "tool_calls"
					}
				]
			});

			const result = await adapter.chat([{ role: "user", content: "Compare weather" }]);

			expect(result.tool_calls).toHaveLength(2);
			expect(result.tool_calls![0].id).toBe("call_1");
			expect(result.tool_calls![1].id).toBe("call_2");
			expect(result.finish_reason).toBe("tool_calls");
		});

		it("should use default model when not specified", async () => {
			const a = new OpenAIAdapter({ apiKey: "key" });
			a.init(mockService);
			const mc = createMockClient();
			a.client = mc;

			mc.chat.completions.create.mockResolvedValue({
				choices: [
					{
						message: { content: "Hi", tool_calls: null },
						finish_reason: "stop"
					}
				]
			});

			await a.chat([{ role: "user", content: "Hi" }]);

			expect(mc.chat.completions.create).toHaveBeenCalledWith({
				model: "gpt-4o",
				messages: [{ role: "user", content: "Hi" }]
			});
		});
	});
});
