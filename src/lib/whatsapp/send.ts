// Outbound sending via the Meta WhatsApp Cloud API (Graph API).

const GRAPH = "https://graph.facebook.com";

function apiBase() {
  const version = process.env.WHATSAPP_API_VERSION || "v21.0";
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!token) throw new Error("WHATSAPP_ACCESS_TOKEN is not set");
  return { version, token };
}

export interface SendResult {
  ok: boolean;
  waMessageId?: string;
  error?: string;
}

async function postMessage(
  phoneNumberId: string,
  payload: Record<string, unknown>,
): Promise<SendResult> {
  const { version, token } = apiBase();
  try {
    const res = await fetch(`${GRAPH}/${version}/${phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ messaging_product: "whatsapp", ...payload }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg =
        data?.error?.message ?? `WhatsApp API error (HTTP ${res.status})`;
      return { ok: false, error: msg };
    }
    return { ok: true, waMessageId: data?.messages?.[0]?.id };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

/** Send a free-text message (only valid inside the 24h customer service window). */
export function sendText(
  phoneNumberId: string,
  to: string,
  body: string,
): Promise<SendResult> {
  return postMessage(phoneNumberId, {
    recipient_type: "individual",
    to,
    type: "text",
    text: { preview_url: false, body },
  });
}

/** Send an image by public URL (Meta fetches the link). 24h window rules apply. */
export function sendImage(
  phoneNumberId: string,
  to: string,
  link: string,
  caption?: string,
): Promise<SendResult> {
  return postMessage(phoneNumberId, {
    recipient_type: "individual",
    to,
    type: "image",
    image: { link, ...(caption ? { caption } : {}) },
  });
}

/**
 * Send an approved template message (used to re-open a conversation outside the
 * 24h window). `components` carries variable parameters when the template needs them.
 */
export function sendTemplate(
  phoneNumberId: string,
  to: string,
  templateName: string,
  languageCode = "en_US",
  components?: unknown[],
): Promise<SendResult> {
  return postMessage(phoneNumberId, {
    to,
    type: "template",
    template: {
      name: templateName,
      language: { code: languageCode },
      ...(components ? { components } : {}),
    },
  });
}

/** Fetch approved message templates for a WABA (name + language + status). */
export async function listTemplates(
  wabaId: string,
): Promise<{ name: string; language: string; status: string; category: string }[]> {
  const { version, token } = apiBase();
  const res = await fetch(
    `${GRAPH}/${version}/${wabaId}/message_templates?fields=name,language,status,category&limit=100`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return [];
  return (data?.data ?? []).map(
    (t: { name: string; language: string; status: string; category: string }) => ({
      name: t.name,
      language: t.language,
      status: t.status,
      category: t.category,
    }),
  );
}
