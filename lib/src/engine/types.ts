/**
 * Incremental Build Engine - Type Definitions
 *
 * This interface defines the contract for an incremental build engine.
 * It is designed to be implementable in TypeScript (reference impl) or
 * replaceable by a Rust engine via FFI/IPC.
 *
 * WHY: Separation of concerns. The Vite plugin is thin; all incremental
 * logic lives in the engine. The engine can be swapped for a faster
 * Rust implementation without changing plugin behavior.
 */

/** Unique module identifier (resolved path) */
export type ModuleId = string;

/** Content hash for change detection. Use a fast, deterministic hash (e.g. xxhash). */
export type ContentHash = string;

/** Entry point identifier (typically same as ModuleId for entry modules) */
export type EntryId = string;

/**
 * Forward dependency: A imports B => A.dependencies includes B
 * Used to propagate invalidation: when B changes, all A that import B must rebuild.
 */
export interface ModuleRecord {
  id: ModuleId;
  contentHash: ContentHash;
  /** Direct dependency IDs (imported modules) */
  dependencies: readonly ModuleId[];
  /** Whether this module is an entry point */
  isEntry: boolean;
}

/**
 * Snapshot of the module graph after a build.
 * Persisted to disk for the next build's comparison.
 */
export interface BuildManifest {
  /** Version for future migrations */
  version: number;
  /** Build timestamp */
  buildTime: number;
  /** Config hash - invalidates entire cache when config changes */
  configHash: ContentHash;
  /** Resolved entry points */
  entries: readonly EntryId[];
  /** Module graph: id -> record */
  modules: ReadonlyMap<ModuleId, ModuleRecord>;
}

/**
 * Result of the incremental engine's decision: should we build, and why?
 */
export interface InvalidationResult {
  /** True if a full build is required */
  shouldBuild: boolean;
  /** Human-readable reason (for logging) */
  reason: string;
  /** Modules whose content actually changed (hash mismatch) */
  changedModules: ReadonlySet<ModuleId>;
  /** All modules invalidated (changed + transitive parents that import them) */
  invalidatedModules: ReadonlySet<ModuleId>;
  /** Entries that transitively depend on invalidated modules */
  affectedEntries: ReadonlySet<EntryId>;
}

/**
 * Input to compute current state and compare with manifest.
 */
export interface BuildContext {
  /** Resolved entry point IDs */
  entries: readonly EntryId[];
  /** Root directory for resolving paths */
  root: string;
  /** Optional config hash (used to invalidate on config change) */
  configHash?: ContentHash;
}

/**
 * Incremental Engine Interface
 *
 * This is the boundary where a Rust engine can be plugged in.
 * Implementation can be:
 * - TypeScript (default): synchronous, file-based
 * - Rust via FFI: call into native module with same input/output
 * - Rust via IPC: spawn subprocess, send JSON, receive JSON
 */
export interface IncrementalEngine {
  /**
   * Load the previous build manifest from disk.
   * Returns null if no previous build or manifest is corrupted.
   */
  loadManifest(cacheDir: string): Promise<BuildManifest | null>;

  /**
   * Persist the manifest after a successful build.
   */
  saveManifest(cacheDir: string, manifest: BuildManifest): Promise<void>;

  /**
   * Compute content hash for a file.
   * Must be deterministic: same content => same hash.
   */
  hashContent(content: string | Buffer): ContentHash;

  /**
   * Determine if a build is needed by comparing current state to manifest.
   * Correct invalidation: when M changes, invalidate M and all modules that
   * import M (transitively up to entries).
   *
   * getCurrentHash: returns current content hash for a module id, or null if
   * the file cannot be read (deleted, etc.) — which invalidates that module.
   */
  computeInvalidation(
    manifest: BuildManifest | null,
    getCurrentHash: (moduleId: ModuleId) => Promise<ContentHash | null>,
    ctx: BuildContext
  ): Promise<InvalidationResult>;
}
