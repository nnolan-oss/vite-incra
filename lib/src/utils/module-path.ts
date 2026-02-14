/**
 * Module path utilities for resolving and normalizing module IDs.
 */

import * as path from "node:path";

/**
 * Root-relative URL: /vite.svg, /assets/logo.png.
 * Excludes: //..., /Users/..., /home/...
 */
export function isRootRelativeModuleId(moduleId: string): boolean {
  return (
    moduleId.startsWith("/") &&
    !moduleId.startsWith("//") &&
    !moduleId.startsWith("/Users") &&
    !moduleId.startsWith("/home")
  );
}

/**
 * Returns true if the module ID is virtual/generated (cannot be read from disk).
 */
export function isVirtualModuleId(moduleId: string): boolean {
  return (
    moduleId.startsWith("\0") ||
    moduleId.startsWith("__vite") ||
    moduleId.startsWith("node:")
  );
}

/**
 * Strip query string and hash fragment from module ID for file resolution.
 * Vite/Rollup append these (e.g. file.css?used, file.css?direct) — the actual
 * file on disk has no query, so we must strip it to read content.
 */
export function stripModuleIdQuery(moduleId: string): string {
  return moduleId.split("?")[0].split("#")[0];
}

/**
 * Resolve module ID to file path on disk.
 * - Virtual (\0..., __vite*, node:): returns null (cannot read)
 * - Root-relative (/x): publicDir + slice
 * - Query strings (?used, ?direct) stripped so we can read the real file
 * - Else: use as-is
 */
export function resolveModuleFilePath(
  moduleId: string,
  publicDir: string
): string | null {
  if (isVirtualModuleId(moduleId)) return null;
  const cleanId = stripModuleIdQuery(moduleId);
  if (isRootRelativeModuleId(cleanId)) {
    return path.join(publicDir, cleanId.slice(1));
  }
  return cleanId;
}

/**
 * Convert module ID to path relative to project root (for display).
 * Filters virtual modules and "invalid".
 */
export function moduleIdsToRelativePaths(
  moduleIds: Iterable<string>,
  root: string,
  publicDir: string
): string[] {
  const result: string[] = [];
  for (const id of moduleIds) {
    if (isVirtualModuleId(id) || id === "invalid") continue;
    const p = isRootRelativeModuleId(id) && publicDir
      ? path.join(publicDir, id.slice(1))
      : id;
    result.push(path.isAbsolute(p) ? path.relative(root, p) : p);
  }
  return result;
}
