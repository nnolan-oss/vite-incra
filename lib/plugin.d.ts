import type { Plugin } from 'vite';
import type { IncrementalBuildPluginOptions } from './types.js';
/** Vite plugin for incremental builds. Add to plugins in vite.config.ts */
export declare function incrementalBuild(options?: IncrementalBuildPluginOptions): Plugin;
