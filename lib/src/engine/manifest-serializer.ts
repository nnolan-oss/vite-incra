/**
 * Manifest serialization for disk persistence.
 * Map/Set are not JSON-serializable; we convert to plain objects.
 */

import type { BuildManifest, ModuleId, ModuleRecord } from "./types.js";

export const MANIFEST_FILENAME = ".vite-incremental-manifest.json";

export interface SerializedManifest {
  version: number;
  buildTime: number;
  configHash: string;
  entries: string[];
  modules: Array<{
    id: string;
    contentHash: string;
    dependencies: string[];
    isEntry: boolean;
  }>;
}

export function serializeManifest(m: BuildManifest): SerializedManifest {
  return {
    version: m.version,
    buildTime: m.buildTime,
    configHash: m.configHash,
    entries: [...m.entries],
    modules: [...m.modules.values()].map((r) => ({
      id: r.id,
      contentHash: r.contentHash,
      dependencies: [...r.dependencies],
      isEntry: r.isEntry,
    })),
  };
}

export function deserializeManifest(s: SerializedManifest): BuildManifest {
  const modules = new Map<ModuleId, ModuleRecord>();
  for (const r of s.modules) {
    modules.set(r.id, {
      id: r.id,
      contentHash: r.contentHash,
      dependencies: r.dependencies,
      isEntry: r.isEntry,
    });
  }
  return {
    version: s.version,
    buildTime: s.buildTime,
    configHash: s.configHash,
    entries: s.entries,
    modules,
  };
}
