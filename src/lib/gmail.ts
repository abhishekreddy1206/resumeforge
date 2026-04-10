import { google } from "googleapis";

function getGmailClient() {
  const clientId = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;
  const refreshToken = process.env.GMAIL_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      "Gmail API not configured. Set GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, and GMAIL_REFRESH_TOKEN in .env"
    );
  }

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
  oauth2Client.setCredentials({ refresh_token: refreshToken });

  return google.gmail({ version: "v1", auth: oauth2Client });
}

export async function searchMessages(query: string, maxResults = 50): Promise<string[]> {
  const gmail = getGmailClient();
  const res = await gmail.users.messages.list({
    userId: "me",
    q: query,
    maxResults,
  });

  return (res.data.messages || []).map((m) => m.id!).filter(Boolean);
}

export interface EmailMessage {
  id: string;
  subject: string;
  from: string;
  body: string;
}

export async function readMessage(messageId: string): Promise<EmailMessage> {
  const gmail = getGmailClient();
  const res = await gmail.users.messages.get({
    userId: "me",
    id: messageId,
    format: "full",
  });

  const headers = res.data.payload?.headers || [];
  const subject = headers.find((h) => h.name?.toLowerCase() === "subject")?.value || "";
  const from = headers.find((h) => h.name?.toLowerCase() === "from")?.value || "";

  const rawBody = extractBody(res.data.payload);
  const body = stripHtml(rawBody).slice(0, 5000);

  return { id: messageId, subject, from, body };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractBody(payload: any): string {
  if (!payload) return "";

  // Check parts recursively for text content
  if (payload.parts) {
    // Prefer text/html (more URLs), fall back to text/plain
    for (const mimeType of ["text/html", "text/plain"]) {
      for (const part of payload.parts) {
        if (part.mimeType === mimeType && part.body?.data) {
          return Buffer.from(part.body.data, "base64url").toString("utf-8");
        }
        // Nested multipart
        if (part.parts) {
          const nested = extractBody(part);
          if (nested) return nested;
        }
      }
    }
  }

  // Single-part message
  if (payload.body?.data) {
    return Buffer.from(payload.body.data, "base64url").toString("utf-8");
  }

  return "";
}

function stripHtml(html: string): string {
  return html
    // Preserve URLs from anchor tags: <a href="URL">text</a> → text ( URL )
    .replace(/<a\s[^>]*href=["']([^"']+)["'][^>]*>(.*?)<\/a>/gi, (_, url, text) => `${text} ( ${url} )`)
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
