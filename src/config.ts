import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config();

export interface AppConfig {
  botToken: string;
  adminTelegramId: number;
  nodeEnv: string;
  publicUrl: string;
  tursoUrl: string;
  tursoAuthToken: string;
  webhookSecret: string;
  rootDir: string;
  dataDir: string;
  questionsPath: string;
  guestsPath: string;
}

function readConfig(): AppConfig {
  const botToken = (process.env.BOT_TOKEN ?? "").trim();
  if (botToken === "") {
    throw new Error("BOT_TOKEN is not set");
  }

  const adminRaw = process.env.ADMIN_TELEGRAM_ID;
  if (!adminRaw || adminRaw.trim() === "") {
    throw new Error("ADMIN_TELEGRAM_ID is not set");
  }
  const adminTelegramId = Number(adminRaw);
  if (!Number.isFinite(adminTelegramId) || !Number.isInteger(adminTelegramId) || adminTelegramId <= 0) {
    throw new Error(`ADMIN_TELEGRAM_ID must be a positive integer, got: ${adminRaw}`);
  }

  const tursoUrl = (process.env.TURSO_DATABASE_URL ?? "").trim();
  if (!tursoUrl) {
    throw new Error("TURSO_DATABASE_URL is not set (e.g. libsql://your-db.turso.io)");
  }

  const tursoAuthToken = (process.env.TURSO_AUTH_TOKEN ?? "").trim();
  if (tursoUrl.startsWith("libsql://") && !tursoAuthToken) {
    throw new Error("TURSO_AUTH_TOKEN is required for libsql:// URLs");
  }

  const publicUrl = (process.env.PUBLIC_URL ?? "").replace(/\/$/, "");
  const webhookSecret = (process.env.TELEGRAM_WEBHOOK_SECRET ?? "").trim();

  const rootDir = path.resolve(__dirname, "..");
  const dataDir = path.join(rootDir, "data");

  return {
    botToken,
    adminTelegramId,
    nodeEnv: process.env.NODE_ENV ?? "development",
    publicUrl,
    tursoUrl,
    tursoAuthToken,
    webhookSecret,
    rootDir,
    dataDir,
    questionsPath: path.join(dataDir, "questions.json"),
    guestsPath: path.join(dataDir, "guests.json"),
  };
}

export const config: AppConfig = readConfig();
