/*
 * @moleculer/agents
 * Copyright (c) 2026 MoleculerJS (https://github.com/moleculerjs/agents)
 * MIT Licensed
 */

import BaseAdapter from "./base.ts";
import { moleculerParamsToJsonSchema } from "../schema-converter.ts";
import type { LLMResponse } from "../types.ts";

interface FakeAdapterOptions {
	responses?: (string | Partial<LLMResponse>)[];
}

export default class FakeAdapter extends BaseAdapter {
	private _responses: (string | Partial<LLMResponse>)[];
	private _callIndex: number;

	constructor(opts?: FakeAdapterOptions) {
		super(opts as Record<string, unknown>);
		this._responses = (opts && opts.responses) || [];
		this._callIndex = 0;
	}

	async chat(): Promise<LLMResponse> {
		if (this._responses.length === 0) {
			return { content: null, finish_reason: "stop" };
		}

		const response = this._responses[this._callIndex % this._responses.length];
		this._callIndex++;

		if (typeof response === "string") {
			return { content: response, finish_reason: "stop" };
		}

		// Object response with possible tool_calls
		if (response.tool_calls && response.tool_calls.length > 0) {
			return {
				content: response.content || null,
				finish_reason: "tool_calls",
				tool_calls: response.tool_calls
			};
		}

		return {
			content: response.content || null,
			finish_reason: response.finish_reason || "stop"
		};
	}

	convertToolSchema(name: string, description: string, params: unknown): unknown {
		const jsonSchema = moleculerParamsToJsonSchema(
			params as Record<string, unknown>,
			this.logger as { warn: (...args: unknown[]) => void }
		);
		return {
			type: "function",
			function: {
				name,
				description,
				parameters: jsonSchema
			}
		};
	}
}
