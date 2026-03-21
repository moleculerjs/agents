/*
 * Helper to create an LLM adapter based on available API keys.
 *
 * Priority: OPENAI_API_KEY > ANTHROPIC_API_KEY > FakeAdapter
 */

import { Adapters } from "../../src/index.ts";
import type { LLMResponse } from "../../src/types.ts";

interface CreateAdapterOptions {
	/** Fake responses to use when no API key is available */
	fakeResponses: (string | Partial<LLMResponse>)[];
}

export function createAdapter(opts: CreateAdapterOptions) {
	if (process.env.OPENAI_API_KEY) {
		console.log("[Using OpenAI adapter]\n");
		return {
			adapter: new Adapters.OpenAI({
				apiKey: process.env.OPENAI_API_KEY,
				model: process.env.OPENAI_MODEL || "gpt-4o"
			}),
			isFake: false
		};
	}

	if (process.env.ANTHROPIC_API_KEY) {
		console.log("[Using Anthropic adapter]\n");
		return {
			adapter: new Adapters.Anthropic({
				apiKey: process.env.ANTHROPIC_API_KEY,
				model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514"
			}),
			isFake: false
		};
	}

	console.log("[No API key found — using FakeAdapter with scripted responses]\n");
	return {
		adapter: new Adapters.Fake({ responses: opts.fakeResponses }),
		isFake: true
	};
}
