/**
 * Incremental Engine - TypeScript Implementation
 *
 * Implements IncrementalEngine: hashing, manifest I/O, invalidation.
 * Plugin collects graph; engine computes what to rebuild.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as crypto from "node:crypto";
import { buildReverseDeps, computeDirtySet } from "./dirty-set.js";
import {
  MANIFEST_FILENAME,
  serializeManifest,
  deserializeManifest,
  type SerializedManifest,
} from "./manifest-serializer.js";
import type {
  BuildManifest,
  BuildContext,
  InvalidationResult,
  IncrementalEngine,
  ModuleId,
  ContentHash,
} from "./types.js";

/**
 * Content hash: SHA-256. Deterministic. Same bytes → same hash.
 * WHY not mtime: mtime changes without content change (touch, git checkout, copy).
 */
function hashContent(content: string | Buffer): ContentHash {
  const data = typeof content === "string" ? Buffer.from(content, "utf-8") : content;
  return crypto.createHash("sha256").update(data).digest("hex");
}

export class IncrementalEngineImpl implements IncrementalEngine {
  hashContent(content: string | Buffer): ContentHash {
    return hashContent(content);
  }

  async loadManifest(cacheDir: string): Promise<BuildManifest | null> {
    const filePath = path.join(cacheDir, MANIFEST_FILENAME);
    try {
      const raw = await fs.readFile(filePath, "utf-8");
      const parsed = JSON.parse(raw) as SerializedManifest;
      return deserializeManifest(parsed);
    } catch {
      return null;
    }
  }

  async saveManifest(cacheDir: string, manifest: BuildManifest): Promise<void> {
    await fs.mkdir(cacheDir, { recursive: true });
    const filePath = path.join(cacheDir, MANIFEST_FILENAME);
    const serialized = serializeManifest(manifest);
    await fs.writeFile(filePath, JSON.stringify(serialized, null, 0), "utf-8");
  }

  async computeInvalidation(
    manifest: BuildManifest | null,
    getCurrentHash: (moduleId: ModuleId) => Promise<ContentHash | null>,
    ctx: BuildContext
  ): Promise<InvalidationResult> {
    if (!manifest) {
      return {
        shouldBuild: true,
        reason: "No previous build manifest",
        changedModules: new Set(),
        invalidatedModules: new Set(),
        affectedEntries: new Set(),
      };
    }

    if (ctx.configHash && manifest.configHash !== ctx.configHash) {
      return {
        shouldBuild: true,
        reason: "Config hash changed",
        changedModules: new Set(),
        invalidatedModules: new Set(),
        affectedEntries: new Set(ctx.entries),
      };
    }

    const entriesSet = new Set(ctx.entries);
    const manifestEntriesSet = new Set(manifest.entries);
    if (
      manifestEntriesSet.size !== entriesSet.size ||
      [...entriesSet].some((e) => !manifestEntriesSet.has(e))
    ) {
      return {
        shouldBuild: true,
        reason: "Entry points changed",
        changedModules: new Set(),
        invalidatedModules: new Set(),
        affectedEntries: new Set(ctx.entries),
      };
    }

    // Collect CHANGED = modules whose hash changed or file is missing
    const changed = new Set<ModuleId>();
    for (const [id, record] of manifest.modules) {
      const currentHash = await getCurrentHash(id);
      if (currentHash === null) {
        changed.add(id);
        continue;
      }
      if (currentHash !== record.contentHash) {
        changed.add(id);
      }
    }

    if (changed.size === 0) {
      return {
        shouldBuild: false,
        reason: "All module hashes match previous build",
        changedModules: new Set(),
        invalidatedModules: new Set(),
        affectedEntries: new Set(),
      };
    }

    // DIRTY SET: changed ∪ all transitive importers (see dirty-set.ts)
    const reverseDeps = buildReverseDeps(manifest);
    const invalidated = computeDirtySet(changed, reverseDeps);

    const affectedEntries = new Set<ModuleId>();
    for (const id of invalidated) {
      if (entriesSet.has(id)) affectedEntries.add(id);
    }

    return {
      shouldBuild: true,
      reason: `${invalidated.size} module(s) invalidated (${changed.size} content change(s))`,
      changedModules: changed,
      invalidatedModules: invalidated,
      affectedEntries,
    };
  }
}
