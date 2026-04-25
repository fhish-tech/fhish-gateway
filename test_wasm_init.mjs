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
console.log('WASM module loaded:', typeof wasm);
console.log('WASM keys:', Object.keys(wasm));

if (typeof wasm.default === 'function') {
  console.log('Calling WASM init...');
  await wasm.default();
  console.log('WASM init complete');
}

// Check if WASM memory is initialized
console.log('\nChecking WASM memory...');
try {
  const memory = wasm.__wbindgen_wasm_module;
  console.log('WASM module:', typeof memory);
} catch (e) {
  console.log('Error accessing WASM module:', e.message);
}

// Check the exported memory
console.log('\nChecking memory export...');
try {
  if (wasm.memory) {
    console.log('Memory exported, size:', wasm.memory.buffer.byteLength);
  } else {
    console.log('Memory not directly exported');
  }
} catch (e) {
  console.log('Error:', e.message);
}

// Try creating config and client key
console.log('\nCreating config...');
const config = new wasm.FhisShortintConfig();
console.log('Config type:', typeof config);

console.log('\nCreating ClientKey...');
const clientKey = new wasm.FhisShortintClientKey(config);
console.log('ClientKey created, checking internal state...');

// Try to access internal state
console.log('ClientKey constructor name:', clientKey.constructor.name);
console.log('ClientKey toString:', clientKey.toString());

// Check for __wbg_ptr
if (clientKey.hasOwnProperty('__wbg_ptr')) {
  console.log('__wbg_ptr:', clientKey.__wbg_ptr);
} else {
  console.log('__wbg_ptr not found on instance');
}

// Try methods
console.log('\nTrying encrypt method...');
try {
  const ct = clientKey.encrypt(1);
  console.log('Encrypt succeeded, ct type:', typeof ct);
} catch (e) {
  console.log('Encrypt failed:', e.message);
}

console.log('\n=== Done ===');
