/**
 * Dirty Set Computation
 *
 * INCREMENTAL BUILD = rebuild changed file AND all modules that depend on it.
 * We NEVER rebuild only the changed file in isolation.
 *
 * DIRTY SET = CHANGED ∪ { all modules that transitively import any changed module }
 *
 * WHY: When module B changes, module A (which imports B) may produce different
 * output. We must invalidate A. If C imports A, C may also change → invalidate C.
 * We walk UP the graph (from deps to importers) via BFS.
 *
 * REJECTED: Rebuilding only the changed file → incorrect (parents need rebuild).
 * REJECTED: Filename-based dependency tracking → misses dynamic imports, require().
 */

import type { BuildManifest, ModuleId } from "./types.js";

/**
 * Build reverse dependency map: for each module M, who imports M?
 *
 * Forward graph: A.dependencies = [B, C] means A imports B and C.
 * Reverse graph: importers(B) = {A} means A imports B.
 *
 * WHY: Invalidation propagates from changed deps to their importers (parents).
 */
export function buildReverseDeps(
  manifest: BuildManifest
): Map<ModuleId, Set<ModuleId>> {
  const reverse = new Map<ModuleId, Set<ModuleId>>();
  for (const record of manifest.modules.values()) {
    for (const depId of record.dependencies) {
      const importers = reverse.get(depId) ?? new Set();
      importers.add(record.id);
      reverse.set(depId, importers);
    }
  }
  return reverse;
}

/**
 * Compute the full dirty set (invalidated modules).
 *
 * @param changed - Modules whose content hash changed or file is missing
 * @param reverseDeps - Map: module → set of modules that import it
 * @returns Dirty set = changed ∪ all transitive importers
 */
export function computeDirtySet(
  changed: Set<ModuleId>,
  reverseDeps: Map<ModuleId, Set<ModuleId>>
): Set<ModuleId> {
  const invalidated = new Set<ModuleId>(changed);
  const queue = [...changed];
  const seen = new Set(changed);

  while (queue.length > 0) {
    const id = queue.shift()!;
    const importers = reverseDeps.get(id) ?? new Set();
    for (const importer of importers) {
      if (!seen.has(importer)) {
        seen.add(importer);
        invalidated.add(importer);
        queue.push(importer);
      }
    }
  }
  return invalidated;
}
