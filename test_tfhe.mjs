import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

globalThis.self = globalThis;
globalThis.location = { href: 'file:///test' };

const OriginalFetch = globalThis.fetch;
const wasmPath = path.join(__dirname, 'node_modules/tfhe/tfhe_bg.wasm');
globalThis.fetch = async (input, init) => {
  if (typeof input === 'string' && input.startsWith('file://')) {
    const filePath = path.resolve(input.replace('file://', ''));
    const bytes = fs.readFileSync(filePath);
    return new Response(bytes, { headers: { 'content-type': 'application/wasm' } });
  }
  return OriginalFetch(input, init);
};

const tfhe = await import('tfhe');
await tfhe.default({ locateFile: () => wasmPath });
console.log('WASM loaded OK');

const config = tfhe.TfheConfigBuilder.default().build();
const ck = tfhe.TfheClientKey.generate(config);
console.log('CK generated OK, size:', ck.serialize().length);
const pk = tfhe.TfheCompactPublicKey.new(ck);
console.log('PK generated OK, size:', pk.serialize().length);

const pkBytes = fs.readFileSync(path.join(__dirname, 'keys/fhish_public_key.bin'));
const ckBytes = fs.readFileSync(path.join(__dirname, 'keys/fhish_client_key.bin'));
console.log('Loaded PK size:', pkBytes.length, ', CK size:', ckBytes.length);

const loadedPK = tfhe.TfheCompactPublicKey.deserialize(pkBytes);
console.log('PK deserialized OK');
const ct = tfhe.FheUint32.encrypt_with_compressed_public_key(42, loadedPK);
console.log('Encrypted OK, ct size:', ct.serialize().length);
const loadedCK = tfhe.TfheClientKey.deserialize(ckBytes);
console.log('CK deserialized OK');
console.log('Decrypted:', ct.decrypt(loadedCK));
