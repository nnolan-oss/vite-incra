# vite-incra

Correct incremental build for Vite: content hashing, dependency graph, parent invalidation.

Only rebuilds what changed — skips builds when output is unchanged, and transforms only the dirty module set when sources change.

## Install

```bash
npm install -D vite-incra
```

## Setup

### 1. Add the plugin to `vite.config.ts`

```ts
import { viteIncraPlugin } from 'vite-incra'

export default defineConfig({
  plugins: [
    viteIncraPlugin({
      onSkip: (reason) => console.log('Skipped:', reason),
      onChanged: (files) => console.log('Changed:', files),
      onDirtySet: (dirty, total, modules) => console.log(`Rebuilding ${dirty}/${total} modules`),
    }),
  ],
})
```

### 2. Use the CLI for builds

```bash
npx vite-incra
# or with options
npx vite-incra --force
```

Or in `package.json`:

```json
{
  "scripts": {
    "build": "vite-incra"
  }
}
```

## How it works

- **Content hashing** — Uses file content (never mtime) to detect changes
- **Dependency graph** — From Rollup’s `moduleParsed` (accurate, no manual parsing)
- **Dirty set** — Invalidates changed modules + their transitive importers
- **Rollup cache** — Reuses cached transforms for unchanged modules

## Requirements

- Node.js >= 18
- Vite ^5, ^6, or ^7
