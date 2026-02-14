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
export type CacheData = {
    version: number;
    root: string;
    files: Record<string, number>;
};
