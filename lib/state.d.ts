import type { IncrementalBuildPluginOptions } from './types.js';
export type DictionaryEntry = {
    parents: Set<string>;
    realLocationInDist: string[];
    imports: string[];
};
export declare const state: {
    running: boolean;
    watcherModifiedFile: string | null;
    waitForBuildEndPromiseResolver: (() => void) | undefined;
    outDir: string;
    dictionary: Record<string, DictionaryEntry>;
    originalEntries: Record<string, string> | undefined;
    buildFn: () => void;
    storedPluginOptions: IncrementalBuildPluginOptions;
};
