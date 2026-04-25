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

console.log('=== Testing Compact Public Key Encrypt & Accumulate ===\n');

// Use compact_pk config
const config = wasm.FhisShortintConfig.compact_pk();
console.log('Config: compact_pk');

// Generate keys
const clientKey = new wasm.FhisShortintClientKey(config);
console.log('ClientKey generated');

const compactPK = wasm.FhisShortintCompactPublicKey.new(clientKey);
console.log('CompactPublicKey generated');

const serverKey = new wasm.FhisShortintServerKey(clientKey);
console.log('ServerKey generated');

// Test 1: Encrypt using CompactPublicKey.encrypt() + expand()
console.log('\n--- Test 1: CompactPublicKey.encrypt(1) + expand() ---');
const ctList1 = compactPK.encrypt(1);
const ct1 = ctList1.expand();
console.log('Encrypted, expanded, size:', ct1.serialize().length);
const val1 = ct1.decrypt(clientKey);
console.log('Decrypted:', val1);

// Test 2: Accumulate 1+1
console.log('\n--- Test 2: Accumulate 1+1 ---');
const ct2a = compactPK.encrypt(1).expand();
const ct2b = compactPK.encrypt(1).expand();
const sum2 = serverKey.add(ct2a, ct2b);
const val2 = sum2.decrypt(clientKey);
console.log('Accumulated 1+1, decrypted:', val2, '(expected: 2)');

// Test 3: Accumulate 5 votes
console.log('\n--- Test 3: Accumulate 5 votes ---');
let acc = compactPK.encrypt(1).expand();
for (let i = 0; i < 4; i++) {
  const ct = compactPK.encrypt(1).expand();
  acc = serverKey.add(acc, ct);
}
const val3 = acc.decrypt(clientKey);
console.log('Accumulated 5 votes, decrypted:', val3, '(expected: 5)');

// Test 4: Accumulate 10 votes
console.log('\n--- Test 4: Accumulate 10 votes ---');
acc = compactPK.encrypt(1).expand();
for (let i = 0; i < 9; i++) {
  const ct = compactPK.encrypt(1).expand();
  acc = serverKey.add(acc, ct);
}
const val4 = acc.decrypt(clientKey);
console.log('Accumulated 10 votes, decrypted:', val4, '(expected: 10)');

// Test 5: Mixed values
console.log('\n--- Test 5: 2+3+1 = 6 ---');
const ctA = compactPK.encrypt(2).expand();
const ctB = compactPK.encrypt(3).expand();
const ctC = compactPK.encrypt(1).expand();
let sumABC = serverKey.add(ctA, ctB);
sumABC = serverKey.add(sumABC, ctC);
const val5 = sumABC.decrypt(clientKey);
console.log('2+3+1, decrypted:', val5, '(expected: 6)');

// Test 6: Accumulate 100 votes (stress test)
console.log('\n--- Test 6: Accumulate 100 votes ---');
acc = compactPK.encrypt(1).expand();
for (let i = 0; i < 99; i++) {
  const ct = compactPK.encrypt(1).expand();
  acc = serverKey.add(acc, ct);
}
const val6 = acc.decrypt(clientKey);
console.log('Accumulated 100 votes, decrypted:', val6, '(expected: 100)');

console.log('\n=== Done ===');
