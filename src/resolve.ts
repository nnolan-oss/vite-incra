import fs from 'node:fs'
import fg from 'fast-glob'
import path from 'node:path'
import { CONFIG_FILE, CSS_EXT, PARTIAL_BUILD_EXT } from './constants.js'

/** Find React/TS/JS modules that import the given stylesheet. Used to resolve CSS → importer for partial build. */
export function findCssImporters(cssPath: string, rootResolved: string): string[] {
	const importers: string[] = []
	const IMPORT_RE =
		/(?:import\s+['"]([^'"]+)['"]|import\s+[^'"]+from\s+['"]([^'"]+)['"]|require\s*\(\s*['"]([^'"]+)['"]\s*\))/g
	const sourceFiles = fg.sync('**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs,vue,svelte}', {
		cwd: rootResolved,
		absolute: true,
		ignore: ['**/node_modules/**', '**/dist/**'],
	})
	const cssPathNorm = cssPath.replace(/\\/g, '/')
	for (const absPath of sourceFiles) {
		const fromRel = path.relative(rootResolved, absPath).replace(/\\/g, '/')
		try {
			const code = fs.readFileSync(absPath, 'utf-8')
			IMPORT_RE.lastIndex = 0
			let m: RegExpExecArray | null
			while ((m = IMPORT_RE.exec(code)) !== null) {
				const spec = (m[1] ?? m[2] ?? m[3] ?? '').trim().split('?')[0]
				// Match .css, .module.css, .scss, .module.scss, etc.
				if (!spec || !/(\.module)?\.(css|scss|sass|less|styl|stylus)(\?.*)?$/i.test(spec))
					continue
				const fromDir = path.dirname(absPath)
				const resolved = path.resolve(fromDir, spec)
				const resolvedRel = path.relative(rootResolved, resolved).replace(/\\/g, '/')
				if (resolvedRel === cssPathNorm) {
					importers.push(fromRel)
					break
				}
			}
		} catch {
			// skip
		}
	}
	return importers
}

/** When modified file is a stylesheet, resolve to its importer module for partial build. */
export function resolveForPartialBuild(
	modifiedFile: string,
	rootResolved: string
): string | null {
	if (CONFIG_FILE.test(modifiedFile.replace(/\\/g, '/'))) return null
	if (PARTIAL_BUILD_EXT.test(modifiedFile)) return modifiedFile
	if (CSS_EXT.test(modifiedFile)) {
		const importers = findCssImporters(modifiedFile, rootResolved)
		return importers[0] ?? null
	}
	return null
}
