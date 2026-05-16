const RU_MONTHS_GENITIVE: Record<number, string> = {
  1: "января",
  2: "февраля",
  3: "марта",
  4: "апреля",
  5: "мая",
  6: "июня",
  7: "июля",
  8: "августа",
  9: "сентября",
  10: "октября",
  11: "ноября",
  12: "декабря",
};

interface ParsedDay {
  day: number;
  month: number;
  year: number;
  raw: string;
}

function parseDay(raw: string): ParsedDay | null {
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (!month || !day) return null;
  return { day, month, year, raw };
}

function joinDaysReadable(days: ParsedDay[]): string {
  if (days.length === 0) return "";
  if (days.length === 1) {
    const d = days[0];
    return `${d.day} ${RU_MONTHS_GENITIVE[d.month] ?? ""}`.trim();
  }

  const sameMonth = days.every((d) => d.month === days[0].month);
  if (sameMonth) {
    const monthWord = RU_MONTHS_GENITIVE[days[0].month] ?? "";
    if (days.length === 2) {
      return `${days[0].day} и ${days[1].day} ${monthWord}`.trim();
    }
    const head = days.slice(0, -1).map((d) => d.day).join(", ");
    const last = days[days.length - 1].day;
    return `${head} и ${last} ${monthWord}`.trim();
  }

  return days
    .map((d) => `${d.day} ${RU_MONTHS_GENITIVE[d.month] ?? ""}`.trim())
    .join(", ");
}

export interface FinalContent {
  title: string;
  body: string;
}

export function buildFinalContent(name: string, rawDays: string[]): FinalContent {
  const parsed = rawDays
    .map(parseDay)
    .filter((d): d is ParsedDay => d !== null)
    .sort((a, b) => a.raw.localeCompare(b.raw));

  const set = new Set(parsed.map((d) => d.raw));
  const has29 = set.has("2026-05-29");
  const has30 = set.has("2026-05-30");
  const has31 = set.has("2026-05-31");

  const title = `Исследование завершено, ${name}.`;

  if (has29 && has30 && has31) {
    return {
      title,
      body: "29, 30, 31 мая - ничего не планируй.\nВсе три дня ты нужен в Питере.\nПодробности позже. Билеты не покупай.",
    };
  }
  if (has30 && !has29 && !has31) {
    return {
      title,
      body: "30 мая - ничего не планируй.\nОстальное узнаешь позже.",
    };
  }
  if (has29 && has30 && !has31) {
    return {
      title,
      body: "29 и 30 мая - держи свободными.\nПодробности скоро.",
    };
  }
  if (has30 && has31 && !has29) {
    return {
      title,
      body: "30 и 31 мая - без планов.\nОстальное узнаешь позже.",
    };
  }
  if (has29 && has31 && !has30) {
    return {
      title,
      body: "29 и 31 мая - держи свободными.\nПодробности скоро.",
    };
  }
  if (has29 && !has30 && !has31) {
    return {
      title,
      body: "29 мая - ничего не планируй.\nОстальное узнаешь позже.",
    };
  }
  if (has31 && !has29 && !has30) {
    return {
      title,
      body: "31 мая - ничего не планируй.\nОстальное узнаешь позже.",
    };
  }

  if (parsed.length === 0) {
    return { title, body: "Подробности скоро." };
  }
  const readable = joinDaysReadable(parsed);
  return { title, body: `${readable} - держи свободными.\nПодробности скоро.` };
}

export function buildFinalText(name: string, rawDays: string[]): string {
  const c = buildFinalContent(name, rawDays);
  return `${c.title}\nРезультат неожиданный.\n\n${c.body}`;
}

export function formatGreeting(name: string): string {
  return `Привет, ${name}.\nЕсть 3 минуты? Это небольшое исследование.\nОтвечай честно.`;
}

export function formatUnknownUser(telegramId: number): string {
  return `Похоже, тебя нет в списке исследования.\nТвой Telegram ID: ${telegramId}.\nСкинь его Сергею.`;
}

export function formatAlreadyCompletedShort(): string {
  return "Ты уже прошел исследование. Результаты зафиксированы.";
}

export function formatRestartBlocked(): string {
  return "Опрос можно пройти только один раз. Твои ответы уже зафиксированы.";
}

export function formatNotAdmin(): string {
  return "Команда недоступна.";
}
