import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'electron/main.ts'),
          // Tien trinh render Remotion (utilityProcess) — out/main/remotion-worker.js
          'remotion-worker': resolve(__dirname, 'electron/remotion-worker.ts')
        }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'electron/preload.ts') }
      }
    }
  },
  renderer: {
    root: '.',
    resolve: {
      alias: { '@': resolve(__dirname, 'src') }
    },
    plugins: [react()],
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'index.html') }
      }
    }
  }
})
