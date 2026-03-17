import webpush from "web-push";
import { pushConfig } from "./config.js";
import type { PushMessage, PushResult, WebPushSubscription } from "./types.js";

let _configured = false;

function configure() {
  if (!_configured) {
    webpush.setVapidDetails(
      pushConfig.webpush.vapidSubject,
      pushConfig.webpush.vapidPublicKey,
      pushConfig.webpush.vapidPrivateKey,
    );
    _configured = true;
  }
}

export async function sendWebPush(sub: WebPushSubscription, msg: PushMessage): Promise<PushResult> {
  configure();

  const payload = JSON.stringify({
    title: msg.title,
    body: msg.body,
    data: msg.data,
    badge: msg.badge,
  });

  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      payload,
      { TTL: 3600, urgency: "normal" },
    );
    return { ok: true };
  } catch (err: unknown) {
    const statusCode =
      err && typeof err === "object" && "statusCode" in err
        ? (err as { statusCode: number }).statusCode
        : 0;
    const message = err instanceof Error ? err.message : String(err);
    // 404 / 410 = subscription expired/unregistered
    const shouldDelete = statusCode === 404 || statusCode === 410;
    return { ok: false, error: message, shouldDelete };
  }
}
