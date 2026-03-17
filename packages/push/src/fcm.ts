import { GoogleAuth } from "google-auth-library";
import { pushConfig } from "./config.js";
import type { FcmSubscription, PushMessage, PushResult } from "./types.js";

// FCM HTTP v1 API — uses a short-lived OAuth2 bearer token from the service account.
// Lighter than firebase-admin (no gRPC, no full SDK).

let _auth: GoogleAuth | null = null;

function getAuth(): GoogleAuth {
  if (!_auth) {
    const credentials = pushConfig.fcm.serviceAccount
      ? (JSON.parse(pushConfig.fcm.serviceAccount) as object)
      : undefined;

    _auth = new GoogleAuth({
      credentials,
      scopes: ["https://www.googleapis.com/auth/firebase.messaging"],
    });
  }
  return _auth;
}

export async function sendFcm(sub: FcmSubscription, msg: PushMessage): Promise<PushResult> {
  const projectId =
    pushConfig.fcm.projectId ||
    (pushConfig.fcm.serviceAccount
      ? (JSON.parse(pushConfig.fcm.serviceAccount) as { project_id?: string }).project_id
      : undefined);

  if (!projectId) {
    return { ok: false, error: "FCM_PROJECT_ID not configured", shouldDelete: false };
  }

  const client = await getAuth().getClient();
  const token = await client.getAccessToken();
  const accessToken = typeof token === "string" ? token : token?.token;
  if (!accessToken) {
    return { ok: false, error: "failed to obtain FCM access token", shouldDelete: false };
  }

  const url = `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`;

  const body = {
    message: {
      token: sub.token,
      notification: { title: msg.title, body: msg.body },
      android: {
        collapse_key: msg.collapseKey,
        notification: { sound: msg.sound ?? "default" },
      },
      apns: {
        payload: { aps: { badge: msg.badge, sound: msg.sound ?? "default" } },
      },
      data: msg.data,
    },
  };

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    // 404 = token not found; 400 with INVALID_ARGUMENT on bad token
    const shouldDelete = resp.status === 404 || text.includes("UNREGISTERED");
    return { ok: false, error: `FCM ${resp.status}: ${text}`, shouldDelete };
  }

  return { ok: true };
}
