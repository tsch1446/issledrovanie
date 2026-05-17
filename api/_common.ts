import type { VercelRequest, VercelResponse } from "@vercel/node";
import { authenticate, AuthResult, HandlerResult } from "../src/apiHandlers";

export function methodGuard(req: VercelRequest, res: VercelResponse, method: string): boolean {
  if (req.method !== method) {
    res.status(405).json({ error: "method not allowed" });
    return false;
  }
  return true;
}

export function auth(req: VercelRequest, res: VercelResponse): AuthResult | null {
  const r = authenticate({
    headers: req.headers as Record<string, string | string[] | undefined>,
    body: req.body,
  });
  if ("error" in r) {
    res.status(r.status).json({ error: r.error });
    return null;
  }
  return r;
}

export function sendResult<T>(res: VercelResponse, r: HandlerResult<T>): void {
  res.status(r.status).json(r.body);
}
