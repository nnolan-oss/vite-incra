import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { viteIncraPlugin } from '../lib/dist/index.js'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    viteIncraPlugin({
      onSkip: (reason) => {
        console.log('Incremental: build skipped —', reason)
      },
      onChanged: (changedFiles) => {
        if (changedFiles.length > 0) {
          console.log('Changed files:')
          changedFiles.forEach((f) => console.log('  -', f))
        }
      },
      onDirtySet: (dirtyCount, totalCount, dirtyModules) => {
        console.log(
          `Incremental: rebuilding ${dirtyCount} of ${totalCount} modules (dirty set)`
        )
        dirtyModules.forEach((m) => console.log('  -', m))
      },
    }) as Plugin,
  ],
})
