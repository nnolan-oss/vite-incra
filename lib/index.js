import * as vite from 'vite';
import chokidar from 'chokidar';
import fs from 'node:fs';
import fg from 'fast-glob';
import path from 'node:path';
import readline from 'node:readline';
let running = false;
let watcherModifiedFile = null;
let waitForBuildEndPromiseResolver;
let outDir = 'dist';
let dictionary = {};
let originalEntries;
// Framework files that emit extracted CSS (Vue SFC, Svelte)
const COMPONENT_WITH_STYLES = /\.(vue|svelte)$/;
// Extensions that need .js output in entryFileNames
const SOURCE_EXT_TO_JS = {
    '.vue': '.js',
    '.tsx': '.js',
    '.jsx': '.js',
    '.svelte': '.js',
    '.ts': '.js',
    '.mts': '.mjs',
    '.cts': '.cjs',
    '.js': '.js',
    '.mjs': '.mjs',
    '.cjs': '.cjs',
};
let buildFn;
const toDist = (...parts) => path.join(outDir, ...parts);
const CACHE_NAME = '.vite-incra-cache.json';
const ENV_MODIFIED_FILE = 'VITE_PLUGIN_INCREMENTAL_MODIFIED_FILE';
const SOURCE_GLOB = '**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs,vue,svelte,css,scss,sass,less,styl,stylus,html}';
// Only these extensions work as Rollup entry for partial build; CSS cannot be sole entry
const PARTIAL_BUILD_EXT = /\.(tsx?|jsx?|mts|cts|mjs|cjs|vue|svelte)$/;
// Config files import Node/bundler deps – cannot be used as browser entry. Force full build.
const CONFIG_FILE = /(?:^|\/)(?:vite|vitest|rollup|vike)\.(config|env)\.(ts|js|mts|mjs|cjs|cts)$/;
// Stylesheet extensions: when changed, use the importing module as entry for partial build
const CSS_EXT = /\.(css|scss|sass|less|styl|stylus)$/;
function getCachePath(config) {
    const projectRoot = path.dirname(path.resolve(config.root));
    return path.join(projectRoot, CACHE_NAME);
}
function loadCache(cachePath) {
    try {
        if (!fs.existsSync(cachePath))
            return null;
        const data = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
        return data.version === 1 ? data : null;
    }
    catch {
        return null;
    }
}
function saveCache(cachePath, rootResolved, files) {
    const dir = path.dirname(cachePath);
    if (!fs.existsSync(dir))
        fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(cachePath, JSON.stringify({ version: 1, root: rootResolved, files }, null, 0), 'utf-8');
}
function getSourceFileMtimes(rootResolved) {
    const files = {};
    const matches = fg.sync(SOURCE_GLOB, {
        cwd: rootResolved,
        absolute: true,
        ignore: ['**/node_modules/**', '**/dist/**', '**/.*', '**/.*/**'],
    });
    for (const file of matches) {
        try {
            const stat = fs.statSync(file);
            const rel = path.relative(rootResolved, file).replace(/\\/g, '/');
            files[rel] = stat.mtimeMs;
        }
        catch {
            // skip
        }
    }
    return files;
}
function getChangedFiles(cache, current) {
    if (!cache)
        return []; // no cache = treat as "all new", caller does full build
    const changed = [];
    for (const [rel, mtime] of Object.entries(current)) {
        if (cache.files[rel] !== mtime)
            changed.push(rel);
    }
    for (const rel of Object.keys(cache.files)) {
        if (!(rel in current))
            changed.push(rel); // deleted
    }
    return changed;
}
/** Find JS/TS modules that import the given stylesheet. Used to resolve CSS → importer for partial build. */
function findCssImporters(cssPath, rootResolved) {
    const importers = [];
    const IMPORT_RE = /(?:import\s+['"]([^'"]+)['"]|import\s+[^'"]+from\s+['"]([^'"]+)['"]|require\s*\(\s*['"]([^'"]+)['"]\s*\))/g;
    const sourceFiles = fg.sync('**/*.{ts,tsx,js,jsx,vue,svelte}', {
        cwd: rootResolved,
        absolute: true,
        ignore: ['**/node_modules/**', '**/dist/**'],
    });
    const cssPathNorm = cssPath.replace(/\\/g, '/');
    for (const absPath of sourceFiles) {
        const fromRel = path.relative(rootResolved, absPath).replace(/\\/g, '/');
        try {
            const code = fs.readFileSync(absPath, 'utf-8');
            IMPORT_RE.lastIndex = 0;
            let m;
            while ((m = IMPORT_RE.exec(code)) !== null) {
                const spec = (m[1] ?? m[2] ?? m[3] ?? '').trim();
                if (!spec || !spec.endsWith('.css') && !/\.(scss|sass|less|styl|stylus)$/.test(spec))
                    continue;
                const fromDir = path.dirname(absPath);
                const resolved = path.resolve(fromDir, spec);
                const resolvedRel = path.relative(rootResolved, resolved).replace(/\\/g, '/');
                if (resolvedRel === cssPathNorm) {
                    importers.push(fromRel);
                    break;
                }
            }
        }
        catch {
            // skip
        }
    }
    return importers;
}
/** When modified file is a stylesheet, resolve to its importer module for partial build. */
function resolveForPartialBuild(modifiedFile, rootResolved) {
    if (CONFIG_FILE.test(modifiedFile.replace(/\\/g, '/')))
        return null;
    if (PARTIAL_BUILD_EXT.test(modifiedFile))
        return modifiedFile;
    if (CSS_EXT.test(modifiedFile)) {
        const importers = findCssImporters(modifiedFile, rootResolved);
        return importers[0] ?? null;
    }
    return null;
}
let storedPluginOptions = {};
/** Vite plugin for incremental builds. Add to plugins in vite.config.ts */
export function incrementalBuild(options = {}) {
    storedPluginOptions = options;
    return {
        name: 'vite-incra',
        enforce: 'pre',
        config(config, _env) {
            patchConfig(config, { ignoreWarnings: true });
            const modifiedFile = process.env[ENV_MODIFIED_FILE];
            if (modifiedFile && config.build?.rollupOptions) {
                const root = config.root ?? '.';
                const modifiedPath = path.resolve(root, modifiedFile);
                const entryName = modifiedFile.split('.')[0] ?? modifiedFile;
                config.build.rollupOptions = {
                    ...config.build.rollupOptions,
                    input: { [entryName]: modifiedPath },
                };
            }
        },
    };
}
/** Run incremental build (watcher + build loop). Use via `vite-incra` CLI or call directly. */
export async function runIncrementalBuild(config, options) {
    const resolvedConfig = config && typeof config === 'object' && 'root' in config
        ? config
        : (await vite.resolveConfig({}, 'build', 'production', 'production'));
    // Options must be read AFTER resolveConfig - plugin sets storedPluginOptions when config loads
    const opts = options ?? storedPluginOptions;
    const watchMode = opts.watch !== false;
    const cachePath = getCachePath(resolvedConfig);
    const hasCache = loadCache(cachePath) !== null;
    if (opts.cleanBeforeFirstBuild !== false) {
        const root = resolvedConfig.root ?? process.cwd();
        const outDirPath = resolvedConfig.build?.outDir ?? 'dist';
        const distPath = path.resolve(path.resolve(root), outDirPath);
        if (watchMode || !hasCache) {
            if (fs.existsSync(distPath))
                fs.rmSync(distPath, { recursive: true, force: true });
        }
    }
    const defaultIgnored = [
        /(^|[\\/])\../, // dotfiles
        '**/node_modules',
        '**/dist',
        '**/.git',
    ];
    startIncrementalBuild({
        config: resolvedConfig,
        bundleName: opts.bundleName ?? 'bundle',
        watcherIgnoredFiles: opts.watcherIgnoredFiles ?? defaultIgnored,
        watcherUsePolling: opts.watcherUsePolling ?? true,
        beforeBuildCallback: opts.beforeBuildCallback,
        watch: watchMode,
        cachePath,
    });
}
function startIncrementalBuild({ config, bundleName = 'bundle', watcherIgnoredFiles, watcherUsePolling = true, beforeBuildCallback, watch = true, cachePath, }) {
    // Config should already be patched when loaded via resolveConfig (plugin's config hook runs)
    // If called with raw config, patch it
    const plugins = config.plugins;
    if (!plugins?.some((p) => p && typeof p === 'object' && p.name === 'viteIncrementalBuild')) {
        patchConfig(config, { ignoreWarnings: true });
    }
    buildFn = () => {
        void buildBundle(bundleName, config, beforeBuildCallback, watch);
    };
    const rootResolved = path.resolve(config.root);
    if (!rootResolved) {
        throw new Error('viteIncrementalBuild requires config.root');
    }
    const defaultIgnored = [
        /(^|[\\/])\../,
        '**/node_modules',
        '**/dist',
        '**/.git',
    ];
    const ignoredPatterns = watcherIgnoredFiles ?? defaultIgnored;
    if (watch) {
        // Watch only source dirs to avoid EMFILE (node_modules can have thousands of files/symlinks)
        const srcDir = path.join(rootResolved, 'src');
        const publicDir = path.join(rootResolved, 'public');
        const indexHtml = path.join(rootResolved, 'index.html');
        const watchPaths = [];
        if (fs.existsSync(srcDir))
            watchPaths.push(srcDir);
        if (fs.existsSync(publicDir))
            watchPaths.push(publicDir);
        if (fs.existsSync(indexHtml))
            watchPaths.push(indexHtml);
        const watchTargets = watchPaths.length > 0 ? watchPaths : [rootResolved];
        const ignored = (p) => {
            const n = p.replace(/\\/g, '/');
            if (n.includes('/node_modules') || n.includes('/dist') || n.includes('/.git') || /\/(\.[^/]+|\.\.)/.test(n))
                return true;
            for (const pat of ignoredPatterns) {
                if (typeof pat === 'string') {
                    const s = pat.replace(/^\*\*\/?|\/\*\*$/g, '');
                    if (s && (n.includes(s) || n.includes(s.replace(/^\//, ''))))
                        return true;
                }
                else if (pat.test(p))
                    return true;
            }
            return false;
        };
        const watcher = chokidar.watch(watchTargets, {
            persistent: true,
            ignored,
            followSymlinks: false,
            usePolling: watcherUsePolling, // avoids EMFILE on macOS; set false if you have high ulimit
        });
        watcher
            .on('add', buildFn)
            .on('unlink', buildFn)
            .on('unlinkDir', buildFn)
            .on('change', (file) => {
            const changedFile = path.relative(rootResolved, path.resolve(file)).replace(/\\/g, '/');
            const entryForBuild = resolveForPartialBuild(changedFile, rootResolved);
            if (entryForBuild) {
                watcherModifiedFile = entryForBuild;
                process.env[ENV_MODIFIED_FILE] = entryForBuild;
                if (entryForBuild !== changedFile) {
                    console.log('\x1b[90m%s\x1b[0m', `partial build: ${changedFile} → ${entryForBuild}`);
                }
            }
            else {
                watcherModifiedFile = null;
                delete process.env[ENV_MODIFIED_FILE];
            }
            void buildBundle(bundleName, config, beforeBuildCallback, true).then(() => {
                watcherModifiedFile = null;
                delete process.env[ENV_MODIFIED_FILE];
            });
        });
        if (process.stdin.isTTY) {
            readline.emitKeypressEvents(process.stdin);
            process.stdin.on('keypress', (_, key) => {
                if (key && key.ctrl && key.name == 'c')
                    process.exit(0);
                if (key && key.name == 'r')
                    buildFn();
            });
            process.stdin.setRawMode(true);
            process.stdin.resume();
        }
    }
    else {
        // No watch: use cache to detect changes, build once, save cache, exit
        const cache = cachePath ? loadCache(cachePath) : null;
        const current = getSourceFileMtimes(rootResolved);
        const changed = getChangedFiles(cache, current);
        const shouldBuild = !cache || changed.length > 0;
        if (!shouldBuild) {
            console.log('\x1b[90m%s\x1b[0m', 'No changes detected, skipping build');
            return;
        }
        watcherModifiedFile =
            changed.length === 1 ? resolveForPartialBuild(changed[0], rootResolved) : null;
        if (watcherModifiedFile) {
            process.env[ENV_MODIFIED_FILE] = watcherModifiedFile;
            console.log('\x1b[90m%s\x1b[0m', changed[0] !== watcherModifiedFile
                ? `partial build: ${changed[0]} → ${watcherModifiedFile}`
                : `partial build: ${watcherModifiedFile}`);
        }
        else {
            delete process.env[ENV_MODIFIED_FILE];
            if (changed.length > 0) {
                console.log('\x1b[90m%s\x1b[0m', `full build: ${changed.length} file(s) changed`);
            }
        }
        void buildBundle(bundleName, config, beforeBuildCallback, false).then(() => {
            delete process.env[ENV_MODIFIED_FILE];
            if (cachePath)
                saveCache(cachePath, rootResolved, current);
            process.exit(0);
        });
    }
}
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
    outDir = path.resolve(path.resolve(config.root), config.build?.outDir ?? 'dist');
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
            waitForBuildEndPromiseResolver?.();
        },
        generateBundle(_, bundle) {
            void (async () => {
                await new Promise((resolve) => {
                    waitForBuildEndPromiseResolver = resolve;
                });
                const modifiedFile = watcherModifiedFile ?? process.env[ENV_MODIFIED_FILE] ?? null;
                if (modifiedFile) {
                    // update files that import this file if the hash changed (Vue SFC, Svelte)
                    if (COMPONENT_WITH_STYLES.test(modifiedFile)) {
                        const dictKey = modifiedFile.replace(/\.(vue|svelte)$/, '.css');
                        const dictEntry = dictionary[dictKey];
                        if (dictEntry) {
                            const oldNames = dictEntry.realLocationInDist;
                            const newNames = Object.values(bundle)
                                .filter((fileInfo) => {
                                return fileInfo.name === dictKey;
                            })
                                .map((fileInfo) => fileInfo.fileName);
                            if (oldNames.length !== newNames.length) {
                                return buildFn();
                            }
                            dictEntry.realLocationInDist = newNames;
                            for (let i = 0; i < oldNames.length; i++) {
                                const oldName = oldNames[i], newName = newNames[i];
                                if (oldName && newName && oldName !== newName) {
                                    fs.rmSync(toDist(oldName));
                                    dictEntry.parents.forEach((file) => {
                                        for (const distPath of dictionary[file].realLocationInDist) {
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
                dictionary = {};
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
                        const dictEntry = dictionary[fileInfo.name];
                        if (dictEntry)
                            dictionary[fileInfo.name].realLocationInDist.push(fileInfo.fileName);
                        else
                            dictionary[fileInfo.name] = {
                                parents: new Set(),
                                realLocationInDist: [fileInfo.fileName],
                                imports: [],
                            };
                    }
                    else {
                        dictionary[fileInfo.name + '.js'] = {
                            parents: new Set(),
                            realLocationInDist: [fileInfo.fileName],
                            imports: [...fileInfo.imports, ...fileInfo.dynamicImports],
                        };
                    }
                });
                const cssImportsToFind = new Set();
                Object.entries(dictionary).forEach(([key, fileInfo]) => {
                    fileInfo.imports.forEach((imported) => {
                        if (imported.includes('node_modules'))
                            return;
                        if (imported.includes('_virtual'))
                            return;
                        const bundleEntry = bundle[imported];
                        if (!bundleEntry)
                            return;
                        dictionary[bundleEntry.name + '.js']?.parents.add(key);
                    });
                    if (key.endsWith('.css'))
                        cssImportsToFind.add(key);
                });
                fg.globSync(path.join(outDir, '**/*.html')).forEach((match) => {
                    const key = path.relative(outDir, match).replace(/\\/g, '/');
                    dictionary[key] = {
                        realLocationInDist: [key],
                        parents: new Set(),
                        imports: [],
                    };
                });
                Object.entries(dictionary).forEach(([key, fileInfo]) => {
                    if (fileInfo.realLocationInDist[0]?.startsWith('assets/'))
                        return;
                    cssImportsToFind.forEach((cssImportEntryKey) => {
                        const cssImportEntry = dictionary[cssImportEntryKey];
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
            if (originalEntries === undefined &&
                options.input &&
                typeof options.input === 'object' &&
                !Array.isArray(options.input) &&
                Object.keys(options.input).length)
                originalEntries = options.input;
            const modifiedFile = watcherModifiedFile ?? process.env[ENV_MODIFIED_FILE] ?? null;
            if (modifiedFile) {
                // partial build – restrict entry to changed file only
                const modifiedPath = path.resolve(config.root, modifiedFile);
                let entryName = modifiedFile.split('.')[0];
                const findMatching = (item) => path.resolve(item[1]) === path.resolve(modifiedPath);
                const matchingItemInEntries = Object.entries(originalEntries ?? {}).find(findMatching);
                if (originalEntries && matchingItemInEntries)
                    entryName = matchingItemInEntries[0];
                options.input = { [entryName]: modifiedPath };
            }
        },
    });
    return config;
};
const buildBundle = async (bundleName, _config, beforeBuildCallback, watchMode = true) => {
    if (running)
        return;
    running = true;
    beforeBuildCallback?.();
    const start = performance.now();
    console.log('\x1b[90m%s\x1b[0m', `building ${bundleName}`);
    try {
        await vite.build({});
        console.log('\x1b[32m%s\x1b[0m', `✓ ${bundleName} built in ${((performance.now() - start) / 1000).toFixed(3)}s`);
    }
    catch (error) {
        console.error(typeof error === 'object' && error && 'message' in error ? error.message : error);
        console.log('\x1b[31m%s\x1b[0m', `✗ ${bundleName} failed in ${((performance.now() - start) / 1000).toFixed(3)}s`);
    }
    if (watchMode) {
        console.log('\x1b[90m%s\x1b[0m', 'r = full rebuild | Ctrl+C = exit');
    }
    setTimeout(() => {
        running = false;
    }, 200);
};
