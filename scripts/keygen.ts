import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const keysDir = path.join(__dirname, '../keys');

console.log('╔══════════════════════════════════════════════════════╗');
console.log('║         FHISH KEY GENERATION (fhish-wasm)         ║');
console.log('╚══════════════════════════════════════════════════════╝');

async function main() {
  try {
    console.log('[Keygen] Importing fhish-wasm...');
    let fhis;
    try {
      // Try Docker path first
      // @ts-ignore
      fhis = await import('/packages/fhish-wasm/pkg-node/fhish_wasm.js');
      console.log('[Keygen] Imported from Docker path');
    } catch (e) {
      try {
        // Try local dev path
        // @ts-ignore
        fhis = await import('../../packages/fhish-wasm/pkg-node/fhish_wasm.js');
        console.log('[Keygen] Imported from local dev path');
      } catch (e2) {
        // Fallback to module
        fhis = await import('fhish-wasm');
        console.log('[Keygen] Imported as module');
      }
    }
    
    console.log("[Keygen] Generating keys...");
    const config = new fhis.FhisConfig();
    console.log("[Keygen] Config built");

    let clientKey;
    try {
      clientKey = fhis.FhisClientKey.generate(config);
      console.log("[Keygen] Client key generated (Normal)");
    } catch (e) {
      console.log("[Keygen] Normal generation failed, using Deterministic Mode...");
      // Use a fixed seed (BigInts for hi/lo bits)
      clientKey = fhis.FhisClientKey.generate_deterministic(config, BigInt("0x1234567812345678"), BigInt("0x9abcdef09abcdef0"));
      console.log("[Keygen] Client key generated (Deterministic)");
    }
    
    console.log('[Keygen] Generating compressed public key...');
    const compressedPublicKey = fhis.FhisCompactPublicKey.new(clientKey);
    console.log('[Keygen] Compressed public key generated');
    
    console.log('[Keygen] Saving keys...');
    
    fs.mkdirSync(keysDir, { recursive: true });
    
    const clientKeySer = clientKey.serialize();
    const publicKeySer = compressedPublicKey.serialize();
    
    fs.writeFileSync(path.join(keysDir, 'fhish_client_key.bin'), Buffer.from(clientKeySer));
    console.log('[Keygen] Client key saved:', clientKeySer.length, 'bytes');
    
    fs.writeFileSync(path.join(keysDir, 'fhish_public_key.bin'), Buffer.from(publicKeySer));
    console.log('[Keygen] Public key saved:', publicKeySer.length, 'bytes');
    
    const metadata = {
      clientKey: {
        data_id: 'fhish-client-key-v3',
        size: clientKeySer.length
      },
      publicKey: {
        data_id: 'fhish-compressed-public-key-v3',
        size: publicKeySer.length
      },
      generatedAt: new Date().toISOString(),
      compatibleWith: 'fhish-wasm 1.5.4'
    };
    
    fs.writeFileSync(path.join(keysDir, 'key_metadata.json'), JSON.stringify(metadata, null, 2));
    console.log('[Keygen] Metadata saved');
    
    console.log('[Keygen] ✓ Keys generated successfully!');
    
  } catch (err: any) {
    console.error('[Keygen] Failed:', err.message);
    console.error('[Keygen] Stack:', err.stack);
    process.exit(1);
  }
}

main();
