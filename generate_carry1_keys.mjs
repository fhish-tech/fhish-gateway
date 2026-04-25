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

console.log('=== Generate NEW Keys with CARRY_1 ===\n');

// Use CARRY_1 config (compact_pk uses MESSAGE_1_CARRY_1)
const config = wasm.FhisShortintConfig.compact_pk();
console.log('Config: compact_pk (MESSAGE_1_CARRY_1)');
console.log('This allows counting up to 3 before carry overflow\n');

// Generate keys
console.log('Generating ClientKey...');
const clientKey = new wasm.FhisShortintClientKey(config);
console.log('ClientKey generated');

console.log('Generating CompactPublicKey...');
const compactPK = wasm.FhisShortintCompactPublicKey.new(clientKey);
console.log('CompactPublicKey generated');

console.log('Generating ServerKey...');
const serverKey = new wasm.FhisShortintServerKey(clientKey);
console.log('ServerKey generated');

// Save keys
const keysDir = path.join(__dirname, 'keys-new-carry1');
fs.mkdirSync(keysDir, { recursive: true });

fs.writeFileSync(path.join(keysDir, 'shortint_client_key.bin'), clientKey.serialize());
console.log('Saved ClientKey');

fs.writeFileSync(path.join(keysDir, 'shortint_public_key.bin'), compactPK.serialize());
console.log('Saved CompactPublicKey');

fs.writeFileSync(path.join(keysDir, 'shortint_server_key.bin'), serverKey.serialize());
console.log('Saved ServerKey');

// Write metadata
const metadata = {
  type: "FhisShortint",
  parameters: "V1_1_PARAM_MESSAGE_1_CARRY_1_COMPACT_PK_KS_PBS_GAUSSIAN_2M64",
  message_bits: 1,
  carry_bits: 1,
  max_value: 3,
  created: new Date().toISOString()
};
fs.writeFileSync(path.join(keysDir, 'key_metadata.json'), JSON.stringify(metadata, null, 2));
console.log('Saved metadata');

// Test accumulation
console.log('\n=== Testing Accumulation with NEW CARRY_1 Keys ===\n');

// Test single encryption
console.log('--- Test: Encrypt 1 ---');
const ct1 = compactPK.encrypt(1).expand();
const val1 = ct1.decrypt(clientKey);
console.log('Encrypted 1, decrypted:', val1);

// Test 1+1
console.log('\n--- Test: 1+1 = 2 ---');
const ct2a = compactPK.encrypt(1).expand();
const ct2b = compactPK.encrypt(1).expand();
const sum2 = serverKey.add(ct2a, ct2b);
const val2 = sum2.decrypt(clientKey);
console.log('1+1 =', val2, '(expected: 2)');

// Test 1+2
console.log('\n--- Test: 1+2 = 3 ---');
const ct3a = compactPK.encrypt(1).expand();
const ct3b = compactPK.encrypt(2).expand();
const sum3 = serverKey.add(ct3a, ct3b);
const val3 = sum3.decrypt(clientKey);
console.log('1+2 =', val3, '(expected: 3)');

// Test 2+2 (should overflow)
console.log('\n--- Test: 2+2 = 4 (overflow expected) ---');
const ct4a = compactPK.encrypt(2).expand();
const ct4b = compactPK.encrypt(2).expand();
const sum4 = serverKey.add(ct4a, ct4b);
const val4 = sum4.decrypt(clientKey);
console.log('2+2 =', val4, '(expected: 4, but may overflow to 0)');

// Test 5 votes (1+1+1+1+1)
console.log('\n--- Test: 5 votes (1+1+1+1+1) ---');
let acc = compactPK.encrypt(1).expand();
for (let i = 0; i < 4; i++) {
  acc = serverKey.add(acc, compactPK.encrypt(1).expand());
}
const val5 = acc.decrypt(clientKey);
console.log('1+1+1+1+1 =', val5, '(expected: 5, but may overflow)');

// Test 3 votes (should work without overflow)
console.log('\n--- Test: 3 votes (1+1+1) ---');
acc = compactPK.encrypt(1).expand();
acc = serverKey.add(acc, compactPK.encrypt(1).expand());
acc = serverKey.add(acc, compactPK.encrypt(1).expand());
const val3b = acc.decrypt(clientKey);
console.log('1+1+1 =', val3b, '(expected: 3)');

// Mixed values: 1+1+1
console.log('\n--- Test: 1+1+1 = 3 ---');
acc = compactPK.encrypt(1).expand();
acc = serverKey.add(acc, compactPK.encrypt(1).expand());
acc = serverKey.add(acc, compactPK.encrypt(1).expand());
const val1b = acc.decrypt(clientKey);
console.log('1+1+1 =', val1b, '(expected: 3)');

console.log('\n=== Done ===');
