// Mirror of server API types. Keep in sync with src/types.ts.

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
