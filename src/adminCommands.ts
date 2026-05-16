import { Context, Telegraf } from "telegraf";
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
import { buildFinalText, formatNotAdmin } from "./renderText";
import {
  ensureUser,
  getUser,
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

function logAdminCommand(ctx: Context, command: string, args: string[]): void {
  const fromId = ctx.from?.id ?? null;
  log("admin_command_used", { command, fromId, args });
  logEvent(fromId, "admin_command", { command, args });
}

export function registerAdminCommands(bot: Telegraf): void {
  bot.command(
    "stats",
    adminOnly(async (ctx) => {
      logAdminCommand(ctx, "stats", []);
      const s = computeGeneralStats();
      const lines = [
        "Общая статистика:",
        `Гостей в guests.json: ${s.guestsTotal}`,
        `Начали опрос: ${s.startedCount}`,
        `Завершили: ${s.completedCount}`,
        `Не начали: ${s.notStartedCount}`,
        `Completion rate: ${s.completionRate}%`,
        "",
        `Приглашены 29 мая: ${s.invited29}`,
        `Приглашены 30 мая: ${s.invited30}`,
        `Приглашены 31 мая: ${s.invited31}`,
      ];
      await ctx.reply(lines.join("\n"));
    }),
  );

  bot.command(
    "stats_questions",
    adminOnly(async (ctx) => {
      logAdminCommand(ctx, "stats_questions", []);
      const aggs = computeQuestionAggregates();
      if (aggs.length === 0) {
        await ctx.reply("Вопросов нет.");
        return;
      }
      const blocks = aggs.map((a) => {
        return [
          `${a.questionId}: ${a.questionText}`,
          `Да: ${a.yesCount} (${a.yesPercent}%)`,
          `Нет: ${a.noCount} (${a.noPercent}%)`,
          `Всего: ${a.totalAnswers}`,
        ].join("\n");
      });
      await ctx.reply(blocks.join("\n\n"));
    }),
  );

  bot.command(
    "stats_question",
    adminOnly(async (ctx) => {
      const args = getArgs(ctx);
      logAdminCommand(ctx, "stats_question", args);
      const qid = args[0];
      if (!qid) {
        await ctx.reply("Использование: /stats_question <questionId>");
        return;
      }
      const detail = computeQuestionDetail(qid);
      if (!detail) {
        await ctx.reply(`Вопрос "${qid}" не найден.`);
        return;
      }
      const fmt = (label: string, list: typeof detail.yes) => {
        if (list.length === 0) return `${label}: никто`;
        const names = list
          .map((e) => {
            const u = e.username ? `@${e.username}` : "";
            const fn = e.firstName ?? "";
            return `${fn || "(без имени)"} ${u} [${e.telegramId}]`.trim();
          })
          .join("\n  ");
        return `${label} (${list.length}):\n  ${names}`;
      };
      const out = [
        `${detail.questionId}: ${detail.questionText}`,
        "",
        fmt(`Да - ${detail.yesLabel}`, detail.yes),
        "",
        fmt(`Нет - ${detail.noLabel}`, detail.no),
      ].join("\n");
      await ctx.reply(out);
    }),
  );

  bot.command(
    "insights",
    adminOnly(async (ctx) => {
      logAdminCommand(ctx, "insights", []);
      const lines = computeInsights().map((i) => `${i.label}: ${i.count}`);
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
      logAdminCommand(ctx, "pending", []);
      const p = computePending();
      const fmt = (
        label: string,
        list: Array<{ telegramId: number; name: string; username: string | null }>,
      ) => {
        if (list.length === 0) return `${label}: никого`;
        const lines = list.map((u) => {
          const un = u.username ? `@${u.username}` : "";
          return `- ${u.name} ${un} [${u.telegramId}]`.trim();
        });
        return `${label} (${list.length}):\n${lines.join("\n")}`;
      };
      const out = [
        fmt("Не начали", p.notStarted),
        "",
        fmt(
          "Начали, но не завершили",
          p.notCompleted.map((u) => ({
            telegramId: u.telegramId,
            name: u.name,
            username: u.username,
          })),
        ),
      ].join("\n");
      await ctx.reply(out);
    }),
  );

  bot.command(
    "user_status",
    adminOnly(async (ctx) => {
      const args = getArgs(ctx);
      logAdminCommand(ctx, "user_status", args);
      const idRaw = args[0];
      const id = Number(idRaw);
      if (!Number.isFinite(id) || !Number.isInteger(id) || id <= 0) {
        await ctx.reply("Использование: /user_status <telegramId>");
        return;
      }
      const report = computeUserStatus(id);
      const lines = [
        `Имя: ${report.guestName ?? "(нет в guests.json)"}`,
        `Telegram ID: ${id}`,
        `Username: ${report.user?.username ?? "-"}`,
        `Группа: ${report.group ?? "-"}`,
        `Назначенные дни: ${report.assignedDays.join(", ") || "-"}`,
        `Начал: ${report.user?.startedAt ?? "нет"}`,
        `Завершил: ${report.user?.completedAt ?? "нет"}`,
        `Текущий индекс вопроса: ${report.user?.currentQuestionIndex ?? "-"}`,
        "",
        "Ответы:",
      ];
      for (const a of report.answers) {
        if (a.answer === null) {
          lines.push(`  ${a.questionId}: нет ответа`);
        } else {
          lines.push(`  ${a.questionId}: ${a.answer} (${a.label})`);
        }
      }
      await ctx.reply(lines.join("\n"));
    }),
  );

  bot.command(
    "export",
    adminOnly(async (ctx) => {
      logAdminCommand(ctx, "export", []);
      const csv = buildAnswersCsv();
      await ctx.replyWithDocument({
        source: Buffer.from(csv, "utf8"),
        filename: `answers_${Date.now()}.csv`,
      });
    }),
  );

  bot.command(
    "export_summary",
    adminOnly(async (ctx) => {
      logAdminCommand(ctx, "export_summary", []);
      const csv = buildSummaryCsv();
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
      logAdminCommand(ctx, "preview_final", args);
      const idRaw = args[0];
      const id = Number(idRaw);
      if (!Number.isFinite(id) || !Number.isInteger(id) || id <= 0) {
        await ctx.reply("Использование: /preview_final <telegramId>");
        return;
      }
      const guest = getGuestById(id);
      if (!guest) {
        await ctx.reply(`Гость с ID ${id} не найден в guests.json`);
        return;
      }
      const text = buildFinalText(guest.name, guest.days);
      await ctx.reply(`Финальный экран для ${guest.name} (${id}):\n\n${text}`);
    }),
  );

  bot.command(
    "admin_reset",
    adminOnly(async (ctx) => {
      const args = getArgs(ctx);
      logAdminCommand(ctx, "admin_reset", args);
      const idRaw = args[0];
      const id = Number(idRaw);
      if (!Number.isFinite(id) || !Number.isInteger(id) || id <= 0) {
        await ctx.reply("Использование: /admin_reset <telegramId>");
        return;
      }
      const guest = getGuestById(id);
      if (guest && !getUser(id)) {
        ensureUser(guest, {});
      }
      const ok = resetUserProgress(id);
      if (!ok) {
        await ctx.reply(`Пользователь ${id} не найден в SQLite. Сброс не требуется.`);
        return;
      }
      logEvent(id, "admin_reset_user", { by: ctx.from?.id ?? null });
      await ctx.reply(`Прогресс пользователя ${id} сброшен.`);
    }),
  );

  bot.command(
    "dev_clear_db",
    adminOnly(async (ctx) => {
      logAdminCommand(ctx, "dev_clear_db", []);
      if (config.nodeEnv === "production") {
        await ctx.reply("В production команда заблокирована.");
        return;
      }
      clearAllTables();
      await ctx.reply("База очищена.");
    }),
  );

  bot.command(
    "guests",
    adminOnly(async (ctx) => {
      logAdminCommand(ctx, "guests", []);
      const list = loadGuests();
      const lines = list.map(
        (g) =>
          `- ${g.name} [${g.telegramId}] ${g.group} ${g.days.join(",")} ${g.finalVariant}`,
      );
      await ctx.reply(`Гости (${list.length}):\n${lines.join("\n")}`);
    }),
  );
}
