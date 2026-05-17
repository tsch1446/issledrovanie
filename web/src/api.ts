import type {
  AnswerResponse,
  CompleteResponse,
  StateResponse,
} from "./types";

function getInitData(): string {
  const tg = (window as Window & typeof globalThis).Telegram?.WebApp;
  return tg?.initData ?? "";
}

function getViewAs(): string | null {
  try {
    const search =
      typeof window !== "undefined" && window.location ? window.location.search : "";
    const p = new URLSearchParams(search);
    const v = p.get("as");
    return v && v.length > 0 ? v : null;
  } catch {
    return null;
  }
}

async function call<T>(path: string, body: Record<string, unknown> = {}): Promise<T> {
  const viewAs = getViewAs();
  const payload = viewAs ? { ...body, viewAs } : body;
  const res = await fetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `tma ${getInitData()}`,
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    let detail = "";
    try {
      const j = (await res.json()) as { error?: string };
      detail = j.error ?? "";
    } catch {
      // ignore
    }
    throw new Error(`${res.status} ${detail || res.statusText}`);
  }
  return (await res.json()) as T;
}

export function getState(): Promise<StateResponse> {
  return call<StateResponse>("/api/state");
}

export function notifyStart(): Promise<{ ok: boolean }> {
  return call<{ ok: boolean }>("/api/start");
}

export function sendAnswer(questionId: string, optionId: string): Promise<AnswerResponse> {
  return call<AnswerResponse>("/api/answer", { questionId, optionId });
}

export function sendComplete(): Promise<CompleteResponse> {
  return call<CompleteResponse>("/api/complete");
}
