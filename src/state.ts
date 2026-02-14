import type { IncrementalBuildPluginOptions } from './types.js'

export type DictionaryEntry = {
	parents: Set<string>
	realLocationInDist: string[]
	imports: string[]
}

export const state = {
	running: false,
	watcherModifiedFile: null as string | null,
	waitForBuildEndPromiseResolver: undefined as (() => void) | undefined,
	outDir: 'dist',
	dictionary: {} as Record<string, DictionaryEntry>,
	originalEntries: undefined as Record<string, string> | undefined,
	buildFn: (() => {}) as () => void,
	storedPluginOptions: {} as IncrementalBuildPluginOptions,
}
