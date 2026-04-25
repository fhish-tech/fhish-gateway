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

console.log('=== Debugging WASM bindings ===\n');

// Check ClientKey static methods
console.log('FhisShortintClientKey static methods:', Object.keys(wasm.FhisShortintClientKey));

// Check instance
const config = wasm.FhisShortintConfig.carry_1();
const clientKey = new wasm.FhisShortintClientKey(config);

console.log('\nClientKey instance properties:', Object.getOwnPropertyNames(clientKey));

// Check if serialize exists
console.log('\nHas serialize:', typeof clientKey.serialize);
console.log('Has deserialize:', typeof clientKey.deserialize);

// Try serialize
console.log('\nSerializing ClientKey...');
const serialized = clientKey.serialize();
console.log('Serialized length:', serialized.length);

// Try deserialize
console.log('\nTrying to deserialize...');
try {
  const restored = wasm.FhisShortintClientKey.deserialize(serialized);
  console.log('Deserialized OK');
  console.log('Restored properties:', Object.getOwnPropertyNames(restored));
} catch (e) {
  console.log('Deserialize failed:', e.message);
}

// Check CompactPublicKey static methods
console.log('\n\nFhisShortintCompactPublicKey static methods:', Object.keys(wasm.FhisShortintCompactPublicKey));

// Check FhisShortintConfig
console.log('\n\nFhisShortintConfig methods:', Object.getOwnPropertyNames(wasm.FhisShortintConfig.prototype));
console.log('FhisShortintConfig static methods:', Object.keys(wasm.FhisShortintConfig));

console.log('\n=== Done ===');
