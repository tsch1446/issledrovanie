import type { VercelRequest, VercelResponse } from "@vercel/node";
import { handleState } from "../src/apiHandlers";
import { auth, methodGuard } from "./_common";

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (!methodGuard(req, res, "POST")) return;
  const a = auth(req, res);
  if (!a) return;
  try {
    const body = await handleState(a);
    res.status(200).json(body);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
}
