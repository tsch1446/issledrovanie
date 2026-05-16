import * as crypto from "crypto";
import { config } from "./config";

export interface TelegramWebAppUser {
  id: number;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
}

export interface ValidatedInitData {
  user: TelegramWebAppUser;
  authDateSec: number;
  raw: string;
}

const MAX_INIT_DATA_AGE_SEC = 24 * 60 * 60;

export function validateInitData(initData: string): ValidatedInitData | null {
  if (!initData || typeof initData !== "string") return null;

  let params: URLSearchParams;
  try {
    params = new URLSearchParams(initData);
  } catch {
    return null;
  }

  const hash = params.get("hash");
  if (!hash) return null;

  const entries: Array<[string, string]> = [];
  params.forEach((value, key) => {
    if (key !== "hash") entries.push([key, value]);
  });
  entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const dataCheckString = entries.map(([k, v]) => `${k}=${v}`).join("\n");

  const secret = crypto.createHmac("sha256", "WebAppData").update(config.botToken).digest();
  const computed = crypto
    .createHmac("sha256", secret)
    .update(dataCheckString)
    .digest("hex");

  const expected = Buffer.from(hash, "hex");
  const actual = Buffer.from(computed, "hex");
  if (expected.length !== actual.length) return null;
  if (!crypto.timingSafeEqual(expected, actual)) return null;

  const authDateRaw = params.get("auth_date");
  const authDate = authDateRaw ? Number(authDateRaw) : 0;
  if (!Number.isFinite(authDate) || authDate <= 0) return null;
  const ageSec = Math.floor(Date.now() / 1000) - authDate;
  if (ageSec > MAX_INIT_DATA_AGE_SEC) return null;

  const userJson = params.get("user");
  if (!userJson) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(userJson);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const u = parsed as Record<string, unknown>;
  const id = u.id;
  if (typeof id !== "number" || !Number.isInteger(id) || id <= 0) return null;

  return {
    user: {
      id,
      username: typeof u.username === "string" ? u.username : null,
      firstName: typeof u.first_name === "string" ? u.first_name : null,
      lastName: typeof u.last_name === "string" ? u.last_name : null,
    },
    authDateSec: authDate,
    raw: initData,
  };
}

export function extractInitDataFromHeader(headerValue: string | undefined): string | null {
  if (!headerValue) return null;
  const trimmed = headerValue.trim();
  if (trimmed.toLowerCase().startsWith("tma ")) {
    return trimmed.slice(4);
  }
  return trimmed;
}
