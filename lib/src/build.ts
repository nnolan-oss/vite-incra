/**
 * Incremental Build Wrapper
 *
 * DESIGN: Dirty-set-first. We compute DIRTY_SET = changed + transitive importers.
 * - If clean: skip build entirely
 * - If dirty: run build with Rollup cache — only dirty set is re-parsed
 *
 * WHY wrapper: Plugin hooks run during build. We must check BEFORE vite.build().
 */

import { resolveConfig, type InlineConfig } from "vite";
import * as path from "node:path";
import * as fs from "node:fs/promises";
import { IncrementalEngineImpl } from "./engine/impl.js";
import { getEntries } from "./build/entries.js";
import { runBuild } from "./build/run-build.js";
import type { BuildManifest, IncrementalEngine } from "./engine/types.js";
import {
  moduleIdsToRelativePaths,
  resolveModuleFilePath,
} from "./utils/module-path.js";

export interface IncrementalBuildOptions extends InlineConfig {
  force?: boolean;
  engine?: IncrementalEngine;
  onSkip?: (reason: string) => void;
  onChanged?: (changedFiles: string[]) => void;
  onDirtySet?: (
    dirtyCount: number,
    totalCount: number,
    dirtyModules: string[]
  ) => void;
}

/**
 * Run an incremental build. Skips when no module content has changed.
 */
export async function incrementalBuild(
  config: IncrementalBuildOptions = {}
): Promise<unknown> {
  const { force = false, engine, onSkip, onChanged, onDirtySet, ...viteConfig } =
    config;
  const incEngine = engine ?? new IncrementalEngineImpl();

  const resolved = await resolveConfig(viteConfig, "build", "production", "production");
  const root = resolved.root;
  const publicDir = resolved.publicDir ?? path.join(root, "public");
  const incCacheDir = path.join(
    resolved.cacheDir ?? path.join(root, "node_modules/.vite"),
    "incremental"
  );

  if (force) {
    return runBuild(resolved, incCacheDir, { useCache: false });
  }

  // If output dir missing or empty, must rebuild (don't use stale Rollup cache)
  const outDir = path.join(root, resolved.build?.outDir ?? "dist");
  if (!(await outputDirValid(outDir))) {
    return runBuild(resolved, incCacheDir, { useCache: false });
  }

  const manifest = await incEngine.loadManifest(incCacheDir);
  const entries = await getEntries(resolved);

  if (entries.length === 0) {
    return runBuild(resolved, incCacheDir);
  }

  if (!manifest) {
    return runBuild(resolved, incCacheDir, { useCache: false });
  }

  const getCurrentHash = createHashResolver(
    manifest,
    publicDir,
    incEngine
  );

  const result = await incEngine.computeInvalidation(
    manifest,
    getCurrentHash,
    { entries, root, configHash: "default" }
  );

  if (!result.shouldBuild) {
    onSkip?.(result.reason);
    return { skipped: true, reason: result.reason };
  }

  const toRelative = (ids: Iterable<string>) =>
    moduleIdsToRelativePaths(ids, root, publicDir);

  onChanged?.(toRelative(result.changedModules));
  onDirtySet?.(
    result.invalidatedModules.size,
    manifest?.modules.size ?? 0,
    toRelative(result.invalidatedModules)
  );

  // Cache unusable when manifest/entries/config changed — cache is from different build.
  const fullRebuildReasons = [
    "No previous build manifest",
    "Config hash changed",
    "Entry points changed",
  ];
  const useCache = !fullRebuildReasons.includes(result.reason);

  // Invalidate dirty set + deps. When an ENTRY (e.g. index.html) is dirty, we must
  // expand transitively from it — otherwise CSS/assets stay cached and won't emit.
  const cacheInvalidation = useCache
    ? expandForCacheInvalidation(result.invalidatedModules, manifest)
    : new Set<string>();

  return runBuild(resolved, incCacheDir, {
    useCache,
    invalidatedModules: cacheInvalidation,
  });
}

/** Max depth when expanding from dirty entry. 3 = index.html→main→App→App.css. */
const ENTRY_EXPAND_MAX_DEPTH = 3;

/**
 * Expand invalidated set for cache filtering.
 * - Normal modules: dirty set + direct deps (1 level).
 * - When an ENTRY is dirty: expand up to ENTRY_EXPAND_MAX_DEPTH levels so
 *   CSS/assets are re-processed without full 39-module rebuild.
 */
function expandForCacheInvalidation(
  dirtySet: ReadonlySet<string>,
  manifest: BuildManifest
): Set<string> {
  const out = new Set(dirtySet);
  const entryIds = new Set(manifest.entries);

  const hasDirtyEntry = [...dirtySet].some((id) => entryIds.has(id));
  if (hasDirtyEntry) {
    for (const id of dirtySet) {
      if (!entryIds.has(id)) continue;
      let layer = [...(manifest.modules.get(id)?.dependencies ?? [])];
      for (let depth = 0; depth < ENTRY_EXPAND_MAX_DEPTH && layer.length > 0; depth++) {
        const next: string[] = [];
        for (const depId of layer) {
          out.add(depId);
          const record = manifest.modules.get(depId);
          if (record?.dependencies) {
            for (const d of record.dependencies) next.push(d);
          }
        }
        layer = next;
      }
    }
  } else {
    for (const id of dirtySet) {
      const record = manifest.modules.get(id);
      if (record?.dependencies) {
        for (const depId of record.dependencies) out.add(depId);
      }
    }
  }
  return out;
}

/**
 * Check if output dir exists and has build output (not empty).
 * Handles: dist deleted, dist emptied (rm -rf dist/*).
 */
async function outputDirValid(outDir: string): Promise<boolean> {
  try {
    await fs.access(outDir);
  } catch {
    return false;
  }
  const entries = await fs.readdir(outDir, { withFileTypes: true }).catch(() => []);
  if (entries.length === 0) return false;
  return true;
}

/**
 * Returns a function that resolves current content hash for a module.
 * Virtual modules (\0...): use previous hash or null.
 * Real files: read from disk, hash, or null on error.
 */
function createHashResolver(
  manifest: BuildManifest | null,
  publicDir: string,
  engine: IncrementalEngine
) {
  return async (moduleId: string): Promise<string | null> => {
    const previousHash = manifest?.modules.get(moduleId)?.contentHash;
    if (moduleId.startsWith("\0")) return previousHash ?? null;

    const filePath = resolveModuleFilePath(moduleId, publicDir);
    if (!filePath) return null;

    try {
      const content = await fs.readFile(filePath, "utf-8");
      return engine.hashContent(content);
    } catch {
      return null;
    }
  };
}
