import type { VercelRequest, VercelResponse } from "@vercel/node";
import { handleComplete } from "../src/apiHandlers";
import { auth, methodGuard, sendResult } from "./_common";

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (!methodGuard(req, res, "POST")) return;
  const a = auth(req, res);
  if (!a) return;
  try {
    sendResult(res, await handleComplete(a));
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
}
