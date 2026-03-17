export type PushPlatform = "apns" | "fcm" | "webpush";

// Per-platform subscription shapes stored in push_tokens.subscription
export interface ApnsSubscription {
  token: string;
}

export interface FcmSubscription {
  token: string;
}

export interface WebPushSubscription {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export type PushSubscription = ApnsSubscription | FcmSubscription | WebPushSubscription;

// The message to deliver
export interface PushMessage {
  title: string;
  body: string;
  data?: Record<string, string>; // arbitrary key-value pairs for the app to handle
  badge?: number; // iOS badge count
  sound?: string; // "default" or custom sound name
  collapseKey?: string; // FCM collapse key / APNs apns-collapse-id
}

export type PushResult =
  | { ok: true }
  | {
      ok: false;
      error: string;
      // true = token is invalid/unregistered and should be removed from DB
      shouldDelete: boolean;
    };
