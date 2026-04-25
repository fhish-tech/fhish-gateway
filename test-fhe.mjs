import tfhe from 'node-tfhe';
import fs from 'fs';

console.log('Loading keys...');
const clientKeySer = fs.readFileSync('./keys/fhish_client_key.bin');
const clientKey = tfhe.TfheClientKey.deserialize(new Uint8Array(clientKeySer));
console.log('Client key loaded');

console.log('Generating server key...');
tfhe.init_panic_hook();
const serverKey = tfhe.TfheServerKey.new(clientKey);
tfhe.set_server_key(serverKey);
console.log('Server key generated');

// Check the actual type of serverKey
console.log('serverKey instanceof:', serverKey.constructor.name);

// Check TfheServerKey properties
const sk = tfhe.TfheServerKey;
console.log('\nTfheServerKey length:', tfhe.TfheServerKey.length);

// Check if there are any hidden methods
const allMethods = [];
let proto = serverKey;
while (proto && proto !== Object.prototype) {
  allMethods.push(...Object.getOwnPropertyNames(proto));
  proto = Object.getPrototypeOf(proto);
}
console.log('\nAll methods:', allMethods.filter(m => !m.startsWith('__')).join(', '));

// Try calling tfhe.add
console.log('\nChecking tfhe.add:', typeof tfhe.add);
console.log('Checking tfhe.fhe_add:', typeof tfhe.fhe_add);
console.log('Checking tfhe.add_uint32:', typeof tfhe.add_uint32);
