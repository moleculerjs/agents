/*
 * @moleculer/agents
 * Copyright (c) 2026 MoleculerJS (https://github.com/moleculerjs/agents)
 * MIT Licensed
 */

import _ from "lodash";

const DEFAULT_HISTORY_TTL = 3600;
const DEFAULT_MAX_HISTORY_MESSAGES = 50;

interface MemoryMixinOptions {
	historyTtl?: number;
	maxHistoryMessages?: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ServiceInstance = any;

export default function MemoryMixin(mixinOpts?: MemoryMixinOptions) {
	mixinOpts = _.defaultsDeep(mixinOpts, {
		historyTtl: DEFAULT_HISTORY_TTL,
		maxHistoryMessages: DEFAULT_MAX_HISTORY_MESSAGES
	});

	const schema = {
		settings: {
			agent: {
				historyTtl: mixinOpts!.historyTtl,
				maxHistoryMessages: mixinOpts!.maxHistoryMessages
			}
		},

		methods: {
			async loadHistory(this: ServiceInstance, sessionId?: string): Promise<unknown[]> {
				if (!sessionId) return [];

				const key = `agent:history:${this.name}:${sessionId}`;
				const history = await this.broker.cacher.get(key);
				return history || [];
			},

			async saveHistory(
				this: ServiceInstance,
				sessionId?: string,
				history?: unknown[]
			): Promise<void> {
				if (!sessionId) return;

				const key = `agent:history:${this.name}:${sessionId}`;
				const ttl = this.settings.agent.historyTtl || DEFAULT_HISTORY_TTL;
				await this.broker.cacher.set(key, history, ttl);
			},

			async compactConversation(
				this: ServiceInstance,
				history: unknown[]
			): Promise<unknown[]> {
				const maxMessages =
					this.settings.agent.maxHistoryMessages || DEFAULT_MAX_HISTORY_MESSAGES;

				if (history.length <= maxMessages) return history;

				const first = history[0] as { role?: string };
				const hasSystem = first && first.role === "system";

				if (hasSystem) {
					return [first, ...history.slice(-(maxMessages - 1))];
				}

				return history.slice(-maxMessages);
			}
		}
	};

	return schema;
}
