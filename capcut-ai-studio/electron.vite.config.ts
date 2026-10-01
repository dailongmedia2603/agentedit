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
        },
        // Doi MOI dynamic import() -> require() trong ban CJS. Bat buoc cho `npm run dist`:
        // ma BE duoc bien dich bytecode (bytenode) KHONG chay duoc import() dong
        // (ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING). Vd `await import('fs')` trong main.ts.
        output: { dynamicImportInCjs: false }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'electron/preload.ts') },
        output: { dynamicImportInCjs: false }
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
