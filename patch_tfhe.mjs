import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const wasmPath = path.join(__dirname, 'node_modules/tfhe/tfhe_bg.wasm');
const tfhePath = path.join(__dirname, 'node_modules/tfhe/tfhe.js');
const workerHelpersPath = path.join(__dirname, 'node_modules/tfhe/snippets/wasm-bindgen-rayon-38edf6e439f6d70d/src/workerHelpers.js');

fs.writeFileSync(workerHelpersPath, `
export async function startWorkers(module, memory, builder) {
  if (builder.numThreads() === 0) {
    console.log('Single-threaded mode: skipping worker initialization');
    return;
  }
  console.log('Multi-threaded: workers not supported in Node.js');
  throw new Error('Workers not supported in Node.js');
}
`);

console.log('Patched workerHelpers.js');

fs.writeFileSync(tfhePath, fs.readFileSync(tfhePath, 'utf8').replace(
  'import { startWorkers } from ',
  '// Worker polyfill: const startWorkers = async () => {};\n// Disabled for Node.js: import { startWorkers } from '
));

const content = fs.readFileSync(tfhePath, 'utf8');
const patched = content.includes('Single-threaded mode');
console.log('tfhe.js patched:', patched);
