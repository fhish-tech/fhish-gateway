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

console.log('=== Testing NEW keys with decrypt_full ===\n');

// Load the newly generated keys
const keysDir = path.join(__dirname, 'keys-carry2');
const clientKeyBytes = fs.readFileSync(path.join(keysDir, 'shortint_client_key.bin'));
const serverKeyBytes = fs.readFileSync(path.join(keysDir, 'shortint_server_key.bin'));
const publicKeyBytes = fs.readFileSync(path.join(keysDir, 'shortint_public_key.bin'));

console.log('Loading keys...');
const clientKey = wasm.FhisShortintClientKey.deserialize(clientKeyBytes);
console.log('ClientKey loaded');

const serverKey = wasm.FhisShortintServerKey.deserialize(serverKeyBytes);
console.log('ServerKey loaded');

// For public key, we need to check what type it is
// The keygen generated a regular PublicKey, not CompactPublicKey
let publicKey;
try {
  publicKey = wasm.FhisShortintPublicKey.deserialize(publicKeyBytes);
  console.log('PublicKey (regular) loaded');
} catch (e) {
  console.log('Failed to load as regular PublicKey:', e.message);
  process.exit(1);
}

// Test encryption and accumulation
console.log('\n=== Testing with decrypt and decrypt_full ===\n');

// Test 1 vote
const ct1 = publicKey.encrypt(1);
console.log('1 vote:');
console.log('  decrypt():', ct1.decrypt(clientKey));
console.log('  decrypt_full():', ct1.decrypt_full(clientKey));

// Test 2 votes
const ct2a = publicKey.encrypt(1);
const ct2b = publicKey.encrypt(1);
const sum2 = serverKey.add(ct2a, ct2b);
console.log('\n2 votes (1+1):');
console.log('  decrypt():', sum2.decrypt(clientKey));
console.log('  decrypt_full():', sum2.decrypt_full(clientKey));

// Test 5 votes
let acc = publicKey.encrypt(1);
for (let i = 0; i < 4; i++) {
  acc = serverKey.add(acc, publicKey.encrypt(1));
}
console.log('\n5 votes:');
console.log('  decrypt():', acc.decrypt(clientKey));
console.log('  decrypt_full():', acc.decrypt_full(clientKey));

// Test 10 votes
acc = publicKey.encrypt(1);
for (let i = 0; i < 9; i++) {
  acc = serverKey.add(acc, publicKey.encrypt(1));
}
console.log('\n10 votes:');
console.log('  decrypt():', acc.decrypt(clientKey));
console.log('  decrypt_full():', acc.decrypt_full(clientKey));

// Test 15 votes
acc = publicKey.encrypt(1);
for (let i = 0; i < 14; i++) {
  acc = serverKey.add(acc, publicKey.encrypt(1));
}
console.log('\n15 votes:');
console.log('  decrypt():', acc.decrypt(clientKey));
console.log('  decrypt_full():', acc.decrypt_full(clientKey));

// Test 16 votes (overflow)
acc = publicKey.encrypt(1);
for (let i = 0; i < 15; i++) {
  acc = serverKey.add(acc, publicKey.encrypt(1));
}
console.log('\n16 votes (overflow):');
console.log('  decrypt():', acc.decrypt(clientKey));
console.log('  decrypt_full():', acc.decrypt_full(clientKey));

console.log('\n=== Done ===');
