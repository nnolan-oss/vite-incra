import type { Plugin } from 'vite'
import path from 'node:path'
import { ENV_MODIFIED_FILE } from './constants.js'
import { state } from './state.js'
import { patchConfig } from './config.js'
import type { IncrementalBuildPluginOptions } from './types.js'

/** Vite plugin for incremental builds. Add to plugins in vite.config.ts */
export function incrementalBuild(options: IncrementalBuildPluginOptions = {}): Plugin {
	state.storedPluginOptions = options
	return {
		name: 'vite-incra',
		enforce: 'pre',
		config(config, _env) {
			patchConfig(config, { ignoreWarnings: true })
			const modifiedFile = process.env[ENV_MODIFIED_FILE]
			if (modifiedFile && config.build?.rollupOptions) {
				const root = config.root ?? '.'
				const modifiedPath = path.resolve(root, modifiedFile)
				const entryName = modifiedFile.split('.')[0] ?? modifiedFile
				config.build.rollupOptions = {
					...config.build.rollupOptions,
					input: { [entryName]: modifiedPath },
				}
			}
		},
	}
}
