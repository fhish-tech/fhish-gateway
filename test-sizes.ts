import fs from 'fs';
import http from 'http';

const publicKeySer = fs.readFileSync('./keys/fhish_public_key.bin');

const wasmServer = http.createServer((req, res) => {
  if (req.url === '/tfhe_bg.wasm') {
    res.writeHead(200, { 'Content-Type': 'application/wasm' });
    fs.createReadStream('./node_modules/tfhe/tfhe_bg.wasm').pipe(res);
  } else { res.writeHead(404); res.end(); }
});

wasmServer.listen(8086, '127.0.0.1', async () => {
  try {
    const mod = await import('tfhe');
    const resp = await fetch('http://127.0.0.1:8086/tfhe_bg.wasm');
    await mod.default(resp);
    
    const pubKey = mod.TfheCompressedPublicKey.deserialize(new Uint8Array(publicKeySer));
    
    const ctBool = (mod.FheBool as any).encrypt_with_compressed_public_key(true, pubKey);
    console.log('FheBool ciphertext size:', ctBool.serialize().length, 'bytes');
    
    const ct8 = (mod.FheUint8 as any).encrypt_with_compressed_public_key(1, pubKey);
    console.log('FheUint8 ciphertext size:', ct8.serialize().length, 'bytes');
    
    const ct32 = (mod.FheUint32 as any).encrypt_with_compressed_public_key(1, pubKey);
    console.log('FheUint32 ciphertext size:', ct32.serialize().length, 'bytes');
    
    process.exit(0);
  } catch(e: any) {
    console.error('Error:', e.message);
    process.exit(1);
  } finally { wasmServer.close(); }
});
