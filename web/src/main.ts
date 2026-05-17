import { getState, notifyStart, sendAnswer, sendComplete } from "./api";
import type {
  FinalScreen,
  PublicQuestion,
  PublicQuestionOption,
  StateReady,
} from "./types";

type Screen = "loading" | "unknown" | "welcome" | "question" | "reaction" | "final" | "error";

interface AppState {
  ready: StateReady | null;
  questionIndex: number;
  lastReaction: { image?: string; text: string } | null;
}

const state: AppState = {
  ready: null,
  questionIndex: 0,
  lastReaction: null,
};

const root = document.getElementById("root") as HTMLElement;

function tg() {
  return (window as Window & typeof globalThis).Telegram?.WebApp;
}

function haptic(kind: "light" | "medium" | "heavy" | "success" | "warning" | "error" = "light"): void {
  const w = tg();
  if (!w?.HapticFeedback) return;
  try {
    if (kind === "success" || kind === "warning" || kind === "error") {
      w.HapticFeedback.notificationOccurred(kind);
    } else {
      w.HapticFeedback.impactOccurred(kind);
    }
  } catch {
    // ignore
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function renderScreen(name: Screen, html: string): void {
  root.innerHTML = `<section id="screen-${name}" class="screen active">${html}</section>`;
}

function progressDots(total: number, current: number): string {
  const dots: string[] = [];
  for (let i = 0; i < total; i++) {
    let cls = "progress-dot";
    if (i < current) cls += " done";
    else if (i === current) cls += " current";
    dots.push(`<div class="${cls}"></div>`);
  }
  return `<div class="progress">${dots.join("")}</div>`;
}

function imageTag(src: string | null | undefined): string {
  if (!src) return "";
  return `<img class="image" src="${escapeHtml(src)}" alt="" onerror="this.classList.add('missing')" />`;
}

function preloadImages(srcs: Array<string | null | undefined>): void {
  for (const src of srcs) {
    if (!src) continue;
    const img = new Image();
    img.src = src;
  }
}

let toastTimer: number | null = null;
function toast(text: string): void {
  let el = document.querySelector(".toast") as HTMLDivElement | null;
  if (!el) {
    el = document.createElement("div");
    el.className = "toast";
    document.body.appendChild(el);
  }
  el.textContent = text;
  el.classList.add("show");
  if (toastTimer !== null) window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    el?.classList.remove("show");
  }, 2200);
}

function showLoading(): void {
  renderScreen(
    "loading",
    `<div class="card center">
       <div class="spinner"></div>
       <p class="muted">Загружаем исследование</p>
     </div>`,
  );
}

function showUnknown(telegramId: number): void {
  renderScreen(
    "unknown",
    `<div class="card">
       <p class="kicker">Доступ</p>
       <h1 class="title">Тебя нет в списке исследования</h1>
       <p class="body">Это закрытый прогон. Если ты считаешь, что должен быть в списке - скинь Сергею свой Telegram ID.</p>
       <div class="error-block">
         <p class="muted">Твой Telegram ID:</p>
         <p class="subtitle" id="copy-id">${telegramId}</p>
       </div>
       <div class="actions">
         <button class="btn" id="copy-btn">Скопировать ID</button>
       </div>
     </div>`,
  );
  const btn = document.getElementById("copy-btn") as HTMLButtonElement | null;
  btn?.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(String(telegramId));
      toast("ID скопирован");
      haptic("success");
    } catch {
      toast("Не получилось скопировать. Перепиши вручную.");
    }
  });
}

function showError(message: string): void {
  renderScreen(
    "error",
    `<div class="card">
       <p class="kicker error-block" style="padding-left:8px">Ошибка</p>
       <h1 class="title">Что-то пошло не так</h1>
       <p class="body">${escapeHtml(message)}</p>
       <div class="actions">
         <button class="btn" id="retry-btn">Попробовать снова</button>
       </div>
     </div>`,
  );
  const btn = document.getElementById("retry-btn") as HTMLButtonElement | null;
  btn?.addEventListener("click", () => {
    void bootstrap();
  });
}

function showWelcome(ready: StateReady): void {
  renderScreen(
    "welcome",
    `<div class="card">
       <p class="kicker">Исследование</p>
       <h1 class="title">Привет, ${escapeHtml(ready.name)}.</h1>
       <p class="body">Есть 3 минуты? Это небольшое исследование. ${ready.total} коротких вопросов. Отвечай честно.</p>
       <div class="actions">
         <button class="btn" id="start-btn">Начать</button>
       </div>
     </div>`,
  );
  const btn = document.getElementById("start-btn") as HTMLButtonElement | null;
  btn?.addEventListener("click", async () => {
    haptic("medium");
    btn.disabled = true;
    try {
      await notifyStart();
      showQuestion();
    } catch (err) {
      showError((err as Error).message);
    }
  });
}

function currentQuestion(): PublicQuestion | null {
  const r = state.ready;
  if (!r) return null;
  return r.questions[state.questionIndex] ?? null;
}

function showQuestion(): void {
  const ready = state.ready;
  if (!ready) return;
  const q = currentQuestion();
  if (!q) {
    void completeFlow();
    return;
  }

  const optionsHtml = q.options
    .map(
      (o, i) => `<button class="btn ${i === 0 ? "secondary" : ""}" data-option-id="${escapeHtml(o.id)}">${escapeHtml(o.label)}</button>`,
    )
    .join("");

  renderScreen(
    "question",
    `${progressDots(ready.total, state.questionIndex)}
     <div class="card">
       <p class="kicker">Вопрос ${state.questionIndex + 1} из ${ready.total}</p>
       ${imageTag(q.image)}
       <h2 class="subtitle">${escapeHtml(q.text)}</h2>
       <div class="actions">
         ${optionsHtml}
       </div>
     </div>`,
  );

  const buttons = root.querySelectorAll<HTMLButtonElement>("button[data-option-id]");
  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const optionId = btn.dataset.optionId ?? "";
      const option = q.options.find((o) => o.id === optionId) ?? null;
      void onAnswer(q, option, buttons);
    });
  });
}

async function onAnswer(
  q: PublicQuestion,
  option: PublicQuestionOption | null,
  buttons: NodeListOf<HTMLButtonElement>,
): Promise<void> {
  if (!option) return;
  buttons.forEach((b) => (b.disabled = true));
  haptic("medium");
  try {
    const res = await sendAnswer(q.id, option.id);
    if (res.alreadyAnswered) {
      toast("Ответ уже зафиксирован");
    }
    state.questionIndex = res.currentIndex;
    state.lastReaction = option.reaction
      ? { text: option.reaction.text, image: option.reaction.image }
      : null;
    if (state.lastReaction) {
      showReaction();
    } else {
      // No reaction configured - go straight to next question
      if (state.questionIndex < (state.ready?.total ?? 0)) {
        showQuestion();
      } else {
        void completeFlow();
      }
    }
  } catch (err) {
    buttons.forEach((b) => (b.disabled = false));
    showError((err as Error).message);
  }
}

function showReaction(): void {
  const ready = state.ready;
  const reaction = state.lastReaction;
  if (!ready || !reaction) return;

  const hasMore = state.questionIndex < ready.total;
  const buttonLabel = hasMore ? "Дальше" : "К финалу";

  renderScreen(
    "reaction",
    `${progressDots(ready.total, Math.min(state.questionIndex, ready.total - 1))}
     <div class="card">
       <p class="kicker">Зафиксировано</p>
       ${imageTag(reaction.image ?? null)}
       <p class="body">${escapeHtml(reaction.text)}</p>
       <div class="actions">
         <button class="btn" id="next-btn">${buttonLabel}</button>
       </div>
     </div>`,
  );

  const btn = document.getElementById("next-btn") as HTMLButtonElement | null;
  btn?.addEventListener("click", () => {
    haptic("light");
    if (hasMore) {
      showQuestion();
    } else {
      void completeFlow();
    }
  });
}

async function completeFlow(): Promise<void> {
  showLoading();
  try {
    await sendComplete();
    haptic("success");
    if (state.ready) {
      showFinal(state.ready.final);
    }
  } catch (err) {
    showError((err as Error).message);
  }
}

function showFinal(final: FinalScreen): void {
  renderScreen(
    "final",
    `<div class="card">
       <p class="kicker">Исследование завершено</p>
       ${imageTag(final.image)}
       <h1 class="final-title">${escapeHtml(final.title)}</h1>
       <p class="final-body">${escapeHtml(final.body)}</p>
       <div class="actions">
         <button class="btn" id="done-btn">Я понял</button>
       </div>
     </div>`,
  );
  const btn = document.getElementById("done-btn") as HTMLButtonElement | null;
  btn?.addEventListener("click", () => {
    haptic("success");
    const w = tg();
    if (w?.close) {
      try {
        w.close();
        return;
      } catch {
        // ignore
      }
    }
    toast("Можно закрыть это окно");
  });
}

async function bootstrap(): Promise<void> {
  showLoading();
  const w = tg();
  if (w) {
    try {
      w.ready();
      w.expand();
    } catch {
      // ignore
    }
  }

  try {
    const data = await getState();
    if (data.status === "unknown") {
      showUnknown(data.telegramId);
      return;
    }
    state.ready = data;
    state.questionIndex = data.currentIndex;

    const imageSources: Array<string | null | undefined> = [data.final.image];
    for (const q of data.questions) {
      imageSources.push(q.image);
      for (const o of q.options) {
        imageSources.push(o.reaction?.image);
      }
    }
    preloadImages(imageSources);

    if (data.completed) {
      showFinal(data.final);
      return;
    }
    if (data.currentIndex > 0 && data.currentIndex < data.total) {
      showQuestion();
      return;
    }
    if (data.currentIndex >= data.total) {
      void completeFlow();
      return;
    }
    showWelcome(data);
  } catch (err) {
    showError((err as Error).message);
  }
}

void bootstrap();
