import * as vite from 'vite';
import path from 'node:path';
import { state } from './state.js';
export const toDist = (...parts) => path.join(state.outDir, ...parts);
export const buildBundle = async (bundleName, _config, beforeBuildCallback, watchMode = true) => {
    if (state.running)
        return;
    state.running = true;
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
        state.running = false;
    }, 200);
};
