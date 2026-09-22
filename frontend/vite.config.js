import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * HTTPS turns on by itself once certs/ exists, for one specific reason:
 * browsers only allow camera access on a secure origin, so the kiosk
 * cannot scan from a phone over the network without it.
 *
 * Create the certificate with `npm run cert` in the backend. Delete the
 * certs folder to go back to plain http.
 */
const certDir = path.resolve(process.cwd(), '..', 'certs');
const keyPath = path.join(certDir, 'key.pem');
const certPath = path.join(certDir, 'cert.pem');

const https =
  fs.existsSync(keyPath) && fs.existsSync(certPath)
    ? { key: fs.readFileSync(keyPath), cert: fs.readFileSync(certPath) }
    : undefined;

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    https,
    // Listen on every network interface so phones and other machines on the
    // same Wi-Fi can reach the dev server, not just this computer.
    host: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      output: {
        // Charts are heavy and only the admin pages need them; splitting
        // keeps the first load for students and faculty small.
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          charts: ['recharts'],
        },
      },
    },
  },
});
