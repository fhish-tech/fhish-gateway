const nodeTfhe = require('node-tfhe');
const fs = require('fs');
const path = require('path');

async function main() {
  console.log("Generating fhish FHE keypair (Zama compatible)...");

  // Use parameters that definitely support ZK CRS generation
  // Found via node-tfhe 1.5.4 d.ts analysis
  const block_params = new nodeTfhe.ShortintParameters(495); // V1_5_PARAM_MESSAGE_2_CARRY_2_COMPACT_PK_PBS_KS_GAUSSIAN_2M128
  const casting_params = new nodeTfhe.ShortintCompactPublicKeyEncryptionParameters(14); // V1_5_PARAM_PKE_MESSAGE_2_CARRY_2_KS_PBS_TUNIFORM_2M128_ZKV1

  const builder = nodeTfhe.TfheConfigBuilder.default()
    .use_custom_parameters(block_params)
    .use_dedicated_compact_public_key_parameters(casting_params);
  
  const config = builder.build();

  console.log("[1/3] Generating TfheClientKey...");
  const clientKey = nodeTfhe.TfheClientKey.generate(config);
  
  console.log("[2/3] Generating TfheCompactPublicKey...");
  const publicKey = nodeTfhe.TfheCompactPublicKey.new(clientKey);

  console.log("[3/3] Generating CompactPkeCrs (2048 bits)...");
  // 2048 bits = 4 * 512 as seen in fhevmjs
  const crs = nodeTfhe.CompactPkeCrs.from_config(config, 2048);

  const publicKeyBytes = publicKey.serialize();
  const clientKeyBytes = clientKey.serialize();
  const crsBytes = crs.serialize(true);

  const keysDir = path.join(__dirname, '../keys');
  if (!fs.existsSync(keysDir)) {
    fs.mkdirSync(keysDir, { recursive: true });
  }

  fs.writeFileSync(path.join(keysDir, 'fhish_public_key.bin'), Buffer.from(publicKeyBytes));
  fs.writeFileSync(path.join(keysDir, 'fhish_client_key.bin'), Buffer.from(clientKeyBytes));
  fs.writeFileSync(path.join(keysDir, 'fhish_crs_2048.bin'), Buffer.from(crsBytes));

  const keyMeta = {
    publicKey: {
      data_id: "fhish-public-key-v2",
      size: publicKeyBytes.length
    },
    crs: {
      data_id: "fhish-crs-2048-v2",
      size: crsBytes.length
    },
    generatedAt: new Date().toISOString()
  };
  fs.writeFileSync(path.join(keysDir, 'key_metadata.json'), JSON.stringify(keyMeta, null, 2));

  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("FHE KEYPAIR GENERATED");
  console.log("Public key: ", publicKeyBytes.length, "bytes");
  console.log("Private key:", clientKeyBytes.length, "bytes");
  console.log("CRS (2048): ", crsBytes.length, "bytes");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
}

main().then(() => console.log("SUCCESS")).catch((err) => {
  console.error("FATAL ERROR:", err);
  process.exit(1);
});
