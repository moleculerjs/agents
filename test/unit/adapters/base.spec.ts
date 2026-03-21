/*
 * @moleculer/agents
 * Copyright (c) 2026 MoleculerJS (https://github.com/moleculerjs/agents)
 * MIT Licensed
 */

import { describe, expect, it } from "vitest";
import BaseAdapter from "../../../src/adapters/base.ts";
import Adapters from "../../../src/adapters/index.ts";
import type { LLMResponse } from "../../../src/types.ts";

class TestAdapter extends BaseAdapter {
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	async chat(messages: unknown[], tools?: unknown[]): Promise<LLMResponse> {
		return { content: "test", finish_reason: "stop" };
	}

	convertToolSchema(name: string, description: string, params: unknown): unknown {
		return { name, description, params };
	}
}

describe("Test BaseAdapter", () => {
	it("should set default opts", () => {
		const adapter = new TestAdapter();
		expect(adapter.opts).toEqual({});
	});

	it("should accept opts in constructor", () => {
		const opts = { apiKey: "test-key", model: "gpt-4" };
		const adapter = new TestAdapter(opts);
		expect(adapter.opts).toEqual(opts);
	});

	it("should init with service, broker, and logger", () => {
		const adapter = new TestAdapter();
		const mockService = {
			broker: { call: () => {} },
			logger: { info: () => {} }
		};
		adapter.init(mockService);
		expect(adapter.service).toBe(mockService);
		expect(adapter.broker).toBe(mockService.broker);
		expect(adapter.logger).toBe(mockService.logger);
	});

	it("should have a no-op stop method", async () => {
		const adapter = new TestAdapter();
		await expect(adapter.stop()).resolves.toBeUndefined();
	});

	it("should call abstract chat method", async () => {
		const adapter = new TestAdapter();
		const result = await adapter.chat([{ role: "user", content: "hi" }]);
		expect(result).toEqual({ content: "test", finish_reason: "stop" });
	});

	it("should call abstract convertToolSchema method", () => {
		const adapter = new TestAdapter();
		const result = adapter.convertToolSchema("test", "A test tool", { type: "string" });
		expect(result).toEqual({
			name: "test",
			description: "A test tool",
			params: { type: "string" }
		});
	});
});

describe("Test Adapter Registry", () => {
	it("should have Base adapter registered", () => {
		expect(Adapters.Base).toBe(BaseAdapter);
	});

	it("should resolve adapter by string name", () => {
		Adapters.register("Test", TestAdapter);
		const adapter = Adapters.resolve("Test");
		expect(adapter).toBeInstanceOf(TestAdapter);
	});

	it("should throw on unknown adapter name", () => {
		expect(() => Adapters.resolve("Unknown")).toThrow("Unknown adapter: 'Unknown'");
	});

	it("should resolve adapter from object with type", () => {
		Adapters.register("Test", TestAdapter);
		const adapter = Adapters.resolve({ type: "Test", apiKey: "key123" });
		expect(adapter).toBeInstanceOf(TestAdapter);
		expect(adapter.opts).toEqual({ type: "Test", apiKey: "key123" });
	});

	it("should throw on object with unknown type", () => {
		expect(() => Adapters.resolve({ type: "Nope" })).toThrow("Unknown adapter type: 'Nope'");
	});

	it("should return BaseAdapter instance directly", () => {
		const adapter = new TestAdapter({ key: "val" });
		const resolved = Adapters.resolve(adapter);
		expect(resolved).toBe(adapter);
	});

	it("should throw on object without type field", () => {
		expect(() => Adapters.resolve({ apiKey: "key" })).toThrow(
			"Adapter object must have a 'type' field or be a BaseAdapter instance"
		);
	});

	it("should throw on invalid option type", () => {
		// @ts-expect-error testing invalid type
		expect(() => Adapters.resolve(123)).toThrow(
			"Adapter option must be a string name or an object config"
		);
	});

	it("should register custom adapter", () => {
		class CustomAdapter extends BaseAdapter {
			async chat(): Promise<LLMResponse> {
				return { content: "custom", finish_reason: "stop" };
			}
			convertToolSchema() {
				return {};
			}
		}
		Adapters.register("Custom", CustomAdapter);
		expect(Adapters.Custom).toBe(CustomAdapter);
		const adapter = Adapters.resolve("Custom");
		expect(adapter).toBeInstanceOf(CustomAdapter);
	});
});
