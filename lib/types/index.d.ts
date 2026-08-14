/**
 * dsh-memory — global memory plugin for the DeepSeek Harness.
 * @module dsh-memory
 */

import type { Context } from '@deepseek-ai/cordis';
import type z from '@deepseek-ai/schemastery';

export declare const name: 'dsh-memory';
export declare const inject: string[];
export declare const Config: z<Config>;

/** Plugin configuration; every field is optional (code supplies defaults). */
export interface Config {
  /** Override for the DeepSeek Harness home. Defaults to `$DSH_HOME`, then `~/.dsh`. */
  dshHome?: string;
  /** Directory (relative to the harness home) holding memory `.md` files. Default `memory`. */
  memoryDir?: string;
  /** UTF-8 byte budget for the injected memory context. Default 16384. */
  maxInjectedBytes?: number;
  /** Default result count for `memory_search`. Default 5. */
  searchDefaultLimit?: number;
  /** Explicit provider route for `memory_summarize` (empty = use the default model). */
  summarizeProvider?: string;
  /** Explicit model id for `memory_summarize` (paired with `summarizeProvider`). */
  summarizeModel?: string;
  /** Max input bytes accepted by `memory_summarize`. Default 24576. */
  summarizeMaxInputBytes?: number;
  /** Max output tokens for the summarization call. Default 512. */
  summarizeMaxOutputTokens?: number;
  /** Timeout for the summarization call in milliseconds. Default 60000. */
  summarizeTimeoutMs?: number;
}

/** A stored memory record (as persisted in frontmatter + body). */
export interface Memory {
  id: string;
  title: string;
  content: string;
  tags: string[];
  importance: 'high' | 'medium' | 'low';
  created: string;
  updated: string;
}

export declare function apply(ctx: Context, config?: Config): void;
