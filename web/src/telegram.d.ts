// Minimal subset of Telegram.WebApp surface that we use.
// Full types are available in @twa-dev/types, but we only need a handful here.

interface TelegramHapticFeedback {
  impactOccurred(style: "light" | "medium" | "heavy" | "rigid" | "soft"): void;
  notificationOccurred(type: "error" | "success" | "warning"): void;
  selectionChanged(): void;
}

interface TelegramWebApp {
  initData: string;
  initDataUnsafe: unknown;
  ready(): void;
  expand(): void;
  close(): void;
  HapticFeedback?: TelegramHapticFeedback;
  themeParams: Record<string, string>;
  colorScheme: "light" | "dark";
}

interface Window {
  Telegram?: {
    WebApp: TelegramWebApp;
  };
}
