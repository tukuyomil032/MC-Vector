import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const tauriDevHost = process.env.TAURI_DEV_HOST;
const parsedPort = process.env.PORT ? Number(process.env.PORT) : undefined;
const portlessPort =
  parsedPort !== undefined && Number.isFinite(parsedPort) ? parsedPort : undefined;
const devHost = tauriDevHost ?? process.env.HOST;
const isPlaywright = process.env.VITE_PLAYWRIGHT === 'true';

function mockPath(name: string) {
  return fileURLToPath(new URL(`./src/test-mocks/${name}`, import.meta.url));
}

const playwrightAliases = isPlaywright
  ? {
      '@tauri-apps/api/core': mockPath('tauri-api-core.ts'),
      '@tauri-apps/api/event': mockPath('tauri-api-event.ts'),
      '@tauri-apps/api/app': mockPath('tauri-api-app.ts'),
      '@tauri-apps/api/path': mockPath('tauri-api-path.ts'),
      '@tauri-apps/api/window': mockPath('tauri-api-window.ts'),
      '@tauri-apps/api/webviewWindow': mockPath('tauri-api-webview-window.ts'),
      '@tauri-apps/plugin-store': mockPath('tauri-plugin-store.ts'),
      '@tauri-apps/plugin-global-shortcut': mockPath('tauri-plugin-global-shortcut.ts'),
      '@tauri-apps/plugin-updater': mockPath('tauri-plugin-updater.ts'),
      '@tauri-apps/plugin-os': mockPath('tauri-plugin-os.ts'),
      '@tauri-apps/plugin-dialog': mockPath('tauri-plugin-dialog.ts'),
      '@tauri-apps/plugin-fs': mockPath('tauri-plugin-fs.ts'),
      '@tauri-apps/plugin-http': mockPath('tauri-plugin-http.ts'),
      '@tauri-apps/plugin-opener': mockPath('tauri-plugin-opener.ts'),
      '@tauri-apps/plugin-clipboard-manager': mockPath('tauri-plugin-clipboard.ts'),
      '@tauri-apps/plugin-process': mockPath('tauri-plugin-process.ts'),
      '@tauri-apps/plugin-notification': mockPath('tauri-plugin-notification.ts'),
      '@tauri-apps/plugin-window-state': mockPath('tauri-plugin-window-state.ts'),
    }
  : {};

export default defineConfig({
  plugins: [react()],

  clearScreen: false,

  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      ...playwrightAliases,
    },
  },

  server: {
    port: portlessPort ?? 5173,
    strictPort: true,
    host: devHost || false,
    hmr: tauriDevHost ? { protocol: 'ws', host: tauriDevHost, port: 1421 } : undefined,
    watch: {
      ignored: ['**/src-tauri/**'],
    },
  },

  envPrefix: ['VITE_', 'TAURI_ENV_*'],

  worker: {
    format: 'es',
  },

  build: {
    target: process.env.TAURI_ENV_PLATFORM === 'windows' ? 'chrome105' : 'safari16.4',
    minify: !process.env.TAURI_ENV_DEBUG ? 'esbuild' : false,
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
    reportCompressedSize: false,
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      onLog(level, log, handler) {
        if (log.code === 'PLUGIN_TIMINGS') {
          return;
        }
        handler(level, log);
      },
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) {
            return;
          }
          if (id.includes('monaco-editor') || id.includes('@monaco-editor')) {
            return 'vendor-monaco';
          }
          if (id.includes('recharts')) {
            return 'vendor-charts';
          }
          if (id.includes('xterm') || id.includes('xterm-addon-')) {
            return 'vendor-terminal';
          }
          if (id.includes('framer-motion')) {
            return 'vendor-motion';
          }
          if (
            id.includes('react-markdown') ||
            id.includes('remark-gfm') ||
            id.includes('remark-') ||
            id.includes('rehype-') ||
            id.includes('micromark') ||
            id.includes('mdast-') ||
            id.includes('unified')
          ) {
            return 'vendor-markdown';
          }
          if (id.includes('@tauri-apps')) {
            return 'vendor-tauri';
          }
          if (id.includes('react') || id.includes('scheduler')) {
            return 'vendor-react';
          }
          return 'vendor-misc';
        },
      },
    },
  },
});
