/*
 * @moleculer/agents
 * Copyright (c) 2026 MoleculerJS (https://github.com/moleculerjs/agents)
 * MIT Licensed
 */

import { describe, expect, it } from "vitest";
import FakeAdapter from "../../../src/adapters/fake.ts";
import Adapters from "../../../src/adapters/index.ts";

describe("Test FakeAdapter", () => {
	describe("constructor", () => {
		it("should set default empty responses", () => {
			const adapter = new FakeAdapter();
			expect(adapter.opts).toEqual({});
		});

		it("should accept responses in constructor", () => {
			const adapter = new FakeAdapter({ responses: ["hello", "world"] });
			expect(adapter.opts).toEqual({ responses: ["hello", "world"] });
		});
	});

	describe("chat", () => {
		it("should return null content when no responses configured", async () => {
			const adapter = new FakeAdapter();
			const result = await adapter.chat();
			expect(result).toEqual({ content: null, finish_reason: "stop" });
		});

		it("should return string response as LLMResponse", async () => {
			const adapter = new FakeAdapter({ responses: ["Hello!"] });
			const result = await adapter.chat();
			expect(result).toEqual({ content: "Hello!", finish_reason: "stop" });
		});

		it("should cycle through responses in round-robin", async () => {
			const adapter = new FakeAdapter({
				responses: ["first", "second", "third"]
			});

			const r1 = await adapter.chat();
			expect(r1.content).toBe("first");

			const r2 = await adapter.chat();
			expect(r2.content).toBe("second");

			const r3 = await adapter.chat();
			expect(r3.content).toBe("third");

			// Round-robin: back to first
			const r4 = await adapter.chat();
			expect(r4.content).toBe("first");
		});

		it("should return tool_calls response from object", async () => {
			const toolCallResponse = {
				content: null,
				tool_calls: [
					{
						id: "call_1",
						type: "function" as const,
						function: {
							name: "getWeather",
							arguments: JSON.stringify({ city: "London" })
						}
					}
				]
			};

			const adapter = new FakeAdapter({ responses: [toolCallResponse] });
			const result = await adapter.chat();

			expect(result.finish_reason).toBe("tool_calls");
			expect(result.tool_calls).toHaveLength(1);
			expect(result.tool_calls![0].function.name).toBe("getWeather");
		});

		it("should return object response without tool_calls as stop", async () => {
			const adapter = new FakeAdapter({
				responses: [{ content: "Done!", finish_reason: "stop" as const }]
			});

			const result = await adapter.chat();
			expect(result).toEqual({ content: "Done!", finish_reason: "stop" });
		});

		it("should handle mixed string and object responses", async () => {
			const toolCall = {
				content: null,
				tool_calls: [
					{
						id: "call_1",
						type: "function" as const,
						function: {
							name: "search",
							arguments: "{}"
						}
					}
				]
			};

			const adapter = new FakeAdapter({
				responses: [toolCall, "Final answer"]
			});

			const r1 = await adapter.chat();
			expect(r1.finish_reason).toBe("tool_calls");

			const r2 = await adapter.chat();
			expect(r2).toEqual({ content: "Final answer", finish_reason: "stop" });
		});

		it("should default content to null for object response", async () => {
			const adapter = new FakeAdapter({
				responses: [
					{
						tool_calls: [
							{
								id: "call_1",
								type: "function" as const,
								function: { name: "test", arguments: "{}" }
							}
						]
					}
				]
			});

			const result = await adapter.chat();
			expect(result.content).toBeNull();
		});
	});

	describe("convertToolSchema", () => {
		it("should convert moleculer params to OpenAI function format", () => {
			const result = FakeAdapter.prototype.convertToolSchema.call(
				{ logger: undefined },
				"getWeather",
				"Get current weather",
				{
					city: { type: "string", description: "City name" }
				}
			);

			expect(result).toEqual({
				type: "function",
				function: {
					name: "getWeather",
					description: "Get current weather",
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

		it("should handle complex params with nested objects", () => {
			const result = FakeAdapter.prototype.convertToolSchema.call(
				{ logger: undefined },
				"search",
				"Search items",
				{
					query: { type: "string", description: "Search query" },
					limit: {
						type: "number",
						optional: true,
						description: "Max results"
					}
				}
			);

			const fn = (result as { function: { parameters: unknown } }).function;
			expect(fn.parameters).toEqual({
				type: "object",
				properties: {
					query: { type: "string", description: "Search query" },
					limit: { type: "number", description: "Max results" }
				},
				required: ["query"]
			});
		});
	});

	describe("registry", () => {
		it("should be registered in Adapters as Fake", () => {
			expect(Adapters.Fake).toBe(FakeAdapter);
		});

		it("should be resolvable by name", () => {
			const adapter = Adapters.resolve("Fake");
			expect(adapter).toBeInstanceOf(FakeAdapter);
		});
	});
});
