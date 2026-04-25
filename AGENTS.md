# FHISH Gateway — AGENTS.md

## Tech Stack

- **Runtime**: Node.js 20+
- **Language**: TypeScript
- **FHE Library**: `fhish-wasm` (our custom WASM, NOT `node-tfhe` or `tfhe` npm)
- **HTTP**: Express 5
- **Signing**: ethers v6 (EIP-712)
- **Auth**: Shared secret header (`x-fhish-relayer-secret`) + ECDSA signatures
- **Container**: Docker + Docker Compose

## CRITICAL: No External FHE Packages

**NEVER use external FHE packages:**
- ❌ `npm install tfhe` - Browser package (requires Web Workers)
- ❌ `npm install node-tfhe` - Node.js FHE (external dependency)
- ❌ `fhevmjs` - Zama JS SDK
- ❌ Any Zama/Fhenix npm packages

**USE our custom WASM:**
- ✅ `fhish-wasm` (packages/fhish-wasm/pkg-node/)
- Built from tfhe-rs source in `_references/zama/tfhe-rs/`

## Build Commands

```bash
# Install dependencies (NO tfhe packages!)
npm install

# Build WASM if needed
cd ../packages/fhish-wasm
wasm-pack build --target nodejs --out-dir pkg-node
cd ../fhish-gateway

# Generate keys (when keygen is fixed)
npm run keygen

# Development
npm run dev          # tsx (with polyfills)

# Production
npm start           # Node.js
docker compose up   # Docker
```

## Key Files

- `src/server.ts`      — Main Express server
- `src/polyfill.mjs`   — Node.js polyfills for WASM
- `scripts/keygen.ts`  — Key generation (uses Rust binary)
- `keys/`              — Generated keys (gitignored)
- `pkg/`               — Symlink to fhish-wasm/pkg-node/

## Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/health` | None | Health check |
| GET | `/ready` | None | Readiness (keys loaded) |
| GET | `/get-public-key` | None | Public key for SDK |
| POST | `/decrypt` | Relayer secret | Decrypt ciphertext |
| GET | `/metrics` | None | Prometheus metrics |

## Environment Variables

```bash
# Required
FHISH_RELAYER_SECRET=fhish-default-secret  # Change in production!

# Optional
PORT=8080
BASE_URL=http://localhost:8080
ADMIN_PRIVATE_KEY=0x...          # For gateway admin operations
RPC_URL=https://ethereum-sepolia.publicnode.com
```

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                   FHISH GATEWAY                     │
│                                                      │
│  Express Server (TypeScript)                         │
│         │                                            │
│         ▼                                            │
│  ┌─────────────────────────────────────────────┐    │
│  │           fhish-wasm (Node WASM)            │    │
│  │                                               │    │
│  │  ┌─────────────────────────────────────┐     │    │
│  │  │     FhisShortintClientKey          │     │    │
│  │  │     (PRIVATE - never exposed)      │     │    │
│  │  └─────────────────────────────────────┘     │    │
│  │                                               │    │
│  │  ┌─────────────────────────────────────┐     │    │
│  │  │     Decrypt Operations              │     │    │
│  │  │     FhisShortintUint2.decrypt()     │     │    │
│  │  └─────────────────────────────────────┘     │    │
│  │                                               │    │
│  └─────────────────────────────────────────────┘    │
│                                                      │
└─────────────────────────────────────────────────────┘
```

## Key Types (from fhish-wasm)

```typescript
// Types imported from fhish-wasm (NOT from tfhe npm!)
import {
  FhisShortintClientKey,    // Private key (never expose)
  FhisShortintPublicKey,    // Public key (share with SDK)
  FhisShortintServerKey,    // Server key (for operations)
  FhisShortintUint2,        // 2-bit ciphertext (~2-4KB)
  FhisShortintConfig,       // Configuration
} from 'fhish-wasm';
```

## Workflow

1. **Startup**: Load client key from `keys/fhish_client_key.bin`
2. **Public Key**: Serve public key to SDK on request
3. **Decrypt Request**: 
   - Validate `x-fhish-relayer-secret` header
   - Receive ciphertext hex
   - Deserialize to `FhisShortintUint2`
   - Call `decrypt(clientKey)`
   - Return plaintext result

## Known Issues

1. **WASM Memory**: Node.js WASM may have capacity overflow during key generation
   - Workaround: Use browser WASM for key generation initially
   - Or: Increase Node.js memory with `--max-old-space-size`

2. **Key Generation**: TypeScript keygen not fully tested
   - Need Rust-based keygen for proper shortint params
   - Track progress in PLAN.md

## Testing

```bash
# Test gateway endpoints
curl http://localhost:8080/health
curl http://localhost:8080/ready
curl http://localhost:8080/get-public-key

# Test decryption (with auth)
curl -X POST http://localhost:8080/decrypt \
  -H "x-fhish-relayer-secret: fhish-default-secret" \
  -H "Content-Type: application/json" \
  -d '{"ciphertext": "0x..."}'
```
