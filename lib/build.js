import { createRequire } from 'node:module';
import path from 'node:path';
import { state } from './state.js';
const require = createRequire(import.meta.url);
export const toDist = (...parts) => path.join(state.outDir, ...parts);
export const buildBundle = async (bundleName, config, beforeBuildCallback, watchMode = true) => {
    if (state.running)
        return;
    state.running = true;
    beforeBuildCallback?.();
    const start = performance.now();
    console.log('\x1b[90m%s\x1b[0m', `building ${bundleName}`);
    const root = path.resolve(config.root ?? process.cwd());
    try {
        // Use project's Vite (same version as npm run build) to avoid compatibility issues
        const projectVitePath = path.join(root, 'node_modules/vite');
        const vite = require(projectVitePath);
        await vite.build({ root });
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
        state.running = false;
    }, 200);
};
