export interface QuestionOptionReaction {
  text: string;
  image?: string;
  images?: string[];
}

export interface QuestionOption {
  id: string;
  label: string;
  analyticsLabel: string;
  reaction?: QuestionOptionReaction;
}

export type AudienceTag = "all" | "poker" | "football";

export interface Question {
  id: string;
  audience: AudienceTag[];
  text: string;
  image?: string;
  options: QuestionOption[];
}

export interface Guest {
  telegramId: number;
  name: string;
  days: string[];
  group?: string;
  notes?: string;
}

export interface UserRow {
  telegramId: number;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  startedAt: string | null;
  completedAt: string | null;
  completed: number;
  currentQuestionIndex: number;
  groupName: string | null;
  assignedDays: string | null;
  finalVariant: string | null;
}

export interface AnswerRow {
  id: number;
  telegramId: number;
  questionId: string;
  analyticsKey: string;
  answer: string;
  timestamp: string;
}

// API types

export interface PublicQuestionOption {
  id: string;
  label: string;
  reaction: { text: string; image?: string; images?: string[] } | null;
}

export interface PublicQuestion {
  id: string;
  text: string;
  image: string | null;
  options: PublicQuestionOption[];
}

export interface FinalScreen {
  title: string;
  body: string;
  image: string | null;
}

export interface StateUnknown {
  status: "unknown";
  telegramId: number;
}

export interface StateReady {
  status: "ready";
  name: string;
  total: number;
  currentIndex: number;
  completed: boolean;
  questions: PublicQuestion[];
  final: FinalScreen;
}

export type StateResponse = StateUnknown | StateReady;

export interface AnswerResponse {
  ok: boolean;
  alreadyAnswered: boolean;
  currentIndex: number;
}

export interface CompleteResponse {
  ok: boolean;
  completedAt: string | null;
}
