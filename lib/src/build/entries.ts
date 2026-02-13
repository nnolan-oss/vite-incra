/**
 * Resolve entry points from Vite config.
 * Uses same logic as Vite's default: rollupOptions.input or index.html.
 */

import * as path from "node:path";
import * as fs from "node:fs/promises";
import type { ResolvedConfig } from "vite";

export async function getEntries(config: ResolvedConfig): Promise<string[]> {
  const input = config.build?.rollupOptions?.input;
  const root = config.root;

  if (input) {
    if (typeof input === "string") {
      return [path.resolve(root, input)];
    }
    if (Array.isArray(input)) {
      return input.map((p) => path.resolve(root, p));
    }
    if (typeof input === "object") {
      return Object.values(input).map((p) => path.resolve(root, p));
    }
  }

  const indexHtml = path.join(root, "index.html");
  try {
    await fs.access(indexHtml);
    return [path.resolve(indexHtml)];
  } catch {
    return [];
  }
}
