import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    // GitHub Pages serves the site from /Thela-Dhaka/; AI Studio and local dev use /.
    base: process.env.GITHUB_PAGES === 'true' ? '/Thela-Dhaka/' : '/',
    plugins: [react(), tailwindcss()],
    build: {
      rolldownOptions: {
        input: {
          game: path.resolve(__dirname, 'index.html'),
          characters: path.resolve(__dirname, 'character-preview.html'),
        },
      },
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
