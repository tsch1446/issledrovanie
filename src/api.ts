import { NextFunction, Request, Response, Router } from "express";
import { extractInitDataFromHeader, validateInitData, ValidatedInitData } from "./auth";
import { getGuestById } from "./guests";
import { buildFinalContent } from "./renderText";
import { loadQuestions, questionsCount } from "./scenario";
import {
  ensureUser,
  getUser,
  logEvent,
  markCompleted,
  markStarted,
  saveAnswer,
  setCurrentQuestionIndex,
} from "./storage";
import {
  AnswerRequest,
  AnswerResponse,
  AnswerValue,
  CompleteResponse,
  FinalScreen,
  Guest,
  PublicQuestion,
  StateReady,
  StateResponse,
} from "./types";
import { log, warn } from "./utils";

interface ContextLocals {
  init: ValidatedInitData;
}

function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = extractInitDataFromHeader(req.header("authorization"));
  const bodyInit = (req.body && typeof req.body === "object" && (req.body as Record<string, unknown>).initData) as
    | string
    | undefined;
  const initData = header ?? (typeof bodyInit === "string" ? bodyInit : null);
  if (!initData) {
    res.status(401).json({ error: "missing initData" });
    return;
  }
  const validated = validateInitData(initData);
  if (!validated) {
    res.status(401).json({ error: "invalid initData" });
    return;
  }
  (res.locals as ContextLocals).init = validated;
  next();
}

function publicAssetPath(rel: string): string {
  if (!rel) return "";
  const cleaned = rel.replace(/^\/+/, "");
  if (cleaned.startsWith("assets/")) {
    return "/" + cleaned;
  }
  return "/" + cleaned;
}

function toPublicQuestions(): PublicQuestion[] {
  return loadQuestions().map((q) => ({
    id: q.id,
    text: q.text,
    image: publicAssetPath(q.image),
    yesReaction: {
      image: publicAssetPath(q.yes.reactionImage),
      text: q.yes.reactionText,
    },
    noReaction: {
      image: publicAssetPath(q.no.reactionImage),
      text: q.no.reactionText,
    },
  }));
}

function buildFinalScreen(guest: Guest): FinalScreen {
  const c = buildFinalContent(guest.name, guest.days);
  return {
    title: c.title,
    body: c.body,
    image: publicAssetPath(`assets/finals/${guest.finalVariant}.jpg`),
  };
}

function buildReadyState(guest: Guest, init: ValidatedInitData): StateReady {
  const user = ensureUser(guest, {
    username: init.user.username,
    firstName: init.user.firstName,
    lastName: init.user.lastName,
  });
  return {
    status: "ready",
    name: guest.name,
    total: questionsCount(),
    currentIndex: user.currentQuestionIndex,
    completed: user.completed === 1,
    questions: toPublicQuestions(),
    final: buildFinalScreen(guest),
  };
}

export function buildApiRouter(): Router {
  const router = Router();

  router.post("/state", requireAuth, (_req, res) => {
    const init = (res.locals as ContextLocals).init;
    const guest = getGuestById(init.user.id);
    if (!guest) {
      logEvent(init.user.id, "miniapp_unknown_user");
      const body: StateResponse = { status: "unknown", telegramId: init.user.id };
      res.json(body);
      return;
    }
    const body: StateResponse = buildReadyState(guest, init);
    res.json(body);
  });

  router.post("/start", requireAuth, (_req, res) => {
    const init = (res.locals as ContextLocals).init;
    const guest = getGuestById(init.user.id);
    if (!guest) {
      res.status(403).json({ error: "not in guest list" });
      return;
    }
    const user = ensureUser(guest, {
      username: init.user.username,
      firstName: init.user.firstName,
      lastName: init.user.lastName,
    });
    if (user.completed !== 1 && user.startedAt === null) {
      markStarted(init.user.id);
      logEvent(init.user.id, "user_started");
      log("user_started", { telegramId: init.user.id });
    }
    res.json({ ok: true });
  });

  router.post("/answer", requireAuth, (req, res) => {
    const init = (res.locals as ContextLocals).init;
    const guest = getGuestById(init.user.id);
    if (!guest) {
      res.status(403).json({ error: "not in guest list" });
      return;
    }
    const body = req.body as Partial<AnswerRequest> | undefined;
    const questionId = body?.questionId;
    const answer = body?.answer;
    if (typeof questionId !== "string" || (answer !== "yes" && answer !== "no")) {
      res.status(400).json({ error: "invalid payload" });
      return;
    }

    const user = getUser(init.user.id);
    if (!user) {
      res.status(409).json({ error: "user not initialised, call /state first" });
      return;
    }
    if (user.completed === 1) {
      res.status(409).json({ error: "already completed", currentIndex: user.currentQuestionIndex });
      return;
    }

    const questions = loadQuestions();
    const idx = user.currentQuestionIndex;
    const currentQ = questions[idx];
    if (!currentQ || currentQ.id !== questionId) {
      res.status(409).json({ error: "question out of order", expectedId: currentQ?.id ?? null });
      return;
    }

    const result = saveAnswer(init.user.id, currentQ.id, currentQ.analyticsKey, answer as AnswerValue);
    if (result.alreadyAnswered) {
      const body: AnswerResponse = { ok: false, alreadyAnswered: true, currentIndex: idx };
      res.json(body);
      return;
    }
    setCurrentQuestionIndex(init.user.id, idx + 1);
    logEvent(init.user.id, "answer_saved", { questionId: currentQ.id, answer });
    log("answer_saved", { telegramId: init.user.id, questionId: currentQ.id, answer });
    const resp: AnswerResponse = { ok: true, alreadyAnswered: false, currentIndex: idx + 1 };
    res.json(resp);
  });

  router.post("/complete", requireAuth, (_req, res) => {
    const init = (res.locals as ContextLocals).init;
    const guest = getGuestById(init.user.id);
    if (!guest) {
      res.status(403).json({ error: "not in guest list" });
      return;
    }
    const user = getUser(init.user.id);
    if (!user) {
      res.status(409).json({ error: "user not initialised" });
      return;
    }
    if (user.completed === 1) {
      const body: CompleteResponse = { ok: true, completedAt: user.completedAt };
      res.json(body);
      return;
    }
    if (user.currentQuestionIndex < questionsCount()) {
      res.status(409).json({ error: "not all questions answered" });
      return;
    }
    markCompleted(init.user.id);
    logEvent(init.user.id, "user_completed");
    log("user_completed", { telegramId: init.user.id });
    const refreshed = getUser(init.user.id);
    const body: CompleteResponse = { ok: true, completedAt: refreshed?.completedAt ?? null };
    res.json(body);
  });

  router.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    warn("api_error", { error: err.message });
    res.status(500).json({ error: "internal" });
  });

  return router;
}
