# Fhish Gateway

The Fhish Gateway is a central Node.js microservice responsible for temporarily storing heavy FHE ciphertext blobs off-chain.

## Architecture

FHE ciphertexts (especially in `tfhe-rs`) are incredibly large (e.g., 16KB for a single `uint32` encrypted value). Storing these directly on an EVM blockchain is cost-prohibitive. The Fhish Gateway solves this by acting as a decentralized ciphertext data-availability layer.

1. **Storage**: Users POST their encrypted FHE blobs (`Uint8Array`) to `/ciphertext`. The Gateway stores the blob in an in-memory or Redis map and returns a 32-byte `handle` (a hash of the content).
2. **Key Distribution**: Users GET `/get-public-key` to fetch the public FHE evaluation key required to encrypt their data locally before submission.
3. **Retrieval**: The Relayer GETs `/ciphertext/:handle` to retrieve the original 16KB blob when it detects that a smart contract has requested an operation on that handle.

## Keys Directory
The Gateway relies on a `keys/` directory containing the `client_key.bin` and `server_key.bin` files. These are typically generated natively via the `fhish-cli` and mounted into the gateway container.
