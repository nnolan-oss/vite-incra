# Incremental builds for Vite

Correct incremental build for Vite: content hashing, dependency graph, parent invalidation.

## Use case

Projects that need to be built to disk instead of being served by the Vite dev server. If you can, the recommended approach is to use CSP to allow localhost in dev and use the Vite dev server without this plugin.

## Installation

```bash
npm i -D vite-incra
```

## Usage

### 1. Add the plugin to `vite.config.ts`

```ts
import { defineConfig } from 'vite'
import { incrementalBuild } from 'vite-incra'

export default defineConfig({
  plugins: [
    // ... your other plugins (react, vue, etc.)
    incrementalBuild({
      bundleName: 'bundle',
      watcherIgnoredFiles: [/node_modules/, /\.git/, /dist/],
      beforeBuildCallback: () => { /* runs before each build */ },
      cleanBeforeFirstBuild: true,
      watch: true,
      watcherUsePolling: true,
    }),
  ],
  root: '.',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
})
```

### 2. Add script to `package.json`

```json
{
  "scripts": {
    "build": "vite build",
    "build:incremental": "vite-incra"
  }
}
```

### 3. Run

```bash
npm run build:incremental
```

Or without adding a script:

```bash
npx vite-incra
```

- **Watch mode** (default): Watches `src/`, `public/`, `index.html` and rebuilds only when files change.
- **Single run**: Pass `watch: false` to the plugin if you run from CI and want one build then exit.

## Project structure

```
project/
├── index.html
├── package.json
├── vite.config.ts
├── src/
│   ├── main.tsx      # or main.ts, main.js
│   └── ...
├── public/
│   └── ...
└── dist/             # output
```

## Requirements

- `vite.config` must have `root` set
- If you set `build.rollupOptions.input`, it must be an object (e.g. `{ main: 'index.html' }`), not a string or array

## Advanced: Programmatic usage

For custom scripts (e.g. `tools/incrementalBuild.ts`):

```ts
import { runIncrementalBuild, patchConfig } from 'vite-incra'
import viteConfig from '../vite.config'

runIncrementalBuild(patchConfig(viteConfig), {
  watch: false,
  bundleName: 'bundle',
  watcherIgnoredFiles: [/node_modules/, /\.git/],
  beforeBuildCallback: () => { /* ... */ },
})
```

Requires `tsx` for running TypeScript:

```bash
npm i -D vite-incra tsx
```

## Notes

- **Extensions**: Don't use this package. Build minimal files for install, serve JS from Vite dev server, allow localhost in CSP.
- **File remapping**: Use Vite middleware for build path remapping.
- **Tested**: Vue, React. Rolldown untested.
- **Build speed**: Depends on how many files the changed file imports. More imports = longer incremental build.

---