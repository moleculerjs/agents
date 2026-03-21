/*
 * Helper to create an LLM adapter based on available API keys.
 *
 * Priority: OPENAI_API_KEY > ANTHROPIC_API_KEY > FakeAdapter
 */

import BaseAdapter from "../../src/adapters/base.ts";
import OpenAIAdapter from "../../src/adapters/openai.ts";
import AnthropicAdapter from "../../src/adapters/anthropic.ts";
import FakeAdapter from "../../src/adapters/fake.ts";
import type { LLMResponse } from "../../src/types.ts";

interface CreateAdapterOptions {
	/** Fake responses to use when no API key is available */
	fakeResponses: (string | Partial<LLMResponse>)[];
}

interface CreateAdapterResult {
	adapter: BaseAdapter;
	isFake: boolean;
}

export function createAdapter(opts: CreateAdapterOptions): CreateAdapterResult {
	if (process.env.OPENAI_API_KEY) {
		console.log("[Using OpenAI adapter]\n");
		return {
			adapter: new OpenAIAdapter({
				apiKey: process.env.OPENAI_API_KEY,
				model: process.env.OPENAI_MODEL || "gpt-4o"
			}),
			isFake: false
		};
	}

	if (process.env.ANTHROPIC_API_KEY) {
		console.log("[Using Anthropic adapter]\n");
		return {
			adapter: new AnthropicAdapter({
				apiKey: process.env.ANTHROPIC_API_KEY,
				model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514"
			}),
			isFake: false
		};
	}

	console.log("[No API key found — using FakeAdapter with scripted responses]\n");
	return {
		adapter: new FakeAdapter({ responses: opts.fakeResponses }),
		isFake: true
	};
}
