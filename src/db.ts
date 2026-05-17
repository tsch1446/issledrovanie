import { Client, createClient } from "@libsql/client";
import { config } from "./config";

let clientInstance: Client | null = null;
let schemaReady = false;

export function getClient(): Client {
  if (clientInstance) return clientInstance;
  clientInstance = createClient({
    url: config.tursoUrl,
    authToken: config.tursoAuthToken || undefined,
  });
  return clientInstance;
}

const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS users (
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
   )`,
  `CREATE TABLE IF NOT EXISTS answers (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     telegramId INTEGER NOT NULL,
     questionId TEXT NOT NULL,
     analyticsKey TEXT NOT NULL,
     answer TEXT NOT NULL,
     timestamp TEXT NOT NULL,
     UNIQUE(telegramId, questionId)
   )`,
  `CREATE INDEX IF NOT EXISTS idx_answers_question ON answers(questionId)`,
  `CREATE INDEX IF NOT EXISTS idx_answers_user ON answers(telegramId)`,
  `CREATE TABLE IF NOT EXISTS events (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     telegramId INTEGER,
     eventName TEXT NOT NULL,
     payload TEXT,
     timestamp TEXT NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS idx_events_user ON events(telegramId)`,
  `CREATE INDEX IF NOT EXISTS idx_events_name ON events(eventName)`,
];

export async function ensureSchema(): Promise<Client> {
  const client = getClient();
  if (schemaReady) return client;
  for (const sql of SCHEMA_STATEMENTS) {
    await client.execute(sql);
  }
  schemaReady = true;
  return client;
}

export async function clearAllTables(): Promise<void> {
  const client = await ensureSchema();
  await client.batch(
    ["DELETE FROM answers", "DELETE FROM events", "DELETE FROM users"],
    "write",
  );
}
