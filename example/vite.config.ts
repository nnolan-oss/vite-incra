import type { PluginOption } from 'vite'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { incrementalBuild } from 'vite-incra'

// https://vite.dev/config/
export default defineConfig({
  root: '.',
  plugins: [react(), incrementalBuild({
    watch: true
  }) as PluginOption],
})
