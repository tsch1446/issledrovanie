import * as fs from "fs";
import { config } from "./config";
import { Question } from "./types";

let cached: Question[] | null = null;

function isStringField(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function validateQuestion(raw: unknown, idx: number): Question {
  if (!raw || typeof raw !== "object") {
    throw new Error(`questions.json: item ${idx} is not an object`);
  }
  const q = raw as Record<string, unknown>;
  const required = ["id", "analyticsKey", "text", "image", "yesLabel", "noLabel"];
  for (const key of required) {
    if (!isStringField(q[key])) {
      throw new Error(`questions.json: item ${idx} is missing or empty "${key}"`);
    }
  }
  const yes = q.yes as Record<string, unknown> | undefined;
  const no = q.no as Record<string, unknown> | undefined;
  if (!yes || !isStringField(yes.reactionImage) || !isStringField(yes.reactionText)) {
    throw new Error(`questions.json: item ${idx} has invalid "yes" block`);
  }
  if (!no || !isStringField(no.reactionImage) || !isStringField(no.reactionText)) {
    throw new Error(`questions.json: item ${idx} has invalid "no" block`);
  }
  return {
    id: q.id as string,
    analyticsKey: q.analyticsKey as string,
    text: q.text as string,
    image: q.image as string,
    yesLabel: q.yesLabel as string,
    noLabel: q.noLabel as string,
    yes: {
      reactionImage: yes.reactionImage as string,
      reactionText: yes.reactionText as string,
    },
    no: {
      reactionImage: no.reactionImage as string,
      reactionText: no.reactionText as string,
    },
  };
}

export function loadQuestions(): Question[] {
  if (cached) return cached;

  let raw: string;
  try {
    raw = fs.readFileSync(config.questionsPath, "utf8");
  } catch (err) {
    throw new Error(`Failed to read questions.json at ${config.questionsPath}: ${(err as Error).message}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`questions.json is not valid JSON: ${(err as Error).message}`);
  }

  if (!Array.isArray(parsed)) {
    throw new Error("questions.json must be a JSON array");
  }
  if (parsed.length === 0) {
    throw new Error("questions.json is empty");
  }

  const items = parsed.map((q, i) => validateQuestion(q, i));

  const ids = new Set<string>();
  for (const q of items) {
    if (ids.has(q.id)) {
      throw new Error(`questions.json: duplicate question id "${q.id}"`);
    }
    ids.add(q.id);
  }

  cached = items;
  return items;
}

export function getQuestionById(id: string): Question | null {
  return loadQuestions().find((q) => q.id === id) ?? null;
}

export function getQuestionByIndex(index: number): Question | null {
  const list = loadQuestions();
  if (index < 0 || index >= list.length) return null;
  return list[index];
}

export function questionsCount(): number {
  return loadQuestions().length;
}
