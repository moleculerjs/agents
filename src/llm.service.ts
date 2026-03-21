/*
 * @moleculer/agents
 * Copyright (c) 2026 MoleculerJS (https://github.com/moleculerjs/agents)
 * MIT Licensed
 */

import Adapters from "./adapters/index.ts";
import type BaseAdapter from "./adapters/base.ts";
import type { ToolSchema } from "./types.ts";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export default function LLMService(_mixinOpts?: Record<string, unknown>) {
	const schema = {
		settings: {
			adapter: undefined as unknown,
			apiKey: undefined as string | undefined,
			model: undefined as string | undefined
		},

		actions: {
			chat: {
				params: {
					messages: { type: "array" },
					tools: { type: "array", optional: true },
					toolSchemas: { type: "array", optional: true }
				},
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				async handler(this: any, ctx: any) {
					let tools = ctx.params.tools;

					if (ctx.params.toolSchemas) {
						const converted = ctx.params.toolSchemas.map((ts: ToolSchema) =>
							this._adapter.convertToolSchema(ts.name, ts.description, ts.params)
						);
						tools = tools ? [...tools, ...converted] : converted;
					}

					return this._adapter.chat(ctx.params.messages, tools);
				}
			}
		},

		methods: {},

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		created(this: any) {
			this._adapter = Adapters.resolve(this.settings.adapter) as BaseAdapter;
			this._adapter.init(this);
		},

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		async stopped(this: any) {
			if (this._adapter) {
				await this._adapter.stop();
			}
		}
	};

	return schema;
}
