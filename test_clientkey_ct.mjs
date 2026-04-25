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

console.log('=== Testing ClientKey Encryption ===');

// Load keys from disk
const keysDir = path.join(__dirname, 'keys-shortint');
const clientKeyBytes = fs.readFileSync(path.join(keysDir, 'shortint_client_key.bin'));
const serverKeyBytes = fs.readFileSync(path.join(keysDir, 'shortint_server_key.bin'));

const clientKey = wasm.FhisShortintClientKey.deserialize(clientKeyBytes);
console.log('ClientKey loaded from disk');

const serverKey = wasm.FhisShortintServerKey.deserialize(serverKeyBytes);
console.log('ServerKey loaded from disk');

// Encrypt using CLIENT KEY directly (not compact public key)
console.log('\n--- Test: ClientKey encrypt, ClientKey decrypt ---');
const ct1 = clientKey.encrypt(1);
console.log('Encrypted 1, size:', ct1.serialize().length);
const val1 = ct1.decrypt(clientKey);
console.log('Decrypted:', val1);

// Accumulate
console.log('\n--- Test: Accumulate 1+1 ---');
const ct2 = clientKey.encrypt(1);
const sum = serverKey.add(ct1, ct2);
console.log('Sum created, size:', sum.serialize().length);
const val2 = sum.decrypt(clientKey);
console.log('Decrypted sum:', val2);

// Accumulate more
console.log('\n--- Test: Accumulate 1+1+1+1+1 (5 votes) ---');
let acc = clientKey.encrypt(1);
for (let i = 0; i < 4; i++) {
  const ct = clientKey.encrypt(1);
  acc = serverKey.add(acc, ct);
}
const val5 = acc.decrypt(clientKey);
console.log('Decrypted sum of 5:', val5);

// Save ciphertext for gateway test
const ctHex = '0x' + Buffer.from(ct1.serialize()).toString('hex');
fs.writeFileSync('/tmp/clientkey_ct.txt', ctHex);
console.log('\nSaved ciphertext to /tmp/clientkey_ct.txt');

console.log('\n=== Done ===');
