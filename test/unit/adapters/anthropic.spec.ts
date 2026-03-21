/*
 * @moleculer/agents
 * Copyright (c) 2026 MoleculerJS (https://github.com/moleculerjs/agents)
 * MIT Licensed
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import AnthropicAdapter from "../../../src/adapters/anthropic.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockCreate = vi.fn() as any;

vi.mock("node:module", () => {
	return {
		createRequire: () => {
			return (id: string) => {
				if (id === "@anthropic-ai/sdk") {
					return {
						default: class MockAnthropic {
							messages = { create: mockCreate };
							// eslint-disable-next-line @typescript-eslint/no-explicit-any
							constructor(_opts?: any) {}
						}
					};
				}
				throw new Error(`Cannot find module '${id}'`);
			};
		}
	};
});

function createAdapter(opts?: Record<string, unknown>) {
	const adapter = new AnthropicAdapter({
		apiKey: "test-key",
		model: "claude-sonnet-4-20250514",
		...opts
	});

	const mockService = {
		broker: {
			fatal: vi.fn()
		},
		logger: {
			debug: vi.fn(),
			info: vi.fn(),
			warn: vi.fn(),
			error: vi.fn()
		}
	};

	adapter.init(mockService);
	return { adapter, mockService };
}

describe("AnthropicAdapter", () => {
	beforeEach(() => {
		mockCreate.mockReset();
	});

	describe("init", () => {
		it("should initialize with service references", () => {
			const { adapter, mockService } = createAdapter();
			expect(adapter.service).toBe(mockService);
			expect(adapter.broker).toBe(mockService.broker);
			expect(adapter.logger).toBe(mockService.logger);
			expect(adapter.client).toBeDefined();
		});
	});

	describe("convertToolSchema", () => {
		it("should convert moleculer params to Anthropic tool format", () => {
			const { adapter } = createAdapter();

			const result = adapter.convertToolSchema("getWeather", "Get weather", {
				city: { type: "string", description: "City name" }
			});

			expect(result).toEqual({
				name: "getWeather",
				description: "Get weather",
				input_schema: {
					type: "object",
					properties: {
						city: { type: "string", description: "City name" }
					},
					required: ["city"]
				}
			});
		});

		it("should handle complex params with nested objects", () => {
			const { adapter } = createAdapter();

			const result = adapter.convertToolSchema("search", "Search hotels", {
				location: { type: "string", description: "Location" },
				filters: {
					type: "object",
					description: "Search filters",
					properties: {
						minPrice: { type: "number", description: "Min price" },
						maxPrice: { type: "number", description: "Max price" }
					}
				}
			});

			expect(result).toEqual({
				name: "search",
				description: "Search hotels",
				input_schema: {
					type: "object",
					properties: {
						location: { type: "string", description: "Location" },
						filters: {
							type: "object",
							description: "Search filters",
							properties: {
								minPrice: {
									type: "number",
									description: "Min price"
								},
								maxPrice: {
									type: "number",
									description: "Max price"
								}
							},
							required: ["minPrice", "maxPrice"]
						}
					},
					required: ["location", "filters"]
				}
			});
		});

		it("should handle optional params", () => {
			const { adapter } = createAdapter();

			const result = adapter.convertToolSchema("test", "Test action", {
				required: { type: "string" },
				optional: { type: "string", optional: true }
			});

			expect(result).toEqual({
				name: "test",
				description: "Test action",
				input_schema: {
					type: "object",
					properties: {
						required: { type: "string" },
						optional: { type: "string" }
					},
					required: ["required"]
				}
			});
		});
	});

	describe("chat", () => {
		it("should call Anthropic API and convert stop response", async () => {
			const { adapter } = createAdapter();

			mockCreate.mockResolvedValue({
				content: [{ type: "text", text: "Hello there!" }],
				stop_reason: "end_turn"
			});

			const result = await adapter.chat([{ role: "user", content: "Hello" }]);

			expect(result).toEqual({
				content: "Hello there!",
				finish_reason: "stop"
			});

			expect(mockCreate).toHaveBeenCalledWith({
				model: "claude-sonnet-4-20250514",
				messages: [{ role: "user", content: "Hello" }],
				max_tokens: 4096
			});
		});

		it("should extract system message and pass separately", async () => {
			const { adapter } = createAdapter();

			mockCreate.mockResolvedValue({
				content: [{ type: "text", text: "I am helpful." }],
				stop_reason: "end_turn"
			});

			await adapter.chat([
				{ role: "system", content: "You are a helpful assistant." },
				{ role: "user", content: "Hello" }
			]);

			expect(mockCreate).toHaveBeenCalledWith({
				model: "claude-sonnet-4-20250514",
				messages: [{ role: "user", content: "Hello" }],
				max_tokens: 4096,
				system: "You are a helpful assistant."
			});
		});

		it("should convert tool_use response to OpenAI format", async () => {
			const { adapter } = createAdapter();

			mockCreate.mockResolvedValue({
				content: [
					{ type: "text", text: "Let me check the weather." },
					{
						type: "tool_use",
						id: "toolu_123",
						name: "getWeather",
						input: { city: "London" }
					}
				],
				stop_reason: "tool_use"
			});

			const result = await adapter.chat(
				[{ role: "user", content: "What is the weather?" }],
				[
					{
						name: "getWeather",
						description: "Get weather",
						input_schema: {}
					}
				]
			);

			expect(result).toEqual({
				content: "Let me check the weather.",
				finish_reason: "tool_calls",
				tool_calls: [
					{
						id: "toolu_123",
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
			const { adapter } = createAdapter();

			mockCreate.mockResolvedValue({
				content: [
					{
						type: "tool_use",
						id: "toolu_1",
						name: "getWeather",
						input: { city: "London" }
					},
					{
						type: "tool_use",
						id: "toolu_2",
						name: "getForecast",
						input: { city: "London", days: 3 }
					}
				],
				stop_reason: "tool_use"
			});

			const result = await adapter.chat([{ role: "user", content: "Weather and forecast" }]);

			expect(result.finish_reason).toBe("tool_calls");
			expect(result.tool_calls).toHaveLength(2);
			expect(result.tool_calls![0].function.name).toBe("getWeather");
			expect(result.tool_calls![1].function.name).toBe("getForecast");
		});

		it("should pass tools to API when provided", async () => {
			const { adapter } = createAdapter();

			const tools = [
				{
					name: "getWeather",
					description: "Get weather",
					input_schema: { type: "object", properties: {} }
				}
			];

			mockCreate.mockResolvedValue({
				content: [{ type: "text", text: "Done" }],
				stop_reason: "end_turn"
			});

			await adapter.chat([{ role: "user", content: "test" }], tools);

			expect(mockCreate).toHaveBeenCalledWith(
				expect.objectContaining({
					tools
				})
			);
		});

		it("should handle response with no text content", async () => {
			const { adapter } = createAdapter();

			mockCreate.mockResolvedValue({
				content: [
					{
						type: "tool_use",
						id: "toolu_1",
						name: "doSomething",
						input: {}
					}
				],
				stop_reason: "tool_use"
			});

			const result = await adapter.chat([{ role: "user", content: "Do it" }]);

			expect(result.content).toBeNull();
			expect(result.finish_reason).toBe("tool_calls");
			expect(result.tool_calls).toHaveLength(1);
		});

		it("should use default model if not specified", async () => {
			const adapter = new AnthropicAdapter({ apiKey: "test-key" });
			const mockService = {
				broker: { fatal: vi.fn() },
				logger: { warn: vi.fn() }
			};
			adapter.init(mockService);

			mockCreate.mockResolvedValue({
				content: [{ type: "text", text: "Hi" }],
				stop_reason: "end_turn"
			});

			await adapter.chat([{ role: "user", content: "test" }]);

			expect(mockCreate).toHaveBeenCalledWith(
				expect.objectContaining({
					model: "claude-sonnet-4-20250514"
				})
			);
		});
	});

	describe("_convertResponse", () => {
		let adapter: AnthropicAdapter;

		beforeEach(() => {
			const result = createAdapter();
			adapter = result.adapter;
		});

		it("should convert end_turn to stop", () => {
			const result = adapter._convertResponse({
				content: [{ type: "text", text: "Hello" }],
				stop_reason: "end_turn"
			});

			expect(result.finish_reason).toBe("stop");
			expect(result.content).toBe("Hello");
		});

		it("should convert tool_use stop_reason to tool_calls", () => {
			const result = adapter._convertResponse({
				content: [
					{
						type: "tool_use",
						id: "t1",
						name: "test",
						input: { a: 1 }
					}
				],
				stop_reason: "tool_use"
			});

			expect(result.finish_reason).toBe("tool_calls");
			expect(result.tool_calls).toEqual([
				{
					id: "t1",
					type: "function",
					function: {
						name: "test",
						arguments: '{"a":1}'
					}
				}
			]);
		});

		it("should handle empty content array", () => {
			const result = adapter._convertResponse({
				content: [],
				stop_reason: "end_turn"
			});

			expect(result.content).toBeNull();
			expect(result.finish_reason).toBe("stop");
		});
	});
});
