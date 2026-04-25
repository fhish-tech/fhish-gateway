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

console.log('=== Debugging CompactPublicKey creation ===\n');

// Check what classes are available
console.log('Available shortint classes:', Object.keys(wasm).filter(k => k.includes('Shortint')));

// Create config
const config = wasm.FhisShortintConfig.carry_1();
console.log('\nConfig created');

// Create ClientKey
const clientKey = new wasm.FhisShortintClientKey(config);
console.log('ClientKey created:', typeof clientKey);
console.log('ClientKey.__wbg_ptr:', clientKey.__wbg_ptr);

// Check what methods FhisShortintClientKey has
console.log('\nFhisShortintClientKey methods:', Object.getOwnPropertyNames(wasm.FhisShortintClientKey.prototype));

// Try creating CompactPublicKey
console.log('\nAttempting to create FhisShortintCompactPublicKey...');
try {
  const compactPK = wasm.FhisShortintCompactPublicKey.new(clientKey);
  console.log('SUCCESS!');
  console.log('CompactPublicKey created');
} catch (e) {
  console.log('FAILED:', e.message);
  console.log('Error details:', e);
}

// Try creating regular PublicKey instead
console.log('\nAttempting to create FhisShortintPublicKey...');
try {
  const publicKey = wasm.FhisShortintPublicKey.new(clientKey);
  console.log('SUCCESS!');
  console.log('PublicKey created');
  
  // Test with regular public key
  const ct = publicKey.encrypt(1);
  console.log('Encrypted 1, size:', ct.serialize().length);
  const val = ct.decrypt(clientKey);
  console.log('Decrypted:', val);
} catch (e) {
  console.log('FAILED:', e.message);
}

console.log('\n=== Done ===');
