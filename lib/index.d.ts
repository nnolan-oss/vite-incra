import type { Plugin } from 'vite';
import * as vite from 'vite';
export interface IncrementalBuildPluginOptions {
    bundleName?: string;
    watcherIgnoredFiles?: (string | RegExp)[];
    beforeBuildCallback?: () => void;
    cleanBeforeFirstBuild?: boolean;
    /** When false, runs one build and exits. Uses cache to detect changed files for incremental rebuild. Default: true (watch mode) */
    watch?: boolean;
    /** Use polling instead of native watchers. Default true to avoid EMFILE on macOS. Set false if you have high ulimit. */
    watcherUsePolling?: boolean;
}
/** Vite plugin for incremental builds. Add to plugins in vite.config.ts */
export declare function incrementalBuild(options?: IncrementalBuildPluginOptions): Plugin;
/** Run incremental build (watcher + build loop). Use via `vite-incremental` CLI or call directly. */
export declare function runIncrementalBuild(config?: vite.ResolvedConfig | vite.UserConfig, options?: IncrementalBuildPluginOptions): Promise<void>;
/** Patch config with incremental build prerequisites. Used internally by the plugin. */
export declare const patchConfig: (config: vite.UserConfig, { ignoreWarnings }?: {
    ignoreWarnings?: boolean | undefined;
}) => vite.UserConfig;
