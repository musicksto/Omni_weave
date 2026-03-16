import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [react(), tailwindcss()],
    define: {},
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      chunkSizeWarningLimit: 600,
      rollupOptions: {
        output: {
          manualChunks(id: string) {
            // React core
            if (id.includes('node_modules/react-dom') || id.includes('node_modules/react/')) {
              return 'vendor-react';
            }
            // Framer Motion / motion
            if (id.includes('node_modules/motion/') || id.includes('node_modules/framer-motion/')) {
              return 'vendor-motion';
            }
            // Firebase SDK — split into sub-chunks for better caching
            if (id.includes('node_modules/@firebase/firestore/') || id.includes('node_modules/firebase/firestore')) {
              return 'vendor-firebase-firestore';
            }
            if (id.includes('node_modules/@firebase/auth/') || id.includes('node_modules/firebase/auth')) {
              return 'vendor-firebase-auth';
            }
            if (id.includes('node_modules/@firebase/storage/') || id.includes('node_modules/firebase/storage')) {
              return 'vendor-firebase-storage';
            }
            if (id.includes('node_modules/firebase/') || id.includes('node_modules/@firebase/')) {
              return 'vendor-firebase-core';
            }
            // React-markdown and its dependencies (unified, remark, rehype, etc.)
            if (
              id.includes('node_modules/react-markdown/') ||
              id.includes('node_modules/remark-') ||
              id.includes('node_modules/rehype-') ||
              id.includes('node_modules/unified/') ||
              id.includes('node_modules/mdast-') ||
              id.includes('node_modules/hast-') ||
              id.includes('node_modules/micromark') ||
              id.includes('node_modules/unist-') ||
              id.includes('node_modules/vfile')
            ) {
              return 'vendor-markdown';
            }
          },
        },
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
