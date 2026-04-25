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

console.log('=== Debugging Accumulation ===');

// Load keys from disk
const keysDir = path.join(__dirname, 'keys-shortint');
const clientKeyBytes = fs.readFileSync(path.join(keysDir, 'shortint_client_key.bin'));
const publicKeyBytes = fs.readFileSync(path.join(keysDir, 'shortint_public_key.bin'));
const serverKeyBytes = fs.readFileSync(path.join(keysDir, 'shortint_server_key.bin'));

const clientKey = wasm.FhisShortintClientKey.deserialize(clientKeyBytes);
const publicKey = wasm.FhisShortintCompactPublicKey.deserialize(publicKeyBytes);
const serverKey = wasm.FhisShortintServerKey.deserialize(serverKeyBytes);

console.log('Keys loaded');
console.log('ClientKey size:', clientKeyBytes.length);
console.log('PublicKey size:', publicKeyBytes.length);
console.log('ServerKey size:', serverKeyBytes.length);

// Encrypt
console.log('\n--- Encrypting ---');
const compactCt = publicKey.encrypt(1);
console.log('Compact ciphertext created');
console.log('Compact size_bytes:', compactCt.size_bytes());

const ct = compactCt.expand();
console.log('Expanded ciphertext');
console.log('Expanded size:', ct.serialize().length);

// Decrypt directly
console.log('\n--- Decrypt directly ---');
const directVal = ct.decrypt(clientKey);
console.log('Direct decrypt:', directVal);

// Accumulate
console.log('\n--- Accumulating ---');
const ct2 = compactCt.expand();
const sum = serverKey.add(ct, ct2);
console.log('Sum created');

// Check if sum needs bootstrapping before decrypt
console.log('Sum size:', sum.serialize().length);

// Decrypt sum
console.log('\n--- Decrypt sum ---');
const sumVal = sum.decrypt(clientKey);
console.log('Sum decrypt:', sumVal);

console.log('\n=== Done ===');
