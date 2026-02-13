/**
 * Run this with: node --import=./register.mjs your-script.mjs
 * Registers the Rollup loader before any other code runs.
 */
import { pathToFileURL } from "node:url";
import { register } from "node:module";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
register(pathToFileURL(`${__dirname}/rollup-loader-internal.mjs`));
