/*
 * @moleculer/agents
 * Copyright (c) 2026 MoleculerJS (https://github.com/moleculerjs/agents)
 * MIT Licensed
 */

import { createRequire } from "node:module";
import BaseAdapter from "./base.ts";
import { moleculerParamsToJsonSchema } from "../schema-converter.ts";
import type { LLMResponse } from "../types.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let OpenAI: any;

export interface OpenAIAdapterOptions {
	apiKey?: string;
	model?: string;
	baseURL?: string;
}

export default class OpenAIAdapter extends BaseAdapter {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	client: any;

	constructor(opts?: OpenAIAdapterOptions) {
		super(opts as Record<string, unknown>);
	}

	init(service: unknown) {
		super.init(service);

		try {
			// eslint-disable-next-line @typescript-eslint/ban-ts-comment
			// @ts-ignore - import.meta.url not available in CJS build
			const req = createRequire(import.meta.url);
			OpenAI = req("openai");
		} catch (err) {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			(this as any).broker.fatal(
				"The 'openai' package is missing! Please install it with 'npm install openai --save' command.",
				err,
				true
			);
			return;
		}

		const OpenAIClass = OpenAI.default || OpenAI;
		this.client = new OpenAIClass({
			apiKey: this.opts.apiKey,
			baseURL: this.opts.baseURL
		});
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

	async chat(messages: unknown[], tools?: unknown[]): Promise<LLMResponse> {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const params: any = {
			model: this.opts.model || "gpt-4o",
			messages
		};

		if (tools && tools.length > 0) {
			params.tools = tools;
		}

		const response = await this.client.chat.completions.create(params);
		const choice = response.choices[0];

		const result: LLMResponse = {
			content: choice.message.content,
			finish_reason: choice.finish_reason === "tool_calls" ? "tool_calls" : "stop"
		};

		if (choice.message.tool_calls && choice.message.tool_calls.length > 0) {
			result.tool_calls = choice.message.tool_calls.map(
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				(tc: any) => ({
					id: tc.id,
					type: "function" as const,
					function: {
						name: tc.function.name,
						arguments: tc.function.arguments
					}
				})
			);
			result.finish_reason = "tool_calls";
		}

		return result;
	}
}
