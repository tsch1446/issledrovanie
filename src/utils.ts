import * as fs from "fs";
import * as path from "path";
import { config } from "./config";

export function log(event: string, payload?: Record<string, unknown>): void {
  const time = new Date().toISOString();
  if (payload) {
    console.log(`[${time}] ${event}`, JSON.stringify(payload));
  } else {
    console.log(`[${time}] ${event}`);
  }
}

export function warn(event: string, payload?: Record<string, unknown>): void {
  const time = new Date().toISOString();
  if (payload) {
    console.warn(`[${time}] WARN ${event}`, JSON.stringify(payload));
  } else {
    console.warn(`[${time}] WARN ${event}`);
  }
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function resolveAsset(relativePath: string): string {
  if (path.isAbsolute(relativePath)) {
    return relativePath;
  }
  return path.join(config.rootDir, relativePath);
}

export function assetExists(relativePath: string): boolean {
  try {
    const abs = resolveAsset(relativePath);
    return fs.existsSync(abs) && fs.statSync(abs).isFile();
  } catch {
    return false;
  }
}

export function isAdmin(telegramId: number): boolean {
  return telegramId === config.adminTelegramId;
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
