/*
 * @moleculer/agents
 * Copyright (c) 2026 MoleculerJS (https://github.com/moleculerjs/agents)
 * MIT Licensed
 */

import type { LLMResponse } from "../types.ts";

interface ServiceLike {
	broker: unknown;
	logger: unknown;
}

export default abstract class BaseAdapter {
	opts: Record<string, unknown>;
	service?: unknown;
	broker?: unknown;
	logger?: unknown;

	constructor(opts?: Record<string, unknown>) {
		this.opts = opts || {};
	}

	init(service: unknown) {
		this.service = service;
		this.broker = (service as ServiceLike).broker;
		this.logger = (service as ServiceLike).logger;
	}

	abstract chat(messages: unknown[], tools?: unknown[]): Promise<LLMResponse>;

	abstract convertToolSchema(name: string, description: string, params: unknown): unknown;

	async stop(): Promise<void> {
		// No-op by default
	}
}
