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

console.log('=== Regenerating SHORTINT Keys ===');
console.log('This will create keys matching the WASM parameters...');

const config = wasm.FhisShortintConfig.compact_pk();
console.log('Config: compact_pk() (V1_1_PARAM_MESSAGE_1_CARRY_0_COMPACT_PK_KS_PBS)');

console.log('Generating ClientKey...');
const clientKey = wasm.FhisShortintClientKey.new(config);
const clientKeyBytes = clientKey.serialize();
console.log('ClientKey size:', clientKeyBytes.length);

console.log('Generating PublicKey...');
const publicKey = wasm.FhisShortintCompactPublicKey.new(clientKey);
const publicKeyBytes = publicKey.serialize();
console.log('PublicKey size:', publicKeyBytes.length);

console.log('Generating ServerKey...');
const serverKey = wasm.FhisShortintServerKey.new(clientKey);
const serverKeyBytes = serverKey.serialize();
console.log('ServerKey size:', serverKeyBytes.length);

// Save keys
const keysDir = path.join(__dirname, 'keys-shortint');
fs.writeFileSync(path.join(keysDir, 'shortint_client_key.bin'), Buffer.from(clientKeyBytes));
fs.writeFileSync(path.join(keysDir, 'shortint_public_key.bin'), Buffer.from(publicKeyBytes));
fs.writeFileSync(path.join(keysDir, 'shortint_server_key.bin'), Buffer.from(serverKeyBytes));

// Update metadata
const metadata = {
  type: 'FhisShortint',
  parameters: 'V1_1_PARAM_MESSAGE_1_CARRY_0_COMPACT_PK_KS_PBS',
  lwe_dimension: 684,
  ciphertext_size: '~5.5KB',
  created: new Date().toISOString()
};
fs.writeFileSync(path.join(keysDir, 'key_metadata.json'), JSON.stringify(metadata, null, 2));

console.log('=== Keys regenerated successfully! ===');
console.log('Keys saved to keys-shortint/');
console.log('Restart the gateway to use new keys.');
