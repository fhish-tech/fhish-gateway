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

console.log('=== Testing GENERIC FhisClientKey (not shortint) ===\n');

// Create a generic FhisConfig
console.log('Creating FhisConfig...');
const config = new wasm.FhisConfig();
console.log('Config created');

// Generate generic ClientKey
console.log('\nGenerating FhisClientKey...');
try {
  const clientKey = wasm.FhisClientKey.generate(config);
  console.log('ClientKey generated!');
  console.log('ClientKey type:', typeof clientKey);
  console.log('ClientKey keys:', Object.keys(clientKey));
  
  // Try to serialize
  console.log('\nTrying serialize...');
  const serialized = clientKey.serialize();
  console.log('Serialized, length:', serialized.length);
  
} catch (e) {
  console.log('Error:', e.message);
}

console.log('\n=== Done ===');
