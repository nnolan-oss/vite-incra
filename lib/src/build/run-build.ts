/**
 * Execute Vite build with Rollup cache injection and capture.
 */

import { build as viteBuild, type ResolvedConfig } from "vite";
import { loadRollupCache, saveRollupCache } from "../rollup-cache.js";

declare global {
  var __VITE_INC_ROLLUP_CACHE__: unknown;
}

export interface RunBuildOptions {
  /** Use saved Rollup cache. False when dist deleted or --force. */
  useCache?: boolean;
  /** Module IDs to invalidate (remove from cache so Rollup re-transforms them). */
  invalidatedModules?: ReadonlySet<string>;
}

export async function runBuild(
  resolved: ResolvedConfig,
  incCacheDir?: string,
  options: RunBuildOptions = {},
): Promise<unknown> {
  const { useCache = true, invalidatedModules } = options;

  let rollupCache =
    useCache && incCacheDir ? await loadRollupCache(incCacheDir) : null;

  const cache = rollupCache as {
    modules?: Array<{ id?: string }>;
    plugins?: unknown;
  } | null;

  // Remove invalidated modules so Rollup re-transforms them.
  // We pass expanded set (incl. transitive deps) so CSS/assets are re-processed.
  if (
    rollupCache &&
    Array.isArray(cache?.modules) &&
    cache.modules.length > 0 &&
    invalidatedModules?.size
  ) {
    rollupCache = {
      ...cache,
      modules: cache.modules.filter(
        (m) => m?.id && !invalidatedModules!.has(m.id),
      ),
      // Preserve plugins cache so Rollup doesn't re-run plugin transforms on cached modules
      plugins: (cache as { plugins?: unknown }).plugins,
    };
  }

  const cacheToUse =
    rollupCache ??
    (incCacheDir ? {} : undefined) ??
    resolved.build?.rollupOptions?.cache;

  (globalThis as typeof global).__VITE_INC_CACHE_TO_INJECT = cacheToUse as
    | import("rollup").RollupCache
    | undefined;

  try {
    const result = await viteBuild({ root: resolved.root });
    if (incCacheDir) {
      const captured = (globalThis as typeof global).__VITE_INC_ROLLUP_CACHE__;
      if (captured) {
        try {
          await saveRollupCache(incCacheDir, captured);
        } catch (e) {
          console.warn("[vite-inc] Failed to save Rollup cache:", e);
        }
        (globalThis as typeof global).__VITE_INC_ROLLUP_CACHE__ = undefined;
      }
    }
    return result;
  } finally {
    (globalThis as typeof global).__VITE_INC_CACHE_TO_INJECT = undefined;
  }
}
