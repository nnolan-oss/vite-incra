import type { UserConfig } from 'vite';
export declare function startIncrementalBuild({ config, bundleName, watcherIgnoredFiles, watcherUsePolling, beforeBuildCallback, watch, cachePath, force, }: {
    config: UserConfig;
    bundleName?: string;
    watcherIgnoredFiles?: (string | RegExp)[];
    watcherUsePolling?: boolean;
    beforeBuildCallback?: () => void;
    watch?: boolean;
    cachePath?: string;
    force?: boolean;
}): void;
