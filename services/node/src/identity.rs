//! Node identity — Ed25519 keypair + registered node ID.
//!
//! On first start the node generates a keypair and persists it to disk.
//! The public key is submitted to the API; receipts are signed with the
//! private key so any party can verify them without a shared secret.

use anyhow::{Context, Result};
use ed25519_dalek::{Signature, Signer, SigningKey};
use rand::rngs::OsRng;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use uuid::Uuid;

/// Persisted identity file (~/.config/maschina-node/identity.toml)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IdentityFile {
    /// Node UUID assigned by the API after registration.
    /// None until the node has successfully registered.
    pub node_id: Option<Uuid>,
    /// Ed25519 private key — hex-encoded 32 bytes.
    pub private_key_hex: String,
    /// Ed25519 public key — hex-encoded 32 bytes.
    pub public_key_hex: String,
}

/// Loaded identity with the signing key in memory.
pub struct NodeIdentity {
    pub node_id: Option<Uuid>,
    pub signing_key: SigningKey,
    pub public_key_hex: String,
    path: PathBuf,
}

impl NodeIdentity {
    /// Load identity from disk, generating a new keypair if none exists.
    pub fn load_or_create(config_dir: &Path) -> Result<Self> {
        let path = config_dir.join("identity.toml");

        let file: IdentityFile = if path.exists() {
            let raw = std::fs::read_to_string(&path)
                .with_context(|| format!("Failed to read identity file {}", path.display()))?;
            toml::from_str(&raw).context("Failed to parse identity file")?
        } else {
            std::fs::create_dir_all(config_dir).context("Failed to create config dir")?;
            let signing_key = SigningKey::generate(&mut OsRng);
            let file = IdentityFile {
                node_id: None,
                private_key_hex: hex::encode(signing_key.to_bytes()),
                public_key_hex: hex::encode(signing_key.verifying_key().to_bytes()),
            };
            std::fs::write(&path, toml::to_string_pretty(&file)?)
                .with_context(|| format!("Failed to write identity file {}", path.display()))?;
            tracing::info!(path = %path.display(), "Generated new Ed25519 keypair");
            file
        };

        let key_bytes: [u8; 32] = hex::decode(&file.private_key_hex)
            .context("Invalid private key hex")?
            .try_into()
            .map_err(|_| anyhow::anyhow!("Private key must be 32 bytes"))?;
        let signing_key = SigningKey::from_bytes(&key_bytes);

        Ok(Self {
            node_id: file.node_id,
            public_key_hex: file.public_key_hex,
            signing_key,
            path,
        })
    }

    /// Persist the node ID after successful registration.
    pub fn set_node_id(&mut self, node_id: Uuid) -> Result<()> {
        self.node_id = Some(node_id);
        self.save()
    }

    /// Sign arbitrary bytes. Returns hex-encoded Ed25519 signature (64 bytes).
    /// Used when the node signs execution receipts (Phase 5).
    #[allow(dead_code)]
    pub fn sign(&self, message: &[u8]) -> String {
        let sig: Signature = self.signing_key.sign(message);
        hex::encode(sig.to_bytes())
    }

    fn save(&self) -> Result<()> {
        let file = IdentityFile {
            node_id: self.node_id,
            private_key_hex: hex::encode(self.signing_key.to_bytes()),
            public_key_hex: self.public_key_hex.clone(),
        };
        std::fs::write(&self.path, toml::to_string_pretty(&file)?)
            .with_context(|| format!("Failed to write identity file {}", self.path.display()))
    }
}
