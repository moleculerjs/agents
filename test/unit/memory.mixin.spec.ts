/*
 * @moleculer/agents
 * Copyright (c) 2026 MoleculerJS (https://github.com/moleculerjs/agents)
 * MIT Licensed
 */

import { describe, expect, it, afterAll, beforeAll } from "vitest";
import { ServiceBroker } from "moleculer";
import AgentMixin from "../../src/agent.mixin.ts";
import MemoryMixin from "../../src/memory.mixin.ts";

describe("Test MemoryMixin", () => {
	const broker = new ServiceBroker({ logger: false, cacher: "Memory" });

	beforeAll(() => broker.start());
	afterAll(() => broker.stop());

	describe("loadHistory", () => {
		it("should return empty array when no sessionId", async () => {
			const svc = broker.createService({
				name: "mem-load-1",
				mixins: [MemoryMixin(), AgentMixin()],
				settings: { agent: { llm: "llm", description: "test" } }
			});
			await broker.waitForServices("mem-load-1");

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const result = await (svc as any).loadHistory();
			expect(result).toEqual([]);

			await broker.destroyService(svc);
		});

		it("should return empty array when no cached data", async () => {
			const svc = broker.createService({
				name: "mem-load-2",
				mixins: [MemoryMixin(), AgentMixin()],
				settings: { agent: { llm: "llm", description: "test" } }
			});
			await broker.waitForServices("mem-load-2");

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const result = await (svc as any).loadHistory("nonexistent-session");
			expect(result).toEqual([]);

			await broker.destroyService(svc);
		});

		it("should return cached history", async () => {
			const svc = broker.createService({
				name: "mem-load-3",
				mixins: [MemoryMixin(), AgentMixin()],
				settings: { agent: { llm: "llm", description: "test" } }
			});
			await broker.waitForServices("mem-load-3");

			const history = [
				{ role: "user", content: "hello" },
				{ role: "assistant", content: "hi" }
			];
			await broker.cacher.set("agent:history:mem-load-3:s1", history, 3600);

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const result = await (svc as any).loadHistory("s1");
			expect(result).toEqual(history);

			await broker.destroyService(svc);
		});
	});

	describe("saveHistory", () => {
		it("should not save when no sessionId", async () => {
			const svc = broker.createService({
				name: "mem-save-1",
				mixins: [MemoryMixin(), AgentMixin()],
				settings: { agent: { llm: "llm", description: "test" } }
			});
			await broker.waitForServices("mem-save-1");

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			await (svc as any).saveHistory(undefined, [{ role: "user", content: "hi" }]);
			// No error thrown — just a no-op

			await broker.destroyService(svc);
		});

		it("should save history to cacher", async () => {
			const svc = broker.createService({
				name: "mem-save-2",
				mixins: [MemoryMixin(), AgentMixin()],
				settings: { agent: { llm: "llm", description: "test" } }
			});
			await broker.waitForServices("mem-save-2");

			const history = [
				{ role: "user", content: "hello" },
				{ role: "assistant", content: "hi there" }
			];
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			await (svc as any).saveHistory("s2", history);

			const cached = await broker.cacher.get("agent:history:mem-save-2:s2");
			expect(cached).toEqual(history);

			await broker.destroyService(svc);
		});

		it("should use custom historyTtl from settings", async () => {
			const svc = broker.createService({
				name: "mem-save-3",
				mixins: [MemoryMixin(), AgentMixin()],
				settings: { agent: { llm: "llm", description: "test", historyTtl: 1800 } }
			});
			await broker.waitForServices("mem-save-3");

			const history = [{ role: "user", content: "test" }];
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			await (svc as any).saveHistory("s3", history);

			const cached = await broker.cacher.get("agent:history:mem-save-3:s3");
			expect(cached).toEqual(history);

			await broker.destroyService(svc);
		});
	});

	describe("compactConversation", () => {
		it("should return history unchanged if within limit", async () => {
			const svc = broker.createService({
				name: "mem-compact-1",
				mixins: [MemoryMixin(), AgentMixin()],
				settings: {
					agent: { llm: "llm", description: "test", maxHistoryMessages: 5 }
				}
			});
			await broker.waitForServices("mem-compact-1");

			const history = [
				{ role: "user", content: "a" },
				{ role: "assistant", content: "b" }
			];
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const result = await (svc as any).compactConversation(history);
			expect(result).toEqual(history);

			await broker.destroyService(svc);
		});

		it("should keep system message and last N messages", async () => {
			const svc = broker.createService({
				name: "mem-compact-2",
				mixins: [MemoryMixin(), AgentMixin()],
				settings: {
					agent: { llm: "llm", description: "test", maxHistoryMessages: 3 }
				}
			});
			await broker.waitForServices("mem-compact-2");

			const history = [
				{ role: "system", content: "You are helpful" },
				{ role: "user", content: "msg1" },
				{ role: "assistant", content: "resp1" },
				{ role: "user", content: "msg2" },
				{ role: "assistant", content: "resp2" }
			];
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const result = await (svc as any).compactConversation(history);
			expect(result).toEqual([
				{ role: "system", content: "You are helpful" },
				{ role: "user", content: "msg2" },
				{ role: "assistant", content: "resp2" }
			]);

			await broker.destroyService(svc);
		});

		it("should keep last N messages when no system message", async () => {
			const svc = broker.createService({
				name: "mem-compact-3",
				mixins: [MemoryMixin(), AgentMixin()],
				settings: {
					agent: { llm: "llm", description: "test", maxHistoryMessages: 2 }
				}
			});
			await broker.waitForServices("mem-compact-3");

			const history = [
				{ role: "user", content: "msg1" },
				{ role: "assistant", content: "resp1" },
				{ role: "user", content: "msg2" },
				{ role: "assistant", content: "resp2" }
			];
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const result = await (svc as any).compactConversation(history);
			expect(result).toEqual([
				{ role: "user", content: "msg2" },
				{ role: "assistant", content: "resp2" }
			]);

			await broker.destroyService(svc);
		});
	});

	describe("E2E: load/save round-trip", () => {
		it("should persist and retrieve history across sessions", async () => {
			const svc = broker.createService({
				name: "mem-e2e-1",
				mixins: [MemoryMixin(), AgentMixin()],
				settings: { agent: { llm: "llm", description: "test" } }
			});
			await broker.waitForServices("mem-e2e-1");

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const s = svc as any;

			// Initially empty
			let history = await s.loadHistory("e2e-session");
			expect(history).toEqual([]);

			// Save some history
			const msgs = [
				{ role: "system", content: "instructions" },
				{ role: "user", content: "hello" },
				{ role: "assistant", content: "hi" }
			];
			await s.saveHistory("e2e-session", msgs);

			// Load it back
			history = await s.loadHistory("e2e-session");
			expect(history).toEqual(msgs);

			// Different session is independent
			const other = await s.loadHistory("other-session");
			expect(other).toEqual([]);

			await broker.destroyService(svc);
		});

		it("should compact and save correctly in a full flow", async () => {
			const svc = broker.createService({
				name: "mem-e2e-2",
				mixins: [MemoryMixin(), AgentMixin()],
				settings: {
					agent: {
						llm: "llm",
						description: "test",
						maxHistoryMessages: 4
					}
				}
			});
			await broker.waitForServices("mem-e2e-2");

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const s = svc as any;

			// Build a long history
			const history = [
				{ role: "system", content: "sys" },
				{ role: "user", content: "u1" },
				{ role: "assistant", content: "a1" },
				{ role: "user", content: "u2" },
				{ role: "assistant", content: "a2" },
				{ role: "user", content: "u3" },
				{ role: "assistant", content: "a3" }
			];

			// Compact
			const compacted = await s.compactConversation(history);
			expect(compacted).toHaveLength(4);
			expect(compacted[0]).toEqual({ role: "system", content: "sys" });
			expect(compacted[compacted.length - 1]).toEqual({
				role: "assistant",
				content: "a3"
			});

			// Save compacted, then reload
			await s.saveHistory("e2e-compact", compacted);
			const loaded = await s.loadHistory("e2e-compact");
			expect(loaded).toEqual(compacted);

			await broker.destroyService(svc);
		});
	});
});
