# dsh-memory 使用教程

> 让每一次使用都带上全局记忆。装一次，之后所有会话自动生效。

## 一、它是什么

`dsh-memory` 是 DeepSeek Harness（`dsh`）的**全局记忆插件**。它给每个 Agent 一份持久、跨会话的长期记忆：

- 记忆存在 `$DSH_HOME/memory/*.md`（默认 `~/.dsh/memory`），**所有会话、所有项目、所有工作区共享**。
- 每个新任务开始时，记忆上下文**自动注入**，Agent 一上来就「记得」这些事。
- Agent 通过工具**自己写入/更新/搜索/删除**记忆，无需手动编辑文件。
- 支持用语言模型把长文本或整段对话**自动总结成精简记忆**。

## 二、安装（一次性）

打开终端，执行：

```sh
dsh plugin --profile web add github:lifensame/dsh-plugin
```

- 网页版用 `web` profile；用 `headless`（命令行单任务）就改成 `--profile headless`。
- 首次安装时 pnpm 会下载依赖，`dsh` 会自动把插件登记进 profile 的 bundle 列表。

装好后**重启应用**（重开 `dsh web`），让新插件加载。

## 三、验证装好了

```sh
dsh --profile web --dump-config | findstr /C:"dsh-memory"
```

能看到 `name: dsh-memory` 的一行即成功。

## 四、日常怎么用（全程自动）

每次新会话开始，对话里会自动出现一个 `<system-reminder>` 记忆上下文块。Agent 手里会多出 5 个工具：

| 工具 | 用途 |
|---|---|
| `memory_add` | 保存一条持久记忆（标题 + 内容 + 标签 + 重要度） |
| `memory_search` | 按关键词搜索记忆 |
| `memory_list` | 列出所有记忆 |
| `memory_delete` | 删除（遗忘）一条记忆 |
| `memory_summarize` | 把一段长文本/对话提炼成精简记忆并保存 |

你只需**用自然语言说**，Agent 会自动调用工具，例如：

- 「记住：我的项目代码在 D:\code，用中文回答我」
- 「记住我喜欢用 pnpm，不用 npm」
- 「我们之前聊过什么来着？」 → 它会 search / list
- 「把这次对话总结成一条记忆」 → 它会用 summarize
- 输入框直接打 `/memory` → 查看所有记忆；`/memory 关键词` → 搜索；
  `/memory show <id>` → 看某条记忆全文；`/memory rm <id>` → 删除一条；`/memory help` → 查看用法

注入的常驻指令还会**主动提醒 Agent 维护记忆**：学到新事实就存、旧的变了就更新、别重复建。

## 五、记忆存哪里

`C:\Users\<你>\.dsh\memory\*.md`（macOS/Linux 是 `~/.dsh/memory`）。每个记忆一个 Markdown 文件，带 YAML frontmatter：

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

你可以手动改、删，甚至放进 git 版本管理。

## 六、配置（可选）

在 profile 的 `cordis.patch.yml` 里给 `dsh-memory` 行加配置即可，全部可省略，下面是默认值：

```yaml
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

## 七、常见问题

1. **装一次，处处生效**：记忆是全局的，跨会话/项目/工作区共享。
2. **`memory_summarize` 报「找不到模型路由」**：默认走「默认模型」；若没有默认模型，就在配置里同时填 `summarizeProvider` 和 `summarizeModel`。
3. **想让某项目有「只属于该项目的记忆」**：当前版本是全局记忆；项目级隔离可作为后续功能加入。
4. **记忆太多、注入超预算**：超出的记忆会被省略并提示，Agent 仍可用 `memory_list` / `memory_search` 精确查找。
5. **从 0.1 升级**：0.1 里所有中文标题的记忆都写进了同一个 `memory.md`（互相覆盖）。0.2 修复了这一点——中文标题现在各得其所。升级后如有记忆丢失，检查 `memory` 目录下的 `memory.md`，里面可能还留着最后一条。
