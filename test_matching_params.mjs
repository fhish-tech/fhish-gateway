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

console.log('=== Testing with MATCHING params (compact_pk_v1) ===\n');

// Use the SAME config as existing disk keys
const config = wasm.FhisShortintConfig.compact_pk_v1();
console.log('Config: compact_pk_v1 (MESSAGE_1_CARRY_0)');

// Load keys from disk
const keysDir = path.join(__dirname, 'keys-shortint');
const clientKeyBytes = fs.readFileSync(path.join(keysDir, 'shortint_client_key.bin'));
const serverKeyBytes = fs.readFileSync(path.join(keysDir, 'shortint_server_key.bin'));

const diskClientKey = wasm.FhisShortintClientKey.deserialize(clientKeyBytes);
console.log('Disk ClientKey loaded, size:', clientKeyBytes.length);

const diskServerKey = wasm.FhisShortintServerKey.deserialize(serverKeyBytes);
console.log('Disk ServerKey loaded, size:', serverKeyBytes.length);

// Test 1: Fresh key encrypt, disk key decrypt
console.log('\n--- Test 1: Fresh encrypt, disk key decrypt ---');
const freshClientKey = new wasm.FhisShortintClientKey(config);
const freshCompactPK = wasm.FhisShortintCompactPublicKey.new(freshClientKey);
const freshServerKey = new wasm.FhisShortintServerKey(freshClientKey);

const ct1 = freshCompactPK.encrypt(1).expand();
const val1 = ct1.decrypt(diskClientKey);
console.log('Fresh key encrypted 1, disk clientKey decrypted:', val1, '(expected: 1)');

// Test 2: Fresh key encrypt, fresh key decrypt
console.log('\n--- Test 2: Fresh encrypt, fresh key decrypt ---');
const ct2 = freshCompactPK.encrypt(1).expand();
const val2 = ct2.decrypt(freshClientKey);
console.log('Fresh key encrypted 1, fresh clientKey decrypted:', val2, '(expected: 1)');

// Test 3: Accumulate with fresh serverKey, decrypt with disk clientKey
console.log('\n--- Test 3: Accumulate 1+1 (fresh sk, disk ck) ---');
const ct3a = freshCompactPK.encrypt(1).expand();
const ct3b = freshCompactPK.encrypt(1).expand();
const ct3Sum = freshServerKey.add(ct3a, ct3b);
const val3 = ct3Sum.decrypt(diskClientKey);
console.log('Accumulated 1+1, decrypted:', val3, '(expected: 2)');

// Test 4: Accumulate with disk serverKey, decrypt with disk clientKey
console.log('\n--- Test 4: Accumulate 1+1 (disk serverKey, disk clientKey) ---');
const ct4a = freshCompactPK.encrypt(1).expand();
const ct4b = freshCompactPK.encrypt(1).expand();
const ct4Sum = diskServerKey.add(ct4a, ct4b);
const val4 = ct4Sum.decrypt(diskClientKey);
console.log('Accumulated 1+1, decrypted:', val4, '(expected: 2)');

// Test 5: Accumulate 5 votes with disk keys
console.log('\n--- Test 5: Accumulate 5 votes (disk keys) ---');
let acc = freshCompactPK.encrypt(1).expand();
for (let i = 0; i < 4; i++) {
  const ct = freshCompactPK.encrypt(1).expand();
  acc = diskServerKey.add(acc, ct);
}
const val5 = acc.decrypt(diskClientKey);
console.log('Accumulated 5 votes, decrypted:', val5, '(expected: 5)');

// Test 6: Accumulate 100 votes
console.log('\n--- Test 6: Accumulate 100 votes (disk keys) ---');
acc = freshCompactPK.encrypt(1).expand();
for (let i = 0; i < 99; i++) {
  const ct = freshCompactPK.encrypt(1).expand();
  acc = diskServerKey.add(acc, ct);
}
const val6 = acc.decrypt(diskClientKey);
console.log('Accumulated 100 votes, decrypted:', val6, '(expected: 100)');

// Test 7: Mixed values
console.log('\n--- Test 7: 2+3+1 = 6 ---');
const ctA = freshCompactPK.encrypt(2).expand();
const ctB = freshCompactPK.encrypt(3).expand();
const ctC = freshCompactPK.encrypt(1).expand();
let sumABC = diskServerKey.add(ctA, ctB);
sumABC = diskServerKey.add(sumABC, ctC);
const val7 = sumABC.decrypt(diskClientKey);
console.log('2+3+1, decrypted:', val7, '(expected: 6)');

console.log('\n=== Done ===');
