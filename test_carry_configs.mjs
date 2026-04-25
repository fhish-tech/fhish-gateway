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

console.log('=== Testing CARRY_1 Config ===\n');

// Try different configs
const configs = [
  { name: 'carry_1', config: wasm.FhisShortintConfig.carry_1() },
  { name: 'carry_2', config: wasm.FhisShortintConfig.carry_2() },
  { name: 'carry_2_128bit', config: wasm.FhisShortintConfig.carry_2_128bit() },
  { name: 'compact_pk', config: wasm.FhisShortintConfig.compact_pk() },
];

for (const { name, config } of configs) {
  console.log(`\n--- Testing ${name} ---`);
  try {
    console.log(`  Creating ClientKey...`);
    const clientKey = new wasm.FhisShortintClientKey(config);
    console.log(`  ClientKey created`);
    
    console.log(`  Creating CompactPublicKey...`);
    const compactPK = wasm.FhisShortintCompactPublicKey.new(clientKey);
    console.log(`  CompactPublicKey created`);
    
    console.log(`  Creating ServerKey...`);
    const serverKey = new wasm.FhisShortintServerKey(clientKey);
    console.log(`  ServerKey created`);
    
    // Test encryption
    console.log(`  Testing encryption...`);
    const ct = compactPK.encrypt(1).expand();
    const val = ct.decrypt(clientKey);
    console.log(`  Encrypt 1, decrypt: ${val}`);
    
    // Test accumulation
    console.log(`  Testing accumulation...`);
    const ct2a = compactPK.encrypt(1).expand();
    const ct2b = compactPK.encrypt(1).expand();
    const sum = serverKey.add(ct2a, ct2b);
    const val2 = sum.decrypt(clientKey);
    console.log(`  1+1 = ${val2} (expected: 2)`);
    
    // Test 5 votes
    let acc = compactPK.encrypt(1).expand();
    for (let i = 0; i < 4; i++) {
      acc = serverKey.add(acc, compactPK.encrypt(1).expand());
    }
    const val5 = acc.decrypt(clientKey);
    console.log(`  5 votes = ${val5} (expected: 5)`);
    
    console.log(`  SUCCESS with ${name}!`);
    
  } catch (e) {
    console.log(`  FAILED: ${e.message}`);
  }
}

console.log('\n=== Done ===');
