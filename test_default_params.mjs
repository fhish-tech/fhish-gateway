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

console.log('=== Testing with STANDARD params (ClientKey.encrypt) ===');

try {
  const config = new wasm.FhisShortintConfig();
  console.log('Config created');
  
  const clientKey = new wasm.FhisShortintClientKey(config);
  console.log('ClientKey generated');
  
  const serverKey = new wasm.FhisShortintServerKey(clientKey);
  console.log('ServerKey generated');
  
  // Encrypt using ClientKey.encrypt() - this encrypts directly
  console.log('\n--- Encrypt 1 using clientKey.encrypt() ---');
  const ct1 = clientKey.encrypt(1);
  console.log('Encrypted, size:', ct1.serialize().length);
  const val1 = ct1.decrypt(clientKey);
  console.log('Decrypted:', val1);
  
  // Accumulate
  console.log('\n--- Accumulate 1+1 ---');
  const ct2 = clientKey.encrypt(1);
  const sum = serverKey.add(ct1, ct2);
  const val2 = sum.decrypt(clientKey);
  console.log('Accumulated 1+1, decrypted:', val2);
  
  // Accumulate more
  console.log('\n--- Accumulate 5 votes ---');
  let acc = clientKey.encrypt(1);
  for (let i = 0; i < 4; i++) {
    const ct = clientKey.encrypt(1);
    acc = serverKey.add(acc, ct);
  }
  const val5 = acc.decrypt(clientKey);
  console.log('Accumulated 5 votes, decrypted:', val5);
  
  // Save ciphertext for gateway
  const ctHex = '0x' + Buffer.from(ct1.serialize()).toString('hex');
  fs.writeFileSync('/tmp/standard_ct.txt', ctHex);
  console.log('\nSaved ciphertext to /tmp/standard_ct.txt');
  
} catch (e) {
  console.error('Error:', e.message, e.stack);
}

console.log('\n=== Done ===');
