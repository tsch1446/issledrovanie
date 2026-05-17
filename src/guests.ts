import * as fs from "fs";
import { config } from "./config";
import { Guest } from "./types";

let cached: Guest[] | null = null;

function normalizeUsername(raw: string): string {
  return raw.replace(/^@+/, "").trim().toLowerCase();
}

function validateGuest(raw: unknown, idx: number): Guest {
  if (!raw || typeof raw !== "object") {
    throw new Error(`guests.json: item ${idx} is not an object`);
  }
  const g = raw as Record<string, unknown>;

  let telegramId: number | undefined;
  if (g.telegramId !== undefined && g.telegramId !== null) {
    if (typeof g.telegramId !== "number" || !Number.isInteger(g.telegramId)) {
      throw new Error(`guests.json: item ${idx} has invalid telegramId`);
    }
    telegramId = g.telegramId;
  }

  let username: string | undefined;
  if (g.username !== undefined && g.username !== null) {
    if (typeof g.username !== "string") {
      throw new Error(`guests.json: item ${idx} has invalid username`);
    }
    username = normalizeUsername(g.username);
    if (!username) username = undefined;
  }

  if (telegramId === undefined && !username) {
    throw new Error(
      `guests.json: item ${idx} must have either telegramId or username (or both)`,
    );
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
  return { telegramId, username, name: g.name, days, group, notes };
}

export function loadGuests(): Guest[] {
  if (cached) return cached;

  let raw: string;
  try {
    raw = fs.readFileSync(config.guestsPath, "utf8");
  } catch (err) {
    throw new Error(
      `Failed to read guests.json at ${config.guestsPath}: ${(err as Error).message}`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`guests.json is not valid JSON: ${(err as Error).message}`);
  }

  if (!Array.isArray(parsed)) throw new Error("guests.json must be a JSON array");

  const items = parsed.map((g, i) => validateGuest(g, i));

  const seenIds = new Set<number>();
  const seenUsernames = new Set<string>();
  for (const g of items) {
    if (g.telegramId !== undefined) {
      if (seenIds.has(g.telegramId)) {
        throw new Error(`guests.json: duplicate telegramId ${g.telegramId}`);
      }
      seenIds.add(g.telegramId);
    }
    if (g.username) {
      if (seenUsernames.has(g.username)) {
        throw new Error(`guests.json: duplicate username @${g.username}`);
      }
      seenUsernames.add(g.username);
    }
  }

  cached = items;
  return items;
}

export function getGuestById(telegramId: number): Guest | null {
  return loadGuests().find((g) => g.telegramId === telegramId) ?? null;
}

export function findGuest(
  telegramId: number,
  username: string | null,
): Guest | null {
  const guests = loadGuests();
  // 1) Match by numeric ID first - that's the strongest signal once we have it
  const byId = guests.find((g) => g.telegramId === telegramId);
  if (byId) return byId;
  // 2) Fall back to username (case-insensitive)
  if (username) {
    const u = normalizeUsername(username);
    if (u) {
      const byUsername = guests.find((g) => g.username === u);
      if (byUsername) return byUsername;
    }
  }
  return null;
}

export function guestsCount(): number {
  return loadGuests().length;
}
