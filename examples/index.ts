/*
 * Example runner
 *
 * Usage:
 *   npx tsx examples/index.ts              # runs simple-agent
 *   npx tsx examples/index.ts simple       # runs simple-agent
 *   npx tsx examples/index.ts multi-turn   # runs multi-turn-chat
 *   npm run dev                            # runs simple-agent with nodemon
 */

const example = process.argv[2] || "simple";

const examples: Record<string, string> = {
	simple: "./simple-agent.ts",
	"multi-turn": "./multi-turn-chat.ts"
};

const file = examples[example];
if (!file) {
	console.error(`Unknown example: "${example}"`);
	console.error(`Available: ${Object.keys(examples).join(", ")}`);
	process.exit(1);
}

await import(file);
