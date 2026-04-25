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

console.log('=== Testing with DESERIALIZED disk keys ONLY ===\n');

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
try {
  const diskClientKey = wasm.FhisShortintClientKey.deserialize(clientKeyBytes);
  console.log('ClientKey deserialized OK');
  
  const diskServerKey = wasm.FhisShortintServerKey.deserialize(serverKeyBytes);
  console.log('ServerKey deserialized OK');
  
  const diskPublicKey = wasm.FhisShortintPublicKey.deserialize(publicKeyBytes);
  console.log('PublicKey deserialized OK');
  
  // Try encrypting with the deserialized public key
  console.log('\n--- Test: Deserialized PublicKey.encrypt(1) ---');
  const ct1 = diskPublicKey.encrypt(1);
  console.log('Encrypted, size:', ct1.serialize().length);
  const val1 = ct1.decrypt(diskClientKey);
  console.log('Decrypted:', val1, '(expected: 1)');
  
  // Accumulate
  console.log('\n--- Test: Accumulate 1+1 ---');
  const ct2a = diskPublicKey.encrypt(1);
  const ct2b = diskPublicKey.encrypt(1);
  const sum = diskServerKey.add(ct2a, ct2b);
  const val2 = sum.decrypt(diskClientKey);
  console.log('Accumulated 1+1, decrypted:', val2, '(expected: 2)');
  
  // Accumulate 5
  console.log('\n--- Test: Accumulate 5 votes ---');
  let acc = diskPublicKey.encrypt(1);
  for (let i = 0; i < 4; i++) {
    acc = diskServerKey.add(acc, diskPublicKey.encrypt(1));
  }
  const val5 = acc.decrypt(diskClientKey);
  console.log('Accumulated 5 votes, decrypted:', val5, '(expected: 5)');
  
} catch (e) {
  console.error('Error:', e.message);
  console.error('Stack:', e.stack);
}

console.log('\n=== Done ===');
