import * as fs from "fs";
import { config } from "./config";
import { AudienceTag, Question, QuestionOption } from "./types";

let cached: Question[] | null = null;

function isStringField(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

const VALID_AUDIENCE: Set<AudienceTag> = new Set(["all", "poker", "football"]);

function validateOption(raw: unknown, qIdx: number, oIdx: number): QuestionOption {
  if (!raw || typeof raw !== "object") {
    throw new Error(`questions.json: q[${qIdx}].options[${oIdx}] is not an object`);
  }
  const o = raw as Record<string, unknown>;
  if (!isStringField(o.id)) throw new Error(`questions.json: q[${qIdx}].options[${oIdx}].id is missing`);
  if (!isStringField(o.label)) throw new Error(`questions.json: q[${qIdx}].options[${oIdx}].label is missing`);
  if (!isStringField(o.analyticsLabel)) {
    throw new Error(`questions.json: q[${qIdx}].options[${oIdx}].analyticsLabel is missing`);
  }
  const reactionRaw = o.reaction as Record<string, unknown> | undefined;
  let reaction: QuestionOption["reaction"];
  if (reactionRaw && typeof reactionRaw === "object") {
    if (!isStringField(reactionRaw.text)) {
      throw new Error(`questions.json: q[${qIdx}].options[${oIdx}].reaction.text is required when reaction is present`);
    }
    reaction = {
      text: reactionRaw.text as string,
      image: typeof reactionRaw.image === "string" ? reactionRaw.image : undefined,
    };
  }
  return {
    id: o.id as string,
    label: o.label as string,
    analyticsLabel: o.analyticsLabel as string,
    reaction,
  };
}

function validateQuestion(raw: unknown, idx: number): Question {
  if (!raw || typeof raw !== "object") {
    throw new Error(`questions.json: item ${idx} is not an object`);
  }
  const q = raw as Record<string, unknown>;
  if (!isStringField(q.id)) throw new Error(`questions.json: item ${idx} missing id`);
  if (!isStringField(q.text)) throw new Error(`questions.json: item ${idx} missing text`);
  if (!Array.isArray(q.audience)) {
    throw new Error(`questions.json: item ${idx} audience must be an array`);
  }
  const audience: AudienceTag[] = [];
  for (let i = 0; i < q.audience.length; i++) {
    const tag = q.audience[i];
    if (typeof tag !== "string" || !VALID_AUDIENCE.has(tag as AudienceTag)) {
      throw new Error(
        `questions.json: item ${idx} audience[${i}] must be one of: ${[...VALID_AUDIENCE].join(", ")}`,
      );
    }
    audience.push(tag as AudienceTag);
  }
  if (audience.length === 0) {
    throw new Error(`questions.json: item ${idx} audience cannot be empty`);
  }
  if (!Array.isArray(q.options) || q.options.length < 2) {
    throw new Error(`questions.json: item ${idx} options must have at least 2 entries`);
  }
  const options = q.options.map((o, i) => validateOption(o, idx, i));
  const optionIds = new Set<string>();
  for (const o of options) {
    if (optionIds.has(o.id)) {
      throw new Error(`questions.json: item ${idx} has duplicate option id "${o.id}"`);
    }
    optionIds.add(o.id);
  }

  return {
    id: q.id as string,
    audience,
    text: q.text as string,
    image: typeof q.image === "string" ? (q.image as string) : undefined,
    options,
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

  if (!Array.isArray(parsed)) throw new Error("questions.json must be a JSON array");
  if (parsed.length === 0) throw new Error("questions.json is empty");

  const items = parsed.map((q, i) => validateQuestion(q, i));
  const ids = new Set<string>();
  for (const q of items) {
    if (ids.has(q.id)) throw new Error(`questions.json: duplicate question id "${q.id}"`);
    ids.add(q.id);
  }

  cached = items;
  return items;
}

export function getQuestionById(id: string): Question | null {
  return loadQuestions().find((q) => q.id === id) ?? null;
}

export function allQuestions(): Question[] {
  return loadQuestions();
}
