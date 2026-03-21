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
let AnthropicSDK: any;

interface AnthropicAdapterOptions {
	apiKey?: string;
	model?: string;
}

export default class AnthropicAdapter extends BaseAdapter {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	client: any;

	constructor(opts?: AnthropicAdapterOptions) {
		super(opts as Record<string, unknown>);
	}

	init(service: unknown) {
		super.init(service);

		try {
			const req = createRequire(process.cwd() + "/");
			AnthropicSDK = req("@anthropic-ai/sdk");
		} catch (err) {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			(this as any).broker.fatal(
				"The '@anthropic-ai/sdk' package is missing! Please install it with 'npm install @anthropic-ai/sdk --save' command.",
				err,
				true
			);
			return;
		}

		const AnthropicClass = AnthropicSDK.default || AnthropicSDK;
		this.client = new AnthropicClass({
			apiKey: this.opts.apiKey
		});
	}

	convertToolSchema(name: string, description: string, params: unknown): unknown {
		const jsonSchema = moleculerParamsToJsonSchema(
			params as Record<string, unknown>,
			this.logger as { warn: (...args: unknown[]) => void }
		);

		return {
			name,
			description,
			input_schema: jsonSchema
		};
	}

	async chat(messages: unknown[], tools?: unknown[]): Promise<LLMResponse> {
		const model = (this.opts.model as string) || "claude-sonnet-4-20250514";

		// Anthropic requires system message to be passed separately
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const msgArray = messages as any[];
		let system: string | undefined;
		const filteredMessages: unknown[] = [];

		for (const msg of msgArray) {
			if (msg.role === "system") {
				system = msg.content;
			} else {
				filteredMessages.push(msg);
			}
		}

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const params: any = {
			model,
			messages: filteredMessages,
			max_tokens: 4096
		};

		if (system) {
			params.system = system;
		}

		if (tools && tools.length > 0) {
			params.tools = tools;
		}

		const response = await this.client.messages.create(params);

		return this._convertResponse(response);
	}

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	_convertResponse(response: any): LLMResponse {
		let content: string | null = null;
		const toolCalls: LLMResponse["tool_calls"] = [];

		if (response.content && Array.isArray(response.content)) {
			for (const block of response.content) {
				if (block.type === "text") {
					content = block.text;
				} else if (block.type === "tool_use") {
					toolCalls.push({
						id: block.id,
						type: "function",
						function: {
							name: block.name,
							arguments: JSON.stringify(block.input)
						}
					});
				}
			}
		}

		const finishReason = response.stop_reason === "tool_use" ? "tool_calls" : "stop";

		const result: LLMResponse = {
			content,
			finish_reason: finishReason
		};

		if (toolCalls.length > 0) {
			result.tool_calls = toolCalls;
		}

		return result;
	}
}
