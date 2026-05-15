import { defineConfig } from 'vite'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { TanStackRouterVite } from '@tanstack/router-plugin/vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const currentDir = dirname(fileURLToPath(import.meta.url))
const rootPackageJson = JSON.parse(
  readFileSync(resolve(currentDir, '../../package.json'), 'utf-8'),
) as { version: string }

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(rootPackageJson.version),
  },
  resolve: {
    alias: {
      '@': resolve(currentDir, 'src'),
    },
  },
  plugins: [
    TanStackRouterVite({ target: 'react' }),
    react({
      babel: {
        plugins: [['babel-plugin-react-compiler']],
      },
    }),
    tailwindcss(),
  ],
})
