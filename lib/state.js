export const state = {
    running: false,
    watcherModifiedFile: null,
    waitForBuildEndPromiseResolver: undefined,
    outDir: 'dist',
    dictionary: {},
    originalEntries: undefined,
    buildFn: (() => { }),
    storedPluginOptions: {},
};
