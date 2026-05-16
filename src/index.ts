import { buildBot } from "./bot";
import { config } from "./config";
import { closeDb, getDb } from "./db";
import { loadGuests } from "./guests";
import { loadQuestions } from "./scenario";
import { startServer } from "./server";
import { log, warn } from "./utils";

function main(): void {
  const questions = loadQuestions();
  const guests = loadGuests();
  log("scenario_loaded", { questions: questions.length, guests: guests.length });

  getDb();
  log("db_ready", { path: config.dbPath });

  startServer();

  const bot = buildBot();

  const shutdown = (signal: string) => {
    log("shutdown", { signal });
    bot.stop(signal);
    closeDb();
  };

  process.once("SIGINT", () => shutdown("SIGINT"));
  process.once("SIGTERM", () => shutdown("SIGTERM"));

  log("bot_starting", {
    nodeEnv: config.nodeEnv,
    adminTelegramId: config.adminTelegramId,
    publicUrl: config.publicUrl || "(empty)",
  });
  bot.launch().catch((err) => {
    warn("bot_launch_failed", { error: (err as Error).message });
    process.exit(1);
  });
  log("bot_started");
}

try {
  main();
} catch (err) {
  warn("startup_failed", { error: (err as Error).message });
  process.exit(1);
}
