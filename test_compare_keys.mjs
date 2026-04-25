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

console.log('=== Compare deserialized vs freshly created keys ===\n');

// Load existing keys from disk
const keysDir = path.join(__dirname, 'keys-shortint');
const clientKeyBytes = fs.readFileSync(path.join(keysDir, 'shortint_client_key.bin'));

console.log('Loading existing ClientKey from disk...');
const diskClientKey = wasm.FhisShortintClientKey.deserialize(clientKeyBytes);
console.log('Deserialized ClientKey OK');
console.log('Deserialized key properties:', Object.getOwnPropertyNames(diskClientKey));

// Try methods on deserialized key
console.log('\nTrying encrypt on deserialized key...');
try {
  const ct = diskClientKey.encrypt(1);
  console.log('Encrypt succeeded!');
  const val = ct.decrypt(diskClientKey);
  console.log('Decrypt result:', val);
} catch (e) {
  console.log('Encrypt failed:', e.message);
}

// Now create a new key
console.log('\n\nCreating new ClientKey...');
const config = wasm.FhisShortintConfig.carry_1();
const newClientKey = new wasm.FhisShortintClientKey(config);
console.log('New ClientKey created');
console.log('New key properties:', Object.getOwnPropertyNames(newClientKey));

// Try methods on new key
console.log('\nTrying encrypt on new key...');
try {
  const ct = newClientKey.encrypt(1);
  console.log('Encrypt succeeded!');
  const val = ct.decrypt(newClientKey);
  console.log('Decrypt result:', val);
} catch (e) {
  console.log('Encrypt failed:', e.message);
}

// Check if both objects are valid
console.log('\n\nComparing keys...');
console.log('Disk key constructor:', diskClientKey.constructor.name);
console.log('New key constructor:', newClientKey.constructor.name);
console.log('Disk key is valid:', diskClientKey !== null && diskClientKey !== undefined);
console.log('New key is valid:', newClientKey !== null && newClientKey !== undefined);

// Try to serialize the new key
console.log('\n\nTrying to serialize new key...');
try {
  const serialized = newClientKey.serialize();
  console.log('Serialize succeeded, length:', serialized.length);
} catch (e) {
  console.log('Serialize failed:', e.message);
}

console.log('\n=== Done ===');
