import type { AccessibilityCallbacks } from "../types";
import { updateThemeIcon } from "../icons";

export class AccessibilityManager {
  private themeToggleBtn: HTMLButtonElement | null;
  private fontSizeSelect: HTMLSelectElement | null;

  constructor() {
    this.themeToggleBtn = document.getElementById(
      "theme-toggle-btn"
    ) as HTMLButtonElement | null;
    this.fontSizeSelect = document.getElementById(
      "font-size-select"
    ) as HTMLSelectElement | null;

    this.loadPreferences();

    this.setupListeners();

    this.setupSystemThemeListener();
  }

  private loadPreferences(): void {
    const savedTheme = localStorage.getItem("theme") || "light";
    this.applyTheme(savedTheme);

    const savedFontSize = localStorage.getItem("fontSize") || "medium";
    if (this.fontSizeSelect) {
      this.fontSizeSelect.value = savedFontSize;
    }
    this.applyFontSize(savedFontSize);
  }

  private setupListeners(): void {
    if (this.themeToggleBtn) {
      this.themeToggleBtn.addEventListener("click", () => {
        const currentTheme = localStorage.getItem("theme") || "light";
        const newTheme = currentTheme === "light" ? "dark" : "light";
        localStorage.setItem("theme", newTheme);
        this.applyTheme(newTheme);
        updateThemeIcon(newTheme === "dark");
        this.announceToScreenReader(
          `Thème changé en mode ${newTheme === "dark" ? "sombre" : "clair"}`
        );
      });
    }

    if (this.fontSizeSelect) {
      this.fontSizeSelect.addEventListener("change", (e) => {
        const size = (e.target as HTMLSelectElement).value;
        const sizeNames: Record<string, string> = {
          small: "petit",
          medium: "moyen",
          large: "grand",
          xlarge: "très grand",
        };
        localStorage.setItem("fontSize", size);
        this.applyFontSize(size);
        this.announceToScreenReader(
          `Taille du texte changée en ${sizeNames[size] || size}`
        );
      });
    }
  }

  private applyTheme(theme: string): void {
    const html = document.documentElement;
    html.setAttribute("data-theme", theme);
  }

  private applyFontSize(size: string): void {
    const html = document.documentElement;
    html.className = html.className.replace(/font-size-\w+/g, "");
    html.classList.add(`font-size-${size}`);
  }

  private setupSystemThemeListener(): void {
    if (!localStorage.getItem("theme")) {
      const prefersDark = window.matchMedia(
        "(prefers-color-scheme: dark)"
      ).matches;
      this.applyTheme(prefersDark ? "dark" : "light");
    }
  }

  public announceToScreenReader(message: string): void {
    const announcement = document.createElement("div");
    announcement.setAttribute("role", "status");
    announcement.setAttribute("aria-live", "polite");
    announcement.setAttribute("aria-atomic", "true");
    announcement.className = "sr-only";
    announcement.style.position = "absolute";
    announcement.style.left = "-10000px";
    announcement.style.width = "1px";
    announcement.style.height = "1px";
    announcement.style.overflow = "hidden";
    announcement.textContent = message;

    document.body.appendChild(announcement);

    setTimeout(() => {
      document.body.removeChild(announcement);
    }, 1000);
  }

  public createKeyboardHandler(
    callbacks: AccessibilityCallbacks
  ): (e: KeyboardEvent) => void {
    return (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "l") {
        e.preventDefault();
        if (callbacks.toggleListening) {
          callbacks.toggleListening();
        }
      }

      if ((e.ctrlKey || e.metaKey) && e.key === "r") {
        e.preventDefault();
        if (callbacks.refresh) {
          callbacks.refresh();
          this.announceToScreenReader("Utterances refreshed");
        }
      }

      if ((e.ctrlKey || e.metaKey) && e.key === "t") {
        e.preventDefault();
        if (callbacks.testVoice) {
          callbacks.testVoice();
          this.announceToScreenReader("Testing voice output");
        }
      }

      if (e.key === "Escape" && callbacks.stopListening) {
        callbacks.stopListening();
        this.announceToScreenReader("Voice recognition stopped");
      }
    };
  }
}
