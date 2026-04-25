import fs from 'fs';
import path from 'path';
import http from 'http';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const keysDir = path.join(__dirname, '../keys');
const wasmPort = 8081;

const fakeSelf = {
  addEventListener: () => {},
  removeEventListener: () => {},
  postMessage: () => {},
  dispatchEvent: () => true,
};
(globalThis).self = fakeSelf;

async function initTfhe() {
  const wasmPath = path.join(__dirname, '../node_modules/tfhe/tfhe_bg.wasm');
  console.log('[Keygen] WASM path:', wasmPath);
  
  const wasmServer = http.createServer((req, res) => {
    if (req.url === '/' || req.url === '/tfhe_bg.wasm') {
      res.writeHead(200, { 'Content-Type': 'application/wasm' });
      fs.createReadStream(wasmPath).pipe(res);
    } else {
      res.writeHead(404);
      res.end();
    }
  });
  
  await new Promise<void>((resolve) => {
    wasmServer.listen(wasmPort, '127.0.0.1', () => {
      console.log(`[Keygen] WASM server listening on port ${wasmPort}`);
      resolve();
    });
  });
  
  console.log('[Keygen] Loading tfhe module...');
  const tfhe = await import('tfhe');
  
  const wasmUrl = `http://127.0.0.1:${wasmPort}/tfhe_bg.wasm`;
  const response = await fetch(wasmUrl);
  
  await tfhe.default(response);
  console.log('[Keygen] WASM initialized successfully');
  
  wasmServer.close();
  
  return tfhe;
}

async function generateKeys(tfhe: any) {
  console.log('[Keygen] Generating client key...');
  const config = tfhe.TfheConfigBuilder.default();
  const clientKey = new tfhe.TfheClientKey(config);
  
  console.log('[Keygen] Generating compressed public key...');
  const publicKey = tfhe.TfheCompressedPublicKey.new(clientKey);
  
  console.log('[Keygen] Saving keys...');
  
  fs.mkdirSync(keysDir, { recursive: true });
  
  fs.writeFileSync(
    path.join(keysDir, 'fhish_client_key.bin'),
    clientKey.serialize()
  );
  console.log('[Keygen] Client key saved');
  
  fs.writeFileSync(
    path.join(keysDir, 'fhish_public_key.bin'),
    publicKey.serialize()
  );
  console.log('[Keygen] Public key saved');
  
  const metadata = {
    publicKey: {
      data_id: 'fhish-public-key-v2',
      size: publicKey.serialize().length,
      type: 'compressed'
    },
    clientKey: {
      data_id: 'fhish-client-key-v2',
      size: clientKey.serialize().length
    },
    generatedAt: new Date().toISOString(),
    compatibleWith: 'tfhe 1.5.4 npm package'
  };
  
  fs.writeFileSync(
    path.join(keysDir, 'key_metadata.json'),
    JSON.stringify(metadata, null, 2)
  );
  console.log('[Keygen] Metadata saved');
  
  console.log('[Keygen] ✓ Keys generated successfully!');
  console.log(`[Keygen] Client key: ${metadata.clientKey.size} bytes`);
  console.log(`[Keygen] Public key: ${metadata.publicKey.size} bytes`);
}

async function main() {
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║         FHISH KEY GENERATION                      ║');
  console.log('╚══════════════════════════════════════════════════════╝');
  
  try {
    const tfhe = await initTfhe();
    await generateKeys(tfhe);
  } catch (err) {
    console.error('[Keygen] Failed:', err);
    process.exit(1);
  }
}

main();
