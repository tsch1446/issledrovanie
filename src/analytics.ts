import { deriveCohorts } from "./cohorts";
import { loadGuests } from "./guests";
import { loadQuestions } from "./scenario";
import {
  getAllAnswers,
  getAllUsers,
  getAnswersByQuestion,
} from "./storage";
import { AnswerRow, Question, UserRow } from "./types";

export interface GeneralStats {
  guestsTotal: number;
  startedCount: number;
  completedCount: number;
  notStartedCount: number;
  completionRate: number;
  invited29: number;
  invited30: number;
  invited31: number;
  pokerCohort: number;
  footballCohort: number;
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

  let pokerCohort = 0;
  let footballCohort = 0;
  for (const g of guests) {
    const c = deriveCohorts(g.days);
    if (c.hasPoker) pokerCohort++;
    if (c.hasFootball) footballCohort++;
  }

  return {
    guestsTotal: guests.length,
    startedCount: started,
    completedCount: completed,
    notStartedCount: notStarted < 0 ? 0 : notStarted,
    completionRate,
    invited29,
    invited30,
    invited31,
    pokerCohort,
    footballCohort,
  };
}

export interface OptionAggregate {
  optionId: string;
  label: string;
  analyticsLabel: string;
  count: number;
  percent: number;
}

export interface QuestionAggregate {
  questionId: string;
  questionText: string;
  audience: string[];
  totalAnswers: number;
  options: OptionAggregate[];
}

export async function computeQuestionAggregates(): Promise<QuestionAggregate[]> {
  const questions = loadQuestions();
  const out: QuestionAggregate[] = [];
  for (const q of questions) {
    const rows = await getAnswersByQuestion(q.id);
    const total = rows.length;
    const counts = new Map<string, number>();
    for (const r of rows) {
      counts.set(r.answer, (counts.get(r.answer) ?? 0) + 1);
    }
    const options: OptionAggregate[] = q.options.map((o) => {
      const c = counts.get(o.id) ?? 0;
      return {
        optionId: o.id,
        label: o.label,
        analyticsLabel: o.analyticsLabel,
        count: c,
        percent: total > 0 ? Math.round((c / total) * 100) : 0,
      };
    });
    out.push({
      questionId: q.id,
      questionText: q.text,
      audience: q.audience,
      totalAnswers: total,
      options,
    });
  }
  return out;
}

export interface QuestionDetailEntry {
  telegramId: number;
  username: string | null;
  firstName: string | null;
  optionId: string;
  optionLabel: string;
  timestamp: string;
}

export interface QuestionDetailGroup {
  optionId: string;
  label: string;
  entries: QuestionDetailEntry[];
}

export interface QuestionDetail {
  questionId: string;
  questionText: string;
  groups: QuestionDetailGroup[];
}

export async function computeQuestionDetail(questionId: string): Promise<QuestionDetail | null> {
  const questions = loadQuestions();
  const q = questions.find((x) => x.id === questionId);
  if (!q) return null;

  const rows = await getAnswersByQuestion(questionId);
  const users = new Map<number, UserRow>();
  for (const u of await getAllUsers()) users.set(u.telegramId, u);

  const groups: QuestionDetailGroup[] = q.options.map((o) => ({
    optionId: o.id,
    label: o.label,
    entries: [],
  }));
  const groupByOption = new Map<string, QuestionDetailGroup>();
  for (const g of groups) groupByOption.set(g.optionId, g);

  for (const r of rows) {
    const u = users.get(r.telegramId);
    const group = groupByOption.get(r.answer);
    if (!group) continue;
    group.entries.push({
      telegramId: r.telegramId,
      username: u?.username ?? null,
      firstName: u?.firstName ?? null,
      optionId: r.answer,
      optionLabel: group.label,
      timestamp: r.timestamp,
    });
  }

  return { questionId: q.id, questionText: q.text, groups };
}

export interface InsightLine {
  label: string;
  count: number;
}

export async function computeInsights(): Promise<InsightLine[]> {
  const aggregates = await computeQuestionAggregates();
  const out: InsightLine[] = [];
  for (const a of aggregates) {
    for (const o of a.options) {
      out.push({ label: o.analyticsLabel, count: o.count });
    }
  }
  return out;
}

export interface PendingLists {
  notStarted: Array<{ telegramId: number | null; name: string; username: string | null }>;
  notCompleted: Array<{
    telegramId: number;
    name: string;
    username: string | null;
    currentQuestionIndex: number;
  }>;
}

export async function computePending(): Promise<PendingLists> {
  const guests = loadGuests();
  const usersById = new Map<number, UserRow>();
  const usersByUsername = new Map<string, UserRow>();
  for (const u of await getAllUsers()) {
    usersById.set(u.telegramId, u);
    if (u.username) usersByUsername.set(u.username.toLowerCase(), u);
  }

  const notStarted: PendingLists["notStarted"] = [];
  const notCompleted: PendingLists["notCompleted"] = [];

  for (const g of guests) {
    let u: UserRow | undefined;
    if (g.telegramId !== undefined) u = usersById.get(g.telegramId);
    if (!u && g.username) u = usersByUsername.get(g.username);

    if (!u || u.startedAt === null) {
      notStarted.push({
        telegramId: g.telegramId ?? u?.telegramId ?? null,
        name: g.name,
        username: g.username ?? u?.username ?? null,
      });
      continue;
    }
    if (u.completed !== 1) {
      notCompleted.push({
        telegramId: u.telegramId,
        name: g.name,
        username: g.username ?? u.username ?? null,
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
    optionId: string | null;
    optionLabel: string | null;
  }>;
}

function optionLabel(q: Question, optionId: string): string | null {
  const o = q.options.find((x) => x.id === optionId);
  return o?.label ?? null;
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
      return { questionId: q.id, questionText: q.text, optionId: null, optionLabel: null };
    }
    return {
      questionId: q.id,
      questionText: q.text,
      optionId: ans.answer,
      optionLabel: optionLabel(q, ans.answer),
    };
  });

  return {
    guestName: guest?.name ?? null,
    group: guest?.group ?? null,
    assignedDays: guest?.days ?? [],
    user: userRow,
    answers: rows,
  };
}
