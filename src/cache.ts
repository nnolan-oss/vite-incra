import type { UserConfig } from 'vite'
import fs from 'node:fs'
import fg from 'fast-glob'
import path from 'node:path'
import { CACHE_NAME, SOURCE_GLOB } from './constants.js'
import type { CacheData } from './types.js'

export function getCachePath(config: UserConfig): string {
	const projectRoot = path.dirname(path.resolve(config.root!))
	return path.join(projectRoot, CACHE_NAME)
}

export function loadCache(cachePath: string): CacheData | null {
	try {
		if (!fs.existsSync(cachePath)) return null
		const data = JSON.parse(fs.readFileSync(cachePath, 'utf-8')) as CacheData
		return data.version === 1 ? data : null
	} catch {
		return null
	}
}

export function saveCache(cachePath: string, rootResolved: string, files: Record<string, number>): void {
	const dir = path.dirname(cachePath)
	if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
	fs.writeFileSync(
		cachePath,
		JSON.stringify({ version: 1, root: rootResolved, files } as CacheData, null, 0),
		'utf-8'
	)
}

export function getSourceFileMtimes(rootResolved: string): Record<string, number> {
	const files: Record<string, number> = {}
	const matches = fg.sync(SOURCE_GLOB, {
		cwd: rootResolved,
		absolute: true,
		ignore: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/.*', '**/.*/**'],
	})
	for (const file of matches) {
		try {
			const stat = fs.statSync(file)
			const rel = path.relative(rootResolved, file).replace(/\\/g, '/')
			files[rel] = stat.mtimeMs
		} catch {
			// skip
		}
	}
	return files
}

export function getChangedFiles(cache: CacheData | null, current: Record<string, number>): string[] {
	if (!cache) return [] // no cache = treat as "all new", caller does full build
	const changed: string[] = []
	for (const [rel, mtime] of Object.entries(current)) {
		if (cache.files[rel] !== mtime) changed.push(rel)
	}
	for (const rel of Object.keys(cache.files)) {
		if (!(rel in current)) changed.push(rel) // deleted
	}
	return changed
}
