import fs from 'node:fs';
import fg from 'fast-glob';
import path from 'node:path';
import { COMPONENT_WITH_STYLES, ENV_MODIFIED_FILE, SOURCE_EXT_TO_JS } from './constants.js';
import { state } from './state.js';
import { toDist } from './build.js';
/** Patch config with incremental build prerequisites. Used internally by the plugin. */
export const patchConfig = (config, { ignoreWarnings = false } = {}) => {
    if (config.root === undefined || config.root === '') {
        console.log('\x1b[31m%s\x1b[0m', `expected to find 'root' in vite config`);
        throw new Error('config error');
    }
    if (typeof config.root === 'string' && config.root.endsWith('/')) {
        console.log('\x1b[31m%s\x1b[0m', `config 'root' should not end with "/"`);
        throw new Error('config error');
    }
    if (config.build === undefined) {
        config.build = {};
        if (!ignoreWarnings)
            console.log('\x1b[33m%s\x1b[0m', `expected to find 'build' in vite config`);
    }
    // Match Vite: outDir is relative to project root (directory containing root when root is ./src etc)
    state.outDir = path.resolve(path.resolve(config.root), config.build?.outDir ?? 'dist');
    if (config.build.rollupOptions === undefined) {
        config.build.rollupOptions = {};
    }
    else if (!ignoreWarnings) {
        console.log('\x1b[33m%s\x1b[0m', `expected to 'build.rollupOptions' in vite config to not exist`);
    }
    if (config.build.rollupOptions.input &&
        (typeof config.build.rollupOptions.input !== 'object' ||
            Array.isArray(config.build.rollupOptions.input) ||
            !Object.keys(config.build.rollupOptions.input).length)) {
        console.log('\x1b[31m%s\x1b[0m', `build.rollupOptions.input was supplied but was either empty, a string or a string[]. Please use an object instead (Record<string, string>)`);
        throw new Error('config error');
    }
    config.build.emptyOutDir = false;
    config.build.rollupOptions.preserveEntrySignatures = 'strict';
    config.build.rollupOptions.output = {
        entryFileNames: ({ facadeModuleId, name }) => {
            if (`${facadeModuleId}`.includes('/node_modules/'))
                return `node_modules/${name.split('node_modules/').at(-1)}.js`;
            for (const [ext, outExt] of Object.entries(SOURCE_EXT_TO_JS)) {
                if (name.endsWith(ext))
                    return name.slice(0, -ext.length) + outExt;
            }
            return '[name].js';
        },
        preserveModules: true,
        preserveModulesRoot: config.root.startsWith('./')
            ? config.root.replace(/^\.\//, '').replace(/\/$/, '')
            : path.relative(process.cwd(), path.resolve(config.root)),
        inlineDynamicImports: false,
        compact: false,
        indent: false,
        minifyInternalExports: false,
        format: 'esm',
    };
    if (config.plugins === undefined)
        config.plugins = [];
    config.plugins.unshift({
        name: 'viteIncrementalBuild',
        closeBundle: () => {
            // files have been written to disk, can proceed with dependency tree map
            state.waitForBuildEndPromiseResolver?.();
        },
        generateBundle(_, bundle) {
            void (async () => {
                await new Promise((resolve) => {
                    state.waitForBuildEndPromiseResolver = resolve;
                });
                const modifiedFile = state.watcherModifiedFile ?? process.env[ENV_MODIFIED_FILE] ?? null;
                if (modifiedFile) {
                    // update files that import this file if the hash changed (Vue SFC, Svelte)
                    if (COMPONENT_WITH_STYLES.test(modifiedFile)) {
                        const dictKey = modifiedFile.replace(/\.(vue|svelte)$/, '.css');
                        const dictEntry = state.dictionary[dictKey];
                        if (dictEntry) {
                            const oldNames = dictEntry.realLocationInDist;
                            const newNames = Object.values(bundle)
                                .filter((fileInfo) => {
                                return fileInfo.name === dictKey;
                            })
                                .map((fileInfo) => fileInfo.fileName);
                            if (oldNames.length !== newNames.length) {
                                return state.buildFn();
                            }
                            dictEntry.realLocationInDist = newNames;
                            for (let i = 0; i < oldNames.length; i++) {
                                const oldName = oldNames[i], newName = newNames[i];
                                if (oldName && newName && oldName !== newName) {
                                    fs.rmSync(toDist(oldName));
                                    dictEntry.parents.forEach((file) => {
                                        for (const distPath of state.dictionary[file].realLocationInDist) {
                                            const fileContent = fs
                                                .readFileSync(toDist(distPath), 'utf-8')
                                                .replaceAll(oldName, newName);
                                            fs.writeFileSync(toDist(distPath), fileContent);
                                        }
                                    });
                                }
                            }
                        }
                    }
                    return;
                }
                state.dictionary = {};
                console.log('\x1b[90m%s\x1b[0m', '    building dependency tree');
                Object.values(bundle).forEach((fileInfo) => {
                    if (fileInfo.fileName.includes('node_modules'))
                        return;
                    if (fileInfo.fileName.includes('_virtual'))
                        return;
                    if (!('facadeModuleId' in fileInfo) || !fileInfo.facadeModuleId) {
                        if (fileInfo.type !== 'asset' || !fileInfo.name?.endsWith('.css'))
                            return;
                        // css files can have more than one realLocation (vue with many style blocks)
                        const dictEntry = state.dictionary[fileInfo.name];
                        if (dictEntry)
                            state.dictionary[fileInfo.name].realLocationInDist.push(fileInfo.fileName);
                        else
                            state.dictionary[fileInfo.name] = {
                                parents: new Set(),
                                realLocationInDist: [fileInfo.fileName],
                                imports: [],
                            };
                    }
                    else {
                        state.dictionary[fileInfo.name + '.js'] = {
                            parents: new Set(),
                            realLocationInDist: [fileInfo.fileName],
                            imports: [...fileInfo.imports, ...fileInfo.dynamicImports],
                        };
                    }
                });
                const cssImportsToFind = new Set();
                Object.entries(state.dictionary).forEach(([key, fileInfo]) => {
                    fileInfo.imports.forEach((imported) => {
                        if (imported.includes('node_modules'))
                            return;
                        if (imported.includes('_virtual'))
                            return;
                        const bundleEntry = bundle[imported];
                        if (!bundleEntry)
                            return;
                        state.dictionary[bundleEntry.name + '.js']?.parents.add(key);
                    });
                    if (key.endsWith('.css'))
                        cssImportsToFind.add(key);
                });
                fg.globSync(path.join(state.outDir, '**/*.html')).forEach((match) => {
                    const key = path.relative(state.outDir, match).replace(/\\/g, '/');
                    state.dictionary[key] = {
                        realLocationInDist: [key],
                        parents: new Set(),
                        imports: [],
                    };
                });
                Object.entries(state.dictionary).forEach(([key, fileInfo]) => {
                    if (fileInfo.realLocationInDist[0]?.startsWith('assets/'))
                        return;
                    cssImportsToFind.forEach((cssImportEntryKey) => {
                        const cssImportEntry = state.dictionary[cssImportEntryKey];
                        if (!cssImportEntry)
                            return;
                        for (const distPath of fileInfo.realLocationInDist) {
                            const code = fs.readFileSync(toDist(distPath), 'utf-8');
                            for (const cssPath of cssImportEntry.realLocationInDist) {
                                if (code.includes(cssPath)) {
                                    cssImportEntry.parents.add(key);
                                    break;
                                }
                            }
                        }
                    });
                });
                console.log('\x1b[32m%s\x1b[0m', '    ✓ dependency tree built');
            })();
        },
        options(options) {
            if (state.originalEntries === undefined &&
                options.input &&
                typeof options.input === 'object' &&
                !Array.isArray(options.input) &&
                Object.keys(options.input).length)
                state.originalEntries = options.input;
            const modifiedFile = state.watcherModifiedFile ?? process.env[ENV_MODIFIED_FILE] ?? null;
            if (modifiedFile) {
                // partial build – restrict entry to changed file only
                const modifiedPath = path.resolve(config.root, modifiedFile);
                let entryName = modifiedFile.split('.')[0];
                const findMatching = (item) => path.resolve(item[1]) === path.resolve(modifiedPath);
                const matchingItemInEntries = Object.entries(state.originalEntries ?? {}).find(findMatching);
                if (state.originalEntries && matchingItemInEntries)
                    entryName = matchingItemInEntries[0];
                options.input = { [entryName]: modifiedPath };
            }
        },
    });
    return config;
};
