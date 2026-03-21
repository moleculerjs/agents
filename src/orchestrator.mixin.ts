/*
 * @moleculer/agents
 * Copyright (c) 2026 MoleculerJS (https://github.com/moleculerjs/agents)
 * MIT Licensed
 */

import _ from "lodash";
import type { DiscoveredAgent } from "./types.ts";

interface OrchestratorMixinOptions {
	// Reserved for future options
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ServiceInstance = any;

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export default function OrchestratorMixin(_mixinOpts?: OrchestratorMixinOptions) {
	_mixinOpts = _.defaultsDeep(_mixinOpts, {});

	const schema = {
		merged(this: ServiceInstance, schema: Record<string, unknown>) {
			const settings = schema.settings as Record<string, unknown> | undefined;
			const agent = settings?.agent as Record<string, unknown> | undefined;
			if (agent?.strategy === "llm-router") {
				const actions = (schema.actions || {}) as Record<string, unknown>;
				actions._routeToAgent = {
					description: "Route a task to a discovered agent",
					visibility: "protected",
					params: {
						agentName: { type: "string" },
						task: { type: "string" }
					},
					async handler(this: ServiceInstance, ctx: ServiceInstance) {
						const agents = this.discoverAgents();
						if (
							!agents.some(
								(a: DiscoveredAgent) => a.name === ctx.params.agentName
							)
						) {
							throw new Error(
								`Agent not found: ${ctx.params.agentName}`
							);
						}
						return this.delegateTo(ctx.params.agentName, ctx.params.task);
					}
				};
				schema.actions = actions;
			}
		},

		events: {
			"$services.changed"(this: ServiceInstance) {
				if (this.settings.agent?.strategy === "llm-router") {
					this._updateRouteToAgent();
				}
			}
		},

		methods: {
			discoverAgents(this: ServiceInstance): DiscoveredAgent[] {
				const services = this.broker.registry.getServiceList({
					onlyAvailable: true,
					withActions: true,
					skipInternal: true,
					grouping: true
				});

				const agents: DiscoveredAgent[] = [];

				for (const svc of services) {
					// Skip self
					if (svc.name === this.name) continue;

					// Must have agent settings with description
					const agentSettings = svc.settings?.agent;
					if (!agentSettings || !agentSettings.description) continue;

					// Collect actions with description, excluding run/chat
					const actionNames: string[] = [];
					if (svc.actions) {
						for (const [fullName, actionDef] of Object.entries(svc.actions)) {
							const def = actionDef as Record<string, unknown>;
							if (!def.description) continue;

							// Strip service prefix (e.g., "weather-agent.getCurrent" -> "getCurrent")
							const shortName = fullName.includes(".")
								? fullName.split(".").slice(1).join(".")
								: fullName;

							if (shortName === "run" || shortName === "chat") continue;

							actionNames.push(shortName);
						}
					}

					agents.push({
						name: svc.name,
						description: agentSettings.description,
						actions: actionNames
					});
				}

				return agents;
			},

			async delegateTo(
				this: ServiceInstance,
				agentName: string,
				task: string,
				sessionId?: string
			): Promise<string> {
				return this.broker.call(`${agentName}.run`, { task, sessionId });
			},

			_updateRouteToAgent(this: ServiceInstance) {
				const agents = this.discoverAgents();

				if (agents.length === 0) {
					// Remove _routeToAgent if no agents available
					this.toolSchemas = (this.toolSchemas || []).filter(
						(ts: { name: string }) => ts.name !== "_routeToAgent"
					);
					return;
				}

				const agentList = agents
					.map(
						(a: DiscoveredAgent) =>
							`- ${a.name}: ${a.description} (actions: ${a.actions.join(", ")})`
					)
					.join("\n");

				const description =
					`Route a task to another agent. Available agents:\n${agentList}`;

				// Remove old _routeToAgent if exists
				this.toolSchemas = (this.toolSchemas || []).filter(
					(ts: { name: string }) => ts.name !== "_routeToAgent"
				);

				this.toolSchemas.push({
					name: "_routeToAgent",
					description,
					params: {
						agentName: {
							type: "string",
							description: "Name of the agent to delegate to"
						},
						task: {
							type: "string",
							description: "Task description to send to the agent"
						}
					}
				});
			}
		},

		async started(this: ServiceInstance) {
			if (this.settings.agent?.strategy === "llm-router") {
				this._updateRouteToAgent();
			}
		}
	};

	return schema;
}
