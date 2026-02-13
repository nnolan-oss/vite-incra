/**
 * Rollup cache persistence using Node's v8.serialize.
 * RollupCache contains ASTs and circular refs - JSON.stringify fails.
 * v8.serialize handles arbitrary JS objects.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as v8 from "node:v8";

const CACHE_FILENAME = ".rollup-cache.bin";

export async function loadRollupCache(cacheDir: string): Promise<unknown | null> {
  const filePath = path.join(cacheDir, CACHE_FILENAME);
  try {
    const buf = await fs.readFile(filePath);
    return v8.deserialize(buf);
  } catch {
    return null;
  }
}

export async function saveRollupCache(
  cacheDir: string,
  cache: unknown
): Promise<void> {
  if (!cache) return;
  await fs.mkdir(cacheDir, { recursive: true });
  const filePath = path.join(cacheDir, CACHE_FILENAME);
  const buf = v8.serialize(cache);
  await fs.writeFile(filePath, buf);
}
