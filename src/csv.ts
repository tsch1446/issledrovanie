import { computeQuestionAggregates } from "./analytics";
import { loadQuestions } from "./scenario";
import { getAllAnswers, getAllUsers } from "./storage";

function escapeCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function rowsToCsv(header: string[], rows: Array<Array<unknown>>): string {
  const out: string[] = [];
  out.push(header.map(escapeCell).join(","));
  for (const row of rows) {
    out.push(row.map(escapeCell).join(","));
  }
  return out.join("\n");
}

export async function buildAnswersCsv(): Promise<string> {
  const header = [
    "telegramId",
    "username",
    "firstName",
    "questionId",
    "questionText",
    "analyticsKey",
    "answer",
    "answerLabel",
    "timestamp",
    "completed",
    "assignedDays",
    "groupName",
  ];

  const users = new Map<number, Awaited<ReturnType<typeof getAllUsers>>[number]>();
  for (const u of await getAllUsers()) users.set(u.telegramId, u);

  const questions = new Map<string, ReturnType<typeof loadQuestions>[number]>();
  for (const q of loadQuestions()) questions.set(q.id, q);

  const rows: Array<Array<unknown>> = [];
  for (const a of await getAllAnswers()) {
    const u = users.get(a.telegramId);
    const q = questions.get(a.questionId);
    const label = q ? (a.answer === "yes" ? q.yesLabel : q.noLabel) : "";
    rows.push([
      a.telegramId,
      u?.username ?? "",
      u?.firstName ?? "",
      a.questionId,
      q?.text ?? "",
      a.analyticsKey,
      a.answer,
      label,
      a.timestamp,
      u?.completed === 1 ? "1" : "0",
      u?.assignedDays ?? "",
      u?.groupName ?? "",
    ]);
  }

  return rowsToCsv(header, rows);
}

export async function buildSummaryCsv(): Promise<string> {
  const header = [
    "questionId",
    "questionText",
    "analyticsKey",
    "yesLabel",
    "noLabel",
    "yesCount",
    "noCount",
    "totalAnswers",
    "yesPercent",
    "noPercent",
  ];

  const aggregates = await computeQuestionAggregates();
  const rows = aggregates.map((a) => [
    a.questionId,
    a.questionText,
    a.analyticsKey,
    a.yesLabel,
    a.noLabel,
    a.yesCount,
    a.noCount,
    a.totalAnswers,
    a.yesPercent,
    a.noPercent,
  ]);

  return rowsToCsv(header, rows);
}
