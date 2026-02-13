/**
 * Loader: when "rollup" is loaded, return a wrapper that captures bundle.cache.
 * We use require to get the CJS module (mutable), patch it, and re-export.
 */
export async function load(url, context, nextLoad) {
  const realUrl = url.replace(/^file:\/\//, "");
  const isRollupMain =
    realUrl.includes("rollup") &&
    !realUrl.includes("parseAst") &&
    !realUrl.includes("loadConfigFile") &&
    !realUrl.includes("getLogFilter") &&
    !realUrl.includes("shared/") &&
    (realUrl.includes("dist/es/rollup.js") || realUrl.endsWith("rollup.js"));

  if (!isRollupMain) return nextLoad(url, context);

  const wrapper = `
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const real = require('rollup');
const orig = real.rollup;
if (orig) {
  real.rollup = async function (options) {
    const bundle = await orig(options);
    if (bundle?.cache) globalThis.__VITE_INC_ROLLUP_CACHE__ = bundle.cache;
    return bundle;
  };
}
export const rollup = real.rollup;
export const watch = real.watch;
export const defineConfig = real.defineConfig;
export const VERSION = real.VERSION;
export default real;
`;
  return { format: "module", shortCircuit: true, source: wrapper };
}
