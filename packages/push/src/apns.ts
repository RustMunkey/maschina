import apn from "@parse/node-apn";
import { pushConfig } from "./config.js";
import type { ApnsSubscription, PushMessage, PushResult } from "./types.js";

let _provider: apn.Provider | null = null;

function getProvider(): apn.Provider {
  if (!_provider) {
    _provider = new apn.Provider({
      token: {
        key: pushConfig.apns.privateKey,
        keyId: pushConfig.apns.keyId,
        teamId: pushConfig.apns.teamId,
      },
      production: pushConfig.apns.production,
    });
  }
  return _provider;
}

export async function sendApns(sub: ApnsSubscription, msg: PushMessage): Promise<PushResult> {
  const provider = getProvider();

  const note = new apn.Notification();
  note.expiry = Math.floor(Date.now() / 1000) + 3600; // 1h
  if (msg.badge !== undefined) note.badge = msg.badge;
  note.sound = msg.sound ?? "default";
  note.alert = { title: msg.title, body: msg.body };
  note.topic = pushConfig.apns.bundleId;
  if (msg.collapseKey !== undefined) note.collapseId = msg.collapseKey;
  if (msg.data) {
    note.payload = { data: msg.data };
  }

  const result = await provider.send(note, sub.token);

  if (result.failed.length > 0) {
    const failure = result.failed[0];
    const reason = failure.response?.reason ?? failure.error?.message ?? "unknown";
    const shouldDelete = ["BadDeviceToken", "Unregistered", "DeviceTokenNotForTopic"].includes(
      reason,
    );
    return { ok: false, error: reason, shouldDelete };
  }

  return { ok: true };
}
