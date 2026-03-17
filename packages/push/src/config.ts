// Push provider config — read from env vars.
// All fields are optional at startup; missing providers are silently skipped.

export const pushConfig = {
  apns: {
    keyId: process.env.APNS_KEY_ID ?? "",
    teamId: process.env.APNS_TEAM_ID ?? "",
    bundleId: process.env.APNS_BUNDLE_ID ?? "",
    // PEM or p8 key content — set APNS_PRIVATE_KEY env var
    privateKey: process.env.APNS_PRIVATE_KEY ?? "",
    production: process.env.NODE_ENV === "production",
  },
  fcm: {
    // Full Firebase service account JSON — set FCM_SERVICE_ACCOUNT env var
    serviceAccount: process.env.FCM_SERVICE_ACCOUNT ?? "",
    projectId: process.env.FCM_PROJECT_ID ?? "",
  },
  webpush: {
    vapidPublicKey: process.env.VAPID_PUBLIC_KEY ?? "",
    vapidPrivateKey: process.env.VAPID_PRIVATE_KEY ?? "",
    // mailto: or https: URI identifying the push service
    vapidSubject: process.env.VAPID_SUBJECT ?? "mailto:team@maschina.ai",
  },
} as const;

export function apnsEnabled() {
  return !!(pushConfig.apns.keyId && pushConfig.apns.privateKey);
}

export function fcmEnabled() {
  return !!(pushConfig.fcm.serviceAccount || pushConfig.fcm.projectId);
}

export function webpushEnabled() {
  return !!(pushConfig.webpush.vapidPublicKey && pushConfig.webpush.vapidPrivateKey);
}
