#!/usr/bin/env node
/**
 * Incremental build CLI. Reads config from vite.config.* via plugin options.
 * Run: vite-incra
 *
 * Must register rollup loader before any imports that load rollup.
 */
import "../register.mjs";

import { resolveConfig } from "vite";
import { incrementalBuild } from "../dist/index.js";

const root = process.cwd();
const configFile = process.argv.find((a) => a.startsWith("--config="))?.slice(9);
const force = process.argv.includes("--force");

const inlineConfig = { root, configFile: configFile || undefined };
const resolved = await resolveConfig(inlineConfig, "build", "production", "production");
const plugins = resolved.plugins.filter(Boolean);
const incPlugin = plugins.find(
  (p) => p && typeof p === "object" && p.name === "vite-incra"
);

const options = incPlugin?.__incBuildOptions ?? {};
const result = await incrementalBuild({
  root,
  configFile: resolved.configFile,
  force: force || options.force,
  onSkip: options.onSkip,
  onChanged: options.onChanged,
  onDirtySet: options.onDirtySet,
});

if (result?.skipped) {
  console.log("Output unchanged. dist/ is up to date.");
} else {
  console.log("Build completed.");
}
