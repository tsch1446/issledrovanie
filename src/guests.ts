import * as fs from "fs";
import { config } from "./config";
import { Guest } from "./types";

let cached: Guest[] | null = null;

function validateGuest(raw: unknown, idx: number): Guest {
  if (!raw || typeof raw !== "object") {
    throw new Error(`guests.json: item ${idx} is not an object`);
  }
  const g = raw as Record<string, unknown>;
  if (typeof g.telegramId !== "number" || !Number.isInteger(g.telegramId)) {
    throw new Error(`guests.json: item ${idx} has invalid telegramId`);
  }
  if (typeof g.name !== "string" || g.name.trim() === "") {
    throw new Error(`guests.json: item ${idx} has invalid name`);
  }
  if (!Array.isArray(g.days)) {
    throw new Error(`guests.json: item ${idx} "days" must be an array`);
  }
  const days = g.days.map((d, i) => {
    if (typeof d !== "string" || d.trim() === "") {
      throw new Error(`guests.json: item ${idx} day[${i}] must be non-empty string`);
    }
    return d;
  });
  const group = typeof g.group === "string" ? g.group : undefined;
  const notes = typeof g.notes === "string" ? g.notes : undefined;
  return { telegramId: g.telegramId, name: g.name, days, group, notes };
}

export function loadGuests(): Guest[] {
  if (cached) return cached;

  let raw: string;
  try {
    raw = fs.readFileSync(config.guestsPath, "utf8");
  } catch (err) {
    throw new Error(`Failed to read guests.json at ${config.guestsPath}: ${(err as Error).message}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`guests.json is not valid JSON: ${(err as Error).message}`);
  }

  if (!Array.isArray(parsed)) throw new Error("guests.json must be a JSON array");

  const items = parsed.map((g, i) => validateGuest(g, i));
  const ids = new Set<number>();
  for (const g of items) {
    if (ids.has(g.telegramId)) {
      throw new Error(`guests.json: duplicate telegramId ${g.telegramId}`);
    }
    ids.add(g.telegramId);
  }

  cached = items;
  return items;
}

export function getGuestById(telegramId: number): Guest | null {
  return loadGuests().find((g) => g.telegramId === telegramId) ?? null;
}

export function guestsCount(): number {
  return loadGuests().length;
}
