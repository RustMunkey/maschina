export * from "./types.js";
export * from "./config.js";

import { sendApns } from "./apns.js";
import { apnsEnabled, fcmEnabled, webpushEnabled } from "./config.js";
import { sendFcm } from "./fcm.js";
import type {
  ApnsSubscription,
  FcmSubscription,
  PushMessage,
  PushPlatform,
  PushResult,
  WebPushSubscription,
} from "./types.js";
import { sendWebPush } from "./webpush.js";

export interface PushTarget {
  id: string; // push_tokens.id — returned on shouldDelete so caller can purge
  platform: PushPlatform;
  subscription: ApnsSubscription | FcmSubscription | WebPushSubscription;
}

// Send a push notification to a single token target.
// Returns PushResult — caller should delete the token if shouldDelete is true.
export async function sendPush(target: PushTarget, msg: PushMessage): Promise<PushResult> {
  switch (target.platform) {
    case "apns":
      if (!apnsEnabled()) return { ok: false, error: "APNs not configured", shouldDelete: false };
      return sendApns(target.subscription as ApnsSubscription, msg);

    case "fcm":
      if (!fcmEnabled()) return { ok: false, error: "FCM not configured", shouldDelete: false };
      return sendFcm(target.subscription as FcmSubscription, msg);

    case "webpush":
      if (!webpushEnabled())
        return { ok: false, error: "Web Push not configured", shouldDelete: false };
      return sendWebPush(target.subscription as WebPushSubscription, msg);
  }
}

// Send to all targets for a user. Silently skips unconfigured providers.
// Returns IDs of tokens that should be deleted (expired/unregistered).
export async function sendPushToTargets(
  targets: PushTarget[],
  msg: PushMessage,
): Promise<string[]> {
  const toDelete: string[] = [];

  await Promise.allSettled(
    targets.map(async (target) => {
      const result = await sendPush(target, msg);
      if (!result.ok && result.shouldDelete) {
        toDelete.push(target.id);
      }
    }),
  );

  return toDelete;
}
