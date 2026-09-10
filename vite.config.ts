import { defineConfig } from 'vite'; import react from '@vitejs/plugin-react'; import fs from 'node:fs'; import path from 'node:path';

function hotFilePlugin() {
  const hotFile = path.resolve(import.meta.dirname, 'public/hot');
  const clean = () => { try { fs.unlinkSync(hotFile); } catch {} };
  return {
    name: 'write-hot-file',
    configureServer(server: any) {
      server.httpServer?.once('listening', () => {
        const address = server.httpServer.address();
        if (address && typeof address === 'object') {
          const protocol = server.config.server.https ? 'https' : 'http';
          const host = ['0.0.0.0', '::', '127.0.0.1', '::1'].includes(address.address) ? 'localhost' : address.address;
          fs.writeFileSync(hotFile, `${protocol}://${host}:${address.port}`);
        }
      });
      process.on('exit', clean);
      process.on('SIGINT', () => process.exit());
      process.on('SIGTERM', () => process.exit());
    },
  };
}

export default defineConfig({
  plugins: [react(), hotFilePlugin()],
  publicDir: false,
  server: { cors: true },
  build: { outDir: 'public/assets', emptyOutDir: false, rollupOptions: { input: 'resources/js/main.tsx', output: { entryFileNames: 'app.js', assetFileNames: 'app.[ext]' } } },
});
