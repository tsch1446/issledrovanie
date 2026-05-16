import Database from "better-sqlite3";
import * as fs from "fs";
import * as path from "path";
import { config } from "./config";

let dbInstance: Database.Database | null = null;

export function getDb(): Database.Database {
  if (dbInstance) return dbInstance;

  if (!fs.existsSync(config.dataDir)) {
    fs.mkdirSync(config.dataDir, { recursive: true });
  }

  const db = new Database(config.dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      telegramId INTEGER PRIMARY KEY,
      username TEXT,
      firstName TEXT,
      lastName TEXT,
      startedAt TEXT,
      completedAt TEXT,
      completed INTEGER NOT NULL DEFAULT 0,
      currentQuestionIndex INTEGER NOT NULL DEFAULT 0,
      groupName TEXT,
      assignedDays TEXT,
      finalVariant TEXT
    );

    CREATE TABLE IF NOT EXISTS answers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      telegramId INTEGER NOT NULL,
      questionId TEXT NOT NULL,
      analyticsKey TEXT NOT NULL,
      answer TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      UNIQUE(telegramId, questionId)
    );

    CREATE INDEX IF NOT EXISTS idx_answers_question ON answers(questionId);
    CREATE INDEX IF NOT EXISTS idx_answers_user ON answers(telegramId);

    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      telegramId INTEGER,
      eventName TEXT NOT NULL,
      payload TEXT,
      timestamp TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_events_user ON events(telegramId);
    CREATE INDEX IF NOT EXISTS idx_events_name ON events(eventName);
  `);

  dbInstance = db;
  return db;
}

export function closeDb(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}

export function clearAllTables(): void {
  const db = getDb();
  db.exec(`
    DELETE FROM answers;
    DELETE FROM events;
    DELETE FROM users;
  `);
}

export function dbFileExists(): boolean {
  return fs.existsSync(config.dbPath);
}

export function dbFilePath(): string {
  return path.resolve(config.dbPath);
}
