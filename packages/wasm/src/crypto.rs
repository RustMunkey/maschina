// TODO: Client-side AES-256-GCM encryption for agent payloads.
// Allows the browser/desktop to encrypt before sending to the API —
// server never sees plaintext. Keys derived from user credentials,
// never transmitted.
//
// Build: wasm-pack build packages/wasm --target web --out-dir pkg
// Consume: import init, { encrypt_payload } from "@maschina/wasm"

use wasm_bindgen::prelude::*;

/// Encrypt a plaintext payload with a base64-encoded key.
/// Returns base64-encoded ciphertext + IV.
#[wasm_bindgen]
pub fn encrypt_payload(_plaintext: &str, _key_b64: &str) -> Result<String, JsValue> {
    todo!("AES-256-GCM client-side encryption — packages/crypto logic to be ported here")
}

/// Decrypt a base64-encoded ciphertext + IV with a base64-encoded key.
#[wasm_bindgen]
pub fn decrypt_payload(_ciphertext_b64: &str, _key_b64: &str) -> Result<String, JsValue> {
    todo!("AES-256-GCM client-side decryption — packages/crypto logic to be ported here")
}
