import { Row } from "@libsql/client";
import { ensureSchema } from "./db";
import { AnswerRow, AnswerValue, Guest, UserRow } from "./types";
import { nowIso } from "./utils";

function rowToUser(r: Row): UserRow {
  return {
    telegramId: Number(r.telegramId),
    username: (r.username as string | null) ?? null,
    firstName: (r.firstName as string | null) ?? null,
    lastName: (r.lastName as string | null) ?? null,
    startedAt: (r.startedAt as string | null) ?? null,
    completedAt: (r.completedAt as string | null) ?? null,
    completed: Number(r.completed),
    currentQuestionIndex: Number(r.currentQuestionIndex),
    groupName: (r.groupName as string | null) ?? null,
    assignedDays: (r.assignedDays as string | null) ?? null,
    finalVariant: (r.finalVariant as string | null) ?? null,
  };
}

function rowToAnswer(r: Row): AnswerRow {
  const answer = String(r.answer);
  return {
    id: Number(r.id),
    telegramId: Number(r.telegramId),
    questionId: String(r.questionId),
    analyticsKey: String(r.analyticsKey),
    answer: answer === "yes" ? "yes" : "no",
    timestamp: String(r.timestamp),
  };
}

export async function getUser(telegramId: number): Promise<UserRow | null> {
  const db = await ensureSchema();
  const res = await db.execute({
    sql: `SELECT * FROM users WHERE telegramId = ?`,
    args: [telegramId],
  });
  if (res.rows.length === 0) return null;
  return rowToUser(res.rows[0]);
}

export interface TelegramProfile {
  username?: string | null;
  firstName?: string | null;
  lastName?: string | null;
}

export async function ensureUser(guest: Guest, tg: TelegramProfile): Promise<UserRow> {
  const db = await ensureSchema();
  const existing = await getUser(guest.telegramId);
  if (existing) {
    await db.execute({
      sql: `UPDATE users
            SET username = COALESCE(?, username),
                firstName = COALESCE(?, firstName),
                lastName = COALESCE(?, lastName),
                groupName = ?,
                assignedDays = ?,
                finalVariant = ?
            WHERE telegramId = ?`,
      args: [
        tg.username ?? null,
        tg.firstName ?? null,
        tg.lastName ?? null,
        guest.group,
        JSON.stringify(guest.days),
        guest.finalVariant,
        guest.telegramId,
      ],
    });
    const refreshed = await getUser(guest.telegramId);
    if (!refreshed) throw new Error("User vanished after upsert");
    return refreshed;
  }

  await db.execute({
    sql: `INSERT INTO users (telegramId, username, firstName, lastName, startedAt, completedAt, completed, currentQuestionIndex, groupName, assignedDays, finalVariant)
          VALUES (?, ?, ?, ?, NULL, NULL, 0, 0, ?, ?, ?)`,
    args: [
      guest.telegramId,
      tg.username ?? null,
      tg.firstName ?? null,
      tg.lastName ?? null,
      guest.group,
      JSON.stringify(guest.days),
      guest.finalVariant,
    ],
  });
  const created = await getUser(guest.telegramId);
  if (!created) throw new Error("Failed to create user");
  return created;
}

export async function markStarted(telegramId: number): Promise<void> {
  const db = await ensureSchema();
  await db.execute({
    sql: `UPDATE users SET startedAt = COALESCE(startedAt, ?) WHERE telegramId = ?`,
    args: [nowIso(), telegramId],
  });
}

export async function setCurrentQuestionIndex(telegramId: number, idx: number): Promise<void> {
  const db = await ensureSchema();
  await db.execute({
    sql: `UPDATE users SET currentQuestionIndex = ? WHERE telegramId = ?`,
    args: [idx, telegramId],
  });
}

export async function markCompleted(telegramId: number): Promise<void> {
  const db = await ensureSchema();
  await db.execute({
    sql: `UPDATE users SET completed = 1, completedAt = ? WHERE telegramId = ?`,
    args: [nowIso(), telegramId],
  });
}

export async function resetUserProgress(telegramId: number): Promise<boolean> {
  const db = await ensureSchema();
  const user = await getUser(telegramId);
  if (!user) return false;
  await db.batch(
    [
      { sql: `DELETE FROM answers WHERE telegramId = ?`, args: [telegramId] },
      {
        sql: `UPDATE users
              SET completed = 0,
                  completedAt = NULL,
                  currentQuestionIndex = 0,
                  startedAt = NULL
              WHERE telegramId = ?`,
        args: [telegramId],
      },
    ],
    "write",
  );
  return true;
}

export interface SaveAnswerResult {
  saved: boolean;
  alreadyAnswered: boolean;
}

export async function saveAnswer(
  telegramId: number,
  questionId: string,
  analyticsKey: string,
  answer: AnswerValue,
): Promise<SaveAnswerResult> {
  const db = await ensureSchema();
  const existing = await db.execute({
    sql: `SELECT id FROM answers WHERE telegramId = ? AND questionId = ?`,
    args: [telegramId, questionId],
  });
  if (existing.rows.length > 0) {
    return { saved: false, alreadyAnswered: true };
  }
  await db.execute({
    sql: `INSERT INTO answers (telegramId, questionId, analyticsKey, answer, timestamp)
          VALUES (?, ?, ?, ?, ?)`,
    args: [telegramId, questionId, analyticsKey, answer, nowIso()],
  });
  return { saved: true, alreadyAnswered: false };
}

export async function getAnswersByUser(telegramId: number): Promise<AnswerRow[]> {
  const db = await ensureSchema();
  const res = await db.execute({
    sql: `SELECT * FROM answers WHERE telegramId = ? ORDER BY id ASC`,
    args: [telegramId],
  });
  return res.rows.map(rowToAnswer);
}

export async function getAllAnswers(): Promise<AnswerRow[]> {
  const db = await ensureSchema();
  const res = await db.execute(`SELECT * FROM answers ORDER BY timestamp ASC`);
  return res.rows.map(rowToAnswer);
}

export async function getAnswersByQuestion(questionId: string): Promise<AnswerRow[]> {
  const db = await ensureSchema();
  const res = await db.execute({
    sql: `SELECT * FROM answers WHERE questionId = ?`,
    args: [questionId],
  });
  return res.rows.map(rowToAnswer);
}

export async function getAllUsers(): Promise<UserRow[]> {
  const db = await ensureSchema();
  const res = await db.execute(`SELECT * FROM users`);
  return res.rows.map(rowToUser);
}

export async function logEvent(
  telegramId: number | null,
  eventName: string,
  payload?: Record<string, unknown>,
): Promise<void> {
  try {
    const db = await ensureSchema();
    await db.execute({
      sql: `INSERT INTO events (telegramId, eventName, payload, timestamp) VALUES (?, ?, ?, ?)`,
      args: [telegramId, eventName, payload ? JSON.stringify(payload) : null, nowIso()],
    });
  } catch {
    // event logging must never block flow
  }
}
