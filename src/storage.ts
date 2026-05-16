import { getDb } from "./db";
import { AnswerRow, AnswerValue, Guest, UserRow } from "./types";
import { nowIso } from "./utils";

export function getUser(telegramId: number): UserRow | null {
  const db = getDb();
  const row = db
    .prepare(`SELECT * FROM users WHERE telegramId = ?`)
    .get(telegramId) as UserRow | undefined;
  return row ?? null;
}

export interface TelegramProfile {
  username?: string | null;
  firstName?: string | null;
  lastName?: string | null;
}

export function ensureUser(
  guest: Guest,
  tg: TelegramProfile,
): UserRow {
  const db = getDb();
  const existing = getUser(guest.telegramId);
  if (existing) {
    db.prepare(
      `UPDATE users
       SET username = COALESCE(?, username),
           firstName = COALESCE(?, firstName),
           lastName = COALESCE(?, lastName),
           groupName = ?,
           assignedDays = ?,
           finalVariant = ?
       WHERE telegramId = ?`,
    ).run(
      tg.username ?? null,
      tg.firstName ?? null,
      tg.lastName ?? null,
      guest.group,
      JSON.stringify(guest.days),
      guest.finalVariant,
      guest.telegramId,
    );
    const refreshed = getUser(guest.telegramId);
    if (!refreshed) throw new Error("User vanished after upsert");
    return refreshed;
  }

  db.prepare(
    `INSERT INTO users (telegramId, username, firstName, lastName, startedAt, completedAt, completed, currentQuestionIndex, groupName, assignedDays, finalVariant)
     VALUES (?, ?, ?, ?, NULL, NULL, 0, 0, ?, ?, ?)`,
  ).run(
    guest.telegramId,
    tg.username ?? null,
    tg.firstName ?? null,
    tg.lastName ?? null,
    guest.group,
    JSON.stringify(guest.days),
    guest.finalVariant,
  );
  const created = getUser(guest.telegramId);
  if (!created) throw new Error("Failed to create user");
  return created;
}

export function markStarted(telegramId: number): void {
  const db = getDb();
  db.prepare(
    `UPDATE users SET startedAt = COALESCE(startedAt, ?) WHERE telegramId = ?`,
  ).run(nowIso(), telegramId);
}

export function setCurrentQuestionIndex(telegramId: number, idx: number): void {
  const db = getDb();
  db.prepare(
    `UPDATE users SET currentQuestionIndex = ? WHERE telegramId = ?`,
  ).run(idx, telegramId);
}

export function markCompleted(telegramId: number): void {
  const db = getDb();
  db.prepare(
    `UPDATE users SET completed = 1, completedAt = ? WHERE telegramId = ?`,
  ).run(nowIso(), telegramId);
}

export function resetUserProgress(telegramId: number): boolean {
  const db = getDb();
  const user = getUser(telegramId);
  if (!user) return false;
  const tx = db.transaction(() => {
    db.prepare(`DELETE FROM answers WHERE telegramId = ?`).run(telegramId);
    db.prepare(
      `UPDATE users
       SET completed = 0,
           completedAt = NULL,
           currentQuestionIndex = 0,
           startedAt = NULL
       WHERE telegramId = ?`,
    ).run(telegramId);
  });
  tx();
  return true;
}

export interface SaveAnswerResult {
  saved: boolean;
  alreadyAnswered: boolean;
}

export function saveAnswer(
  telegramId: number,
  questionId: string,
  analyticsKey: string,
  answer: AnswerValue,
): SaveAnswerResult {
  const db = getDb();
  const existing = db
    .prepare(`SELECT id FROM answers WHERE telegramId = ? AND questionId = ?`)
    .get(telegramId, questionId);
  if (existing) {
    return { saved: false, alreadyAnswered: true };
  }
  db.prepare(
    `INSERT INTO answers (telegramId, questionId, analyticsKey, answer, timestamp)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(telegramId, questionId, analyticsKey, answer, nowIso());
  return { saved: true, alreadyAnswered: false };
}

export function getAnswersByUser(telegramId: number): AnswerRow[] {
  const db = getDb();
  return db
    .prepare(`SELECT * FROM answers WHERE telegramId = ? ORDER BY id ASC`)
    .all(telegramId) as AnswerRow[];
}

export function getAllAnswers(): AnswerRow[] {
  const db = getDb();
  return db
    .prepare(`SELECT * FROM answers ORDER BY timestamp ASC`)
    .all() as AnswerRow[];
}

export function getAnswersByQuestion(questionId: string): AnswerRow[] {
  const db = getDb();
  return db
    .prepare(`SELECT * FROM answers WHERE questionId = ?`)
    .all(questionId) as AnswerRow[];
}

export function getAllUsers(): UserRow[] {
  const db = getDb();
  return db.prepare(`SELECT * FROM users`).all() as UserRow[];
}

export function logEvent(
  telegramId: number | null,
  eventName: string,
  payload?: Record<string, unknown>,
): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO events (telegramId, eventName, payload, timestamp) VALUES (?, ?, ?, ?)`,
  ).run(
    telegramId,
    eventName,
    payload ? JSON.stringify(payload) : null,
    nowIso(),
  );
}
