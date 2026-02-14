import type { UserConfig } from 'vite';
import * as vite from 'vite';
import type { IncrementalBuildPluginOptions } from './types.js';
/** Run incremental build (watcher + build loop). Use via `vite-incra` CLI or call directly. */
export declare function runIncrementalBuild(config?: vite.ResolvedConfig | UserConfig, options?: IncrementalBuildPluginOptions): Promise<void>;
