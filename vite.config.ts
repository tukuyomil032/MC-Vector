import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite-plus';

const tauriDevHost = process.env.TAURI_DEV_HOST;
const parsedPort = process.env.PORT ? Number(process.env.PORT) : undefined;
const portlessPort =
  parsedPort !== undefined && Number.isFinite(parsedPort) ? parsedPort : undefined;
const devHost = tauriDevHost ?? process.env.HOST;

export default defineConfig({
  plugins: [react()],

  clearScreen: false,

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

  build: {
    target: process.env.TAURI_ENV_PLATFORM === 'windows' ? 'chrome105' : 'safari13',
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

  // Oxlint configuration (migrated from biome.json)
  lint: {
    ignorePatterns: [
      'dist/**',
      'build/**',
      'node_modules/**',
      '.vscode/**',
      '.github/workflows/**',
      'scripts/**',
      '.agents/**'
    ],
  },

  // Oxfmt configuration (migrated from biome.json)
  fmt: {
    semi: true,
    singleQuote: true,
    tabWidth: 2,
    printWidth: 100,
  },

  // Staged file checks (replaces lint-staged)
  staged: {
    'src/**/*.{ts,tsx}': 'vp check --fix',
    'src-tauri/src/**/*.rs': 'cargo fmt --all --manifest-path src-tauri/Cargo.toml',
    '**/*.{yml,yaml}': 'yamllint',
  },
});
