import { defineConfig } from 'vite'; import react from '@vitejs/plugin-react';
export default defineConfig({plugins:[react()],publicDir:false,build:{outDir:'public/assets',emptyOutDir:false,rollupOptions:{input:'resources/js/main.tsx',output:{entryFileNames:'app.js',assetFileNames:'app.[ext]'}}}});
