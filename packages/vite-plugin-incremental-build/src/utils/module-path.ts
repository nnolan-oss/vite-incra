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
 * Resolve module ID to file path on disk.
 * - Virtual (\0...): returns empty (cannot read)
 * - Root-relative (/x): publicDir + slice
 * - Else: use as-is
 */
export function resolveModuleFilePath(
  moduleId: string,
  publicDir: string
): string | null {
  if (moduleId.startsWith("\0")) return null;
  if (isRootRelativeModuleId(moduleId)) {
    return path.join(publicDir, moduleId.slice(1));
  }
  return moduleId;
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
    if (id.startsWith("\0") || id === "invalid") continue;
    const p = isRootRelativeModuleId(id) && publicDir
      ? path.join(publicDir, id.slice(1))
      : id;
    result.push(path.isAbsolute(p) ? path.relative(root, p) : p);
  }
  return result;
}
