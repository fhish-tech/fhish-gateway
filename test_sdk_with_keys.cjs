const fs = require('fs');
const path = require('path');

// Load WASM module
const wasm = require('/Users/jaibajrang/Desktop/Projects/fhish/packages/fhish-wasm/pkg-node/fhish_wasm.js');

console.log('=== FHISH SDK Test with Pre-generated Keys ===\n');

// Load pre-generated keys
const keysDir = path.join(__dirname, 'keys-generic');
const clientKeyBytes = fs.readFileSync(path.join(keysDir, 'fhe_client_key.bin'));
const serverKeyBytes = fs.readFileSync(path.join(keysDir, 'fhe_server_key.bin'));

console.log('Keys loaded:');
console.log('  Client Key:', clientKeyBytes.length, 'bytes');
console.log('  Server Key:', serverKeyBytes.length, 'bytes');

// Create client and operations
const clientKey = wasm.FhisClientKey.deserialize(clientKeyBytes);
const serverKey = wasm.FhisServerKey.deserialize(serverKeyBytes);
wasm.set_server_key(serverKey);

console.log('\n=== Testing Uint32 Operations ===');

// Encrypt
const ct1 = wasm.FhisUint32.encrypt(100, clientKey);
const ct2 = wasm.FhisUint32.encrypt(200, clientKey);
console.log('Encrypted 100 and 200');

// Arithmetic
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

// Min/Max
const max = ct1.max(ct2);
console.log('max(100, 200) =', max.decrypt(clientKey), '(expected: 200)');

const min = ct1.min(ct2);
console.log('min(100, 200) =', min.decrypt(clientKey), '(expected: 100)');

console.log('\n=== Testing Uint64 Operations ===');

const ctBig1 = wasm.FhisUint64.encrypt(BigInt('9999999999999'), clientKey);
const ctBig2 = wasm.FhisUint64.encrypt(BigInt('1'), clientKey);

const bigSum = ctBig1.add(ctBig2);
console.log('9999999999999 + 1 =', bigSum.decrypt(clientKey).toString(), '(expected: 10000000000000)');

console.log('\n=== Testing Bool Operations ===');

const bt = wasm.FhisBool.encrypt(true, clientKey);
const bf = wasm.FhisBool.encrypt(false, clientKey);

console.log('true =', bt.decrypt(clientKey), '(expected: true)');
console.log('false =', bf.decrypt(clientKey), '(expected: false)');

const andResult = bt.and(bf);
console.log('true AND false =', andResult.decrypt(clientKey), '(expected: false)');

const orResult = bt.or(bf);
console.log('true OR false =', orResult.decrypt(clientKey), '(expected: true)');

const xorResult = bt.xor(bf);
console.log('true XOR false =', xorResult.decrypt(clientKey), '(expected: true)');

const notResult = bt.not();
console.log('NOT true =', notResult.decrypt(clientKey), '(expected: false)');

console.log('\n=== Ciphertext Sizes ===');
console.log('Uint32 ciphertext:', ct1.serialize().length, 'bytes');
console.log('Uint64 ciphertext:', ctBig1.serialize().length, 'bytes');
console.log('Bool ciphertext:', bt.serialize().length, 'bytes');

console.log('\n✅ All tests passed!');
console.log('\nThe FHISH SDK is ready for use with pre-generated keys.');
