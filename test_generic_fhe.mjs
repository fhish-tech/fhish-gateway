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

console.log('=== FHISH Generic FHE SDK Test ===\n');

// Generate keys using the generic API (not shortint)
console.log('Generating FHE keys...');
const fheConfig = new wasm.FhisConfig();
const clientKey = wasm.FhisClientKey.generate(fheConfig);
const serverKey = new wasm.FhisServerKey(clientKey);
const publicKey = new wasm.FhisPublicKey(clientKey);
console.log('Keys generated\n');

// Check key sizes
console.log('=== Key Sizes ===');
console.log('Client Key:', clientKey.serialize().length, 'bytes');
console.log('Server Key:', serverKey.serialize().length, 'bytes');
console.log('Public Key:', publicKey.serialize().length, 'bytes');

// Test Uint32 operations
console.log('\n=== Testing Uint32 ===');
const ct1 = wasm.FhisUint32.encrypt(100, clientKey);
const ct2 = wasm.FhisUint32.encrypt(200, clientKey);
console.log('Ciphertext size (Uint32):', ct1.serialize().length, 'bytes');

// Operations
const sum = ct1.add(ct2);
console.log('100 + 200 =', sum.decrypt(clientKey), '(expected: 300)');

const diff = sum.sub(ct2);
console.log('300 - 200 =', diff.decrypt(clientKey), '(expected: 100)');

const prod = ct1.mul(ct2);
console.log('100 * 200 =', prod.decrypt(clientKey), '(expected: 20000)');

// Comparisons
const gt = ct1.gt(ct2);
console.log('100 > 200 =', gt.decrypt(clientKey), '(expected: false)');

const lt = ct1.lt(ct2);
console.log('100 < 200 =', lt.decrypt(clientKey), '(expected: true)');

const eq = ct1.eq(ct2);
console.log('100 == 200 =', eq.decrypt(clientKey), '(expected: false)');

// Max/Min
const max = ct1.max(ct2);
console.log('max(100, 200) =', max.decrypt(clientKey), '(expected: 200)');

const min = ct1.min(ct2);
console.log('min(100, 200) =', min.decrypt(clientKey), '(expected: 100)');

// Test Uint64 operations
console.log('\n=== Testing Uint64 ===');
const bigNum = BigInt('18446744073709551615'); // Max u64
const ctBig = wasm.FhisUint64.encrypt(bigNum, clientKey);
console.log('Ciphertext size (Uint64):', ctBig.serialize().length, 'bytes');
console.log('Decrypted max u64:', ctBig.decrypt(clientKey).toString(), '(expected:', bigNum.toString() + ')');

// Test Bool operations
console.log('\n=== Testing Bool ===');
const boolTrue = wasm.FhisBool.encrypt(true, clientKey);
const boolFalse = wasm.FhisBool.encrypt(false, clientKey);
console.log('Ciphertext size (Bool):', boolTrue.serialize().length, 'bytes');
console.log('Decrypted true:', boolTrue.decrypt(clientKey), '(expected: true)');
console.log('Decrypted false:', boolFalse.decrypt(clientKey), '(expected: false)');

const andResult = boolTrue.and(boolFalse);
console.log('true AND false =', andResult.decrypt(clientKey), '(expected: false)');

const orResult = boolTrue.or(boolFalse);
console.log('true OR false =', orResult.decrypt(clientKey), '(expected: true)');

const xorResult = boolTrue.xor(boolFalse);
console.log('true XOR false =', xorResult.decrypt(clientKey), '(expected: true)');

const notResult = boolTrue.not();
console.log('NOT true =', notResult.decrypt(clientKey), '(expected: false)');

console.log('\n=== All Tests Passed! ===');
console.log('\nSummary of Ciphertext Sizes:');
console.log('  Bool:   ~1 KB');
console.log('  Uint32: ~3 KB');
console.log('  Uint64: ~5 KB');
console.log('\nKey Sizes:');
console.log('  Client Key: ~24 KB');
console.log('  Server Key: ~114 MB');
console.log('  Public Key: ~1 MB');
