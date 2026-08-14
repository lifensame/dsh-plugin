# dsh-memory

Global memory plugin for the [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (`dsh`). It gives every agent a persistent, cross-session **long-term memory**: durable facts, user preferences, and decisions that survive across sessions, projects, and workspaces — and it automatically recalls them into every task.

![Q版 DeepSeek 记忆吉祥物](assets/q-version-deepseek-memory.png)

> 中文说明见 [README.zh.md](./README.zh.md)。

## What it does

| Feature | How it works |
|---|---|
| **Global store** | Memories are plain Markdown files under `$DSH_HOME/memory/*.md` (shared by every session, not tied to any workspace). |
| **Automatic recall** | The memory context is injected into every agent step, so *every task* starts with your memories already loaded. |
| **Automatic input** | The agent saves memories itself through tools — no manual file editing. |
| **Auto-summarize** | `memory_summarize` distills a long input (or a recap of the conversation) into a compact memory using the language model. |
| **Human commands** | `/memory` lists (or searches) memories from the chat UI. |

## Model-facing tools

- `memory_add` — save a durable fact / preference / decision. Reusing the same title (or `id`) updates the existing memory.
- `memory_search` — keyword search over titles, tags, and body.
- `memory_list` — list all memories (optionally filtered by tag).
- `memory_delete` — forget a memory by id.
- `memory_summarize` — distill text into a compact memory via the LLM, then save it.

The standing injected instruction also tells the agent to *proactively* keep memory current (save new durable facts, update stale ones, avoid duplicates).

## Install

With the [GitHub CLI](https://cli.github.com/) and `pnpm` installed, add the plugin to a profile:

```sh
# git source (this repository)
dsh plugin --profile web add github:lifensame/dsh-plugin

# or, from a local checkout
dsh plugin --profile web add <path/to/dsh-plugin>

# or, once published, from npm
dsh plugin --profile web add dsh-memory
```

Then restart the profile. The first time you add it, pnpm installs the package and `dsh` reconciles it into the profile's bundle list automatically.

## How memories are stored

Each memory is one Markdown file with YAML frontmatter:

```markdown
---
id: favorite-color-abc123
title: Favorite color
tags: [prefs]
importance: high
created: 2026-01-01T00:00:00.000Z
updated: 2026-01-02T00:00:00.000Z
---
The user's favorite color is blue.
```

They live under `$DSH_HOME/memory` (`~/.dsh/memory` by default), so you can also edit them by hand or put them under version control.

## Configuration

All options are optional; the values below are the defaults.

```yaml
# profile cordis.patch.yml — the dsh-memory row
- id: memory
  name: dsh-memory
  config:
    memoryDir: memory              # directory (relative to $DSH_HOME) holding the .md files
    maxInjectedBytes: 16384        # UTF-8 budget for the auto-injected memory context
    searchDefaultLimit: 5          # default result count for memory_search
    summarizeProvider: ''          # explicit LLM provider route for memory_summarize (empty = default model)
    summarizeModel: ''             # explicit LLM model id, paired with summarizeProvider
    summarizeMaxInputBytes: 24576  # max input size memory_summarize accepts
    summarizeMaxOutputTokens: 512  # max tokens for the summarization call
    summarizeTimeoutMs: 60000      # timeout for the summarization call
```

## Q-version logo

A ready-to-use prompt for generating a chibi (Q版) DeepSeek-memory mascot is in [`docs/image-prompt.md`](./docs/image-prompt.md).

## License

MIT
