// Firebase Cloud Messaging, HTTP v1. One transport covers both apps: Android natively, and iOS via
// the APNs key uploaded to the Firebase project — so there is no second APNs integration to run.
//
// v1 needs an OAuth2 access token from a service account rather than the old static server key, so
// this signs a JWT with WebCrypto and exchanges it. The token is cached for its lifetime: minting one
// per notification would add a round trip to every order update.
//
// Secret: FCM_SERVICE_ACCOUNT_JSON — the whole service-account JSON from
// Firebase Console > Project settings > Service accounts > Generate new private key.

const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/firebase.messaging";

type ServiceAccount = { project_id: string; client_email: string; private_key: string };

export type FcmSendResult =
  | { ok: true; messageId: string }
  | { ok: false; error: string; tokenInvalid: boolean };

let cached: { token: string; expiresAt: number } | null = null;

function serviceAccount(): ServiceAccount {
  const raw = Deno.env.get("FCM_SERVICE_ACCOUNT_JSON");
  if (!raw) throw new Error("FCM_SERVICE_ACCOUNT_JSON is not set");
  const parsed = JSON.parse(raw) as ServiceAccount;
  if (!parsed.project_id || !parsed.client_email || !parsed.private_key) {
    throw new Error("FCM_SERVICE_ACCOUNT_JSON is missing project_id, client_email or private_key");
  }
  return parsed;
}

function base64Url(bytes: Uint8Array | string): string {
  const raw = typeof bytes === "string" ? bytes : String.fromCharCode(...bytes);
  return btoa(raw).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function importPrivateKey(pem: string): Promise<CryptoKey> {
  // Secrets stored through the dashboard often arrive with literal \n rather than real newlines.
  const normalised = pem.replace(/\\n/g, "\n");
  const body = normalised
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s+/g, "");
  const der = Uint8Array.from(atob(body), (char) => char.charCodeAt(0));
  return await crypto.subtle.importKey(
    "pkcs8",
    der,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

async function accessToken(): Promise<{ token: string; projectId: string }> {
  const account = serviceAccount();
  const now = Math.floor(Date.now() / 1000);

  // 60s of slack so a token never expires mid-request.
  if (cached && cached.expiresAt > now + 60) return { token: cached.token, projectId: account.project_id };

  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64Url(JSON.stringify({
    iss: account.client_email,
    scope: SCOPE,
    aud: TOKEN_ENDPOINT,
    iat: now,
    exp: now + 3600,
  }));
  const key = await importPrivateKey(account.private_key);
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(`${header}.${claims}`),
  );
  const assertion = `${header}.${claims}.${base64Url(new Uint8Array(signature))}`;

  const response = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.access_token) {
    throw new Error(`FCM auth failed: ${payload.error_description ?? payload.error ?? response.status}`);
  }

  cached = { token: payload.access_token as string, expiresAt: now + Number(payload.expires_in ?? 3600) };
  return { token: cached.token, projectId: account.project_id };
}

/** A token FCM says is dead should never be tried again — that is what deactivation is for. */
function isTokenInvalid(status: number, payload: Record<string, unknown>): boolean {
  const details = payload?.error as { status?: string; details?: { errorCode?: string }[] } | undefined;
  const errorCode = details?.details?.find((detail) => detail.errorCode)?.errorCode;
  if (errorCode === "UNREGISTERED" || errorCode === "INVALID_ARGUMENT") return true;
  return status === 404 || details?.status === "NOT_FOUND";
}

export async function sendFcmMessage(input: {
  token: string;
  title: string;
  body: string;
  data: Record<string, string>;
}): Promise<FcmSendResult> {
  try {
    const { token: bearer, projectId } = await accessToken();
    const response = await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
      method: "POST",
      headers: { Authorization: `Bearer ${bearer}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: {
          token: input.token,
          notification: { title: input.title, body: input.body },
          // Data values must be strings in v1; the app reads `url` to route the tap.
          data: input.data,
          android: {
            priority: "high",
            notification: {
              // Must match the channel the app creates, or Android 8+ drops the notification.
              channel_id: "orders",
              sound: "default",
            },
          },
          apns: {
            payload: {
              aps: {
                sound: "default",
                // Arabic copy, so the system must not try to localise it.
                alert: { title: input.title, body: input.body },
              },
            },
          },
        },
      }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = (payload?.error as { message?: string } | undefined)?.message ?? `HTTP ${response.status}`;
      return { ok: false, error: message, tokenInvalid: isTokenInvalid(response.status, payload) };
    }
    return { ok: true, messageId: String(payload.name ?? "") };
  } catch (error) {
    // Configuration and network faults are not the device's fault: never invalidate a token for them.
    return { ok: false, error: error instanceof Error ? error.message : "FCM send failed", tokenInvalid: false };
  }
}

export function fcmConfigured(): boolean {
  return Boolean(Deno.env.get("FCM_SERVICE_ACCOUNT_JSON"));
}
