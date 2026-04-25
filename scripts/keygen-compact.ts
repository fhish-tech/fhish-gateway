import * as nodeTfhe from 'node-tfhe';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  console.log('Generating FHISH FHE keypair with COMPACT parameters (Zama/FHEVM approach)...');
  console.log('This produces ~32KB public key instead of ~1MB, and ~7KB ciphertexts instead of ~263KB\n');

  const config = nodeTfhe.TfheConfigBuilder.default_with_compact_public_key().build();

  console.log('[1/4] Generating TfheClientKey...');
  const clientKey = nodeTfhe.TfheClientKey.generate(config);

  console.log('[2/4] Generating TfheCompactPublicKey...');
  const publicKey = nodeTfhe.TfheCompactPublicKey.new(clientKey);
  const publicKeyBytes = publicKey.serialize();
  const clientKeyBytes = clientKey.serialize();

  console.log('[3/4] Testing compact encryption/decryption...');
  const testCtCompact = nodeTfhe.CompactFheUint32.encrypt_with_compact_public_key(123n, publicKey);
  const testCtSerialized = testCtCompact.serialize();
  const testCtDeserialized = nodeTfhe.CompactFheUint32.deserialize(testCtSerialized);
  const expanded = testCtDeserialized.expand();
  const decrypted = expanded.decrypt(clientKey);
  console.log(`    Compact test: encrypt(123) -> serialize(${testCtSerialized.length}B) -> decrypt = ${Number(decrypted) === 123 ? 'OK ✓' : 'FAIL ✗'}`);

  const testCtRegular = nodeTfhe.FheUint32.encrypt_with_client_key(456n, clientKey);
  const testCtRegularSerialized = testCtRegular.serialize();
  const decryptedRegular = testCtRegular.decrypt(clientKey);
  console.log(`    Regular test: encrypt(456) -> serialize(${testCtRegularSerialized.length}B) -> decrypt = ${Number(decryptedRegular) === 456 ? 'OK ✓' : 'FAIL ✗'}`);

  console.log('[4/4] Saving keys...');
  const keysDir = path.join(__dirname, '../keys');
  if (!fs.existsSync(keysDir)) {
    fs.mkdirSync(keysDir, { recursive: true });
  }

  fs.writeFileSync(path.join(keysDir, 'fhish_public_key.bin'), Buffer.from(publicKeyBytes));
  fs.writeFileSync(path.join(keysDir, 'fhish_client_key.bin'), Buffer.from(clientKeyBytes));

  const keyMeta = {
    publicKey: { data_id: 'fhish-public-key-compact-v1', size: publicKeyBytes.length, type: 'compact' },
    clientKey: { data_id: 'fhish-client-key-v1', size: clientKeyBytes.length },
    generatedAt: new Date().toISOString(),
    compatibleWith: 'tfhe-rs node-tfhe (compact mode)',
    note: 'Uses TfheCompactPublicKey for ~7KB ciphertexts instead of ~263KB',
  };
  fs.writeFileSync(
    path.join(keysDir, 'key_metadata.json'),
    JSON.stringify(keyMeta, null, 2)
  );

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  FHISH FHE KEYPAIR GENERATED (COMPACT MODE)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  Public key:  ${publicKeyBytes.length.toLocaleString()} bytes (was ~1MB)`);
  console.log(`  Client key:  ${clientKeyBytes.length.toLocaleString()} bytes`);
  console.log(`  Ciphertext:  ~7KB (was ~263KB)`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  KEEP fhish_client_key.bin SECRET!');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

main().catch(console.error);
