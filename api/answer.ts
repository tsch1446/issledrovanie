import type { VercelRequest, VercelResponse } from "@vercel/node";
import { handleAnswer } from "../src/apiHandlers";
import { auth, methodGuard, sendResult } from "./_common";

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (!methodGuard(req, res, "POST")) return;
  const a = auth(req, res);
  if (!a) return;
  const body = (req.body && typeof req.body === "object" ? (req.body as Record<string, unknown>) : {});
  try {
    sendResult(
      res,
      await handleAnswer(a, {
        questionId: body.questionId,
        answer: body.answer,
      }),
    );
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
}
