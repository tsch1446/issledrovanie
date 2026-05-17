import { Context, Markup, Telegraf } from "telegraf";
import {
  computeGeneralStats,
  computeInsights,
  computePending,
  computeQuestionAggregates,
  computeQuestionDetail,
  computeUserStatus,
} from "./analytics";
import { config } from "./config";
import { buildAnswersCsv, buildSummaryCsv } from "./csv";
import { clearAllTables } from "./db";
import { getGuestById, loadGuests } from "./guests";
import { Guest } from "./types";
import { buildFinalText, formatNotAdmin } from "./renderText";
import {
  ensureUser,
  getUser,
  getUserByUsername,
  logEvent,
  resetUserProgress,
} from "./storage";
import { isAdmin, log } from "./utils";

function adminOnly(handler: (ctx: Context) => Promise<void>) {
  return async (ctx: Context) => {
    const fromId = ctx.from?.id;
    if (typeof fromId !== "number" || !isAdmin(fromId)) {
      await ctx.reply(formatNotAdmin());
      return;
    }
    try {
      await handler(ctx);
    } catch (err) {
      await ctx.reply(`Ошибка команды: ${(err as Error).message}`);
    }
  };
}

function getArgs(ctx: Context): string[] {
  const msg = ctx.message;
  if (!msg || !("text" in msg) || typeof msg.text !== "string") return [];
  const parts = msg.text.trim().split(/\s+/);
  return parts.slice(1);
}

async function logAdminCommand(ctx: Context, command: string, args: string[]): Promise<void> {
  const fromId = ctx.from?.id ?? null;
  log("admin_command_used", { command, fromId, args });
  await logEvent(fromId, "admin_command", { command, args });
}

interface ResolvedTarget {
  guest: Guest | null;
  telegramId: number | null;
  raw: string;
}

/**
 * Resolve an admin command argument into a target user.
 * Accepts a numeric telegramId or @username (with or without the @).
 * Falls back to the DB users table when the guest entry has no telegramId.
 */
async function resolveTarget(raw: string | undefined): Promise<ResolvedTarget> {
  const arg = (raw ?? "").trim();
  if (!arg) return { guest: null, telegramId: null, raw: "" };

  // numeric id?
  const asNumber = Number(arg);
  if (Number.isFinite(asNumber) && Number.isInteger(asNumber) && asNumber > 0) {
    return { guest: getGuestById(asNumber), telegramId: asNumber, raw: arg };
  }

  // treat as username
  const username = arg.replace(/^@+/, "").trim().toLowerCase();
  if (!username) return { guest: null, telegramId: null, raw: arg };

  const guest = loadGuests().find((g) => g.username === username) ?? null;
  let telegramId: number | null = guest?.telegramId ?? null;
  if (telegramId === null) {
    // user may have opened the app already - their row carries the real id
    const u = await getUserByUsername(username);
    telegramId = u?.telegramId ?? null;
  }
  return { guest, telegramId, raw: arg };
}

export function registerAdminCommands(bot: Telegraf): void {
  bot.command(
    "stats",
    adminOnly(async (ctx) => {
      await logAdminCommand(ctx, "stats", []);
      const s = await computeGeneralStats();
      const lines = [
        "Общая статистика:",
        `Гостей: ${s.guestsTotal}`,
        `Начали: ${s.startedCount}`,
        `Завершили: ${s.completedCount}`,
        `Не начали: ${s.notStartedCount}`,
        `Completion rate: ${s.completionRate}%`,
        "",
        `Приглашены 29 мая: ${s.invited29}`,
        `Приглашены 30 мая: ${s.invited30}`,
        `Приглашены 31 мая: ${s.invited31}`,
        "",
        `Покер-когорта: ${s.pokerCohort}`,
        `Футбол-когорта: ${s.footballCohort}`,
      ];
      await ctx.reply(lines.join("\n"));
    }),
  );

  bot.command(
    "stats_questions",
    adminOnly(async (ctx) => {
      await logAdminCommand(ctx, "stats_questions", []);
      const aggs = await computeQuestionAggregates();
      if (aggs.length === 0) {
        await ctx.reply("Вопросов нет.");
        return;
      }
      const blocks = aggs.map((a) => {
        const head = `${a.questionId} [${a.audience.join("|")}]: ${a.questionText}`;
        const opts = a.options
          .map((o) => `  ${o.label}: ${o.count} (${o.percent}%)`)
          .join("\n");
        return `${head}\n${opts}\nВсего: ${a.totalAnswers}`;
      });
      await ctx.reply(blocks.join("\n\n"));
    }),
  );

  bot.command(
    "stats_question",
    adminOnly(async (ctx) => {
      const args = getArgs(ctx);
      await logAdminCommand(ctx, "stats_question", args);
      const qid = args[0];
      if (!qid) {
        await ctx.reply("Использование: /stats_question <questionId>");
        return;
      }
      const detail = await computeQuestionDetail(qid);
      if (!detail) {
        await ctx.reply(`Вопрос "${qid}" не найден.`);
        return;
      }
      const blocks = detail.groups.map((g) => {
        if (g.entries.length === 0) return `${g.label}: никто`;
        const names = g.entries
          .map((e) => {
            const u = e.username ? `@${e.username}` : "";
            const fn = e.firstName ?? "";
            return `${fn || "(без имени)"} ${u} [${e.telegramId}]`.trim();
          })
          .join("\n  ");
        return `${g.label} (${g.entries.length}):\n  ${names}`;
      });
      const out = [`${detail.questionId}: ${detail.questionText}`, "", ...blocks].join("\n\n");
      await ctx.reply(out);
    }),
  );

  bot.command(
    "insights",
    adminOnly(async (ctx) => {
      await logAdminCommand(ctx, "insights", []);
      const lines = (await computeInsights()).map((i) => `${i.label}: ${i.count}`);
      if (lines.length === 0) {
        await ctx.reply("Данных пока нет.");
        return;
      }
      await ctx.reply(lines.join("\n"));
    }),
  );

  bot.command(
    "pending",
    adminOnly(async (ctx) => {
      await logAdminCommand(ctx, "pending", []);
      const p = await computePending();
      const fmt = (
        label: string,
        list: Array<{ telegramId: number | null; name: string; username: string | null }>,
      ) => {
        if (list.length === 0) return `${label}: никого`;
        const lines = list.map((u) => {
          const un = u.username ? `@${u.username}` : "";
          const id = u.telegramId !== null ? `[${u.telegramId}]` : "";
          return `- ${u.name} ${[un, id].filter(Boolean).join(" ")}`.trim();
        });
        return `${label} (${list.length}):\n${lines.join("\n")}`;
      };
      const out = [
        fmt("Не начали", p.notStarted),
        "",
        fmt("Начали, но не завершили", p.notCompleted),
      ].join("\n");
      await ctx.reply(out);
    }),
  );

  bot.command(
    "user_status",
    adminOnly(async (ctx) => {
      const args = getArgs(ctx);
      await logAdminCommand(ctx, "user_status", args);
      const target = await resolveTarget(args[0]);
      if (!target.raw) {
        await ctx.reply("Использование: /user_status <telegramId | @username>");
        return;
      }
      if (target.telegramId === null) {
        await ctx.reply(
          `Не получилось определить Telegram ID для "${target.raw}". Возможно, пользователь ещё не открывал Mini App.`,
        );
        return;
      }
      const id = target.telegramId;
      const report = await computeUserStatus(id);
      const lines = [
        `Имя: ${report.guestName ?? "(нет в guests.json)"}`,
        `Telegram ID: ${id}`,
        `Username: ${report.user?.username ?? "-"}`,
        `Группа: ${report.group ?? "-"}`,
        `Назначенные дни: ${report.assignedDays.join(", ") || "-"}`,
        `Начал: ${report.user?.startedAt ?? "нет"}`,
        `Завершил: ${report.user?.completedAt ?? "нет"}`,
        `Текущий индекс: ${report.user?.currentQuestionIndex ?? "-"}`,
        "",
        "Ответы:",
      ];
      for (const a of report.answers) {
        if (a.optionId === null) {
          lines.push(`  ${a.questionId}: нет ответа`);
        } else {
          lines.push(`  ${a.questionId}: ${a.optionId}${a.optionLabel ? ` (${a.optionLabel})` : ""}`);
        }
      }
      await ctx.reply(lines.join("\n"));
    }),
  );

  bot.command(
    "export",
    adminOnly(async (ctx) => {
      await logAdminCommand(ctx, "export", []);
      const csv = await buildAnswersCsv();
      await ctx.replyWithDocument({
        source: Buffer.from(csv, "utf8"),
        filename: `answers_${Date.now()}.csv`,
      });
    }),
  );

  bot.command(
    "export_summary",
    adminOnly(async (ctx) => {
      await logAdminCommand(ctx, "export_summary", []);
      const csv = await buildSummaryCsv();
      await ctx.replyWithDocument({
        source: Buffer.from(csv, "utf8"),
        filename: `summary_${Date.now()}.csv`,
      });
    }),
  );

  bot.command(
    "preview_final",
    adminOnly(async (ctx) => {
      const args = getArgs(ctx);
      await logAdminCommand(ctx, "preview_final", args);
      const target = await resolveTarget(args[0]);
      if (!target.raw) {
        await ctx.reply("Использование: /preview_final <telegramId | @username>");
        return;
      }
      if (!target.guest) {
        await ctx.reply(`Гость "${target.raw}" не найден в guests.json`);
        return;
      }
      const text = buildFinalText(target.guest.name, target.guest.days);
      const idLabel = target.telegramId ?? target.guest.username;
      await ctx.reply(`Финальный экран для ${target.guest.name} (${idLabel}):\n\n${text}`);
    }),
  );

  bot.command(
    "admin_reset",
    adminOnly(async (ctx) => {
      const args = getArgs(ctx);
      await logAdminCommand(ctx, "admin_reset", args);
      const target = await resolveTarget(args[0]);
      if (!target.raw) {
        await ctx.reply("Использование: /admin_reset <telegramId | @username>");
        return;
      }
      if (target.telegramId === null) {
        await ctx.reply(
          `Не получилось определить Telegram ID для "${target.raw}". Возможно, пользователь ещё не открывал Mini App.`,
        );
        return;
      }
      const id = target.telegramId;
      const existing = await getUser(id);
      if (target.guest && !existing) {
        await ensureUser(id, target.guest, {});
      }
      const ok = await resetUserProgress(id);
      if (!ok) {
        await ctx.reply(`Пользователь ${id} не найден в БД. Сброс не требуется.`);
        return;
      }
      await logEvent(id, "admin_reset_user", { by: ctx.from?.id ?? null });
      await ctx.reply(`Прогресс пользователя ${id} сброшен.`);
    }),
  );

  bot.command(
    "dev_clear_db",
    adminOnly(async (ctx) => {
      await logAdminCommand(ctx, "dev_clear_db", []);
      if (config.nodeEnv === "production") {
        await ctx.reply("В production команда заблокирована.");
        return;
      }
      await clearAllTables();
      await ctx.reply("База очищена.");
    }),
  );

  bot.command(
    "test",
    adminOnly(async (ctx) => {
      await logAdminCommand(ctx, "test", []);
      const base = config.publicUrl;
      if (!base) {
        await ctx.reply("PUBLIC_URL не настроен.");
        return;
      }
      await ctx.reply(
        "Выбери, под какую группу примерить:",
        Markup.inlineKeyboard([
          [Markup.button.webApp("Покер (29)", `${base}/?as=poker`)],
          [Markup.button.webApp("Футбол (30)", `${base}/?as=football`)],
          [Markup.button.webApp("Футбол + вс (30-31)", `${base}/?as=football_ext`)],
          [Markup.button.webApp("Все три дня (29-31)", `${base}/?as=all`)],
        ]),
      );
    }),
  );

  bot.command(
    "guests",
    adminOnly(async (ctx) => {
      await logAdminCommand(ctx, "guests", []);
      const list = loadGuests();
      const lines = list.map((g) => {
        const handle = g.username ? `@${g.username}` : "";
        const id = g.telegramId !== undefined ? `[${g.telegramId}]` : "";
        const label = [handle, id].filter(Boolean).join(" ") || "(нет id)";
        return `- ${g.name} ${label} ${g.group ?? "-"} ${g.days.join(",")}`;
      });
      await ctx.reply(`Гости (${list.length}):\n${lines.join("\n")}`);
    }),
  );
}
