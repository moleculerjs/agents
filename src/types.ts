/*
 * @moleculer/agents
 * Copyright (c) 2026 MoleculerJS (https://github.com/moleculerjs/agents)
 * MIT Licensed
 */

export interface ToolCall {
	id: string;
	type: "function";
	function: {
		name: string;
		arguments: string;
	};
}

export interface LLMResponse {
	content: string | null;
	finish_reason: "stop" | "tool_calls";
	tool_calls?: ToolCall[];
}

export interface AgentSettings {
	description: string;
	instructions?: string;
	llm: string;
	memory?: boolean;
	maxIterations?: number;
	historyTtl?: number;
	maxHistoryMessages?: number;
	strategy?: "direct" | "llm-router";
}

export interface ToolSchema {
	name: string;
	description: string;
	params: Record<string, unknown>;
}

export interface DiscoveredAgent {
	name: string;
	description: string;
	actions: string[];
}
