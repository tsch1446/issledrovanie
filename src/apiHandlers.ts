import { extractInitDataFromHeader, validateInitData, ValidatedInitData } from "./auth";
import { deriveCohorts, questionMatchesAudience } from "./cohorts";
import { config } from "./config";
import { findGuest } from "./guests";
import { buildFinalContent } from "./renderText";
import { loadQuestions } from "./scenario";
import {
  ensureUser,
  getUser,
  logEvent,
  markCompleted,
  markStarted,
  resetUserProgress,
  saveAnswer,
  setCurrentQuestionIndex,
} from "./storage";
import {
  AnswerResponse,
  CompleteResponse,
  FinalScreen,
  Guest,
  PublicQuestion,
  Question,
  StateReady,
  StateResponse,
} from "./types";
import { log } from "./utils";

// Admin-only "view as" overrides: synthetic guest with the chosen day set,
// so the admin can step through what each cohort actually sees.
const VIEW_AS_DAYS: Record<string, string[]> = {
  poker: ["2026-05-29"],
  football: ["2026-05-30"],
  football_ext: ["2026-05-30", "2026-05-31"],
  all: ["2026-05-29", "2026-05-30", "2026-05-31"],
};

function isAdminUser(telegramId: number): boolean {
  return telegramId === config.adminTelegramId;
}

function maybeViewAsGuest(
  init: ValidatedInitData,
  viewAsRaw: unknown,
): Guest | null {
  if (!isAdminUser(init.user.id)) return null;
  if (typeof viewAsRaw !== "string") return null;
  const key = viewAsRaw.toLowerCase();
  const days = VIEW_AS_DAYS[key];
  if (!days) return null;
  const labels: Record<string, string> = {
    poker: "Покер-вью",
    football: "Футбол-вью",
    football_ext: "Футбол+вс-вью",
    all: "Все-3-вью",
  };
  return {
    telegramId: init.user.id,
    username: init.user.username ?? undefined,
    name: labels[key] ?? "Тест",
    days,
    group: "test",
    notes: `View-as: ${key}`,
  };
}

function extractViewAs(body: unknown): unknown {
  if (!body || typeof body !== "object") return undefined;
  return (body as Record<string, unknown>).viewAs;
}

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

function publicAssetPath(rel: string | undefined | null): string | null {
  if (!rel) return null;
  const cleaned = rel.replace(/^\/+/, "");
  return "/" + cleaned;
}

function questionsForGuest(guest: Guest): Question[] {
  const cohorts = deriveCohorts(guest.days);
  return loadQuestions().filter((q) => questionMatchesAudience(q.audience, cohorts));
}

function toPublicQuestion(q: Question): PublicQuestion {
  return {
    id: q.id,
    text: q.text,
    image: publicAssetPath(q.image),
    options: q.options.map((o) => {
      if (!o.reaction) return { id: o.id, label: o.label, reaction: null };
      const r = o.reaction;
      const images = r.images?.map((p) => publicAssetPath(p) as string).filter(Boolean);
      return {
        id: o.id,
        label: o.label,
        reaction: {
          text: r.text,
          image: publicAssetPath(r.image) ?? undefined,
          images: images && images.length > 0 ? images : undefined,
        },
      };
    }),
  };
}

function buildFinalScreen(guest: Guest): FinalScreen {
  const c = buildFinalContent(guest.name, guest.days);
  return { title: c.title, body: c.body, image: null };
}

export async function handleState(
  authResult: AuthResult,
  reqBody: unknown = null,
): Promise<StateResponse> {
  const init = authResult.init;

  // Admin "view-as" preview: if the body carries a valid viewAs, synthesize a
  // guest with that day set and start the run fresh.
  const viewAsGuest = maybeViewAsGuest(init, extractViewAs(reqBody));
  if (viewAsGuest) {
    await ensureUser(init.user.id, viewAsGuest, {
      username: init.user.username,
      firstName: init.user.firstName,
      lastName: init.user.lastName,
    });
    await resetUserProgress(init.user.id);
    await logEvent(init.user.id, "admin_view_as", { key: viewAsGuest.notes });
    const filtered = questionsForGuest(viewAsGuest);
    const body: StateReady = {
      status: "ready",
      name: viewAsGuest.name,
      total: filtered.length,
      currentIndex: 0,
      completed: false,
      questions: filtered.map(toPublicQuestion),
      final: buildFinalScreen(viewAsGuest),
    };
    return body;
  }

  const guest = findGuest(init.user.id, init.user.username);
  if (!guest) {
    await logEvent(init.user.id, "miniapp_unknown_user");
    return { status: "unknown", telegramId: init.user.id };
  }
  let user = await ensureUser(init.user.id, guest, {
    username: init.user.username,
    firstName: init.user.firstName,
    lastName: init.user.lastName,
  });

  // Admin can retake the quiz: if they already completed, wipe their progress
  // on next /state so the next open starts a fresh run.
  if (isAdminUser(init.user.id) && user.completed === 1) {
    await resetUserProgress(init.user.id);
    await logEvent(init.user.id, "admin_auto_replay");
    log("admin_auto_replay", { telegramId: init.user.id });
    const refreshed = await getUser(init.user.id);
    if (refreshed) user = refreshed;
  }

  const filtered = questionsForGuest(guest);
  const body: StateReady = {
    status: "ready",
    name: guest.name,
    total: filtered.length,
    currentIndex: user.currentQuestionIndex,
    completed: user.completed === 1,
    questions: filtered.map(toPublicQuestion),
    final: buildFinalScreen(guest),
  };
  return body;
}

export type HandlerResult<T> =
  | { ok: true; status: number; body: T }
  | { ok: false; status: number; body: { error: string; [k: string]: unknown } };

export async function handleStart(
  authResult: AuthResult,
  reqBody: unknown = null,
): Promise<HandlerResult<{ ok: true }>> {
  const init = authResult.init;
  const guest =
    maybeViewAsGuest(init, extractViewAs(reqBody)) ??
    findGuest(init.user.id, init.user.username);
  if (!guest) return { ok: false, status: 403, body: { error: "not in guest list" } };
  const user = await ensureUser(init.user.id, guest, {
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
  optionId: unknown;
  viewAs?: unknown;
}

export async function handleAnswer(
  authResult: AuthResult,
  input: AnswerInput,
): Promise<HandlerResult<AnswerResponse>> {
  const init = authResult.init;
  const guest =
    maybeViewAsGuest(init, input.viewAs) ??
    findGuest(init.user.id, init.user.username);
  if (!guest) return { ok: false, status: 403, body: { error: "not in guest list" } };

  const { questionId, optionId } = input;
  if (typeof questionId !== "string" || typeof optionId !== "string") {
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

  const filtered = questionsForGuest(guest);
  const idx = user.currentQuestionIndex;
  const currentQ = filtered[idx];
  if (!currentQ || currentQ.id !== questionId) {
    return {
      ok: false,
      status: 409,
      body: { error: "question out of order", expectedId: currentQ?.id ?? null },
    };
  }

  const option = currentQ.options.find((o) => o.id === optionId);
  if (!option) {
    return { ok: false, status: 400, body: { error: "unknown optionId for this question" } };
  }

  const result = await saveAnswer(init.user.id, currentQ.id, currentQ.id, option.id);
  if (result.alreadyAnswered) {
    return {
      ok: true,
      status: 200,
      body: { ok: false, alreadyAnswered: true, currentIndex: idx },
    };
  }
  await setCurrentQuestionIndex(init.user.id, idx + 1);
  await logEvent(init.user.id, "answer_saved", { questionId: currentQ.id, optionId: option.id });
  log("answer_saved", { telegramId: init.user.id, questionId: currentQ.id, optionId: option.id });
  return {
    ok: true,
    status: 200,
    body: { ok: true, alreadyAnswered: false, currentIndex: idx + 1 },
  };
}

export async function handleComplete(
  authResult: AuthResult,
  reqBody: unknown = null,
): Promise<HandlerResult<CompleteResponse>> {
  const init = authResult.init;
  const guest =
    maybeViewAsGuest(init, extractViewAs(reqBody)) ??
    findGuest(init.user.id, init.user.username);
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
  const filtered = questionsForGuest(guest);
  if (user.currentQuestionIndex < filtered.length) {
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
