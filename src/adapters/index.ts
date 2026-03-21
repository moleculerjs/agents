/*
 * @moleculer/agents
 * Copyright (c) 2026 MoleculerJS (https://github.com/moleculerjs/agents)
 * MIT Licensed
 */

import BaseAdapter from "./base.ts";
import OpenAIAdapter from "./openai.ts";
import AnthropicAdapter from "./anthropic.ts";
import FakeAdapter from "./fake.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Adapters: Record<string, any> = {
	Base: BaseAdapter,
	OpenAI: OpenAIAdapter,
	Anthropic: AnthropicAdapter,
	Fake: FakeAdapter
};

function resolve(opt?: string | object): BaseAdapter {
	if (typeof opt === "string") {
		const AdapterClass = Adapters[opt];
		if (!AdapterClass) {
			throw new Error(
				`Unknown adapter: '${opt}'. Available: ${Object.keys(Adapters).join(", ")}`
			);
		}
		return new AdapterClass();
	}

	if (typeof opt === "object" && opt !== null) {
		if (opt instanceof BaseAdapter) {
			return opt;
		}

		const type = (opt as Record<string, unknown>).type as string;
		if (type) {
			const AdapterClass = Adapters[type];
			if (!AdapterClass) {
				throw new Error(
					`Unknown adapter type: '${type}'. Available: ${Object.keys(Adapters).join(", ")}`
				);
			}
			return new AdapterClass(opt);
		}

		throw new Error("Adapter object must have a 'type' field or be a BaseAdapter instance");
	}

	throw new Error("Adapter option must be a string name or an object config");
}

function register(name: string, value: typeof BaseAdapter) {
	Adapters[name] = value;
}

export default Object.assign(Adapters, { resolve, register });
