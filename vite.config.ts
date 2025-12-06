import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron/simple'


export default defineConfig({
  plugins: [
    react(),
    electron({
      main: {
        entry: 'src/electron/main.ts',
        vite: {
          build: {
            rollupOptions: {
              external: ['pidusage', 'tar'],
            },
          },
        },
      },
      preload: {
        input: 'src/electron/preload.ts',
      },
      renderer: {},
    }),
  ],
})
