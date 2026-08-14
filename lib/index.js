/**
 * dsh-memory — global memory plugin for the DeepSeek Harness.
 *
 * A single Cordis plugin that:
 *   - persists durable "memories" as Markdown files under `$DSH_HOME/memory`
 *     (global: shared across every session, project, and workspace),
 *   - injects the memory context into every agent step (auto-recall), and
 *   - registers model-facing tools to add / search / list / delete / summarize
 *     memories, plus a `/memory` slash command for humans.
 *
 * Storage deliberately bypasses the sandboxed `ctx.fs`: the store is a fixed,
 * plugin-owned, host-side directory — the model controls memory *content* only,
 * never a write path — so using Node's `fs/promises` keeps the store global and
 * independent of the per-session workspace sandbox.
 *
 * @module dsh-memory
 */

import { promises as fsp } from "node:fs";
import { basename, join } from "node:path";
import { createHash, randomBytes } from "node:crypto";
import z from "@deepseek-ai/schemastery";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { defineTool } from "@deepseek-ai/dsh-tools";
import { BlockAssembler, createUserMessage } from "@deepseek-ai/dsh-llm";
import { deadline } from "@deepseek-ai/dsh-timeout";
import { resolveDshHome } from "@deepseek-ai/dsh-home-paths";

export const name = "dsh-memory";
export const inject = ["tools"];

const IMPORTANCES = ["high", "medium", "low"];
const IMPORTANCE_RANK = { high: 0, medium: 1, low: 2 };
const DEFAULT_IMPORTANCE = "medium";
const ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const CACHE_TTL_MS = 2000;

export const Config = z.object({
  dshHome: z.string(),
  memoryDir: z.string().default("memory"),
  maxInjectedBytes: z.number().step(1).min(1).default(16384),
  searchDefaultLimit: z.number().step(1).min(1).default(5),
  summarizeProvider: z.string().default(""),
  summarizeModel: z.string().default(""),
  summarizeMaxInputBytes: z.number().step(1).min(1).default(24576),
  summarizeMaxOutputTokens: z.number().step(1).min(1).default(512),
  summarizeTimeoutMs: z.number().step(1).min(1).default(60000)
});

/* ── config / paths ─────────────────────────────────────────────────────── */

function resolveConfig(config = {}) {
  return {
    dshHome: resolveDshHome(config.dshHome),
    memoryDir: typeof config.memoryDir === "string" && config.memoryDir.length > 0 ? config.memoryDir : "memory",
    maxInjectedBytes: positiveInt(config.maxInjectedBytes, 16384, "maxInjectedBytes"),
    searchDefaultLimit: positiveInt(config.searchDefaultLimit, 5, "searchDefaultLimit"),
    summarizeProvider: typeof config.summarizeProvider === "string" ? config.summarizeProvider : "",
    summarizeModel: typeof config.summarizeModel === "string" ? config.summarizeModel : "",
    summarizeMaxInputBytes: positiveInt(config.summarizeMaxInputBytes, 24576, "summarizeMaxInputBytes"),
    summarizeMaxOutputTokens: positiveInt(config.summarizeMaxOutputTokens, 512, "summarizeMaxOutputTokens"),
    summarizeTimeoutMs: positiveInt(config.summarizeTimeoutMs, 60000, "summarizeTimeoutMs")
  };
}

function positiveInt(value, fallback, field) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) {
    if (value === void 0 || value === "") return fallback;
    throw new TypeError(`dsh-memory: ${field} must be a positive integer`);
  }
  return n;
}

function memoryDirectory(config) {
  return join(config.dshHome, config.memoryDir);
}

/* ── small utilities ────────────────────────────────────────────────────── */

function byteLength(value) {
  return Buffer.byteLength(value, "utf8");
}

function slugify(value) {
  const slug = String(value)
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return slug.length > 0 ? slug : "memory";
}

function newId(title) {
  const stamp = Date.now().toString(36);
  return `${slugify(title)}-${stamp}`;
}

function normalizeTags(tags) {
  if (!Array.isArray(tags)) return [];
  const seen = new Set();
  const result = [];
  for (const tag of tags) {
    if (typeof tag !== "string") continue;
    const trimmed = tag.trim().replace(/\s+/g, "-").toLowerCase();
    if (trimmed.length === 0 || seen.has(trimmed)) continue;
    seen.add(trimmed);
    result.push(trimmed);
  }
  return result.slice(0, 20);
}

function normalizeImportance(value) {
  return IMPORTANCES.includes(value) ? value : DEFAULT_IMPORTANCE;
}

function sortMemories(memories) {
  return memories.slice().sort((a, b) => {
    const rankA = IMPORTANCE_RANK[a.importance] ?? 1;
    const rankB = IMPORTANCE_RANK[b.importance] ?? 1;
    if (rankA !== rankB) return rankA - rankB;
    const updatedA = a.updated ?? "";
    const updatedB = b.updated ?? "";
    if (updatedA !== updatedB) return updatedB.localeCompare(updatedA);
    return a.id.localeCompare(b.id);
  });
}

function truncateUtf8(value, maxBytes) {
  const bytes = Buffer.from(value, "utf8");
  if (bytes.length <= maxBytes) return value;
  let end = Math.max(0, Math.trunc(maxBytes));
  while (end > 0 && (bytes.readUInt8(end) & 192) === 128) end -= 1;
  return `${bytes.subarray(0, end).toString("utf8")}…`;
}

/* ── memory file store ──────────────────────────────────────────────────── */

function findClosingFrontmatter(raw, start) {
  let lineStart = start;
  while (lineStart <= raw.length) {
    const nextNewline = raw.indexOf("\n", lineStart);
    const lineEnd = nextNewline < 0 ? raw.length : nextNewline;
    if (raw.slice(lineStart, lineEnd).replace(/\r$/, "") === "---") {
      return { start: lineStart, bodyStart: nextNewline < 0 ? raw.length : nextNewline + 1 };
    }
    if (nextNewline < 0) return void 0;
    lineStart = nextNewline + 1;
  }
  return void 0;
}

function idFromFilename(filename) {
  return basename(filename).replace(/\.md$/, "");
}

/** Parse one `.md` memory file into a record, or return undefined when invalid. */
function parseMemoryFile(raw, filename, logger) {
  const firstLineEnd = raw.indexOf("\n");
  if (firstLineEnd < 0) return void 0;
  if (raw.slice(0, firstLineEnd).replace(/\r$/, "") !== "---") return void 0;
  const closing = findClosingFrontmatter(raw, firstLineEnd + 1);
  if (closing === void 0) return void 0;

  let meta;
  try {
    meta = parseYaml(raw.slice(firstLineEnd + 1, closing.start));
  } catch (error) {
    logger?.warn(`dsh-memory: ignored ${filename}: invalid YAML frontmatter: ${String(error)}`);
    return void 0;
  }
  if (typeof meta !== "object" || meta === null || Array.isArray(meta)) return void 0;

  const id = typeof meta.id === "string" && meta.id.length > 0 ? meta.id : idFromFilename(filename);
  const title = typeof meta.title === "string" && meta.title.length > 0 ? meta.title : id;
  const tags = Array.isArray(meta.tags) ? meta.tags.filter((t) => typeof t === "string") : [];
  const importance = normalizeImportance(meta.importance);
  const created = typeof meta.created === "string" ? meta.created : "";
  const updated = typeof meta.updated === "string" ? meta.updated : created;
  const content = raw.slice(closing.bodyStart).trim();

  return { id, title, tags, importance, created, updated, content };
}

function serializeMemory(memory) {
  const meta = {
    id: memory.id,
    title: memory.title,
    tags: memory.tags ?? [],
    importance: memory.importance ?? DEFAULT_IMPORTANCE,
    created: memory.created,
    updated: memory.updated
  };
  return `---\n${stringifyYaml(meta).trim()}\n---\n${memory.content.replace(/\r\n/g, "\n").trim()}\n`;
}

async function atomicWriteFile(path, content) {
  const tmp = `${path}.tmp-${randomBytes(6).toString("hex")}`;
  await fsp.writeFile(tmp, content, "utf8");
  try {
    await fsp.rename(tmp, path);
  } catch (error) {
    await fsp.unlink(tmp).catch(() => {});
    throw error;
  }
}

/* ── apply ──────────────────────────────────────────────────────────────── */

export function apply(ctx, config = {}) {
  const resolved = resolveConfig(config);
  const dir = memoryDirectory(resolved);

  // Serialize mutations so a read-modify-write never interleaves.
  let mutationChain = Promise.resolve();
  function enqueueMutation(task) {
    const next = mutationChain.then(task, task);
    mutationChain = next.catch(() => {});
    return next;
  }

  // Lightweight rendered-context cache, invalidated on every local mutation and
  // after a short TTL so hand-edited files are picked up quickly.
  let contextCache = { stamp: 0, digest: "", text: "", entries: [] };
  function invalidateContext() {
    contextCache.stamp = 0;
  }

  async function ensureDir() {
    await fsp.mkdir(dir, { recursive: true });
  }

  async function listMemories() {
    await ensureDir();
    let entries;
    try {
      entries = await fsp.readdir(dir, { withFileTypes: true });
    } catch (error) {
      if (error?.code === "ENOENT") return [];
      throw error;
    }
    const memories = [];
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
      const path = join(dir, entry.name);
      let raw;
      try {
        raw = await fsp.readFile(path, "utf8");
      } catch {
        continue;
      }
      const memory = parseMemoryFile(raw, entry.name, ctx.logger);
      if (memory !== void 0) memories.push(memory);
    }
    return memories;
  }

  async function readMemory(id) {
    const path = join(dir, `${id}.md`);
    let raw;
    try {
      raw = await fsp.readFile(path, "utf8");
    } catch (error) {
      if (error?.code === "ENOENT") return void 0;
      throw error;
    }
    return parseMemoryFile(raw, `${id}.md`, ctx.logger);
  }

  async function writeMemory(memory) {
    await ensureDir();
    await atomicWriteFile(join(dir, `${memory.id}.md`), serializeMemory(memory));
  }

  async function deleteMemory(id) {
    const path = join(dir, `${id}.md`);
    try {
      await fsp.unlink(path);
      return true;
    } catch (error) {
      if (error?.code === "ENOENT") return false;
      throw error;
    }
  }

  /* ── context rendering / injection ───────────────────────────────────── */

  function toFullEntry(memory) {
    return {
      id: memory.id,
      title: memory.title,
      tags: memory.tags,
      importance: memory.importance,
      created: memory.created,
      updated: memory.updated,
      content: memory.content
    };
  }

  function toSummaryEntry(memory) {
    return {
      id: memory.id,
      title: memory.title,
      tags: memory.tags,
      importance: memory.importance,
      updated: memory.updated
    };
  }

  function digestEntries(entries) {
    const canonical = entries
      .map((e) => JSON.stringify([e.id, e.title, e.tags ?? [], e.importance ?? DEFAULT_IMPORTANCE, e.updated ?? "", e.content]))
      .join("\n");
    return createHash("sha256").update(canonical).digest("hex");
  }

  function renderEntry(entry) {
    const meta = [];
    meta.push(`- id: ${entry.id}`);
    if (entry.tags.length > 0) meta.push(`- tags: ${entry.tags.join(", ")}`);
    meta.push(`- importance: ${entry.importance}`);
    return `### ${entry.title}\n${meta.join("\n")}\n${entry.content}`;
  }

  const STANDING_INSTRUCTION = [
    "<system-reminder>",
    "The following are your durable GLOBAL memories — persistent context shared across every session, project, and workspace. Treat them as background facts and preferences to honor while working.",
    "",
    "Keep them current: save durable facts, user preferences, and decisions with `memory_add`; look up specifics with `memory_search`; remove stale entries with `memory_delete`; and distill long input or a finished conversation into a compact memory with `memory_summarize`. When a fact changes, update the existing memory instead of creating a duplicate.",
    ""
  ].join("\n");

  const STANDING_FOOTER = "\n\n</system-reminder>";

  function renderContextText(entries, maxBytes) {
    const header = `${STANDING_INSTRUCTION}<global_memories>`;
    const footer = `</global_memories>${STANDING_FOOTER}`;
    const budget = Math.max(512, maxBytes - byteLength(header) - byteLength(footer));
    const blocks = [];
    let used = 0;
    let omitted = 0;
    for (const entry of entries) {
      const block = renderEntry(entry);
      const size = byteLength(block) + 2;
      if (used + size > budget) {
        omitted += 1;
        continue;
      }
      blocks.push(block);
      used += size;
    }
    let body;
    if (entries.length === 0) body = "(No memories yet — save your first one with `memory_add`.)";
    else if (blocks.length === 0) body = "(All memories omitted: the injection budget is too small.)";
    else body = blocks.join("\n\n");
    const note = omitted > 0 ? `\n\n(${omitted} more memories omitted to fit the ${maxBytes}-byte budget; use \`memory_list\` or \`memory_search\`.)` : "";
    return `${header}\n${body}${note}\n${footer}`;
  }

  async function computeContext(force = false) {
    const now = Date.now();
    if (!force && now - contextCache.stamp < CACHE_TTL_MS) return contextCache;
    const memories = sortMemories(await listMemories());
    const entries = memories.map(toFullEntry);
    const digest = digestEntries(entries);
    const text = renderContextText(entries, resolved.maxInjectedBytes);
    const summaries = memories.map(toSummaryEntry);
    contextCache = { stamp: now, digest, text, entries: summaries };
    return contextCache;
  }

  function buildContextMessage(text, digest, entries, update) {
    return createUserMessage({
      content: [{ type: "text", text }],
      source: {
        kind: "memory-context",
        form: "catalog",
        digest,
        update,
        entries
      }
    });
  }

  function memoryContextMessage(messages) {
    for (const message of messages) {
      if (message.source?.kind !== "memory-context") continue;
      if (typeof message.source.digest === "string") {
        return { message, digest: message.source.digest };
      }
    }
    return void 0;
  }

  function memoryContextHistory(agent) {
    const visible = new Set(agent.session.surface.nodes);
    const events = agent.session.events;
    let published = false;
    for (let index = events.length - 1; index >= 0; index -= 1) {
      const event = events[index];
      if (event.type !== "user/message" || event.data?.source?.kind !== "memory-context") continue;
      const digest = event.data.source.digest;
      if (typeof digest !== "string") continue;
      published = true;
      if (visible.has(event.seq)) return { visibleDigest: digest, published };
    }
    return { published };
  }

  ctx.on("agent/pre-step", async ({ agent, signal }, next) => {
    const decision = await next();
    if (decision.kind === "reject") return decision;
    signal.throwIfAborted();
    const { digest, text, entries } = await computeContext();
    signal.throwIfAborted();
    const history = memoryContextHistory(agent);
    const existing = memoryContextMessage(decision.messages);
    if (history.visibleDigest === digest) {
      return existing === void 0 ? decision : {
        kind: "enter",
        messages: decision.messages.filter((message) => message.id !== existing.message.id)
      };
    }
    if (existing !== void 0 && existing.digest === digest) return decision;
    const message = buildContextMessage(text, digest, entries, history.published);
    return {
      kind: "enter",
      messages: existing === void 0
        ? [...decision.messages, message]
        : decision.messages.map((item) => item.id === existing.message.id ? message : item)
    };
  });

  /* ── model-facing tools ───────────────────────────────────────────────── */

  const addTool = defineTool({
    name: "memory_add",
    description: "Save a durable fact, user preference, or decision to your global memory. Reusing the same title (or id) updates the existing memory instead of creating a duplicate. Use this proactively whenever you learn something that should persist across sessions.",
    parameters: {
      title: { type: "string", required: true, description: "Short human-readable title for this memory (also its lookup key)." },
      content: { type: "string", required: true, description: "The durable fact or preference, written clearly and self-contained so it is useful without the original conversation." },
      id: { type: "string", description: "Optional stable slug (lowercase letters, digits, hyphens). Omit to derive it from the title." },
      tags: { type: "array", items: { type: "string" }, description: "Optional short lowercase tags for filtering." },
      importance: { type: "string", enum: ["high", "medium", "low"], description: "Optional importance; defaults to medium. Higher-importance memories are injected first." }
    },
    output: {
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string", required: true },
          action: { type: "string", required: true },
          title: { type: "string", required: true },
          tags: { type: "array", items: { type: "string" } },
          importance: { type: "string" },
          created: { type: "string" },
          updated: { type: "string" }
        }
      },
      render: (_args, value) => [{
        type: "text",
        text: `[memory ${value.action}] #${value.id} "${value.title}" (importance: ${value.importance}, tags: ${value.tags.length > 0 ? value.tags.join(", ") : "—"})`
      }]
    },
    async execute(args, exec) {
      exec.signal.throwIfAborted();
      const title = args.title.trim();
      if (title.length === 0) throw new Error("title must be a non-empty string");
      const content = args.content.trim();
      if (content.length === 0) throw new Error("content must be a non-empty string");

      const importance = normalizeImportance(args.importance);
      const tags = normalizeTags(args.tags);
      let id = typeof args.id === "string" && args.id.trim().length > 0 ? args.id.trim() : slugify(title);
      if (!ID_RE.test(id)) throw new Error(`invalid id "${id}": use lowercase letters, digits, and single hyphens`);

      const now = new Date().toISOString();
      return await enqueueMutation(async () => {
        const existing = await readMemory(id);
        const record = {
          id,
          title,
          content,
          tags,
          importance,
          created: existing?.created ?? now,
          updated: now
        };
        await writeMemory(record);
        invalidateContext();
        return {
          id,
          action: existing === void 0 ? "created" : "updated",
          title,
          tags,
          importance,
          created: record.created,
          updated: now
        };
      });
    },
    presentCall(args) {
      return { card: "generic", title: `Remember: ${args.title}`, kind: "write", rawInput: args.title };
    }
  });

  const searchTool = defineTool({
    name: "memory_search",
    description: "Search your global memories by keyword. Matches titles, tags, and body text; returns the best matches with their full content.",
    parameters: {
      query: { type: "string", required: true, description: "Keywords to search for." },
      limit: { type: "integer", description: "Maximum number of results to return (default 5)." }
    },
    output: {
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          results: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                id: { type: "string", required: true },
                title: { type: "string", required: true },
                tags: { type: "array", items: { type: "string" } },
                importance: { type: "string" },
                updated: { type: "string" },
                content: { type: "string", required: true }
              }
            }
          }
        }
      },
      render: (_args, value) => [{
        type: "text",
        text: value.results.length === 0 ? "No memories matched." : value.results.map((r) => `#${r.id} "${r.title}" (${r.importance})\n${r.content}`).join("\n\n")
      }]
    },
    async execute(args, exec) {
      exec.signal.throwIfAborted();
      const query = args.query.trim();
      if (query.length === 0) throw new Error("query must be a non-empty string");
      const limit = args.limit ?? resolved.searchDefaultLimit;
      if (!Number.isInteger(limit) || limit < 1) throw new Error("limit must be a positive integer");
      const q = query.toLowerCase();
      const scored = [];
      for (const memory of await listMemories()) {
        let score = 0;
        if (memory.title.toLowerCase().includes(q)) score += 4;
        if (memory.tags.some((tag) => tag.toLowerCase().includes(q))) score += 2;
        if (memory.content.toLowerCase().includes(q)) score += 1;
        if (score > 0) scored.push({ memory, score });
      }
      scored.sort((a, b) => b.score - a.score || (b.memory.updated ?? "").localeCompare(a.memory.updated ?? ""));
      const results = scored.slice(0, limit).map(({ memory }) => ({
        id: memory.id,
        title: memory.title,
        tags: memory.tags,
        importance: memory.importance,
        updated: memory.updated,
        content: memory.content
      }));
      return { results };
    },
    presentCall(args) {
      return { card: "generic", title: `Search memory: ${args.query}`, kind: "read", rawInput: args.query };
    }
  });

  const listTool = defineTool({
    name: "memory_list",
    description: "List all global memories (or filter by tag). Returns summaries; call memory_search to read the full content of a specific memory.",
    parameters: {
      tag: { type: "string", description: "Optional tag to filter by." }
    },
    output: {
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          memories: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                id: { type: "string", required: true },
                title: { type: "string", required: true },
                tags: { type: "array", items: { type: "string" } },
                importance: { type: "string" },
                created: { type: "string" },
                updated: { type: "string" },
                summary: { type: "string" }
              }
            }
          }
        }
      },
      render: (_args, value) => [{
        type: "text",
        text: value.memories.length === 0 ? "No memories." : value.memories.map((m) => `#${m.id} "${m.title}" (${m.importance}) ${m.tags.length > 0 ? `[${m.tags.join(", ")}]` : ""}\n  ${m.summary}`).join("\n")
      }]
    },
    async execute(args, exec) {
      exec.signal.throwIfAborted();
      const tag = typeof args.tag === "string" && args.tag.trim().length > 0 ? args.tag.trim().toLowerCase() : void 0;
      const memories = sortMemories(await listMemories()).filter((memory) => tag === void 0 || memory.tags.includes(tag));
      return {
        memories: memories.map((memory) => ({
          id: memory.id,
          title: memory.title,
          tags: memory.tags,
          importance: memory.importance,
          created: memory.created,
          updated: memory.updated,
          summary: truncateUtf8(memory.content.replace(/\s+/g, " ").trim(), 200)
        }))
      };
    },
    presentCall() {
      return { card: "generic", title: "List memories", kind: "read", rawInput: "" };
    }
  });

  const deleteTool = defineTool({
    name: "memory_delete",
    description: "Forget (delete) a memory by id. Find ids with memory_list or memory_search.",
    parameters: {
      id: { type: "string", required: true, description: "The memory id to delete." }
    },
    output: {
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string", required: true },
          deleted: { type: "boolean", required: true }
        }
      },
      render: (_args, value) => [{
        type: "text",
        text: value.deleted ? `Deleted memory #${value.id}.` : `No memory with id "${value.id}" exists.`
      }]
    },
    async execute(args, exec) {
      exec.signal.throwIfAborted();
      const id = args.id.trim();
      if (id.length === 0) throw new Error("id must be a non-empty string");
      return await enqueueMutation(async () => {
        const deleted = await deleteMemory(id);
        invalidateContext();
        return { id, deleted };
      });
    },
    presentCall(args) {
      return { card: "generic", title: `Forget memory: ${args.id}`, kind: "write", rawInput: args.id };
    }
  });

  const summarizeTool = defineTool({
    name: "memory_summarize",
    description: "Distill a chunk of text (or your own summary of the conversation) into a compact, durable memory and save it. Uses the language model to produce the summary; if no model route is available, save the summary yourself with memory_add instead.",
    parameters: {
      text: { type: "string", required: true, description: "The input text to distill into a memory (e.g. a long document or a recap of the current task)." },
      title: { type: "string", description: "Optional title; when omitted the model derives one." },
      tags: { type: "array", items: { type: "string" }, description: "Optional tags." },
      importance: { type: "string", enum: ["high", "medium", "low"], description: "Optional importance (default medium)." }
    },
    output: {
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string", required: true },
          title: { type: "string", required: true },
          summary: { type: "string", required: true },
          importance: { type: "string" },
          tags: { type: "array", items: { type: "string" } },
          saved: { type: "boolean", required: true }
        }
      },
      render: (_args, value) => [{
        type: "text",
        text: `Saved summarized memory #${value.id} "${value.title}"\n\n${value.summary}`
      }]
    },
    async execute(args, exec) {
      exec.signal.throwIfAborted();
      const text = args.text.trim();
      if (text.length === 0) throw new Error("text must be a non-empty string");
      const route = resolveSummarizeRoute();
      const llm = ctx.get("llm");
      if (route === void 0 || llm === void 0) {
        throw new Error("memory_summarize needs a language model route: configure summarizeProvider/summarizeModel in the plugin config, or set a default model — otherwise summarize manually and save with memory_add");
      }
      const inputBytes = byteLength(text);
      if (inputBytes > resolved.summarizeMaxInputBytes) {
        throw new Error(`input is ${inputBytes} bytes, exceeding summarizeMaxInputBytes (${resolved.summarizeMaxInputBytes})`);
      }
      const distilled = await summarizeWithLlm(llm, route, text, exec.signal);
      exec.signal.throwIfAborted();

      const title = (typeof args.title === "string" && args.title.trim().length > 0 ? args.title.trim() : distilled.title).trim();
      const finalTitle = title.length > 0 ? title : truncateUtf8(distilled.summary.replace(/\s+/g, " ").trim(), 60);
      const importance = normalizeImportance(args.importance ?? distilled.importance);
      const tags = normalizeTags(args.tags ?? distilled.tags);
      const now = new Date().toISOString();
      const id = newId(finalTitle);

      return await enqueueMutation(async () => {
        await writeMemory({ id, title: finalTitle, content: distilled.summary, tags, importance, created: now, updated: now });
        invalidateContext();
        return { id, title: finalTitle, summary: distilled.summary, importance, tags, saved: true };
      });
    },
    presentCall(args) {
      return { card: "generic", title: args.title ? `Summarize memory: ${args.title}` : "Summarize into memory", kind: "write", rawInput: args.text.slice(0, 200) };
    }
  });

  function resolveSummarizeRoute() {
    if (resolved.summarizeProvider.length > 0 && resolved.summarizeModel.length > 0) {
      return { provider: resolved.summarizeProvider, model: resolved.summarizeModel };
    }
    const selection = ctx.get("agentDefaultModel")?.currentSelection?.();
    if (selection?.provider && selection?.model) {
      return { provider: selection.provider, model: selection.model };
    }
    return void 0;
  }

  async function summarizeWithLlm(llm, route, text, signal) {
    const system = [
      "You distill input text into a single compact, durable memory entry for an AI coding assistant's long-term memory.",
      "Return exactly one JSON object with these keys:",
      '- "title": a short title (5-10 words, the language of the input),',
      '- "summary": 2-6 sentences capturing only the durable facts, decisions, constraints, and preferences worth remembering (drop transient details),',
      '- "tags": an array of 0-5 short lowercase tags,',
      '- "importance": one of "high", "medium", or "low".',
      "Output only the JSON object — no markdown fences, no commentary."
    ].join("\n");
    const messages = [createUserMessage({
      content: [{ type: "text", text }],
      source: { kind: "plugin", plugin: name }
    })];
    const callDeadline = deadline(signal, resolved.summarizeTimeoutMs, "MEMORY_SUMMARIZE_TIMEOUT");
    const assembler = new BlockAssembler();
    for await (const chunk of llm.stream({
      provider: route.provider,
      model: route.model,
      messages,
      system,
      maxTokens: resolved.summarizeMaxOutputTokens,
      signal: callDeadline.signal
    })) {
      callDeadline.signal.throwIfAborted();
      assembler.push(chunk);
    }
    callDeadline.signal.throwIfAborted();
    if (assembler.finish?.kind === "error" || assembler.finish?.kind === "aborted") {
      throw new Error(`memory_summarize model call failed: ${String(assembler.finish.failure?.message ?? assembler.finish.kind)}`);
    }
    const textOut = assembler.blocks().filter((block) => block.type === "text").map((block) => block.text).join("");
    if (textOut.trim().length === 0) throw new Error("memory_summarize model produced no text");
    return parseDistilled(textOut);
  }

  function parseDistilled(text) {
    const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
    const candidate = fenced ? fenced[1] : text;
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        const parsed = JSON.parse(candidate.slice(start, end + 1));
        if (parsed && typeof parsed === "object") {
          return {
            title: typeof parsed.title === "string" ? parsed.title.trim() : "",
            summary: typeof parsed.summary === "string" ? parsed.summary.trim() : "",
            tags: Array.isArray(parsed.tags) ? parsed.tags.filter((t) => typeof t === "string") : [],
            importance: normalizeImportance(parsed.importance)
          };
        }
      } catch {
        /* fall through to the raw-text summary */
      }
    }
    return { title: "", summary: text.trim(), tags: [], importance: DEFAULT_IMPORTANCE };
  }

  /* ── registrations ────────────────────────────────────────────────────── */

  const disposers = [
    ctx.tools.register(addTool),
    ctx.tools.register(searchTool),
    ctx.tools.register(listTool),
    ctx.tools.register(deleteTool),
    ctx.tools.register(summarizeTool)
  ];

  const commands = ctx.get("commands");
  if (commands !== void 0) {
    disposers.push(commands.register({
      name: "memory",
      description: "List or search your global memories",
      input: { hint: "optional search query" },
      async handler(invocation) {
        const query = invocation.rawInput.trim();
        if (query.length > 0) {
          const q = query.toLowerCase();
          const matches = sortMemories(await listMemories()).filter((memory) =>
            memory.title.toLowerCase().includes(q)
            || memory.tags.some((tag) => tag.toLowerCase().includes(q))
            || memory.content.toLowerCase().includes(q)
          ).slice(0, 10);
          if (matches.length === 0) return { kind: "success", text: `No memories matched "${query}".` };
          return { kind: "success", text: matches.map((m) => `#${m.id} "${m.title}" (${m.importance})${m.tags.length > 0 ? ` [${m.tags.join(", ")}]` : ""}\n  ${truncateUtf8(m.content.replace(/\s+/g, " ").trim(), 240)}`).join("\n\n") };
        }
        const memories = sortMemories(await listMemories());
        if (memories.length === 0) return { kind: "success", text: "No global memories yet. Save durable facts with the memory_add tool." };
        return { kind: "success", text: memories.map((m) => `#${m.id} "${m.title}" (${m.importance})${m.tags.length > 0 ? ` [${m.tags.join(", ")}]` : ""}\n  ${truncateUtf8(m.content.replace(/\s+/g, " ").trim(), 240)}`).join("\n\n") };
      }
    }));
  }

  ctx.effect(() => () => {
    for (const disposer of disposers) {
      try {
        disposer();
      } catch {
        /* already disposed */
      }
    }
  });
}
