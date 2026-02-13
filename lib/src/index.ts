/**
 * vite-incra
 *
 * Correct incremental build for Vite. Requirements:
 * - Content hashing (never mtime)
 * - Explicit dependency graph (module → imported modules)
 * - Dirty set = changed ∪ transitive importers (never single-file rebuild)
 * - Never mutate rollupOptions.input; never patch output files
 *
 * See ARCHITECTURE.md for the algorithm and rejected approaches.
 */

export { viteIncraPlugin } from "./plugin.js";
export type { ViteIncraPluginOptions } from "./plugin.js";
export { incrementalBuild } from "./build.js";
export type { IncrementalBuildOptions } from "./build.js";
export type {
  IncrementalEngine,
  BuildManifest,
  BuildContext,
  InvalidationResult,
  ModuleRecord,
} from "./engine/types.js";
