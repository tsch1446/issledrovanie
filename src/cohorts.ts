import { AudienceTag } from "./types";

const DAY_POKER = "2026-05-29";
const DAY_FOOTBALL = "2026-05-30";
const DAY_FOOTBALL_EXTRA = "2026-05-31";

export interface Cohorts {
  hasPoker: boolean;
  hasFootball: boolean;
  has29: boolean;
  has30: boolean;
  has31: boolean;
  tags: Set<AudienceTag>;
}

export function deriveCohorts(days: string[]): Cohorts {
  const set = new Set(days);
  const has29 = set.has(DAY_POKER);
  const has30 = set.has(DAY_FOOTBALL);
  const has31 = set.has(DAY_FOOTBALL_EXTRA);
  const hasPoker = has29;
  const hasFootball = has30 || has31;
  const tags = new Set<AudienceTag>(["all"]);
  if (hasPoker) tags.add("poker");
  if (hasFootball) tags.add("football");
  return { hasPoker, hasFootball, has29, has30, has31, tags };
}

export function questionMatchesAudience(
  questionAudience: AudienceTag[],
  cohorts: Cohorts,
): boolean {
  for (const a of questionAudience) {
    if (cohorts.tags.has(a)) return true;
  }
  return false;
}
