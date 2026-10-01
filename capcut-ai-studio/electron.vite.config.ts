import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

// BAN CAI CHO MAY KHAC (2026-10-02): build (`npm run build` / `dist` / `dist:win`) mac dinh AN quy trinh + nhat ky +
// Prompt & quy tac + DevTools (src/lib/clientUi.ts). `npm run dev` hoac STUDIO_FULL_UI=1 khi build -> giao dien day du.
export default defineConfig(({ command }) => {
  const CLIENT_UI = command === 'build' && process.env.STUDIO_FULL_UI !== '1'
  const define = { __CLIENT_UI__: JSON.stringify(CLIENT_UI) }
  return {
    main: {
      define,
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
      define,
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
  }
})
