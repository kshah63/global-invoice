/**
 * Twilio WhatsApp notifications — dormant until the env vars are set.
 *
 *   TWILIO_ACCOUNT_SID        Twilio account SID
 *   TWILIO_AUTH_TOKEN         Twilio auth token
 *   TWILIO_WHATSAPP_FROM      sender, e.g. "whatsapp:+14155238886"
 *   TWILIO_WHATSAPP_CONTENT_SID  (optional) an approved template's Content SID;
 *                             required for business-initiated production sends.
 *                             Variables {{1}}=sender label, {{2}}=link.
 *   HR_WHATSAPP_TO            (optional) HR team's number for reply pings,
 *                             e.g. "whatsapp:+65..."
 *
 * With any of the first three missing, every call is a safe no-op.
 */

export function twilioConfigured(): boolean {
  return !!(
    process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN &&
    process.env.TWILIO_WHATSAPP_FROM
  );
}

function toWhatsApp(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  if (s.startsWith("whatsapp:")) return s;
  const cleaned = s.replace(/[^\d+]/g, "");
  if (cleaned.replace(/\D/g, "").length < 8) return null; // not a real number
  const e164 = cleaned.startsWith("+") ? cleaned : `+${cleaned}`;
  return `whatsapp:${e164}`;
}

/**
 * Send a WhatsApp message. `senderLabel` + `link` fill an approved template
 * ({{1}}/{{2}}) when TWILIO_WHATSAPP_CONTENT_SID is set; otherwise `body` is
 * sent as free text (works for the Twilio sandbox / 24h session window).
 * Best-effort: never throws.
 */
export async function sendWhatsApp(
  to: string,
  args: { body: string; senderLabel: string; link: string }
): Promise<boolean> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_WHATSAPP_FROM;
  if (!sid || !token || !from) return false;

  const dest = toWhatsApp(to);
  if (!dest) return false;

  const params = new URLSearchParams();
  params.set("From", from);
  params.set("To", dest);
  const contentSid = process.env.TWILIO_WHATSAPP_CONTENT_SID;
  if (contentSid) {
    params.set("ContentSid", contentSid);
    params.set("ContentVariables", JSON.stringify({ 1: args.senderLabel, 2: args.link }));
  } else {
    params.set("Body", args.body);
  }

  try {
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params.toString(),
      }
    );
    return res.ok;
  } catch {
    return false;
  }
}
