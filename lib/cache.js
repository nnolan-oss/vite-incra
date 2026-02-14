import fs from 'node:fs';
import fg from 'fast-glob';
import path from 'node:path';
import { CACHE_NAME, SOURCE_GLOB } from './constants.js';
export function getCachePath(config) {
    const projectRoot = path.dirname(path.resolve(config.root));
    return path.join(projectRoot, CACHE_NAME);
}
export function loadCache(cachePath) {
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
export function saveCache(cachePath, rootResolved, files) {
    const dir = path.dirname(cachePath);
    if (!fs.existsSync(dir))
        fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(cachePath, JSON.stringify({ version: 1, root: rootResolved, files }, null, 0), 'utf-8');
}
export function getSourceFileMtimes(rootResolved) {
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
export function getChangedFiles(cache, current) {
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
