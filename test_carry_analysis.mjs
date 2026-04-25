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

console.log('=== Understanding CARRY_0 Limitations ===\n');

// Load keys from disk
const keysDir = path.join(__dirname, 'keys-shortint');
const clientKeyBytes = fs.readFileSync(path.join(keysDir, 'shortint_client_key.bin'));
const serverKeyBytes = fs.readFileSync(path.join(keysDir, 'shortint_server_key.bin'));
const publicKeyBytes = fs.readFileSync(path.join(keysDir, 'shortint_public_key.bin'));

const diskClientKey = wasm.FhisShortintClientKey.deserialize(clientKeyBytes);
const diskServerKey = wasm.FhisShortintServerKey.deserialize(serverKeyBytes);
const diskCompactPK = wasm.FhisShortintCompactPublicKey.deserialize(publicKeyBytes);

console.log('Keys loaded. Testing with CARRY_0 params (MESSAGE=1, CARRY=0)');
console.log('This means max value = 2^1 - 1 = 1, and carries are NOT stored\n');

// Single values should work
console.log('--- Test: Single values ---');
console.log('encrypt(0) decrypt:', diskCompactPK.encrypt(0).expand().decrypt(diskClientKey));
console.log('encrypt(1) decrypt:', diskCompactPK.encrypt(1).expand().decrypt(diskClientKey));

// Additions within limit should work
console.log('\n--- Test: Additions within message capacity ---');
console.log('0+0 = ? :', diskServerKey.add(
  diskCompactPK.encrypt(0).expand(),
  diskCompactPK.encrypt(0).expand()
).decrypt(diskClientKey));

console.log('0+1 = ? :', diskServerKey.add(
  diskCompactPK.encrypt(0).expand(),
  diskCompactPK.encrypt(1).expand()
).decrypt(diskClientKey));

console.log('1+0 = ? :', diskServerKey.add(
  diskCompactPK.encrypt(1).expand(),
  diskCompactPK.encrypt(0).expand()
).decrypt(diskClientKey));

// Additions that overflow carry will give wrong results
console.log('\n--- Test: Additions that OVERFLOW carry ---');
console.log('1+1 = ? :', diskServerKey.add(
  diskCompactPK.encrypt(1).expand(),
  diskCompactPK.encrypt(1).expand()
).decrypt(diskClientKey), '(expected: 2, but CARRY_0 loses the carry)');

console.log('1+1+1 = ? :', (() => {
  let acc = diskCompactPK.encrypt(1).expand();
  acc = diskServerKey.add(acc, diskCompactPK.encrypt(1).expand());
  acc = diskServerKey.add(acc, diskCompactPK.encrypt(1).expand());
  return acc.decrypt(diskClientKey);
})(), '(expected: 3, but CARRY_0 loses carries)');

console.log('\n=== Solution: Need CARRY >= 1 for voting ===');
console.log('CARRY_1 allows counting up to 2^2 - 1 = 3 per ciphertext');
console.log('CARRY_2 allows counting up to 2^3 - 1 = 7 per ciphertext');
console.log('And/or we need bootstrapping to clear carries periodically');

console.log('\n=== Done ===');
