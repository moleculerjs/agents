/*
 * @moleculer/agents
 * Copyright (c) 2026 MoleculerJS (https://github.com/moleculerjs/agents)
 * MIT Licensed
 */

import { describe, expect, it, vi } from "vitest";
import { moleculerParamsToJsonSchema } from "../../src/schema-converter.ts";

describe("moleculerParamsToJsonSchema", () => {
	it("should convert string param", () => {
		const result = moleculerParamsToJsonSchema({
			name: { type: "string", description: "User name" }
		});
		expect(result).toEqual({
			type: "object",
			properties: {
				name: { type: "string", description: "User name" }
			},
			required: ["name"]
		});
	});

	it("should convert number param", () => {
		const result = moleculerParamsToJsonSchema({
			age: { type: "number", description: "User age" }
		});
		expect(result.properties.age).toEqual({ type: "number", description: "User age" });
		expect(result.required).toContain("age");
	});

	it("should convert boolean param", () => {
		const result = moleculerParamsToJsonSchema({
			active: { type: "boolean" }
		});
		expect(result.properties.active).toEqual({ type: "boolean" });
	});

	it("should convert enum param", () => {
		const result = moleculerParamsToJsonSchema({
			status: { type: "enum", values: ["active", "inactive", "pending"] }
		});
		expect(result.properties.status).toEqual({
			type: "string",
			enum: ["active", "inactive", "pending"]
		});
	});

	it("should convert object with nested properties", () => {
		const result = moleculerParamsToJsonSchema({
			address: {
				type: "object",
				properties: {
					street: { type: "string", description: "Street name" },
					city: { type: "string" }
				}
			}
		});
		expect(result.properties.address).toEqual({
			type: "object",
			properties: {
				street: { type: "string", description: "Street name" },
				city: { type: "string" }
			},
			required: ["street", "city"]
		});
	});

	it("should convert object with props shorthand", () => {
		const result = moleculerParamsToJsonSchema({
			location: {
				type: "object",
				props: {
					lat: { type: "number" },
					lng: { type: "number" }
				}
			}
		});
		expect(result.properties.location).toEqual({
			type: "object",
			properties: {
				lat: { type: "number" },
				lng: { type: "number" }
			},
			required: ["lat", "lng"]
		});
	});

	it("should convert array with items", () => {
		const result = moleculerParamsToJsonSchema({
			tags: {
				type: "array",
				items: { type: "string" }
			}
		});
		expect(result.properties.tags).toEqual({
			type: "array",
			items: { type: "string" }
		});
	});

	it("should convert email to string with format", () => {
		const result = moleculerParamsToJsonSchema({
			email: { type: "email", description: "Contact email" }
		});
		expect(result.properties.email).toEqual({
			type: "string",
			description: "Contact email (format: email)"
		});
	});

	it("should convert url to string with format", () => {
		const result = moleculerParamsToJsonSchema({
			website: { type: "url" }
		});
		expect(result.properties.website).toEqual({
			type: "string",
			description: "(format: url)"
		});
	});

	it("should convert date to string with format", () => {
		const result = moleculerParamsToJsonSchema({
			birthday: { type: "date" }
		});
		expect(result.properties.birthday).toEqual({
			type: "string",
			description: "(format: date)"
		});
	});

	it("should convert uuid to string with format", () => {
		const result = moleculerParamsToJsonSchema({
			id: { type: "uuid" }
		});
		expect(result.properties.id).toEqual({
			type: "string",
			description: "(format: uuid)"
		});
	});

	it("should handle optional params", () => {
		const result = moleculerParamsToJsonSchema({
			name: { type: "string" },
			nickname: { type: "string", optional: true }
		});
		expect(result.required).toEqual(["name"]);
		expect(result.properties.nickname).toEqual({ type: "string" });
	});

	it("should pass through description", () => {
		const result = moleculerParamsToJsonSchema({
			city: { type: "string", description: "City name" }
		});
		expect(result.properties.city.description).toBe("City name");
	});

	it("should skip unknown types with warning", () => {
		const logger = { warn: vi.fn() };
		const result = moleculerParamsToJsonSchema(
			{
				name: { type: "string" },
				weird: { type: "customType" }
			},
			logger
		);
		expect(result.properties).not.toHaveProperty("weird");
		expect(result.properties).toHaveProperty("name");
		expect(logger.warn).toHaveBeenCalledWith("Unsupported param type", { type: "customType" });
	});

	it("should handle shorthand string type", () => {
		const result = moleculerParamsToJsonSchema({
			name: "string"
		});
		expect(result.properties.name).toEqual({ type: "string" });
		expect(result.required).toEqual(["name"]);
	});

	it("should handle empty params", () => {
		const result = moleculerParamsToJsonSchema({});
		expect(result).toEqual({
			type: "object",
			properties: {},
			required: []
		});
	});

	it("should handle complex nested structure", () => {
		const result = moleculerParamsToJsonSchema({
			query: { type: "string", description: "Search query" },
			filters: {
				type: "object",
				properties: {
					category: { type: "enum", values: ["food", "travel"] },
					tags: { type: "array", items: { type: "string" } },
					minPrice: { type: "number", optional: true }
				}
			}
		});
		expect(result.properties.filters).toEqual({
			type: "object",
			properties: {
				category: { type: "string", enum: ["food", "travel"] },
				tags: { type: "array", items: { type: "string" } },
				minPrice: { type: "number" }
			},
			required: ["category", "tags"]
		});
		expect(result.required).toEqual(["query", "filters"]);
	});
});
