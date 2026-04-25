import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

globalThis.self = globalThis;
globalThis.location = { href: 'file:///test' };

const OriginalFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  if (typeof input === 'string' && input.startsWith('file://')) {
    const filePath = path.resolve(input.replace('file://', ''));
    const bytes = fs.readFileSync(filePath);
    return new Response(bytes, { headers: { 'content-type': 'application/wasm' } });
  }
  return OriginalFetch(input, init);
};

const wasm = await import('fhish-wasm');
if (typeof wasm.default === 'function') {
  await wasm.default();
}
wasm.init_panic_hook();

console.log('=== Testing with Gateway PublicKey ===');

// Load keys from disk
const keysDir = path.join(__dirname, 'keys-shortint');
const clientKeyBytes = fs.readFileSync(path.join(keysDir, 'shortint_client_key.bin'));
const publicKeyBytes = fs.readFileSync(path.join(keysDir, 'shortint_public_key.bin'));
const serverKeyBytes = fs.readFileSync(path.join(keysDir, 'shortint_server_key.bin'));

const clientKey = wasm.FhisShortintClientKey.deserialize(clientKeyBytes);
console.log('ClientKey loaded from disk');

const publicKey = wasm.FhisShortintCompactPublicKey.deserialize(publicKeyBytes);
console.log('PublicKey loaded from disk');

const serverKey = wasm.FhisShortintServerKey.deserialize(serverKeyBytes);
console.log('ServerKey loaded from disk');

// Encrypt using DISK publicKey
console.log('\n--- Test: Disk publicKey encrypt, disk clientKey decrypt ---');
const ct1 = publicKey.encrypt(1).expand();
const val1 = ct1.decrypt(clientKey);
console.log('Encrypted 1, decrypted:', val1);

// Accumulate
console.log('\n--- Test: Accumulate 1+1 with disk serverKey ---');
const ct2a = publicKey.encrypt(1).expand();
const ct2b = publicKey.encrypt(1).expand();
const ct2Sum = serverKey.add(ct2a, ct2b);
const val2 = ct2Sum.decrypt(clientKey);
console.log('Encrypted 1+1, accumulated, decrypted:', val2);

// Save ciphertext hex for testing
const ctHex = '0x' + Buffer.from(ct2a.serialize()).toString('hex');
fs.writeFileSync('/tmp/gateway_ct.bin', Buffer.from(ct2a.serialize()));
fs.writeFileSync('/tmp/gateway_ct.txt', ctHex);
console.log('\nSaved ciphertext to /tmp/gateway_ct.txt');
console.log('Ciphertext size:', ct2a.serialize().length, 'bytes');

console.log('\n=== Done ===');
