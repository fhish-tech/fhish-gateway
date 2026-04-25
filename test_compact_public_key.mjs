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

console.log('=== Testing with DESERIALIZED CompactPublicKey ===\n');

// Load keys from disk
const keysDir = path.join(__dirname, 'keys-shortint');
const clientKeyBytes = fs.readFileSync(path.join(keysDir, 'shortint_client_key.bin'));
const serverKeyBytes = fs.readFileSync(path.join(keysDir, 'shortint_server_key.bin'));
const publicKeyBytes = fs.readFileSync(path.join(keysDir, 'shortint_public_key.bin'));

console.log('ClientKey bytes:', clientKeyBytes.length);
console.log('ServerKey bytes:', serverKeyBytes.length);
console.log('PublicKey bytes:', publicKeyBytes.length);

// Try to deserialize
console.log('\n--- Deserializing keys ---');
const diskClientKey = wasm.FhisShortintClientKey.deserialize(clientKeyBytes);
console.log('ClientKey deserialized OK');

const diskServerKey = wasm.FhisShortintServerKey.deserialize(serverKeyBytes);
console.log('ServerKey deserialized OK');

// Try deserializing as CompactPublicKey
console.log('\n--- Try deserializing as CompactPublicKey ---');
try {
  const diskCompactPK = wasm.FhisShortintCompactPublicKey.deserialize(publicKeyBytes);
  console.log('CompactPublicKey deserialized OK');
  
  // Test encryption
  console.log('\n--- Test: CompactPublicKey.encrypt(1) + expand() ---');
  const ctList = diskCompactPK.encrypt(1);
  const ct1 = ctList.expand();
  console.log('Encrypted, expanded, size:', ct1.serialize().length);
  const val1 = ct1.decrypt(diskClientKey);
  console.log('Decrypted:', val1, '(expected: 1)');
  
  // Accumulate
  console.log('\n--- Test: Accumulate 1+1 ---');
  const ct2a = diskCompactPK.encrypt(1).expand();
  const ct2b = diskCompactPK.encrypt(1).expand();
  const sum = diskServerKey.add(ct2a, ct2b);
  const val2 = sum.decrypt(diskClientKey);
  console.log('Accumulated 1+1, decrypted:', val2, '(expected: 2)');
  
  // Accumulate 5
  console.log('\n--- Test: Accumulate 5 votes ---');
  let acc = diskCompactPK.encrypt(1).expand();
  for (let i = 0; i < 4; i++) {
    acc = diskServerKey.add(acc, diskCompactPK.encrypt(1).expand());
  }
  const val5 = acc.decrypt(diskClientKey);
  console.log('Accumulated 5 votes, decrypted:', val5, '(expected: 5)');
  
  // Accumulate 100
  console.log('\n--- Test: Accumulate 100 votes ---');
  acc = diskCompactPK.encrypt(1).expand();
  for (let i = 0; i < 99; i++) {
    acc = diskServerKey.add(acc, diskCompactPK.encrypt(1).expand());
  }
  const val100 = acc.decrypt(diskClientKey);
  console.log('Accumulated 100 votes, decrypted:', val100, '(expected: 100)');
  
  // Mixed: 2+3+1 = 6
  console.log('\n--- Test: 2+3+1 = 6 ---');
  const ctA = diskCompactPK.encrypt(2).expand();
  const ctB = diskCompactPK.encrypt(3).expand();
  const ctC = diskCompactPK.encrypt(1).expand();
  let sumABC = diskServerKey.add(ctA, ctB);
  sumABC = diskServerKey.add(sumABC, ctC);
  const val6 = sumABC.decrypt(diskClientKey);
  console.log('2+3+1, decrypted:', val6, '(expected: 6)');
  
} catch (e) {
  console.error('Error:', e.message);
}

console.log('\n=== Done ===');
