import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  root,
  base: './',
  plugins: [react()],
  resolve: {
    alias: { '@shared': fileURLToPath(new URL('../src/shared', import.meta.url)) },
  },
  build: {
    outDir: fileURLToPath(new URL('../dist/webview', import.meta.url)),
    // Dropbox 同期フォルダ内では出力先の削除が失敗することがあるため空にしない（ファイル名固定なので不要）
    emptyOutDir: false,
    cssCodeSplit: false,
    chunkSizeWarningLimit: 2000,
    // 拡張機能側から固定パスで読み込むため、ファイル名にハッシュを付けない
    rollupOptions: {
      output: {
        entryFileNames: 'assets/index.js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: (info) => ((info.names ?? [info.name ?? '']).some((n) => n.endsWith('.css')) ? 'assets/index.css' : 'assets/[name][extname]'),
      },
    },
  },
});
