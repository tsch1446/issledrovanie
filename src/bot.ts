import { Context, Markup, Telegraf } from "telegraf";
import { registerAdminCommands } from "./adminCommands";
import { config } from "./config";
import { getGuestById } from "./guests";
import {
  formatAlreadyCompletedShort,
  formatGreeting,
  formatRestartBlocked,
  formatUnknownUser,
} from "./renderText";
import { ensureUser, getUser, logEvent } from "./storage";
import { log, warn } from "./utils";

function getTelegramId(ctx: Context): number | null {
  const id = ctx.from?.id;
  return typeof id === "number" ? id : null;
}

function webAppUrl(): string | null {
  if (!config.publicUrl) return null;
  return config.publicUrl + "/";
}

function webAppKeyboard(label: string) {
  const url = webAppUrl();
  if (!url) {
    return Markup.inlineKeyboard([]);
  }
  return Markup.inlineKeyboard([[Markup.button.webApp(label, url)]]);
}

async function sendOpenAppMessage(ctx: Context, name: string): Promise<void> {
  const url = webAppUrl();
  if (!url) {
    await ctx.reply("Mini App не настроен: PUBLIC_URL пуст. Скажи Сергею.");
    return;
  }
  await ctx.reply(formatGreeting(name), webAppKeyboard("Открыть исследование"));
}

async function handleStart(ctx: Context): Promise<void> {
  const telegramId = getTelegramId(ctx);
  if (telegramId === null) return;

  const guest = getGuestById(telegramId);
  if (!guest) {
    await logEvent(telegramId, "unknown_user_start");
    await ctx.reply(formatUnknownUser(telegramId));
    return;
  }

  await ensureUser(guest, {
    username: ctx.from?.username ?? null,
    firstName: ctx.from?.first_name ?? null,
    lastName: ctx.from?.last_name ?? null,
  });

  const user = await getUser(telegramId);
  if (user?.completed === 1) {
    const url = webAppUrl();
    if (!url) {
      await ctx.reply(formatAlreadyCompletedShort());
      return;
    }
    await ctx.reply(formatAlreadyCompletedShort(), webAppKeyboard("Открыть результат"));
    return;
  }

  await sendOpenAppMessage(ctx, guest.name);
}

let botInstance: Telegraf | null = null;

export function getBot(): Telegraf {
  if (botInstance) return botInstance;

  const bot = new Telegraf(config.botToken);

  bot.catch((err, ctx) => {
    warn("bot_error", {
      error: (err as Error).message,
      updateType: ctx.updateType,
    });
  });

  bot.command("start", async (ctx) => {
    try {
      await handleStart(ctx);
    } catch (err) {
      warn("start_handler_error", { error: (err as Error).message });
    }
  });

  bot.command("myid", async (ctx) => {
    const id = getTelegramId(ctx);
    if (id === null) return;
    await ctx.reply(`Твой Telegram ID: ${id}`);
  });

  bot.command("restart", async (ctx) => {
    const id = getTelegramId(ctx);
    if (id === null) return;
    const user = await getUser(id);
    if (user && user.completed === 1) {
      await ctx.reply(formatRestartBlocked());
      return;
    }
    await handleStart(ctx);
  });

  registerAdminCommands(bot);

  log("bot_handlers_registered");
  botInstance = bot;
  return bot;
}
