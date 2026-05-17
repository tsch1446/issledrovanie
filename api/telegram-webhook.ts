import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getBot } from "../src/bot";
import { config } from "../src/config";
import { warn } from "../src/utils";

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== "POST") {
    res.status(405).json({ error: "method not allowed" });
    return;
  }

  if (config.webhookSecret) {
    const got = req.headers["x-telegram-bot-api-secret-token"];
    const secret = Array.isArray(got) ? got[0] : got;
    if (secret !== config.webhookSecret) {
      res.status(401).json({ error: "invalid webhook secret" });
      return;
    }
  }

  try {
    const bot = getBot();
    await bot.handleUpdate(req.body as Parameters<typeof bot.handleUpdate>[0]);
    if (!res.headersSent) res.status(200).end();
  } catch (err) {
    warn("webhook_error", { error: (err as Error).message });
    if (!res.headersSent) res.status(200).end();
  }
}
