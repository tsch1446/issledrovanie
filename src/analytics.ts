import { loadGuests } from "./guests";
import { loadQuestions } from "./scenario";
import {
  getAllAnswers,
  getAllUsers,
  getAnswersByQuestion,
} from "./storage";
import { AnswerRow, UserRow } from "./types";

export interface GeneralStats {
  guestsTotal: number;
  startedCount: number;
  completedCount: number;
  notStartedCount: number;
  completionRate: number;
  invited29: number;
  invited30: number;
  invited31: number;
}

export async function computeGeneralStats(): Promise<GeneralStats> {
  const guests = loadGuests();
  const users = await getAllUsers();

  const started = users.filter((u) => u.startedAt !== null).length;
  const completed = users.filter((u) => u.completed === 1).length;
  const notStarted = guests.length - started;
  const completionRate =
    guests.length > 0 ? Math.round((completed / guests.length) * 100) : 0;

  const invited29 = guests.filter((g) => g.days.includes("2026-05-29")).length;
  const invited30 = guests.filter((g) => g.days.includes("2026-05-30")).length;
  const invited31 = guests.filter((g) => g.days.includes("2026-05-31")).length;

  return {
    guestsTotal: guests.length,
    startedCount: started,
    completedCount: completed,
    notStartedCount: notStarted < 0 ? 0 : notStarted,
    completionRate,
    invited29,
    invited30,
    invited31,
  };
}

export interface QuestionAggregate {
  questionId: string;
  questionText: string;
  analyticsKey: string;
  yesLabel: string;
  noLabel: string;
  yesCount: number;
  noCount: number;
  totalAnswers: number;
  yesPercent: number;
  noPercent: number;
}

export async function computeQuestionAggregates(): Promise<QuestionAggregate[]> {
  const questions = loadQuestions();
  const out: QuestionAggregate[] = [];
  for (const q of questions) {
    const rows = await getAnswersByQuestion(q.id);
    const yesCount = rows.filter((r) => r.answer === "yes").length;
    const noCount = rows.filter((r) => r.answer === "no").length;
    const total = yesCount + noCount;
    const yesPercent = total > 0 ? Math.round((yesCount / total) * 100) : 0;
    const noPercent = total > 0 ? 100 - yesPercent : 0;
    out.push({
      questionId: q.id,
      questionText: q.text,
      analyticsKey: q.analyticsKey,
      yesLabel: q.yesLabel,
      noLabel: q.noLabel,
      yesCount,
      noCount,
      totalAnswers: total,
      yesPercent,
      noPercent,
    });
  }
  return out;
}

export interface QuestionDetailEntry {
  telegramId: number;
  username: string | null;
  firstName: string | null;
  answer: "yes" | "no";
  timestamp: string;
}

export interface QuestionDetail {
  questionId: string;
  questionText: string;
  yesLabel: string;
  noLabel: string;
  yes: QuestionDetailEntry[];
  no: QuestionDetailEntry[];
}

export async function computeQuestionDetail(questionId: string): Promise<QuestionDetail | null> {
  const questions = loadQuestions();
  const q = questions.find((x) => x.id === questionId);
  if (!q) return null;

  const rows = await getAnswersByQuestion(questionId);
  const users = new Map<number, UserRow>();
  for (const u of await getAllUsers()) {
    users.set(u.telegramId, u);
  }

  const yes: QuestionDetailEntry[] = [];
  const no: QuestionDetailEntry[] = [];
  for (const r of rows) {
    const u = users.get(r.telegramId);
    const entry: QuestionDetailEntry = {
      telegramId: r.telegramId,
      username: u?.username ?? null,
      firstName: u?.firstName ?? null,
      answer: r.answer,
      timestamp: r.timestamp,
    };
    if (r.answer === "yes") yes.push(entry);
    else no.push(entry);
  }

  return {
    questionId: q.id,
    questionText: q.text,
    yesLabel: q.yesLabel,
    noLabel: q.noLabel,
    yes,
    no,
  };
}

export interface InsightLine {
  label: string;
  count: number;
}

export async function computeInsights(): Promise<InsightLine[]> {
  const aggregates = await computeQuestionAggregates();
  const out: InsightLine[] = [];
  for (const a of aggregates) {
    out.push({ label: a.yesLabel, count: a.yesCount });
    out.push({ label: a.noLabel, count: a.noCount });
  }
  return out;
}

export interface PendingLists {
  notStarted: Array<{ telegramId: number; name: string; username: string | null }>;
  notCompleted: Array<{
    telegramId: number;
    name: string;
    username: string | null;
    currentQuestionIndex: number;
  }>;
}

export async function computePending(): Promise<PendingLists> {
  const guests = loadGuests();
  const users = new Map<number, UserRow>();
  for (const u of await getAllUsers()) users.set(u.telegramId, u);

  const notStarted: PendingLists["notStarted"] = [];
  const notCompleted: PendingLists["notCompleted"] = [];

  for (const g of guests) {
    const u = users.get(g.telegramId);
    if (!u || u.startedAt === null) {
      notStarted.push({ telegramId: g.telegramId, name: g.name, username: u?.username ?? null });
      continue;
    }
    if (u.completed !== 1) {
      notCompleted.push({
        telegramId: g.telegramId,
        name: g.name,
        username: u.username ?? null,
        currentQuestionIndex: u.currentQuestionIndex,
      });
    }
  }

  return { notStarted, notCompleted };
}

export interface UserStatusReport {
  guestName: string | null;
  group: string | null;
  assignedDays: string[];
  user: UserRow | null;
  answers: Array<{
    questionId: string;
    questionText: string;
    answer: "yes" | "no" | null;
    label: string | null;
  }>;
}

export async function computeUserStatus(telegramId: number): Promise<UserStatusReport> {
  const guest = loadGuests().find((g) => g.telegramId === telegramId) ?? null;
  const userRow = (await getAllUsers()).find((u) => u.telegramId === telegramId) ?? null;
  const questions = loadQuestions();
  const answers = (await getAllAnswers()).filter((a) => a.telegramId === telegramId);
  const answersMap = new Map<string, AnswerRow>();
  for (const a of answers) answersMap.set(a.questionId, a);

  const rows = questions.map((q) => {
    const ans = answersMap.get(q.id);
    if (!ans) {
      return { questionId: q.id, questionText: q.text, answer: null, label: null };
    }
    const label = ans.answer === "yes" ? q.yesLabel : q.noLabel;
    return { questionId: q.id, questionText: q.text, answer: ans.answer, label };
  });

  return {
    guestName: guest?.name ?? null,
    group: guest?.group ?? null,
    assignedDays: guest?.days ?? [],
    user: userRow,
    answers: rows,
  };
}
