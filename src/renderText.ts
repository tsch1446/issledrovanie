import { Cohorts, deriveCohorts } from "./cohorts";

export interface FinalContent {
  title: string;
  body: string;
}

function pokerFinal(): string {
  return [
    "Результат показал:",
    "29 мая тебе нельзя строить планы.",
    "",
    "Пятница.",
    "Покер.",
    "Братва.",
    "Серьезная заруба.",
    "",
    "Подробности позже.",
    "Пока просто держи 29-е свободным.",
  ].join("\n");
}

function footballFinal(c: Cohorts): string {
  const dayLine = c.has31 && c.has30
    ? "30 и 31 мая тебе нельзя строить планы."
    : c.has31 && !c.has30
      ? "31 мая тебе нельзя строить планы."
      : "30 мая тебе нельзя строить планы.";

  return [
    "Результат показал:",
    dayLine,
    "",
    "Днем - футбол.",
    "Потом - баня.",
    "Мясо.",
    "Пиво.",
    "Финал Лиги чемпионов.",
    "",
    "Дальше - по ситуации.",
    "",
    "Подробности позже.",
    "Пока просто держи эти дни свободными.",
  ].join("\n");
}

function bothFinal(c: Cohorts): string {
  const heading = c.has31
    ? "29, 30 и 31 мая тебе нельзя строить планы."
    : "29 и 30 мая тебе нельзя строить планы.";

  return [
    "Результат показал:",
    heading,
    "",
    "Пятница - покер с братвой.",
    "Суббота - футбол, баня, мясо, пиво и финал ЛЧ.",
    "",
    "Подробности позже.",
    "Главное - будь в Питере и не исчезай.",
  ].join("\n");
}

export function buildFinalContent(name: string, days: string[]): FinalContent {
  const cohorts = deriveCohorts(days);
  const title = `Исследование завершено, ${name}.`;

  if (cohorts.hasPoker && cohorts.hasFootball) {
    return { title, body: bothFinal(cohorts) };
  }
  if (cohorts.hasPoker) {
    return { title, body: pokerFinal() };
  }
  if (cohorts.hasFootball) {
    return { title, body: footballFinal(cohorts) };
  }
  return { title, body: "Подробности скоро." };
}

export function buildFinalText(name: string, days: string[]): string {
  const c = buildFinalContent(name, days);
  return `${c.title}\n${c.body}`;
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
