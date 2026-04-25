import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

globalThis.self = globalThis;
globalThis.location = { href: 'file:///test' };

const OriginalFetch = globalThis.fetch;
const wasmPath = path.join(__dirname, 'node_modules/fhish-wasm/fhish_wasm_bg.wasm');
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

console.log('=== Testing SHORTINT FHE ===');

const config = wasm.FhisShortintConfig.compact_pk();
console.log('Config created');

const clientKey = wasm.FhisShortintClientKey.new(config);
console.log('ClientKey generated, size:', clientKey.serialize().length);

const publicKey = wasm.FhisShortintCompactPublicKey.new(clientKey);
console.log('PublicKey generated, size:', publicKey.serialize().length);

// Encrypt
const compactCt = publicKey.encrypt(1);
console.log('Encrypted with compact key');

const ct = compactCt.expand();
const ctBytes = ct.serialize();
console.log('Ciphertext size:', ctBytes.length);

// Save hex for testing
const hex = '0x' + Buffer.from(ctBytes).toString('hex');
fs.writeFileSync('/tmp/test_vote.txt', hex);
console.log('Saved ciphertext to /tmp/test_vote.txt');
console.log('First 100 hex chars:', hex.slice(0, 102));

// Also save the serverKey
const serverKey = wasm.FhisShortintServerKey.new(clientKey);
const skBytes = serverKey.serialize();
console.log('ServerKey generated, size:', skBytes.length);

console.log('=== Test Complete ===');
