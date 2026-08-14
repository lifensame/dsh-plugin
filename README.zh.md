# dsh-memory

[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（`dsh`）的**全局记忆**插件。它给每个 Agent 一份持久、跨会话的长期记忆：记录那些应该跨越会话、项目和工作区长期保留的事实、用户偏好和决策，并自动把它们召回进每一个任务。

![Q版 DeepSeek 记忆吉祥物](assets/q-version-deepseek-memory.jpg)

## 功能

| 功能 | 说明 |
|---|---|
| **全局存储** | 记忆以 Markdown 文件形式存放在 `$DSH_HOME/memory/*.md`，所有会话共享，不绑定某个工作区。 |
| **自动召回** | 每个任务开始时，记忆上下文会自动注入，Agent 一上来就「记得」这些事。 |
| **自动输入** | Agent 通过工具自己写入记忆，无需手动编辑文件。 |
| **自动总结** | `memory_summarize` 会用语言模型把一段长文本（或对本次对话的复述）提炼成一条精简记忆并保存。 |
| **人工命令** | 在对话里输入 `/memory` 可以查看（或搜索）记忆。 |

## 面向模型（Agent）的工具

- `memory_add` — 保存一条持久事实 / 偏好 / 决策；相同标题（或相同 `id`）会更新已有记忆而不是重复新建。
- `memory_search` — 按关键词搜索标题、标签和正文。
- `memory_list` — 列出所有记忆（可按标签过滤）。
- `memory_delete` — 按 id 删除（遗忘）一条记忆。
- `memory_summarize` — 用 LLM 把文本提炼成精简记忆并保存。

注入的常驻指令还会要求 Agent **主动**维护记忆：遇到新的持久事实就保存、旧事实变更就更新、避免重复。

## 安装

确保已安装 [GitHub CLI](https://cli.github.com/) 和 `pnpm`，然后：

```sh
# 从 git 源（本仓库）安装
dsh plugin --profile web add github:lifensame/dsh-plugin

# 或从本地目录安装
dsh plugin --profile web add <path/to/dsh-plugin>

# 或（发布到 npm 后）
dsh plugin --profile web add dsh-memory
```

之后重启 profile 即可。首次安装时 pnpm 会下载依赖，`dsh` 会自动把它登记到 profile 的 bundle 列表。

## 记忆如何存储

每条记忆是一个带 YAML frontmatter 的 Markdown 文件：

```markdown
---
id: favorite-color-abc123
title: 喜欢的颜色
tags: [prefs]
importance: high
created: 2026-01-01T00:00:00.000Z
updated: 2026-01-02T00:00:00.000Z
---
用户喜欢的颜色是蓝色。
```

文件位于 `$DSH_HOME/memory`（默认 `~/.dsh/memory`），你也可以手动编辑，或把它纳入版本控制。

## 配置

所有配置项都可省略，下面是默认值：

```yaml
# profile 的 cordis.patch.yml —— dsh-memory 行
- id: memory
  name: dsh-memory
  config:
    memoryDir: memory              # 存放 .md 文件的目录（相对 $DSH_HOME）
    maxInjectedBytes: 16384        # 自动注入记忆上下文的字节预算
    searchDefaultLimit: 5          # memory_search 默认返回条数
    summarizeProvider: ''          # memory_summarize 使用的 LLM provider（留空 = 默认模型）
    summarizeModel: ''             # 与 summarizeProvider 配对的模型 id
    summarizeMaxInputBytes: 24576  # memory_summarize 接受的最大输入字节数
    summarizeMaxOutputTokens: 512  # 总结调用的最大输出 token 数
    summarizeTimeoutMs: 60000      # 总结调用超时时间
```

## Q 版形象

生成 Q 版（chibi）DeepSeek 记忆吉祥物的提示词见 [`docs/image-prompt.md`](./docs/image-prompt.md)。

## 许可证

MIT
