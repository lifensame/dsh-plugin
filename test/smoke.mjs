#!/usr/bin/env node
/**
 * Smoke test for dsh-memory.
 *
 * Bootstraps stub implementations of the @deepseek-ai peer packages into
 * node_modules (skipping any that already exist, e.g. real installs), then
 * imports and exercises the real lib/index.js end to end against a temp
 * memory directory.
 *
 * Run: npm test   (or: node test/smoke.mjs)
 */
import { promises as fsp } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const pkgRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

const STUBS = {
  "@deepseek-ai/schemastery": [
    "// Smoke-test stub: infinitely chainable schema builder.",
    "const chain = () => new Proxy(function () {}, {",
    "  get(target, prop) {",
    '    if (prop === Symbol.toPrimitive) return () => "";',
    '    if (prop === "then") return undefined;',
    "    return chain();",
    "  },",
    "  apply() { return chain(); },",
    "  construct() { return chain(); }",
    "});",
    "export default { object: chain, string: chain, number: chain };"
  ].join("\n"),
  "@deepseek-ai/dsh-tools": [
    "// Smoke-test stub: identity registration.",
    "export function defineTool(tool) {",
    "  return tool;",
    "}"
  ].join("\n"),
  "@deepseek-ai/dsh-llm": [
    "// Smoke-test stub: minimal message/blocks surface used by dsh-memory.",
    "export function createUserMessage(init) {",
    '  return { id: "stub-" + Math.random().toString(36).slice(2), role: "user", ...init };',
    "}",
    "export class BlockAssembler {",
    "  constructor() { this._blocks = []; this.finish = undefined; }",
    '  push(chunk) { if (chunk && chunk.type === "text") this._blocks.push(chunk); }',
    "  blocks() { return this._blocks; }",
    "}"
  ].join("\n"),
  "@deepseek-ai/dsh-timeout": [
    "// Smoke-test stub: deadline that never fires.",
    "export function deadline() {",
    "  return { signal: { aborted: false, throwIfAborted() {} }, dispose() {} };",
    "}"
  ].join("\n"),
  "@deepseek-ai/dsh-home-paths": [
    "// Smoke-test stub: pass-through home resolution.",
    "export function resolveDshHome(configured) {",
    '  return configured ?? "/tmp/dsh-home";',
    "}"
  ].join("\n")
};

async function ensureStubs() {
  for (const [name, source] of Object.entries(STUBS)) {
    const dir = join(pkgRoot, "node_modules", name);
    const marker = join(dir, "index.js");
    try {
      await fsp.access(marker);
      continue;
    } catch {
      /* missing — write the stub */
    }
    await fsp.mkdir(dir, { recursive: true });
    await fsp.writeFile(join(dir, "package.json"), JSON.stringify({ name, version: "0.0.0-stub", type: "module", main: "index.js" }));
    await fsp.writeFile(marker, source);
  }
}

await ensureStubs();
const { apply } = await import(pathToFileURL(join(pkgRoot, "lib", "index.js")).href);

const root = await fsp.mkdtemp(join(tmpdir(), "dsh-memory-smoke-"));
const home = join(root, "home");
const victim = join(root, "victim.md");

let failures = 0;
function check(label, cond, extra = "") {
  if (cond) console.log(`  ok  ${label}`);
  else {
    failures += 1;
    console.error(`FAIL  ${label} ${extra}`);
  }
}

const tools = {};
const registeredCommands = [];
const ctx = {
  logger: { warn: (m) => console.log(`[warn] ${m}`) },
  tools: { register: (tool) => (tools[tool.name] = tool, () => {}) },
  get(name) {
    if (name === "commands") {
      return { register: (cmd) => (registeredCommands.push(cmd), () => {}) };
    }
    if (name === "llm") return llm;
    return undefined;
  },
  on() {},
  effect() {}
};

const llm = {
  async *stream({ messages }) {
    const input = messages[0].content[0].text;
    yield { type: "text", text: JSON.stringify({ title: "derived title", summary: `distilled: ${input.slice(0, 40)}`, tags: ["auto"], importance: "low" }) };
  }
};

apply(ctx, { dshHome: home, memoryDir: "memory", summarizeProvider: "stub", summarizeModel: "stub-model" });
const command = registeredCommands[0];
const run = (tool, args) => tool.execute(args, { signal: { throwIfAborted() {} } });

/* A — Chinese titles get distinct, stable ids (was: all collapsed to "memory") */
const a1 = await run(tools.memory_add, { title: "喜欢的颜色", content: "用户喜欢的颜色是蓝色。" });
const a2 = await run(tools.memory_add, { title: "常用工作目录", content: "代码在 D:\\code。" });
check("A1 chinese title ids differ", a1.id !== a2.id, `${a1.id} vs ${a2.id}`);
check("A2 id is the chinese slug", a1.id === "喜欢的颜色", a1.id);
const a3 = await run(tools.memory_add, { title: "喜欢的颜色", content: "用户喜欢的颜色是绿色。" });
check("A3 same title updates not duplicates", a3.action === "updated" && a3.id === a1.id);
const dirFiles = await fsp.readdir(join(home, "memory"));
check("A4 exactly two files on disk", dirFiles.length === 2, JSON.stringify(dirFiles));

/* B — path traversal is rejected */
await fsp.writeFile(victim, "do not delete", "utf8");
let threw = null;
try { await run(tools.memory_delete, { id: "../victim" }); } catch (e) { threw = e; }
check("B1 traversal id rejected", threw instanceof Error, String(threw));
check("B2 victim file survives", await fsp.readFile(victim, "utf8") === "do not delete");
threw = null;
try { await run(tools.memory_delete, { id: "..\\victim" }); } catch (e) { threw = e; }
check("B3 backslash id rejected", threw instanceof Error);
check("B4 victim file still survives", await fsp.readFile(victim, "utf8") === "do not delete");

/* C — multi-word search: AND first, OR fallback */
await run(tools.memory_add, { title: "editor preference", content: "user prefers VS Code with vim keybindings" });
await run(tools.memory_add, { title: "lunch spot", content: "ramen place near the office" });
const c1 = await run(tools.memory_search, { query: "editor vim" });
check("C1 AND match found", c1.results.length === 1 && c1.results[0].title === "editor preference", JSON.stringify(c1.results.map(r => r.title)));
const c2 = await run(tools.memory_search, { query: "editor ramen" });
check("C2 OR fallback returns both", c2.results.length === 2, JSON.stringify(c2.results.map(r => r.title)));
const c3 = await run(tools.memory_search, { query: "喜欢的颜色" });
check("C3 chinese query works", c3.results.length === 1 && c3.results[0].id === a1.id, JSON.stringify(c3.results.map(r => r.id)));
const c4 = await run(tools.memory_search, { query: "preference", limit: 50 });
check("C4 limit accepted", c4.results.length >= 1);

/* D — summarize: explicit title reuses id, derived title always new */
const d1 = await run(tools.memory_summarize, { text: "团队决定用 pnpm 管理依赖。", title: "项目约定" });
check("D1 explicit title created", d1.action === "created" && d1.id === "项目约定", JSON.stringify(d1));
const d2 = await run(tools.memory_summarize, { text: "团队决定改用 yarn 管理依赖。", title: "项目约定" });
check("D2 same explicit title updates", d2.action === "updated");
const d3 = await run(tools.memory_summarize, { text: "另一段文本，没有标题。" });
check("D3 derived title creates fresh id", d3.action === "created" && d3.id !== d1.id, d3.id);

/* E — emoji-only title gets stable hashed id */
const e1 = await run(tools.memory_add, { title: "🎉", content: "celebration" });
const e2 = await run(tools.memory_add, { title: "🎉", content: "celebration twice" });
check("E1 emoji title stable hashed id", e1.id === e2.id && /^memory-[0-9a-f]{8}$/.test(e1.id), e1.id);

/* F — /memory command: list, search, show, rm, help */
const f1 = await command.handler({ rawInput: "" });
check("F1 list shows entries", f1.text.includes("喜欢的颜色"));
const f2 = await command.handler({ rawInput: "help" });
check("F2 help lists subcommands", f2.text.includes("/memory show <id>"));
const f3 = await command.handler({ rawInput: "vim editor" });
check("F3 search via command", f3.text.includes("editor preference"));
const f4 = await command.handler({ rawInput: "show 项目约定" });
check("F4 show prints full content", f4.text.includes("yarn"), f4.text);
const f5 = await command.handler({ rawInput: "show nope" });
check("F5 show unknown id is friendly", f5.text.includes("No memory with id"));
const f6 = await command.handler({ rawInput: "rm nope" });
check("F6 rm unknown id is friendly", f6.text.includes("No memory with id"));
const f7 = await command.handler({ rawInput: "rm ../victim" });
check("F7 rm traversal rejected", f7.text.includes("not a memory id"), f7.text);
check("F8 victim still alive", await fsp.readFile(victim, "utf8") === "do not delete");
const f9 = await command.handler({ rawInput: `rm ${e1.id}` });
check("F9 rm by id deletes", f9.text.includes("Deleted memory #"), f9.text);
const f10 = await command.handler({ rawInput: "" });
check("F10 emoji memory gone from list", !f10.text.includes("celebration twice"));

/* G — delete a chinese-id memory via tool */
const g1 = await run(tools.memory_delete, { id: "常用工作目录" });
check("G1 unicode id delete works", g1.deleted === true);

await fsp.rm(root, { recursive: true, force: true });
console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
