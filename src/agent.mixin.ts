/*
 * @moleculer/agents
 * Copyright (c) 2026 MoleculerJS (https://github.com/moleculerjs/agents)
 * MIT Licensed
 */

import _ from "lodash";
import type { ToolSchema, LLMResponse } from "./types.ts";

const DEFAULT_MAX_ITERATIONS = 10;
const DEFAULT_MAX_HISTORY_MESSAGES = 50;

interface AgentMixinOptions {
	maxIterations?: number;
	maxHistoryMessages?: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ServiceInstance = any;

export default function AgentMixin(mixinOpts?: AgentMixinOptions) {
	mixinOpts = _.defaultsDeep(mixinOpts, {
		maxIterations: DEFAULT_MAX_ITERATIONS,
		maxHistoryMessages: DEFAULT_MAX_HISTORY_MESSAGES
	});

	const schema = {
		settings: {
			agent: {
				description: "",
				instructions: undefined as string | undefined,
				llm: "",
				memory: false,
				maxIterations: mixinOpts!.maxIterations,
				maxHistoryMessages: mixinOpts!.maxHistoryMessages
			}
		},

		actions: {
			run: {
				params: {
					task: { type: "string" },
					sessionId: { type: "string", optional: true }
				},
				async handler(this: ServiceInstance, ctx: ServiceInstance) {
					return this.runReActLoop(ctx.params.task, ctx.params.sessionId);
				}
			},

			chat: {
				params: {
					message: { type: "string" },
					sessionId: { type: "string" }
				},
				async handler(this: ServiceInstance, ctx: ServiceInstance) {
					return this.runReActLoop(ctx.params.message, ctx.params.sessionId);
				}
			}
		},

		methods: {
			async runReActLoop(
				this: ServiceInstance,
				task: string,
				sessionId?: string
			): Promise<string> {
				const settings = this.settings.agent;
				const maxIterations = settings.maxIterations || DEFAULT_MAX_ITERATIONS;
				const maxHistoryMessages =
					settings.maxHistoryMessages || DEFAULT_MAX_HISTORY_MESSAGES;

				// (1) Load history
				let history: unknown[] = await this.loadHistory(sessionId);

				// (2) Add system message if instructions and no existing system msg
				if (
					settings.instructions &&
					!history.some((m: { role: string }) => m.role === "system")
				) {
					history.unshift({
						role: "system",
						content: settings.instructions
					});
				}

				// (3) Add user message
				history.push({ role: "user", content: task });

				// (4) ReAct loop
				for (let i = 0; i < maxIterations; i++) {
					// Compact if needed
					if (history.length > maxHistoryMessages) {
						const prevLen = history.length;
						history = await this.compactConversation(history);
						if (history.length >= prevLen) {
							this.logger.warn("Compaction did not reduce history size", {
								before: prevLen,
								after: history.length
							});
						}
					}

					// Call LLM
					const llmResponse: LLMResponse = await this.broker.call(
						`${settings.llm}.chat`,
						{
							messages: history,
							toolSchemas: this.toolSchemas
						}
					);

					// (5) Stop → save and return
					if (llmResponse.finish_reason === "stop") {
						history.push({
							role: "assistant",
							content: llmResponse.content
						});
						await this.saveHistory(sessionId, history);
						return llmResponse.content || "";
					}

					// (6) Tool calls
					if (llmResponse.finish_reason === "tool_calls" && llmResponse.tool_calls) {
						// Add assistant message with tool_calls
						history.push({
							role: "assistant",
							content: llmResponse.content || null,
							tool_calls: llmResponse.tool_calls
						});

						for (const toolCall of llmResponse.tool_calls) {
							const fnName = toolCall.function.name;

							// Whitelist check
							const allowed = this.toolSchemas.some(
								(ts: ToolSchema) => ts.name === fnName
							);
							if (!allowed) {
								this.logger.warn("Tool call rejected: not in whitelist", {
									name: fnName
								});
								history.push({
									role: "tool",
									tool_call_id: toolCall.id,
									content: JSON.stringify({
										error: `Unknown tool: ${fnName}`
									})
								});
								continue;
							}

							// Execute tool
							let result: unknown;
							try {
								const args = JSON.parse(toolCall.function.arguments);
								result = await this.broker.call(`${this.name}.${fnName}`, args);
							} catch (err: unknown) {
								const errMsg = err instanceof Error ? err.message : String(err);
								this.logger.error("Tool call failed", { name: fnName }, err);
								result = { error: errMsg };
							}

							history.push({
								role: "tool",
								tool_call_id: toolCall.id,
								content:
									typeof result === "string" ? result : JSON.stringify(result)
							});
						}
						continue;
					}

					// Unknown finish_reason
					this.logger.warn("Unknown finish_reason from LLM", {
						finish_reason: llmResponse.finish_reason
					});
					if (llmResponse.content) {
						history.push({
							role: "assistant",
							content: llmResponse.content
						});
						await this.saveHistory(sessionId, history);
						return llmResponse.content;
					}
				}

				// (7) Max iterations exceeded — save history before throwing
				await this.saveHistory(sessionId, history);
				throw new Error("Max iterations reached");
			},

			// eslint-disable-next-line @typescript-eslint/no-unused-vars
			async loadHistory(this: ServiceInstance, _sessionId?: string): Promise<unknown[]> {
				return [];
			},

			/* eslint-disable @typescript-eslint/no-unused-vars */
			async saveHistory(
				this: ServiceInstance,
				_sessionId?: string,
				_history?: unknown[]
			): Promise<void> {
				// no-op
			},
			/* eslint-enable @typescript-eslint/no-unused-vars */

			async compactConversation(
				this: ServiceInstance,
				history: unknown[]
			): Promise<unknown[]> {
				return history;
			}
		},

		created(this: ServiceInstance) {
			this.toolSchemas = [];

			const actions = this.originalSchema?.actions || {};
			for (const [name, actionDef] of Object.entries(actions)) {
				// Skip run and chat meta-actions
				if (name === "run" || name === "chat") continue;

				const def = actionDef as Record<string, unknown>;
				if (!def.description) continue;

				const toolSchema: ToolSchema = {
					name,
					description: def.description as string,
					params: (def.params as Record<string, unknown>) || {}
				};
				this.toolSchemas.push(toolSchema);
			}

			this.logger.debug("Tool schemas generated", {
				count: this.toolSchemas.length
			});
		}
	};

	return schema;
}
