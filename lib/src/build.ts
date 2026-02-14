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

  // Invalidate only the dirty set. Dependencies of dirty modules are unchanged and
  // stay in cache — Rollup will use them when re-parsing the dirty modules.
  const cacheInvalidation = useCache ? result.invalidatedModules : new Set<string>();

  return runBuild(resolved, incCacheDir, {
    useCache,
    invalidatedModules: cacheInvalidation,
  });
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
    const filePath = resolveModuleFilePath(moduleId, publicDir);
    // Virtual/unresolvable modules: use previous hash (no disk to read)
    if (!filePath) return previousHash ?? null;

    try {
      const content = await fs.readFile(filePath, "utf-8");
      return engine.hashContent(content);
    } catch {
      // Read failed (missing, permissions): use previous hash to avoid false
      // "changed" for virtual modules that slipped through (e.g. __vite-browser-external)
      return previousHash ?? null;
    }
  };
}
