import type { Plugin } from "vite";
import type { ModuleInfo } from "rollup";
import * as path from "node:path";
import type { BuildManifest, ModuleRecord, IncrementalEngine } from "./engine/types.js";
import { IncrementalEngineImpl } from "./engine/impl.js";
import { readModuleContent } from "./utils/read-module-content.js";

const PLUGIN_NAME = "vite-incra";

/** Set by run-build before viteBuild(); plugin injects into rollupOptions.cache */
declare global {
  var __VITE_INC_CACHE_TO_INJECT: import("rollup").RollupCache | undefined;
}

export interface ViteIncraPluginOptions {
  /** Custom engine (for Rust bridge); default is TS impl */
  engine?: IncrementalEngine;
  /** Subdir inside Vite cacheDir for our manifest; default "incremental" */
  cacheSubdir?: string;
  /** Called when build is skipped */
  onSkip?: (reason: string) => void;
  /** Called before build with changed file paths */
  onChanged?: (changedFiles: string[]) => void;
  /** Called before build: dirtyCount, totalCount, dirtyModules */
  onDirtySet?: (
    dirtyCount: number,
    totalCount: number,
    dirtyModules: string[]
  ) => void;
  /** Force build (ignore cache) */
  force?: boolean;
}

/**
 * Creates the incremental build plugin.
 *
 * WHY this structure: The plugin collects module graph and manifest only.
 * It does not decide whether to skip the build—that's the wrapper's job.
 */
export function viteIncraPlugin(
  options: ViteIncraPluginOptions = {}
): Plugin {
  const engine = options.engine ?? new IncrementalEngineImpl();
  const cacheSubdir = options.cacheSubdir ?? "incremental";

  let root: string = "";
  let publicDir: string = "";
  let cacheDir: string = "";
  let manifest: BuildManifest | null = null;

  const moduleRecords = new Map<string, ModuleRecord>();

  const plugin: Plugin & { __incBuildOptions?: ViteIncraPluginOptions } = {
    name: PLUGIN_NAME,
    enforce: "post", // Run after other plugins so we see the full graph

    config(config, { command }) {
      if (command === "build") {
        const c = (globalThis as typeof globalThis & { __VITE_INC_CACHE_TO_INJECT?: unknown }).__VITE_INC_CACHE_TO_INJECT;
        if (c) {
          const build = config.build ?? {};
          const rollupOptions = build.rollupOptions ?? {};
          return {
            build: {
              ...build,
              rollupOptions: { ...rollupOptions, cache: c as import("rollup").RollupCache },
            },
          };
        }
      }
    },

    configResolved(config) {
      root = config.root;
      publicDir = config.publicDir ?? path.join(root, "public");
      cacheDir = path.join(config.cacheDir ?? path.join(root, "node_modules/.vite"), cacheSubdir);
    },

    /**
     * Rollup's moduleParsed: authoritative dependency graph.
     * WHY not parse files ourselves: Manual parsing misses dynamic imports,
     * require(), plugin-resolved paths, virtual modules. Rollup has resolved all.
     */
    moduleParsed(info: ModuleInfo) {
      if (info.isExternal) return;
      const id = info.id;
      const dependencies = [...info.importedIds];
      const record: ModuleRecord = {
        id,
        contentHash: "", // Filled in buildEnd when we have all modules
        dependencies,
        isEntry: info.isEntry,
      };
      moduleRecords.set(id, record);
    },

    async buildEnd() {
      if (moduleRecords.size === 0) return;

      const entries: string[] = [];
      for (const r of moduleRecords.values()) {
        if (r.isEntry) entries.push(r.id);
      }

      // Content hash per module (buildEnd: all modules collected; virtual handled)
      for (const record of moduleRecords.values()) {
        const content = await readModuleContent(root, publicDir, record.id);
        record.contentHash = engine.hashContent(content);
      }

      const configHash = "default";
      manifest = {
        version: 1,
        buildTime: Date.now(),
        configHash,
        entries,
        modules: new Map(moduleRecords),
      };

      await engine.saveManifest(cacheDir, manifest);
      moduleRecords.clear();
    },
  };
  plugin.__incBuildOptions = options;
  return plugin;
}
