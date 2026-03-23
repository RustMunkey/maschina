// TODO: Browser-runnable CLI for the homepage terminal demo.
// Compiles the maschina CLI command dispatch to WASM, paired with
// xterm.js in the browser. Replaces the static terminal mockup with
// a real working `maschina` CLI running client-side.
//
// Commands that make sense in WASM (stateless, no daemon):
//   maschina --help / --version
//   maschina agent list  (fetches from API)
//   maschina agent run   (streams via SSE)
//   maschina status
//
// Commands that stay server-side: node, org, billing, etc.

use wasm_bindgen::prelude::*;

/// Dispatch a CLI command string and return output.
/// e.g. run_command("agent list") -> formatted table string
#[wasm_bindgen]
pub fn run_command(_input: &str) -> Result<String, JsValue> {
    todo!("Wire maschina CLI command dispatch for browser terminal — packages/cli logic")
}
