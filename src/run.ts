import type { UserConfig } from 'vite'
import * as vite from 'vite'
import fs from 'node:fs'
import path from 'node:path'
import { getCachePath, loadCache } from './cache.js'
import { startIncrementalBuild } from './watcher.js'
import { state } from './state.js'
import type { IncrementalBuildPluginOptions } from './types.js'

/** Run incremental build (watcher + build loop). Use via `vite-incra` CLI or call directly. */
export async function runIncrementalBuild(
	config?: vite.ResolvedConfig | UserConfig,
	options?: IncrementalBuildPluginOptions
): Promise<void> {
	const resolvedConfig: UserConfig =
		config && typeof config === 'object' && 'root' in config
			? (config as UserConfig)
			: (await vite.resolveConfig({}, 'build', 'production', 'production')) as unknown as UserConfig

	// Options must be read AFTER resolveConfig - plugin sets storedPluginOptions when config loads
	const opts = options ?? state.storedPluginOptions
	const watchMode = opts.watch !== false
	const cachePath = getCachePath(resolvedConfig)
	const hasCache = loadCache(cachePath) !== null

	if (opts.cleanBeforeFirstBuild !== false) {
		const root = resolvedConfig.root ?? process.cwd()
		const outDirPath = resolvedConfig.build?.outDir ?? 'dist'
		const distPath = path.resolve(path.resolve(root), outDirPath)
		if (watchMode || !hasCache) {
			if (fs.existsSync(distPath)) fs.rmSync(distPath, { recursive: true, force: true })
		}
	}

	const defaultIgnored: (string | RegExp)[] = [
		/(^|[\\/])\../, // dotfiles
		'**/node_modules',
		'**/dist',
		'**/.git',
	]
	startIncrementalBuild({
		config: resolvedConfig,
		bundleName: opts.bundleName ?? 'bundle',
		watcherIgnoredFiles: opts.watcherIgnoredFiles ?? defaultIgnored,
		watcherUsePolling: opts.watcherUsePolling ?? true,
		beforeBuildCallback: opts.beforeBuildCallback,
		watch: watchMode,
		cachePath,
	})
}
