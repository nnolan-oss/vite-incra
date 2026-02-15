import type { UserConfig } from 'vite'
import type { Plugin } from 'vite'
import chokidar from 'chokidar'
import fs from 'node:fs'
import path from 'node:path'
import readline from 'node:readline'
import { ENV_MODIFIED_FILE } from './constants.js'
import { state } from './state.js'
import { buildBundle } from './build.js'
import { resolveForPartialBuild } from './resolve.js'
import { loadCache, saveCache, getSourceFileMtimes, getChangedFiles } from './cache.js'
import { patchConfig } from './config.js'

export function startIncrementalBuild({
	config,
	bundleName = 'bundle',
	watcherIgnoredFiles,
	watcherUsePolling = true,
	beforeBuildCallback,
	watch = true,
	cachePath,
}: {
	config: UserConfig
	bundleName?: string
	watcherIgnoredFiles?: (string | RegExp)[]
	watcherUsePolling?: boolean
	beforeBuildCallback?: () => void
	watch?: boolean
	cachePath?: string
}) {
	// Config should already be patched when loaded via resolveConfig (plugin's config hook runs)
	// If called with raw config, patch it
	const plugins = config.plugins as Plugin[] | undefined
	if (!plugins?.some((p) => p && typeof p === 'object' && p.name === 'viteIncrementalBuild')) {
		patchConfig(config, { ignoreWarnings: true })
	}
	state.buildFn = () => {
		void buildBundle(bundleName, config, beforeBuildCallback, watch)
	}
	const rootResolved = path.resolve(config.root!)
	if (!rootResolved) {
		throw new Error('viteIncrementalBuild requires config.root')
	}
	const defaultIgnored: (string | RegExp)[] = [
		/(^|[\\/])\../,
		'**/node_modules',
		'**/dist',
		'**/.git',
	]
	const ignoredPatterns = watcherIgnoredFiles ?? defaultIgnored

	if (watch) {
		// Watch only source dirs to avoid EMFILE (node_modules can have thousands of files/symlinks)
		const srcDir = path.join(rootResolved, 'src')
		const publicDir = path.join(rootResolved, 'public')
		const indexHtml = path.join(rootResolved, 'index.html')
		const watchPaths: string[] = []
		if (fs.existsSync(srcDir)) watchPaths.push(srcDir)
		if (fs.existsSync(publicDir)) watchPaths.push(publicDir)
		if (fs.existsSync(indexHtml)) watchPaths.push(indexHtml)
		const watchTargets = watchPaths.length > 0 ? watchPaths : [rootResolved]

		const ignored = (p: string) => {
			const n = p.replace(/\\/g, '/')
			if (n.includes('/node_modules') || n.includes('/dist') || n.includes('/.git') || /\/(\.[^/]+|\.\.)/.test(n))
				return true
			for (const pat of ignoredPatterns) {
				if (typeof pat === 'string') {
					const s = pat.replace(/^\*\*\/?|\/\*\*$/g, '')
					if (s && (n.includes(s) || n.includes(s.replace(/^\//, '')))) return true
				} else if (pat instanceof RegExp && pat.test(p)) return true
			}
			return false
		}
		const watcher = chokidar.watch(watchTargets, {
			persistent: true,
			ignored,
			followSymlinks: false,
			usePolling: watcherUsePolling, // avoids EMFILE on macOS; set false if you have high ulimit
		})
		watcher
			.on('add', state.buildFn)
			.on('unlink', state.buildFn)
			.on('unlinkDir', state.buildFn)
			.on('change', (file: string) => {
				const changedFile = path.relative(rootResolved, path.resolve(file)).replace(/\\/g, '/')
				const entryForBuild = resolveForPartialBuild(changedFile, rootResolved)
				if (entryForBuild) {
					state.watcherModifiedFile = entryForBuild
					process.env[ENV_MODIFIED_FILE] = entryForBuild
					const msg = entryForBuild !== changedFile
						? `partial build: ${changedFile} → ${entryForBuild}`
						: `partial build: ${changedFile}`
					console.log('\x1b[90m%s\x1b[0m', msg)
				} else {
					state.watcherModifiedFile = null
					delete process.env[ENV_MODIFIED_FILE]
					console.log('\x1b[33m%s\x1b[0m', `full build: ${changedFile} (not a partial entry)`)
				}
				void buildBundle(bundleName, config, beforeBuildCallback, true).then(() => {
					state.watcherModifiedFile = null
					delete process.env[ENV_MODIFIED_FILE]
				})
			})
		if (process.stdin.isTTY) {
			readline.emitKeypressEvents(process.stdin)
			process.stdin.on('keypress', (_, key) => {
				if (key && key.ctrl && key.name == 'c') process.exit(0)
				if (key && key.name == 'r') state.buildFn()
			})
			process.stdin.setRawMode(true)
			process.stdin.resume()
		}
		// Initial build on startup
		state.buildFn()
	} else {
		// No watch: use cache to detect changes, build once, save cache, exit
		const cache = cachePath ? loadCache(cachePath) : null
		const current = getSourceFileMtimes(rootResolved)
		const changed = getChangedFiles(cache, current)
		const shouldBuild = !cache || changed.length > 0

		if (!shouldBuild) {
			console.log('\x1b[90m%s\x1b[0m', 'No changes detected, skipping build')
			return
		}

		state.watcherModifiedFile =
			changed.length === 1 ? resolveForPartialBuild(changed[0], rootResolved) : null
		if (state.watcherModifiedFile) {
			process.env[ENV_MODIFIED_FILE] = state.watcherModifiedFile
			console.log(
				'\x1b[90m%s\x1b[0m',
				changed[0] !== state.watcherModifiedFile
					? `partial build: ${changed[0]} → ${state.watcherModifiedFile}`
					: `partial build: ${state.watcherModifiedFile}`
			)
		} else {
			delete process.env[ENV_MODIFIED_FILE]
			if (changed.length > 0) {
				console.log('\x1b[90m%s\x1b[0m', `full build: ${changed.length} file(s) changed`)
			}
		}
		void buildBundle(bundleName, config, beforeBuildCallback, false).then(() => {
			delete process.env[ENV_MODIFIED_FILE]
			if (cachePath) saveCache(cachePath, rootResolved, current)
			process.exit(0)
		})
	}
}
