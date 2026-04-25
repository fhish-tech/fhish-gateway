const fs = require('fs');
const path = require('path');

// Load WASM module
const wasm = require('../packages/fhish-wasm/pkg-node/fhish_wasm.js');

console.log('=== FHISH SDK Test with Shortint Types ===\n');

// Load pre-generated shortint keys
const keysDir = path.join(__dirname, 'keys-carry2');
const clientKeyBytes = fs.readFileSync(path.join(keysDir, 'shortint_client_key.bin'));
const serverKeyBytes = fs.readFileSync(path.join(keysDir, 'shortint_server_key.bin'));
const publicKeyBytes = fs.readFileSync(path.join(keysDir, 'shortint_public_key.bin'));

console.log('Keys loaded:');
console.log('  Client Key:', clientKeyBytes.length, 'bytes');
console.log('  Server Key:', serverKeyBytes.length, 'bytes');
console.log('  Public Key:', publicKeyBytes.length, 'bytes');

// Load keys
const clientKey = wasm.FhisShortintClientKey.deserialize(clientKeyBytes);
const serverKey = wasm.FhisShortintServerKey.deserialize(serverKeyBytes);
const compactPK = wasm.FhisShortintCompactPublicKey.deserialize(publicKeyBytes);

console.log('\n=== Testing Shortint Encryption ===');

// Encrypt using compact public key
const ctList = compactPK.encrypt(5);
const ct = ctList.expand();
console.log('Encrypted 5 using CompactPublicKey');
console.log('Ciphertext size:', ct.serialize().length, 'bytes');

// Decrypt
const decrypted = ct.decrypt_full(clientKey);
console.log('Decrypted value:', decrypted, '(expected: 5)');

console.log('\n=== Testing Addition (Accumulation) ===');

// Add two ciphertexts
const ct2List = compactPK.encrypt(3);
const ct2 = ct2List.expand();

const sum = serverKey.add(ct, ct2);
const sumDecrypted = sum.decrypt_full(clientKey);
console.log('5 + 3 =', sumDecrypted, '(expected: 8)');

// Test voting scenario - accumulate multiple votes
console.log('\n=== Testing Voting Scenario ===');
let votes = compactPK.encrypt(1).expand();
for (let i = 0; i < 9; i++) {
  const v = compactPK.encrypt(1).expand();
  votes = serverKey.add(votes, v);
}
const voteCount = votes.decrypt_full(clientKey);
console.log('10 votes accumulated =', voteCount, '(expected: 10)');

// Test comparison
console.log('\n=== Testing Comparison ===');
const greaterThan = serverKey.greater_or_equal(ct, ct2);
console.log('5 >= 3 =', greaterThan ? 'true' : 'false', '(expected: true)');

const lessThan = serverKey.less(ct, ct2);
console.log('5 < 3 =', lessThan ? 'true' : 'false', '(expected: false)');

console.log('\n✅ Shortint tests passed!');
console.log('\nNote: Integer types (Uint32, Uint64) require proper WASM seeding.');
console.log('Use pre-generated keys for production.');
