// WhatsApp Cloud API template sending, shared by the OTP hook and the order-notification drainer.
//
// Everything outside the 24-hour customer-service window has to be a template approved in Meta's
// console, per category: OTP codes are an *authentication* template, order confirmations are a *utility*
// template. They are separate approvals with separate names, which is why the template name is
// configuration rather than a constant.
//
// One sending number and one access token serve both.

export type TemplateParam = { type: "text"; text: string };

export type WhatsappResult = {
  ok: boolean;
  messageId: string | null;
  error: string | null;
  /** True when Meta rejected the recipient rather than our request — a wrong or unreachable number. */
  recipientInvalid: boolean;
};

const env = (key: string) => Deno.env.get(key)?.trim() || undefined;

export function whatsappConfigured(): boolean {
  return Boolean(env("WHATSAPP_PHONE_NUMBER_ID") && env("WHATSAPP_ACCESS_TOKEN"));
}

/** Meta wants the number in international form without the leading +. */
function recipient(phone: string): string {
  return phone.replace(/^\+/, "");
}

export async function sendWhatsappTemplate(input: {
  phone: string;
  template: string;
  language?: string;
  bodyParams?: TemplateParam[];
  /** Authentication templates carry a one-tap copy button whose parameter is the code itself. */
  buttonParams?: TemplateParam[];
}): Promise<WhatsappResult> {
  const phoneNumberId = env("WHATSAPP_PHONE_NUMBER_ID");
  const token = env("WHATSAPP_ACCESS_TOKEN");
  const version = env("WHATSAPP_API_VERSION") ?? "v21.0";

  if (!phoneNumberId || !token) {
    return { ok: false, messageId: null, error: "WhatsApp is not configured", recipientInvalid: false };
  }

  const components: Record<string, unknown>[] = [];
  if (input.bodyParams?.length) components.push({ type: "body", parameters: input.bodyParams });
  if (input.buttonParams?.length) {
    components.push({ type: "button", sub_type: "url", index: "0", parameters: input.buttonParams });
  }

  try {
    const response = await fetch(`https://graph.facebook.com/${version}/${phoneNumberId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: recipient(input.phone),
        type: "template",
        template: {
          name: input.template,
          language: { code: input.language ?? "ar" },
          ...(components.length ? { components } : {}),
        },
      }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = payload?.error as { message?: string; code?: number } | undefined;
      // 131026: message undeliverable — most often a number with no WhatsApp account.
      // 131051: unsupported message type for that recipient.
      const recipientInvalid = error?.code === 131026 || error?.code === 131051;
      return {
        ok: false,
        messageId: null,
        error: error?.message ?? `HTTP ${response.status}`,
        recipientInvalid,
      };
    }
    return { ok: true, messageId: payload?.messages?.[0]?.id ?? null, error: null, recipientInvalid: false };
  } catch (error) {
    return {
      ok: false,
      messageId: null,
      error: error instanceof Error ? error.message : "WhatsApp send failed",
      recipientInvalid: false,
    };
  }
}
