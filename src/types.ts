export type AnswerValue = "yes" | "no";

export interface QuestionReaction {
  reactionImage: string;
  reactionText: string;
}

export interface Question {
  id: string;
  analyticsKey: string;
  text: string;
  image: string;
  yesLabel: string;
  noLabel: string;
  yes: QuestionReaction;
  no: QuestionReaction;
}

export interface Guest {
  telegramId: number;
  name: string;
  days: string[];
  group: string;
  finalVariant: string;
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
  answer: AnswerValue;
  timestamp: string;
}

// API types (server-client contract)

export interface PublicQuestion {
  id: string;
  text: string;
  image: string;
  yesReaction: { image: string; text: string };
  noReaction: { image: string; text: string };
}

export interface FinalScreen {
  title: string;
  body: string;
  image: string;
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

export interface AnswerRequest {
  questionId: string;
  answer: AnswerValue;
}

export interface AnswerResponse {
  ok: boolean;
  alreadyAnswered: boolean;
  currentIndex: number;
}

export interface CompleteResponse {
  ok: boolean;
  completedAt: string | null;
}
