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

console.log('=== Testing Accumulation (FIXED) ===');

// Use the SAME config for everything
const config = wasm.FhisShortintConfig.compact_pk();

// Load keys from disk
const keysDir = path.join(__dirname, 'keys-shortint');
const clientKeyBytes = fs.readFileSync(path.join(keysDir, 'shortint_client_key.bin'));
const serverKeyBytes = fs.readFileSync(path.join(keysDir, 'shortint_server_key.bin'));

const clientKey = wasm.FhisShortintClientKey.deserialize(clientKeyBytes);
console.log('ClientKey loaded from disk, size:', clientKeyBytes.length);

// Generate fresh keys with SAME config
const freshClientKey = wasm.FhisShortintClientKey.new(config);
const freshPublicKey = wasm.FhisShortintCompactPublicKey.new(freshClientKey);
const freshServerKey = wasm.FhisShortintServerKey.new(freshClientKey);

console.log('Fresh keys generated with same config');

// Test: Fresh key encrypt, old key decrypt
console.log('\n--- Test: Fresh encrypt, disk key decrypt ---');
const ct = freshPublicKey.encrypt(1).expand();
const val = ct.decrypt(clientKey);
console.log('Fresh key encrypted 1, disk clientKey decrypted:', val);

// Test: Fresh key encrypt, fresh key decrypt
console.log('\n--- Test: Fresh encrypt, fresh key decrypt ---');
const ct2 = freshPublicKey.encrypt(1).expand();
const val2 = ct2.decrypt(freshClientKey);
console.log('Fresh key encrypted 1, fresh clientKey decrypted:', val2);

// Test: Accumulate with fresh serverKey, decrypt with disk clientKey
console.log('\n--- Test: Accumulate with fresh, decrypt with disk ---');
const ct3a = freshPublicKey.encrypt(1).expand();
const ct3b = freshPublicKey.encrypt(1).expand();
const ct3Sum = freshServerKey.add(ct3a, ct3b);
const val3 = ct3Sum.decrypt(clientKey);
console.log('Accumulated 1+1, disk clientKey decrypted:', val3);

// Test: Accumulate with disk serverKey, decrypt with disk clientKey
console.log('\n--- Test: Accumulate with disk, decrypt with disk ---');
const serverKey = wasm.FhisShortintServerKey.deserialize(serverKeyBytes);
console.log('ServerKey loaded from disk, size:', serverKeyBytes.length);

const ct4a = freshPublicKey.encrypt(1).expand();
const ct4b = freshPublicKey.encrypt(1).expand();
const ct4Sum = serverKey.add(ct4a, ct4b);
const val4 = ct4Sum.decrypt(clientKey);
console.log('Accumulated 1+1 with disk serverKey, decrypted:', val4);

console.log('\n=== Done ===');
