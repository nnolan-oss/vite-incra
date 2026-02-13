/**
 * Read module content from disk for hashing.
 * Virtual modules (\0...) return empty string.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { resolveModuleFilePath } from "./module-path.js";

export async function readModuleContent(
  rootDir: string,
  publicDir: string,
  moduleId: string
): Promise<string> {
  const filePath = resolveModuleFilePath(
    moduleId,
    publicDir || path.join(rootDir, "public")
  );
  if (!filePath) return "";
  try {
    return await fs.readFile(filePath, "utf-8");
  } catch {
    return "";
  }
}
