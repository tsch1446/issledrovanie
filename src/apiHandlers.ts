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
  AnswerResponse,
  AnswerValue,
  CompleteResponse,
  FinalScreen,
  Guest,
  PublicQuestion,
  StateReady,
  StateResponse,
} from "./types";
import { log } from "./utils";

export interface RequestLike {
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
}

export interface AuthResult {
  init: ValidatedInitData;
}

export function authenticate(req: RequestLike): AuthResult | { error: string; status: number } {
  const authHeader = req.headers["authorization"];
  const headerValue = Array.isArray(authHeader) ? authHeader[0] : authHeader;
  const header = extractInitDataFromHeader(headerValue);
  const body = (req.body && typeof req.body === "object" ? (req.body as Record<string, unknown>) : null);
  const bodyInit = body && typeof body.initData === "string" ? (body.initData as string) : null;
  const initData = header ?? bodyInit;
  if (!initData) return { error: "missing initData", status: 401 };
  const validated = validateInitData(initData);
  if (!validated) return { error: "invalid initData", status: 401 };
  return { init: validated };
}

function publicAssetPath(rel: string): string {
  if (!rel) return "";
  const cleaned = rel.replace(/^\/+/, "");
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

export async function handleState(auth: AuthResult): Promise<StateResponse> {
  const init = auth.init;
  const guest = getGuestById(init.user.id);
  if (!guest) {
    await logEvent(init.user.id, "miniapp_unknown_user");
    return { status: "unknown", telegramId: init.user.id };
  }
  const user = await ensureUser(guest, {
    username: init.user.username,
    firstName: init.user.firstName,
    lastName: init.user.lastName,
  });
  const body: StateReady = {
    status: "ready",
    name: guest.name,
    total: questionsCount(),
    currentIndex: user.currentQuestionIndex,
    completed: user.completed === 1,
    questions: toPublicQuestions(),
    final: buildFinalScreen(guest),
  };
  return body;
}

export type HandlerResult<T> =
  | { ok: true; status: number; body: T }
  | { ok: false; status: number; body: { error: string; [k: string]: unknown } };

export async function handleStart(auth: AuthResult): Promise<HandlerResult<{ ok: true }>> {
  const init = auth.init;
  const guest = getGuestById(init.user.id);
  if (!guest) return { ok: false, status: 403, body: { error: "not in guest list" } };
  const user = await ensureUser(guest, {
    username: init.user.username,
    firstName: init.user.firstName,
    lastName: init.user.lastName,
  });
  if (user.completed !== 1 && user.startedAt === null) {
    await markStarted(init.user.id);
    await logEvent(init.user.id, "user_started");
    log("user_started", { telegramId: init.user.id });
  }
  return { ok: true, status: 200, body: { ok: true } };
}

export interface AnswerInput {
  questionId: unknown;
  answer: unknown;
}

export async function handleAnswer(
  auth: AuthResult,
  input: AnswerInput,
): Promise<HandlerResult<AnswerResponse>> {
  const init = auth.init;
  const guest = getGuestById(init.user.id);
  if (!guest) return { ok: false, status: 403, body: { error: "not in guest list" } };

  const { questionId, answer } = input;
  if (typeof questionId !== "string" || (answer !== "yes" && answer !== "no")) {
    return { ok: false, status: 400, body: { error: "invalid payload" } };
  }

  const user = await getUser(init.user.id);
  if (!user) {
    return { ok: false, status: 409, body: { error: "user not initialised, call /state first" } };
  }
  if (user.completed === 1) {
    return {
      ok: false,
      status: 409,
      body: { error: "already completed", currentIndex: user.currentQuestionIndex },
    };
  }

  const questions = loadQuestions();
  const idx = user.currentQuestionIndex;
  const currentQ = questions[idx];
  if (!currentQ || currentQ.id !== questionId) {
    return {
      ok: false,
      status: 409,
      body: { error: "question out of order", expectedId: currentQ?.id ?? null },
    };
  }

  const result = await saveAnswer(
    init.user.id,
    currentQ.id,
    currentQ.analyticsKey,
    answer as AnswerValue,
  );
  if (result.alreadyAnswered) {
    return {
      ok: true,
      status: 200,
      body: { ok: false, alreadyAnswered: true, currentIndex: idx },
    };
  }
  await setCurrentQuestionIndex(init.user.id, idx + 1);
  await logEvent(init.user.id, "answer_saved", { questionId: currentQ.id, answer });
  log("answer_saved", { telegramId: init.user.id, questionId: currentQ.id, answer });
  return {
    ok: true,
    status: 200,
    body: { ok: true, alreadyAnswered: false, currentIndex: idx + 1 },
  };
}

export async function handleComplete(auth: AuthResult): Promise<HandlerResult<CompleteResponse>> {
  const init = auth.init;
  const guest = getGuestById(init.user.id);
  if (!guest) return { ok: false, status: 403, body: { error: "not in guest list" } };
  const user = await getUser(init.user.id);
  if (!user) return { ok: false, status: 409, body: { error: "user not initialised" } };
  if (user.completed === 1) {
    return {
      ok: true,
      status: 200,
      body: { ok: true, completedAt: user.completedAt },
    };
  }
  if (user.currentQuestionIndex < questionsCount()) {
    return { ok: false, status: 409, body: { error: "not all questions answered" } };
  }
  await markCompleted(init.user.id);
  await logEvent(init.user.id, "user_completed");
  log("user_completed", { telegramId: init.user.id });
  const refreshed = await getUser(init.user.id);
  return {
    ok: true,
    status: 200,
    body: { ok: true, completedAt: refreshed?.completedAt ?? null },
  };
}
