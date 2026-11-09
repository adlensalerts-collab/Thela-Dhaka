import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({ command }) => {
  const isPages = command === 'build' && process.env.GITHUB_PAGES === 'true';
  const pagesEnv = isPages ? loadEnv('pages', import.meta.dirname, 'VITE_') : {};
  const pagesServerUrl =
    process.env.VITE_SERVER_URL !== undefined
      ? process.env.VITE_SERVER_URL
      : pagesEnv.VITE_SERVER_URL;

  return {
    // GitHub Pages serves the site from /Thela-Dhaka/; AI Studio and local dev use /.
    base: isPages ? '/Thela-Dhaka/' : '/',
    plugins: [react(), tailwindcss()],
    define:
      isPages && pagesServerUrl !== undefined
        ? {
            'import.meta.env.VITE_SERVER_URL': JSON.stringify(pagesServerUrl),
          }
        : undefined,
    build: {
      rolldownOptions: {
        input: {
          game: path.resolve(import.meta.dirname, 'index.html'),
          characters: path.resolve(import.meta.dirname, 'character-preview.html'),
          sounds: path.resolve(import.meta.dirname, 'sound-preview.html'),
        },
      },
    },
    resolve: {
      // Sprint 8D: every `import ... from 'three'` (game code and three/examples addons) resolves to the
      // WebGPU build, so there is one copy of three.js and WebGPURenderer can draw every object.
      // WebGPURenderer falls back to WebGL 2 by itself on browsers without WebGPU.
      alias: [
        { find: /^three$/, replacement: path.resolve(import.meta.dirname, 'node_modules/three/build/three.webgpu.js') },
        { find: '@', replacement: path.resolve(import.meta.dirname, '.') },
      ],
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
