/*
 * @moleculer/agents
 * Copyright (c) 2026 MoleculerJS (https://github.com/moleculerjs/agents)
 * MIT Licensed
 */

interface JsonSchemaProperty {
	type?: string;
	description?: string;
	enum?: unknown[];
	properties?: Record<string, JsonSchemaProperty>;
	required?: string[];
	items?: JsonSchemaProperty;
}

interface JsonSchemaResult {
	type: "object";
	properties: Record<string, JsonSchemaProperty>;
	required: string[];
}

function convertParam(
	paramDef: Record<string, unknown>,
	logger?: { warn: (...args: unknown[]) => void }
): JsonSchemaProperty | null {
	const type = paramDef.type as string;
	const result: JsonSchemaProperty = {};

	if (paramDef.description) {
		result.description = paramDef.description as string;
	}

	switch (type) {
		case "string":
			result.type = "string";
			break;

		case "number":
			result.type = "number";
			break;

		case "boolean":
			result.type = "boolean";
			break;

		case "enum":
			result.type = "string";
			if (paramDef.values) {
				result.enum = paramDef.values as unknown[];
			}
			break;

		case "email":
			result.type = "string";
			result.description = (result.description ? result.description + " " : "") + "(format: email)";
			break;

		case "url":
			result.type = "string";
			result.description = (result.description ? result.description + " " : "") + "(format: url)";
			break;

		case "date":
			result.type = "string";
			result.description = (result.description ? result.description + " " : "") + "(format: date)";
			break;

		case "uuid":
			result.type = "string";
			result.description = (result.description ? result.description + " " : "") + "(format: uuid)";
			break;

		case "object": {
			result.type = "object";
			const props = (paramDef.properties || paramDef.props) as Record<string, Record<string, unknown>> | undefined;
			if (props) {
				const nested = moleculerParamsToJsonSchema(props, logger);
				result.properties = nested.properties;
				if (nested.required.length > 0) {
					result.required = nested.required;
				}
			}
			break;
		}

		case "array": {
			result.type = "array";
			if (paramDef.items) {
				const itemSchema = convertParam(paramDef.items as Record<string, unknown>, logger);
				if (itemSchema) {
					result.items = itemSchema;
				}
			}
			break;
		}

		default:
			if (logger) {
				logger.warn("Unsupported param type", { type });
			}
			return null;
	}

	return result;
}

export function moleculerParamsToJsonSchema(
	params: Record<string, unknown>,
	logger?: { warn: (...args: unknown[]) => void }
): JsonSchemaResult {
	const properties: Record<string, JsonSchemaProperty> = {};
	const required: string[] = [];

	for (const [name, rawDef] of Object.entries(params)) {
		const paramDef = typeof rawDef === "string"
			? { type: rawDef }
			: rawDef as Record<string, unknown>;

		const converted = convertParam(paramDef, logger);
		if (converted) {
			properties[name] = converted;
			if (paramDef.optional !== true) {
				required.push(name);
			}
		}
	}

	return { type: "object", properties, required };
}
