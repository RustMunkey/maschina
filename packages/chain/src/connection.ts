// Solana Connection singleton backed by Helius RPC.

import { Connection } from "@solana/web3.js";
import { getHeliusRpcUrl } from "./helius.js";

let _connection: Connection | null = null;

export function getConnection(): Connection {
  if (_connection) return _connection;
  _connection = new Connection(getHeliusRpcUrl(), "confirmed");
  return _connection;
}
