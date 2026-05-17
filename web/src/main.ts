import confetti from "canvas-confetti";
import { getState, notifyStart, sendAnswer, sendComplete } from "./api";
import type {
  FinalScreen,
  PublicQuestion,
  PublicQuestionOption,
  StateReady,
} from "./types";

type Screen = "loading" | "unknown" | "welcome" | "intro" | "question" | "reaction" | "final" | "error";

interface AppState {
  ready: StateReady | null;
  questionIndex: number;
  lastReaction: { images: string[]; text: string } | null;
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

function progressBar(total: number, current: number): string {
  if (total <= 0) return "";
  const pct = Math.max(0, Math.min(100, Math.round((current / total) * 100)));
  const shown = Math.min(current + 1, total);
  return `
    <div class="progress">
      <div class="progress-track">
        <div class="progress-fill" style="width:${pct}%"></div>
      </div>
      <div class="progress-count">${shown} / ${total}</div>
    </div>
  `;
}

function imageTag(src: string | null | undefined): string {
  if (!src) return "";
  return `<img class="image" src="${escapeHtml(src)}" alt="" onerror="this.classList.add('missing')" />`;
}

function imageStackTag(srcs: string[]): string {
  if (srcs.length === 0) return "";
  if (srcs.length === 1) return imageTag(srcs[0]);
  return `<div class="image-stack">${srcs.map((s) => imageTag(s)).join("")}</div>`;
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
       <p class="muted">Загружаем исследрование</p>
     </div>`,
  );
}

function showUnknown(telegramId: number): void {
  renderScreen(
    "unknown",
    `<div class="card">
       <p class="kicker">Доступ</p>
       <h1 class="title">Тебя нет в списке исследрования</h1>
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
       <p class="kicker">Исследрование</p>
       <h1 class="title">Привет, ${escapeHtml(ready.name)}.</h1>
       <p class="body">Есть 3 минуты? Это небольшое исследрование. ${ready.total} коротких вопросов. Отвечай честно.</p>
       <div class="actions">
         <button class="btn" id="start-btn">Начать</button>
       </div>
     </div>`,
  );
  const btn = document.getElementById("start-btn") as HTMLButtonElement | null;
  btn?.addEventListener("click", () => {
    haptic("medium");
    btn.disabled = true;
    // Fire and forget; do NOT await — preserving the user gesture is required
    // for the browser to allow video.play() with audio in the next call.
    void notifyStart().catch(() => {
      // non-critical; quiz will still record at first answer
    });
    showIntro();
  });
}

function showIntro(): void {
  renderScreen(
    "intro",
    `<div class="intro-shell">
       <video
         id="intro-video"
         src="/welcome.MP4"
         playsinline
         autoplay
         preload="auto"
       ></video>
       <div class="intro-overlay" aria-hidden="true"></div>
       <div class="intro-tap-cta" id="intro-tap-cta">
         <div class="play-icon"></div>
         <div>Нажми, чтобы запустить</div>
       </div>
     </div>`,
  );

  const video = document.getElementById("intro-video") as HTMLVideoElement | null;
  const tapCta = document.getElementById("intro-tap-cta") as HTMLDivElement | null;
  if (!video) {
    showQuestion();
    return;
  }

  let advanced = false;
  const goNext = () => {
    if (advanced) return;
    advanced = true;
    try {
      video.pause();
    } catch {
      // ignore
    }
    showQuestion();
  };

  video.addEventListener("ended", goNext);
  // Defensive: if browser fires "error" or video URL is broken, still advance
  video.addEventListener("error", goNext);

  // Try to play with sound right away (we're inside the click handler call stack).
  const playAttempt = video.play();
  if (playAttempt && typeof playAttempt.then === "function") {
    playAttempt.catch(() => {
      // Autoplay-with-sound was blocked. Show a tap-to-play overlay.
      if (tapCta) {
        tapCta.classList.add("show");
        const start = () => {
          tapCta.classList.remove("show");
          tapCta.removeEventListener("click", start);
          video.play().catch(() => {
            // Last resort: skip straight to question 1
            goNext();
          });
        };
        tapCta.addEventListener("click", start);
      } else {
        goNext();
      }
    });
  }
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
    `${progressBar(ready.total, state.questionIndex)}
     <div class="card">
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
    if (option.reaction) {
      const r = option.reaction;
      const images: string[] = [];
      if (r.images && r.images.length > 0) images.push(...r.images);
      else if (r.image) images.push(r.image);
      state.lastReaction = { text: r.text, images };
    } else {
      state.lastReaction = null;
    }
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
    `${progressBar(ready.total, Math.min(state.questionIndex, ready.total - 1))}
     <div class="card">
       <p class="kicker success">Зафиксировано</p>
       ${imageStackTag(reaction.images)}
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

function fireConfetti(): void {
  // Read the Telegram accent so confetti matches the user's theme.
  const styles = getComputedStyle(document.documentElement);
  const accent = styles.getPropertyValue("--accent").trim() || "#2f80ed";
  const palette = [accent, "#ffb347", "#ffffff", "#34c759", "#ff5e57"];

  const burst = (originX: number) => {
    confetti({
      particleCount: 70,
      startVelocity: 45,
      spread: 70,
      ticks: 240,
      origin: { x: originX, y: 0.25 },
      colors: palette,
      gravity: 1.1,
      scalar: 0.95,
      disableForReducedMotion: true,
    });
  };

  burst(0.2);
  window.setTimeout(() => burst(0.5), 180);
  window.setTimeout(() => burst(0.8), 360);
  window.setTimeout(() => {
    confetti({
      particleCount: 40,
      angle: 90,
      spread: 120,
      origin: { x: 0.5, y: 0.0 },
      colors: palette,
      ticks: 200,
      disableForReducedMotion: true,
    });
  }, 600);
}

function showFinal(final: FinalScreen): void {
  renderScreen(
    "final",
    `<div class="card">
       <p class="kicker success">Исследрование завершено</p>
       ${imageTag(final.image)}
       <h1 class="final-title">${escapeHtml(final.title)}</h1>
       <p class="final-body">${escapeHtml(final.body)}</p>
       <div class="actions">
         <button class="btn" id="done-btn">Я понял</button>
       </div>
     </div>`,
  );
  window.setTimeout(fireConfetti, 200);
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
        if (!o.reaction) continue;
        if (o.reaction.images) imageSources.push(...o.reaction.images);
        else imageSources.push(o.reaction.image);
      }
    }
    preloadImages(imageSources);

    if (data.completed) {
      showFinal(data.final);
      return;
    }
    if (data.currentIndex >= data.total && data.total > 0) {
      void completeFlow();
      return;
    }
    if (data.currentIndex === 0) {
      showWelcome(data);
      return;
    }
    showQuestion();
  } catch (err) {
    showError((err as Error).message);
  }
}

void bootstrap();
