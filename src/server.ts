import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { register, Counter, Histogram } from 'prom-client';

dotenv.config();

console.log('[GATEWAY] Starting FHISH Gateway...');
console.log('[GATEWAY] Env vars loaded');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = parseInt(process.env.PORT || '8080', 10);
const baseUrl = process.env.BASE_URL || `http://localhost:${port}`;
const relayerSecret = process.env.FHISH_RELAYER_SECRET || 'fhish-default-secret';
const adminApiKey = process.env.ADMIN_API_KEY || '';
const keysDir = path.join(__dirname, '../keys-shortint');
const useShortint = true;

console.log('[GATEWAY] Port:', port);
console.log('[GATEWAY] Keys directory:', keysDir);
console.log('[GATEWAY] Relayer secret configured:', relayerSecret !== 'fhish-default-secret' ? 'YES' : 'DEFAULT');
console.log('[GATEWAY] FHE Type: SHORTINT (using CompactPublicKey params)');

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'x-fhish-relayer-secret', 'x-admin-api-key'],
  credentials: true
}));
app.use(express.json({ limit: '50mb' }));

const requestCounter = new Counter({
  name: 'fhish_gateway_requests_total',
  help: 'Total number of gateway requests',
  labelNames: ['method', 'path', 'status'],
});
const decryptDuration = new Histogram({
  name: 'fhish_gateway_decrypt_duration_seconds',
  help: 'Decryption request duration in seconds',
  labelNames: ['type'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 5],
});
const decryptErrorCounter = new Counter({
  name: 'fhish_gateway_decrypt_errors_total',
  help: 'Total number of decryption errors',
  labelNames: ['reason'],
});
const keyRequestCounter = new Counter({
  name: 'fhish_gateway_key_requests_total',
  help: 'Total number of key serving requests',
  labelNames: ['key_type'],
});

const authorizedRelayers = new Set<string>();

console.log('[GATEWAY] Express app created');
console.log('[GATEWAY] Prometheus metrics registered');

interface FhishWasm {
  FhisConfig: any;
  FhisClientKey: any;
  FhisCompactPublicKey: any;
  FhisServerKey: any;
  FhisUint32: any;
  FhisShortintConfig: any;
  FhisShortintClientKey: any;
  FhisShortintCompactPublicKey: any;
  FhisShortintCompactCiphertextList: any;
  FhisShortintServerKey: any;
  FhisShortintUint2: any;
  init_panic_hook: () => void;
}

interface ShortintKeys {
  clientKey: any;
  publicKey: any;
  serverKey: any;
}

let shortintKeys: ShortintKeys | null = null;

let wasm: FhishWasm | null = null;
let config: any = null;
let clientKey: any = null;
let publicKey: any = null;
let serverKey: any = null;
let isReady = false;
let ciphertextStore: Map<string, string> = new Map();
let isShortintReady = false;

let accumulatedYes: any = null;
let accumulatedNo: any = null;
let voteCountYes = 0;
let voteCountNo = 0;
let votingOpen = true;

function validateEnv(): void {
  console.log('[GATEWAY] Validating environment...');
  const required = ['FHISH_RELAYER_SECRET'];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    console.error(`[GATEWAY] CRITICAL: Missing required environment variables: ${missing.join(', ')}`);
    process.exit(1);
  }
  console.log('[GATEWAY] ✓ Required env vars present');

  if (useShortint) {
    console.log('[GATEWAY] Using SHORTINT keys from keys-shortint/');
    const requiredKeys = ['shortint_client_key.bin', 'shortint_public_key.bin'];
    let hasAllKeys = true;
    for (const keyFile of requiredKeys) {
      const filePath = path.join(keysDir, keyFile);
      if (!fs.existsSync(filePath)) {
        console.log(`[GATEWAY] ⚠ Shortint key file missing: ${keyFile}`);
        hasAllKeys = false;
      } else {
        const stats = fs.statSync(filePath);
        console.log(`[GATEWAY] ✓ Shortint key ${keyFile}: ${stats.size} bytes`);
      }
    }
    if (hasAllKeys) {
      console.log('[GATEWAY] ✓ All shortint keys present');
    }
  } else {
    const requiredKeys = ['fhish_client_key.bin', 'fhish_public_key.bin'];
    let hasAllKeys = true;
    for (const keyFile of requiredKeys) {
      const filePath = path.join(keysDir, keyFile);
      if (!fs.existsSync(filePath)) {
        console.log(`[GATEWAY] ⚠ Key file missing: ${keyFile} - will generate on startup`);
        hasAllKeys = false;
        break;
      }
      const stats = fs.statSync(filePath);
      if (stats.size === 0) {
        console.log(`[GATEWAY] ⚠ Key file is empty: ${keyFile} - will generate on startup`);
        hasAllKeys = false;
        break;
      }
      console.log(`[GATEWAY] ✓ Key file ${keyFile}: ${stats.size} bytes`);
    }
    
    if (hasAllKeys) {
      console.log('[GATEWAY] Environment validation passed');
    } else {
      console.log('[GATEWAY] ⚠ Keys missing - will auto-generate on startup');
    }
  }
}

function fromHexString(hexString: string): Uint8Array {
  const clean = hexString.startsWith('0x') ? hexString.slice(2) : hexString;
  const arr = clean.match(/.{1,2}/g);
  if (!arr) return new Uint8Array();
  return Uint8Array.from(arr.map((byte) => parseInt(byte, 16)));
}

async function loadWasm(): Promise<FhishWasm> {
  console.log('[GATEWAY] Loading fhish-wasm...');
  
  try {
    const wasmModule = await import('fhish-wasm');
    wasmModule.init_panic_hook();
    console.log('[GATEWAY] ✓ fhish-wasm loaded successfully');
    return wasmModule as FhishWasm;
  } catch (err: any) {
    console.error('[GATEWAY] CRITICAL: Failed to load fhish-wasm:', err.message);
    console.error('[GATEWAY] Make sure to:');
    console.error('[GATEWAY]   1. Build WASM: cd ../packages/fhish-wasm && wasm-pack build --target nodejs --out-dir pkg-node');
    console.error('[GATEWAY]   2. Install deps: npm install');
    process.exit(1);
    throw err;
  }
}

async function loadKeys(): Promise<void> {
  if (!wasm) {
    throw new Error('WASM not loaded');
  }
  
  if (useShortint) {
    await loadShortintKeys();
    return;
  }
  
  const clientKeyPath = path.join(keysDir, 'fhish_client_key.bin');
  const publicKeyPath = path.join(keysDir, 'fhish_public_key.bin');
  const serverKeyPath = path.join(keysDir, 'fhish_server_key.bin');
  
  if (!fs.existsSync(clientKeyPath) || !fs.existsSync(publicKeyPath) || 
      fs.statSync(clientKeyPath).size === 0 || fs.statSync(publicKeyPath).size === 0) {
    console.log('[GATEWAY] Keys not found - generating new keys...');
    await generateKeys();
    return;
  }
  
  try {
    console.log('[GATEWAY] Loading client key from fhish_client_key.bin...');
    const clientKeySer = fs.readFileSync(clientKeyPath);
    console.log(`[GATEWAY] Client key bytes: ${clientKeySer.length}`);
    
    clientKey = wasm.FhisClientKey.deserialize(clientKeySer);
    console.log('[GATEWAY] ✓ Client key deserialized successfully');

    console.log('[GATEWAY] Loading public key from fhish_public_key.bin...');
    const publicKeySer = fs.readFileSync(publicKeyPath);
    console.log(`[GATEWAY] ✓ Public key loaded: ${publicKeySer.length} bytes`);
    
    publicKey = wasm.FhisCompactPublicKey.deserialize(publicKeySer);

    console.log('[GATEWAY] Loading server key from fhish_server_key.bin...');
    if (fs.existsSync(serverKeyPath) && fs.statSync(serverKeyPath).size > 0) {
      const serverKeySer = fs.readFileSync(serverKeyPath);
      serverKey = wasm.FhisServerKey.deserialize(serverKeySer);
      console.log(`[GATEWAY] ✓ Server key loaded: ${serverKeySer.length} bytes`);
    } else {
      console.log('[GATEWAY] Generating server key...');
      serverKey = wasm.FhisServerKey.new(clientKey);
      const serverKeyBytes = serverKey.serialize();
      fs.writeFileSync(serverKeyPath, Buffer.from(serverKeyBytes));
      console.log(`[GATEWAY] ✓ Server key generated: ${serverKeyBytes.length} bytes`);
    }

    isReady = true;
    console.log('[GATEWAY] ★ All keys loaded successfully — gateway is READY');
  } catch (err: any) {
    console.error('[GATEWAY] Failed to load keys:', err.message);
    console.log('[GATEWAY] Regenerating keys...');
    await generateKeys();
  }
}

async function loadShortintKeys(): Promise<void> {
  if (!wasm) {
    throw new Error('WASM not loaded');
  }
  
  const clientKeyPath = path.join(keysDir, 'shortint_client_key.bin');
  const publicKeyPath = path.join(keysDir, 'shortint_public_key.bin');
  const serverKeyPath = path.join(keysDir, 'shortint_server_key.bin');
  
  console.log('[GATEWAY] Loading SHORTINT keys...');
  console.log('[GATEWAY]   Client key:', clientKeyPath);
  console.log('[GATEWAY]   Public key:', publicKeyPath);
  console.log('[GATEWAY]   Server key:', serverKeyPath);
  
  try {
    console.log('[GATEWAY] Reading shortint_client_key.bin...');
    const clientKeySer = fs.readFileSync(clientKeyPath);
    console.log(`[GATEWAY] Client key: ${clientKeySer.length} bytes`);
    
    console.log('[GATEWAY] Deserializing shortint client key...');
    const clientKeyObj = wasm.FhisShortintClientKey.deserialize(clientKeySer);
    console.log('[GATEWAY] ✓ Shortint client key deserialized');
    
    console.log('[GATEWAY] Reading shortint_public_key.bin...');
    const publicKeySer = fs.readFileSync(publicKeyPath);
    console.log(`[GATEWAY] Public key: ${publicKeySer.length} bytes`);
    
    console.log('[GATEWAY] Deserializing shortint public key...');
    const publicKeyObj = wasm.FhisShortintCompactPublicKey.deserialize(publicKeySer);
    console.log('[GATEWAY] ✓ Shortint public key deserialized');
    
    console.log('[GATEWAY] Reading shortint_server_key.bin...');
    const serverKeySer = fs.readFileSync(serverKeyPath);
    console.log(`[GATEWAY] Server key: ${serverKeySer.length} bytes`);
    
    console.log('[GATEWAY] Deserializing shortint server key...');
    const serverKeyObj = wasm.FhisShortintServerKey.deserialize(serverKeySer);
    console.log('[GATEWAY] ✓ Shortint server key deserialized');
    
    shortintKeys = {
      clientKey: clientKeyObj,
      publicKey: publicKeyObj,
      serverKey: serverKeyObj,
    };
    
    isShortintReady = true;
    isReady = true;
    console.log('[GATEWAY] ★ All SHORTINT keys loaded — gateway is READY');
  } catch (err: any) {
    console.error('[GATEWAY] CRITICAL: Failed to load shortint keys:', err.message);
    console.error('[GATEWAY] Stack:', err.stack);
    throw err;
  }
}

async function generateKeys(): Promise<void> {
  if (!wasm) {
    throw new Error('WASM not loaded');
  }
  
  try {
    config = new wasm.FhisConfig();
    console.log('[GATEWAY] Config created');
    
    clientKey = wasm.FhisClientKey.generate(config);
    console.log('[GATEWAY] Client key generated');
    
    publicKey = wasm.FhisCompactPublicKey.new(clientKey);
    console.log('[GATEWAY] Public key generated');
    
    serverKey = wasm.FhisServerKey.new(clientKey);
    console.log('[GATEWAY] Server key generated');

    const clientKeyBytes = clientKey.serialize();
    const publicKeyBytes = publicKey.serialize();
    const serverKeyBytes = serverKey.serialize();

    fs.writeFileSync(path.join(keysDir, 'fhish_client_key.bin'), Buffer.from(clientKeyBytes));
    fs.writeFileSync(path.join(keysDir, 'fhish_public_key.bin'), Buffer.from(publicKeyBytes));
    fs.writeFileSync(path.join(keysDir, 'fhish_server_key.bin'), Buffer.from(serverKeyBytes));

    console.log(`[GATEWAY] ✓ Keys saved: client=${clientKeyBytes.length} bytes, public=${publicKeyBytes.length} bytes`);
    
    isReady = true;
    console.log('[GATEWAY] ★ Keys generated successfully — gateway is READY');
  } catch (err: any) {
    console.error('[GATEWAY] CRITICAL: Failed to generate keys:', err.message);
    console.error('[GATEWAY] Stack:', err.stack);
    process.exit(1);
  }
}

function requireRelayerAuth(req: Request, res: Response, next: NextFunction): void {
  const secret = req.headers['x-fhish-relayer-secret'];
  if (secret !== relayerSecret) {
    console.warn(`[GATEWAY] [AUTH] ❌ Unauthorized relayer attempt from ${req.ip}`);
    res.status(403).json({ error: 'Unauthorized' });
    return;
  }
  console.log(`[GATEWAY] [AUTH] ✓ Relayer authorized: ${req.ip}`);
  next();
}

function requireAdminAuth(req: Request, res: Response, next: NextFunction): void {
  const key = req.headers['x-admin-api-key'];
  if (!adminApiKey || key !== adminApiKey) {
    console.warn(`[GATEWAY] [AUTH] ❌ Admin auth failed from ${req.ip}`);
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  console.log(`[GATEWAY] [AUTH] ✓ Admin authorized`);
  next();
}

function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const requestId = crypto.randomUUID().slice(0, 8);
  (req as any).requestId = requestId;
  const start = Date.now();
  const reqBody = JSON.stringify(req.body || {}).slice(0, 200);
  console.log(`[GATEWAY] [REQUEST] ${requestId} --> ${req.method} ${req.path} body=${reqBody}`);
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`[GATEWAY] [REQUEST] ${requestId} <-- ${res.statusCode} ${duration}ms`);
    requestCounter.inc({ method: req.method, path: req.path, status: res.statusCode });
  });
  next();
}

app.use(requestLogger);

app.get('/health', (_req: Request, res: Response) => {
  console.log('[GATEWAY] /health → ok');
  res.json({ status: 'ok', uptime: Math.floor(process.uptime()), ready: isReady });
});

app.get('/ready', (_req: Request, res: Response) => {
  console.log(`[GATEWAY] /ready → isReady=${isReady}, isShortintReady=${isShortintReady}, useShortint=${useShortint}`);
  if (isReady && (useShortint ? isShortintReady : clientKey !== null)) {
    res.json({ 
      status: 'ready', 
      keys: 'loaded', 
      wasm: 'fhish-native', 
      type: useShortint ? 'FhisShortint' : 'FhisUint32',
      shortint: isShortintReady
    });
  } else {
    res.status(503).json({ status: 'not ready', keys: 'missing' });
  }
});

app.get('/metrics', async (_req: Request, res: Response) => {
  try {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  } catch (err) {
    res.status(500).end();
  }
});

app.get('/get-public-key', (_req: Request, res: Response) => {
  console.log('[GATEWAY] /get-public-key request — useShortint:', useShortint);
  
  if (useShortint) {
    if (!shortintKeys?.publicKey) {
      console.error('[GATEWAY] /get-public-key → 503 shortint publicKey is null');
      res.status(503).json({ error: 'Shortint public key not loaded' });
      return;
    }
    keyRequestCounter.inc({ key_type: 'public_key' });
    const publicKeyBytes = shortintKeys.publicKey.serialize();
    const hex = '0x' + Buffer.from(publicKeyBytes).toString('hex');
    console.log(`[GATEWAY] /get-public-key (SHORTINT) → 200, ${publicKeyBytes.length} bytes`);
    res.json({ publicKey: hex, version: 'fhish-native', type: 'FhisShortint' });
    return;
  }
  
  if (!publicKey) {
    console.error('[GATEWAY] /get-public-key → 503 publicKey is null');
    res.status(503).json({ error: 'Public key not loaded' });
    return;
  }
  keyRequestCounter.inc({ key_type: 'public_key' });
  const publicKeyBytes = publicKey.serialize();
  const hex = '0x' + Buffer.from(publicKeyBytes).toString('hex');
  console.log(`[GATEWAY] /get-public-key → 200, ${publicKeyBytes.length} bytes`);
  res.json({ publicKey: hex, version: 'fhish-native', type: 'FhisUint32' });
});

app.get('/get-server-key', (_req: Request, res: Response) => {
  console.log('[GATEWAY] /get-server-key request — useShortint:', useShortint);
  
  if (useShortint) {
    if (!shortintKeys?.serverKey) {
      console.error('[GATEWAY] /get-server-key → 503 shortint serverKey is null');
      res.status(503).json({ error: 'Shortint server key not loaded' });
      return;
    }
    const serverKeyBytes = shortintKeys.serverKey.serialize();
    const hex = '0x' + Buffer.from(serverKeyBytes).toString('hex');
    console.log(`[GATEWAY] /get-server-key (SHORTINT) → 200, ${serverKeyBytes.length} bytes`);
    res.json({ serverKey: hex, version: 'fhish-native', type: 'FhisShortint' });
    return;
  }
  
  if (!serverKey) {
    console.error('[GATEWAY] /get-server-key → 503 serverKey is null');
    res.status(503).json({ error: 'Server key not loaded' });
    return;
  }
  const serverKeyBytes = serverKey.serialize();
  const hex = '0x' + Buffer.from(serverKeyBytes).toString('hex');
  console.log(`[GATEWAY] /get-server-key → 200, ${serverKeyBytes.length} bytes`);
  res.json({ serverKey: hex, version: 'fhish-native', type: 'FhisUint32' });
});

app.get('/admin/relayers', requireAdminAuth, (_req: Request, res: Response) => {
  console.log('[GATEWAY] /admin/relayers →', Array.from(authorizedRelayers));
  res.json({ relayers: Array.from(authorizedRelayers) });
});

app.post('/admin/add-relayer', requireAdminAuth, (req: Request, res: Response) => {
  const { address } = req.body;
  console.log('[GATEWAY] /admin/add-relayer address=', address);
  if (!address || typeof address !== 'string') {
    res.status(400).json({ error: 'address required' });
    return;
  }
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
    res.status(400).json({ error: 'Invalid Ethereum address' });
    return;
  }
  authorizedRelayers.add(address.toLowerCase());
  console.log('[GATEWAY] /admin/add-relayer → success, relayers:', Array.from(authorizedRelayers));
  res.json({ success: true, relayers: Array.from(authorizedRelayers) });
});

app.delete('/admin/relayer/:address', requireAdminAuth, (req: Request, res: Response) => {
  const address = (req.params.address || '').toLowerCase();
  console.log('[GATEWAY] /admin/relayer DELETE', address);
  if (authorizedRelayers.delete(address)) {
    res.json({ success: true, relayers: Array.from(authorizedRelayers) });
  } else {
    res.status(404).json({ error: 'Relayer not found' });
  }
});

app.post('/ciphertext', (req: Request, res: Response) => {
  const requestId = (req as any).requestId;
  const { ciphertext } = req.body as { ciphertext?: string };
  console.log(`[GATEWAY] [${requestId}] POST /ciphertext — ${ciphertext?.length ?? 0} chars`);

  if (!ciphertext) {
    res.status(400).json({ error: 'ciphertext required' });
    return;
  }

  try {
    const ctBytes = fromHexString(ciphertext);
    const handle = crypto.createHash('sha256').update(ctBytes).digest('hex');
    ciphertextStore.set(handle, ciphertext);
    console.log(`[GATEWAY] [${requestId}] Stored ciphertext under handle: ${handle}`);
    res.json({ handle, stored: true });
  } catch (err: any) {
    console.error(`[GATEWAY] [${requestId}] POST /ciphertext → 500: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

app.post('/submit-vote', async (req: Request, res: Response) => {
  const requestId = (req as any).requestId;
  const { ciphertext, vote } = req.body as { ciphertext?: string; vote?: 'yes' | 'no' };

  console.log(`[GATEWAY] [${requestId}] POST /submit-vote — vote=${vote}, ciphertext=${ciphertext?.length ?? 0} chars`);

  if (!ciphertext || !vote) {
    res.status(400).json({ error: 'ciphertext and vote (yes/no) required' });
    return;
  }

  if (!votingOpen) {
    res.status(400).json({ error: 'Voting is closed' });
    return;
  }

  if (!shortintKeys?.serverKey || !wasm) {
    console.error(`[GATEWAY] [${requestId}] /submit-vote → 503 Server key not ready`);
    res.status(503).json({ error: 'Server not ready for accumulation' });
    return;
  }

  try {
    const ctBytes = fromHexString(ciphertext);
    console.log(`[GATEWAY] [${requestId}] Decoded ciphertext: ${ctBytes.length} bytes`);

    const ct = wasm.FhisShortintUint2.deserialize(ctBytes);
    console.log(`[GATEWAY] [${requestId}] Ciphertext deserialized successfully`);

    if (vote === 'yes') {
      if (accumulatedYes === null) {
        accumulatedYes = ct;
        console.log(`[GATEWAY] [${requestId}] First YES vote - initialized accumulator`);
      } else {
        accumulatedYes = shortintKeys.serverKey.add(accumulatedYes, ct);
        console.log(`[GATEWAY] [${requestId}] Added to YES accumulator`);
      }
      voteCountYes++;
      console.log(`[GATEWAY] [${requestId}] YES vote count: ${voteCountYes}`);
    } else {
      if (accumulatedNo === null) {
        accumulatedNo = ct;
        console.log(`[GATEWAY] [${requestId}] First NO vote - initialized accumulator`);
      } else {
        accumulatedNo = shortintKeys.serverKey.add(accumulatedNo, ct);
        console.log(`[GATEWAY] [${requestId}] Added to NO accumulator`);
      }
      voteCountNo++;
      console.log(`[GATEWAY] [${requestId}] NO vote count: ${voteCountNo}`);
    }

    console.log(`[GATEWAY] [${requestId}] ★ VOTE ACCEPTED — total YES=${voteCountYes}, NO=${voteCountNo}`);
    res.json({ 
      success: true, 
      vote,
      totalYes: voteCountYes,
      totalNo: voteCountNo,
      message: 'Vote recorded and accumulated' 
    });
  } catch (err: any) {
    console.error(`[GATEWAY] [${requestId}] /submit-vote → ❌ FAILED: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

app.get('/tally-status', (_req: Request, res: Response) => {
  console.log(`[GATEWAY] /tally-status → YES=${voteCountYes}, NO=${voteCountNo}, open=${votingOpen}`);
  res.json({
    yesVotes: voteCountYes,
    noVotes: voteCountNo,
    votingOpen,
    accumulatedEncrypted: accumulatedYes !== null || accumulatedNo !== null
  });
});

app.post('/close-voting', requireAdminAuth, (_req: Request, res: Response) => {
  votingOpen = false;
  console.log(`[GATEWAY] Voting closed. Final tally: YES=${voteCountYes}, NO=${voteCountNo}`);
  res.json({ success: true, votingOpen, yesVotes: voteCountYes, noVotes: voteCountNo });
});

app.post('/decrypt-tally', requireRelayerAuth, (req: Request, res: Response) => {
  const requestId = (req as any).requestId;
  const start = process.hrtime.bigint();

  console.log(`[GATEWAY] [${requestId}] POST /decrypt-tally — decrypting accumulated votes`);

  if (!shortintKeys?.clientKey || !accumulatedYes || !accumulatedNo) {
    console.error(`[GATEWAY] [${requestId}] No accumulated votes to decrypt`);
    res.status(400).json({ error: 'No votes accumulated yet' });
    return;
  }

  try {
    const resultYes = accumulatedYes.decrypt(shortintKeys.clientKey);
    const resultNo = accumulatedNo.decrypt(shortintKeys.clientKey);

    const endNs = process.hrtime.bigint();
    const durationMs = Number(endNs - start) / 1e6;

    console.log(`[GATEWAY] [${requestId}] ★ DECRYPT TALLY SUCCESS`);
    console.log(`[GATEWAY] [${requestId}]   YES votes (encrypted sum): ${resultYes}`);
    console.log(`[GATEWAY] [${requestId}]   NO votes (encrypted sum): ${resultNo}`);
    console.log(`[GATEWAY] [${requestId}]   Duration: ${durationMs.toFixed(2)}ms`);

    res.json({
      yesVotes: resultYes,
      noVotes: resultNo,
      encryptedYesVotes: voteCountYes,
      encryptedNoVotes: voteCountNo,
      verified: resultYes === voteCountYes && resultNo === voteCountNo,
      duration: durationMs.toFixed(2)
    });
  } catch (err: any) {
    console.error(`[GATEWAY] [${requestId}] /decrypt-tally → ❌ FAILED: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

app.post('/reset-tally', requireAdminAuth, (_req: Request, res: Response) => {
  accumulatedYes = null;
  accumulatedNo = null;
  voteCountYes = 0;
  voteCountNo = 0;
  votingOpen = true;
  console.log('[GATEWAY] Tally reset');
  res.json({ success: true, message: 'Tally reset successfully' });
});

app.get('/ciphertext/:handle', requireRelayerAuth, (req: Request, res: Response) => {
  const requestId = (req as any).requestId;
  const { handle } = req.params;
  console.log(`[GATEWAY] [${requestId}] GET /ciphertext/${handle.slice(0, 20)}...`);

  const cleanHandle = handle.startsWith('0x') ? handle.slice(2) : handle;
  const ciphertext = ciphertextStore.get(cleanHandle);
  if (!ciphertext) {
    console.error(`[GATEWAY] [${requestId}] /ciphertext → 404 handle not found`);
    res.status(404).json({ error: 'Ciphertext not found for handle' });
    return;
  }

  console.log(`[GATEWAY] [${requestId}] Found ciphertext: ${ciphertext.length} bytes`);
  res.json({ ciphertext, length: ciphertext.length });
});

app.post('/decrypt', requireRelayerAuth, (req: Request, res: Response) => {
  const start = process.hrtime.bigint();
  const requestId = (req as any).requestId;

  const { ciphertext, type } = req.body as { ciphertext?: string; type?: string };
  
  console.log(`[GATEWAY] [${requestId}] /decrypt → type=${type || 'auto'}, useShortint=${useShortint}`);
  console.log(`[GATEWAY] [${requestId}] Ciphertext length: ${ciphertext?.length || 0} chars`);

  if (!ciphertext) {
    console.error(`[GATEWAY] [${requestId}] /decrypt → 400 missing ciphertext`);
    res.status(400).json({ error: 'ciphertext is required' });
    return;
  }

  const useShortintForDecrypt = useShortint || type === 'FhisShortint';
  
  if (useShortintForDecrypt) {
    if (!shortintKeys?.clientKey || !wasm) {
      console.error(`[GATEWAY] [${requestId}] /decrypt → 503 SHORTINT KMS not ready`);
      decryptErrorCounter.inc({ reason: 'shortint_client_key_missing' });
      res.status(503).json({ error: 'Shortint KMS not ready' });
      return;
    }

    try {
      const ctBytes = fromHexString(ciphertext);
      console.log(`[GATEWAY] [${requestId}] Decoded ${ctBytes.length} bytes from hex (SHORTINT)`);

      const ct = wasm.FhisShortintUint2.deserialize(ctBytes);
      const result = ct.decrypt(shortintKeys.clientKey);
      
      const endNs = process.hrtime.bigint();
      const durationMs = Number(endNs - start) / 1e6;
      decryptDuration.observe({ type: 'FhisShortint' }, Number(endNs - start) / 1e9);

      console.log(`[GATEWAY] [${requestId}] ★ DECRYPT SUCCESS (SHORTINT) → ${result} (duration=${durationMs.toFixed(2)}ms)`);
      res.json({ plaintext: result.toString(), type: 'FhisShortint' });
    } catch (err: any) {
      decryptErrorCounter.inc({ reason: 'shortint_decryption_failed' });
      console.error(`[GATEWAY] [${requestId}] /decrypt (SHORTINT) → ❌ FAILED: ${err.message}`);
      console.error(`[GATEWAY] [${requestId}] Stack:`, err.stack);
      res.status(500).json({ error: err.message });
    }
    return;
  }

  if (!clientKey || !wasm) {
    console.error(`[GATEWAY] [${requestId}] /decrypt → 503 KMS not ready`);
    decryptErrorCounter.inc({ reason: 'client_key_missing' });
    res.status(503).json({ error: 'KMS not ready' });
    return;
  }

  try {
    const ctBytes = fromHexString(ciphertext);
    console.log(`[GATEWAY] [${requestId}] Decoded ${ctBytes.length} bytes from hex`);

    const ct = wasm.FhisUint32.deserialize(ctBytes);
    const result = ct.decrypt(clientKey);
    
    const endNs = process.hrtime.bigint();
    const durationMs = Number(endNs - start) / 1e6;
    decryptDuration.observe({ type: 'FhisUint32' }, Number(endNs - start) / 1e9);

    console.log(`[GATEWAY] [${requestId}] ★ DECRYPT SUCCESS → ${result} (type=FhisUint32, duration=${durationMs.toFixed(2)}ms)`);
    res.json({ plaintext: result.toString(), type: 'FhisUint32' });
  } catch (err: any) {
    decryptErrorCounter.inc({ reason: 'decryption_failed' });
    console.error(`[GATEWAY] [${requestId}] /decrypt → ❌ FAILED: ${err.message}`);
    console.error(`[GATEWAY] [${requestId}] Stack:`, err.stack);
    res.status(500).json({ error: err.message });
  }
});

app.post('/keygen', requireAdminAuth, async (req: Request, res: Response) => {
  const requestId = (req as any).requestId;
  console.log(`[GATEWAY] [${requestId}] /keygen request`);

  if (!wasm) {
    res.status(503).json({ error: 'WASM not loaded' });
    return;
  }

  try {
    await generateKeys();
    res.json({ success: true, message: 'Keys regenerated successfully' });
  } catch (err: any) {
    console.error(`[GATEWAY] [${requestId}] /keygen → ❌ FAILED: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[GATEWAY] Unhandled error:', err.message);
  console.error('[GATEWAY] Stack:', err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

validateEnv();

async function main() {
  console.log('[GATEWAY] Loading fhish-wasm...');
  
  wasm = await loadWasm();
  
  await loadKeys();

  app.listen(port, () => {
    console.log('╔══════════════════════════════════════════════╗');
    console.log('║         FHISH GATEWAY RUNNING ★            ║');
    console.log(`║  Port:    ${String(port).padEnd(35)}║`);
    console.log(`║  Base:    ${String(baseUrl).padEnd(35)}║`);
    console.log(`║  Keys:    ${String(isReady ? 'LOADED ✓' : 'FAILED ✗').padEnd(35)}║`);
    console.log(`║  FHE:     ${String(useShortint ? 'fhish-wasm (FhisShortint)' : 'fhish-wasm (FhisUint32)').padEnd(35)}║`);
    console.log(`║  Type:    ${String(useShortint ? 'SHORTINT CompactPublicKey' : 'Uint32').padEnd(35)}║`);
    console.log('╚══════════════════════════════════════════════╝');
  });
}

main().catch((err) => {
  console.error('[GATEWAY] CRITICAL: main() failed:', err.message);
  console.error('[GATEWAY] Stack:', err.stack);
  process.exit(1);
});

export default app;
