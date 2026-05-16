import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config();

export interface AppConfig {
  botToken: string;
  adminTelegramId: number;
  nodeEnv: string;
  port: number;
  publicUrl: string;
  rootDir: string;
  dataDir: string;
  dbPath: string;
  questionsPath: string;
  guestsPath: string;
  publicDir: string;
  assetsDir: string;
}

function readConfig(): AppConfig {
  const botToken = process.env.BOT_TOKEN;
  if (!botToken || botToken.trim() === "") {
    throw new Error("BOT_TOKEN is not set. Create .env from .env.example and put your bot token there.");
  }

  const adminRaw = process.env.ADMIN_TELEGRAM_ID;
  if (!adminRaw || adminRaw.trim() === "") {
    throw new Error("ADMIN_TELEGRAM_ID is not set. Put your numeric Telegram ID in .env.");
  }
  const adminTelegramId = Number(adminRaw);
  if (!Number.isFinite(adminTelegramId) || !Number.isInteger(adminTelegramId) || adminTelegramId <= 0) {
    throw new Error(`ADMIN_TELEGRAM_ID must be a positive integer, got: ${adminRaw}`);
  }

  const portRaw = process.env.PORT ?? "3000";
  const port = Number(portRaw);
  if (!Number.isFinite(port) || port <= 0) {
    throw new Error(`PORT must be a positive integer, got: ${portRaw}`);
  }

  const publicUrl = (process.env.PUBLIC_URL ?? "").replace(/\/$/, "");

  const rootDir = path.resolve(__dirname, "..");
  const dataDir = path.join(rootDir, "data");

  return {
    botToken,
    adminTelegramId,
    nodeEnv: process.env.NODE_ENV ?? "development",
    port,
    publicUrl,
    rootDir,
    dataDir,
    dbPath: path.join(dataDir, "bot.sqlite"),
    questionsPath: path.join(dataDir, "questions.json"),
    guestsPath: path.join(dataDir, "guests.json"),
    publicDir: path.join(rootDir, "public"),
    assetsDir: path.join(rootDir, "assets"),
  };
}

export const config: AppConfig = readConfig();
