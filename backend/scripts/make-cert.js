#!/usr/bin/env node
/**
 * Creates a self-signed certificate for local HTTPS.
 *
 * Browsers only grant camera access on a secure origin, and "secure" means
 * https:// or localhost. A phone reaching the kiosk over the network is
 * neither, so without this the camera simply never starts.
 *
 * The certificate covers localhost and every address this machine has, so
 * the same pair works for the API and the web app, on this PC and from any
 * device on the same Wi-Fi.
 *
 *   npm run cert
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import selfsigned from 'selfsigned';

const here = path.dirname(fileURLToPath(import.meta.url));
const certDir = path.resolve(here, '..', '..', 'certs');

/** Every address a browser might use to reach this machine. */
function localAddresses() {
  const addresses = ['127.0.0.1'];
  for (const entries of Object.values(os.networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.family === 'IPv4' && !entry.internal) addresses.push(entry.address);
    }
  }
  return [...new Set(addresses)];
}

const ips = localAddresses();

// Subject Alternative Names. A modern browser ignores the common name and
// reads these, so every address has to be listed explicitly.
const altNames = [
  { type: 2, value: 'localhost' },
  ...ips.map((ip) => ({ type: 7, ip })),
];

// selfsigned v5 returns a promise rather than the pems directly.
const pems = await selfsigned.generate([{ name: 'commonName', value: 'localhost' }], {
  days: 825,
  keySize: 2048,
  algorithm: 'sha256',
  extensions: [
    { name: 'basicConstraints', cA: true },
    {
      name: 'keyUsage',
      keyCertSign: true,
      digitalSignature: true,
      keyEncipherment: true,
    },
    { name: 'subjectAltName', altNames },
  ],
});

fs.mkdirSync(certDir, { recursive: true });
fs.writeFileSync(path.join(certDir, 'key.pem'), pems.private);
fs.writeFileSync(path.join(certDir, 'cert.pem'), pems.cert);

console.log('\n  Certificate written to certs/\n');
console.log('  Valid for:');
console.log('    localhost');
for (const ip of ips) console.log(`    ${ip}`);
console.log('\n  Now start both servers with HTTPS:');
console.log('    backend  : npm run dev:https');
console.log('    frontend : npm run dev:https');
console.log('\n  Then on the phone, open each once and accept the warning:');
for (const ip of ips.filter((a) => a !== '127.0.0.1')) {
  console.log(`    https://${ip}:5000/api/health`);
  console.log(`    https://${ip}:5173/kiosk`);
}
console.log(
  '\n  The warning is expected: the certificate signs itself rather than\n' +
    '  being issued by an authority. Accepting it once per address is enough.\n'
);
