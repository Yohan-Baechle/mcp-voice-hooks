import type { SpeechSynthesisCallbacks, TTSEvent } from "../types";

export class SpeechSynthesisManager {
  private baseUrl: string;
  private callbacks: SpeechSynthesisCallbacks;

  private languageSelect: HTMLSelectElement | null;
  private voiceSelect: HTMLSelectElement | null;
  private speechRateSlider: HTMLInputElement | null;
  private speechRateInput: HTMLInputElement | null;
  private testTTSBtn: HTMLButtonElement | null;
  public voiceResponsesToggle: HTMLInputElement | null;
  private voiceOptions: HTMLElement | null;
  private localVoicesGroup: HTMLOptGroupElement | null;
  private cloudVoicesGroup: HTMLOptGroupElement | null;
  private rateWarning: HTMLElement | null;
  private systemVoiceInfo: HTMLElement | null;

  private voices: SpeechSynthesisVoice[];
  private selectedVoice: string;
  private speechRate: number;
  private speechPitch: number;
  public eventSource: EventSource | null;

  constructor(baseUrl: string, callbacks: SpeechSynthesisCallbacks = {}) {
    this.baseUrl = baseUrl;
    this.callbacks = callbacks;

    this.languageSelect = document.getElementById(
      "languageSelect"
    ) as HTMLSelectElement | null;
    this.voiceSelect = document.getElementById(
      "voiceSelect"
    ) as HTMLSelectElement | null;
    this.speechRateSlider = document.getElementById(
      "speechRate"
    ) as HTMLInputElement | null;
    this.speechRateInput = document.getElementById(
      "speechRateInput"
    ) as HTMLInputElement | null;
    this.testTTSBtn = document.getElementById(
      "testTTSBtn"
    ) as HTMLButtonElement | null;
    this.voiceResponsesToggle = document.getElementById(
      "voiceResponsesToggle"
    ) as HTMLInputElement | null;
    this.voiceOptions = document.getElementById("voiceOptions");
    this.localVoicesGroup = document.getElementById(
      "localVoicesGroup"
    ) as HTMLOptGroupElement | null;
    this.cloudVoicesGroup = document.getElementById(
      "cloudVoicesGroup"
    ) as HTMLOptGroupElement | null;
    this.rateWarning = document.getElementById("rateWarning");
    this.systemVoiceInfo = document.getElementById("systemVoiceInfo");

    this.voices = [];
    this.selectedVoice = "system";
    this.speechRate = 1.0;
    this.speechPitch = 1.0;
    this.eventSource = null;

    this.initialize();
    this.initializeTTSEvents();
    this.loadPreferences();
    this.setupEventListeners();
  }

  private initialize(): void {
    if (!window.speechSynthesis) {
      console.warn("Speech synthesis not supported in this browser");
      return;
    }

    const loadVoices = (): void => {
      const voices = window.speechSynthesis!.getVoices();

      const deduplicatedVoices: SpeechSynthesisVoice[] = [];
      const seen = new Set<string>();

      voices.forEach((voice) => {
        const key = `${voice.name}-${voice.lang}-${voice.voiceURI}`;
        if (!seen.has(key)) {
          seen.add(key);
          deduplicatedVoices.push(voice);
        }
      });

      this.voices = deduplicatedVoices;
      this.populateVoiceList();
    };

    loadVoices();
    setTimeout(loadVoices, 100);

    if (window.speechSynthesis.onvoiceschanged !== undefined) {
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }
  }

  private initializeTTSEvents(): void {
    this.eventSource = new EventSource(`${this.baseUrl}/api/tts-events`);

    this.eventSource.onmessage = (event: MessageEvent<string>): void => {
      try {
        const data = JSON.parse(event.data) as TTSEvent;

        if (data.type === "speak" && data.text) {
          this.speak(data.text);
        } else if (
          data.type === "waitStatus" &&
          typeof data.isWaiting === "boolean"
        ) {
          this.handleWaitStatus(data.isWaiting);
        }
      } catch (error) {
        console.error("Failed to parse TTS event:", error);
      }
    };

    this.eventSource.onerror = (error: Event): void => {
      console.error("SSE connection error:", error);
    };

    this.eventSource.onopen = (): void => {
      this.syncStateWithServer();
    };
  }

  private loadPreferences(): void {
    const storedVoiceResponses = localStorage.getItem("voiceResponsesEnabled");
    const voiceResponsesEnabled =
      storedVoiceResponses !== null ? storedVoiceResponses === "true" : true;

    if (this.voiceResponsesToggle) {
      this.voiceResponsesToggle.checked = voiceResponsesEnabled;
      this.voiceResponsesToggle.setAttribute(
        "aria-pressed",
        voiceResponsesEnabled.toString()
      );
    }

    if (storedVoiceResponses === null) {
      localStorage.setItem("voiceResponsesEnabled", "true");
    }

    const storedRate = localStorage.getItem("speechRate");
    if (storedRate !== null) {
      this.speechRate = parseFloat(storedRate);
      if (this.speechRateSlider) {
        this.speechRateSlider.value = storedRate;
        this.speechRateSlider.setAttribute(
          "aria-valuenow",
          this.speechRate.toString()
        );
      }
      if (this.speechRateInput) {
        this.speechRateInput.value = this.speechRate.toFixed(1);
      }
    }

    this.selectedVoice = localStorage.getItem("selectedVoice") || "system";

    const savedLanguage = localStorage.getItem("selectedLanguage");
    if (savedLanguage && this.languageSelect) {
      this.languageSelect.value = savedLanguage;
    }

    this.updateVoiceOptionsVisibility();
    this.updateVoicePreferences();
    this.updateVoiceWarnings();
  }

  private setupEventListeners(): void {
    if (this.languageSelect) {
      this.languageSelect.addEventListener("change", (): void => {
        localStorage.setItem("selectedLanguage", this.languageSelect!.value);
        this.populateVoiceList();

        if (this.callbacks.onLanguageChange) {
          this.callbacks.onLanguageChange(this.languageSelect!.value);
        }
      });
    }

    if (this.voiceSelect) {
      this.voiceSelect.addEventListener("change", (e: Event): void => {
        const target = e.target as HTMLSelectElement;
        this.selectedVoice = target.value;
        localStorage.setItem("selectedVoice", this.selectedVoice);
        this.updateVoicePreferences();
        this.updateVoiceWarnings();

        if (this.callbacks.onVoiceChange) {
          const selectedOption =
            this.voiceSelect!.options[this.voiceSelect!.selectedIndex];
          this.callbacks.onVoiceChange(selectedOption.text);
        }
      });
    }

    if (this.speechRateSlider) {
      this.speechRateSlider.addEventListener("input", (e: Event): void => {
        const target = e.target as HTMLInputElement;
        this.speechRate = parseFloat(target.value);
        if (this.speechRateInput) {
          this.speechRateInput.value = this.speechRate.toFixed(1);
        }
        if (this.speechRateSlider) {
          this.speechRateSlider.setAttribute(
            "aria-valuenow",
            this.speechRate.toString()
          );
        }
        localStorage.setItem("speechRate", this.speechRate.toString());
      });
    }

    if (this.speechRateInput) {
      this.speechRateInput.addEventListener("input", (e: Event): void => {
        const target = e.target as HTMLInputElement;
        let value = parseFloat(target.value);
        if (!isNaN(value)) {
          value = Math.max(0.5, Math.min(5, value));
          this.speechRate = value;
          if (this.speechRateSlider) {
            this.speechRateSlider.value = value.toString();
            this.speechRateSlider.setAttribute(
              "aria-valuenow",
              value.toString()
            );
          }
          if (this.speechRateInput) {
            this.speechRateInput.value = value.toFixed(1);
          }
          localStorage.setItem("speechRate", this.speechRate.toString());
        }
      });
    }

    if (this.testTTSBtn) {
      this.testTTSBtn.addEventListener("click", (): void => {
        this.speak(
          "Ceci est le mode vocal pour Claude Code. Comment puis-je vous aider aujourd'hui ?"
        );

        if (this.callbacks.onTest) {
          this.callbacks.onTest();
        }
      });
    }

    if (this.voiceResponsesToggle) {
      this.voiceResponsesToggle.addEventListener("change", (e: Event): void => {
        const target = e.target as HTMLInputElement;
        const enabled = target.checked;
        this.voiceResponsesToggle!.setAttribute(
          "aria-pressed",
          enabled.toString()
        );
        localStorage.setItem("voiceResponsesEnabled", enabled.toString());
        this.updateVoicePreferences();
        this.updateVoiceOptionsVisibility();

        if (this.callbacks.onToggleVoiceResponses) {
          this.callbacks.onToggleVoiceResponses(enabled);
        }
      });
    }
  }

  private populateLanguageFilter(): void {
    if (!this.languageSelect || !this.voices) return;

    const currentSelection = this.languageSelect.value || "fr-FR";
    this.languageSelect.innerHTML = "";

    const allOption = document.createElement("option");
    allOption.value = "all";
    allOption.textContent = "Toutes les Langues";
    this.languageSelect.appendChild(allOption);

    const languageCodes = new Set<string>();
    this.voices.forEach((voice) => {
      languageCodes.add(voice.lang);
    });

    Array.from(languageCodes)
      .sort()
      .forEach((lang) => {
        const option = document.createElement("option");
        option.value = lang;
        option.textContent = lang;
        this.languageSelect!.appendChild(option);
      });

    this.languageSelect.value = currentSelection;
    if (this.languageSelect.value !== currentSelection) {
      this.languageSelect.value = "fr-FR";
    }
  }

  private populateVoiceList(): void {
    if (!this.voiceSelect || !this.localVoicesGroup || !this.cloudVoicesGroup)
      return;

    this.populateLanguageFilter();

    this.localVoicesGroup.innerHTML = "";
    this.cloudVoicesGroup.innerHTML = "";

    const excludedVoices = [
      "Eddy",
      "Flo",
      "Grandma",
      "Grandpa",
      "Reed",
      "Rocko",
      "Sandy",
      "Shelley",
      "Albert",
      "Bad News",
      "Bahh",
      "Bells",
      "Boing",
      "Bubbles",
      "Cellos",
      "Good News",
      "Jester",
      "Organ",
      "Superstar",
      "Trinoids",
      "Whisper",
      "Wobble",
      "Zarvox",
      "Fred",
      "Junior",
      "Kathy",
      "Ralph",
    ];

    const selectedLanguage = this.languageSelect
      ? this.languageSelect.value
      : "fr-FR";

    this.voices.forEach((voice, index) => {
      const voiceLang = voice.lang;
      let shouldInclude = false;

      if (selectedLanguage === "all") {
        shouldInclude = true;
      } else {
        shouldInclude = voiceLang === selectedLanguage;
      }

      if (shouldInclude) {
        const voiceName = voice.name;
        const isExcluded = excludedVoices.some((excluded) =>
          voiceName.toLowerCase().startsWith(excluded.toLowerCase())
        );

        if (!isExcluded) {
          const option = document.createElement("option");
          option.value = `browser:${index}`;
          option.textContent = `${voice.name} (${voice.lang})`;

          if (voice.localService) {
            this.localVoicesGroup!.appendChild(option);
          } else {
            this.cloudVoicesGroup!.appendChild(option);
          }
        }
      }
    });

    if (this.localVoicesGroup.children.length === 0) {
      this.localVoicesGroup.style.display = "none";
    } else {
      this.localVoicesGroup.style.display = "";
    }

    if (this.cloudVoicesGroup.children.length === 0) {
      this.cloudVoicesGroup.style.display = "none";
    } else {
      this.cloudVoicesGroup.style.display = "";
    }

    const savedVoice = localStorage.getItem("selectedVoice");
    if (savedVoice) {
      this.voiceSelect.value = savedVoice;
      this.selectedVoice = savedVoice;
    } else {
      this.selectDefaultFrenchVoice();
    }

    this.updateVoiceWarnings();
  }

  private selectDefaultFrenchVoice(): void {
    let googleFrenchIndex = -1;
    let microsoftFrenchIndex = -1;
    let anyFrenchIndex = -1;

    this.voices.forEach((voice, index) => {
      const voiceName = voice.name.toLowerCase();
      const voiceLang = voice.lang.toLowerCase();

      if (voiceLang.startsWith("fr")) {
        if (anyFrenchIndex === -1) {
          anyFrenchIndex = index;
        }

        if (voiceName.includes("google") && voiceName.includes("fr")) {
          googleFrenchIndex = index;
        }

        if (
          voiceName.includes("microsoft") &&
          (voiceName.includes("france") || voiceName.includes("french"))
        ) {
          microsoftFrenchIndex = index;
        }
      }
    });

    if (googleFrenchIndex !== -1) {
      this.selectedVoice = `browser:${googleFrenchIndex}`;
      if (this.voiceSelect) {
        this.voiceSelect.value = this.selectedVoice;
      }
    } else if (microsoftFrenchIndex !== -1) {
      this.selectedVoice = `browser:${microsoftFrenchIndex}`;
      if (this.voiceSelect) {
        this.voiceSelect.value = this.selectedVoice;
      }
    } else if (anyFrenchIndex !== -1) {
      this.selectedVoice = `browser:${anyFrenchIndex}`;
      if (this.voiceSelect) {
        this.voiceSelect.value = this.selectedVoice;
      }
    } else {
      this.selectedVoice = "system";
    }
  }

  public async speak(text: string): Promise<void> {
    if (this.callbacks.onSpeakStart) {
      this.callbacks.onSpeakStart();
    }

    if (this.selectedVoice === "system") {
      try {
        const response = await fetch(`${this.baseUrl}/api/speak-system`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            text: text,
            rate: Math.round(this.speechRate * 150),
          }),
        });

        if (!response.ok) {
          const error = await response.json();
          console.error("Failed to speak via system voice:", error);
        }

        const words = text.split(/\s+/).length;
        const estimatedDuration =
          ((words / 2.5) * 1000) / this.speechRate + 500;

        setTimeout(() => {
          if (this.callbacks.onSpeakEnd) {
            this.callbacks.onSpeakEnd();
          }
        }, estimatedDuration);
      } catch (error) {
        console.error("Failed to call speak-system API:", error);
        if (this.callbacks.onSpeakEnd) {
          this.callbacks.onSpeakEnd();
        }
      }
    } else {
      if (!window.speechSynthesis) {
        console.error("Speech synthesis not available");
        if (this.callbacks.onSpeakEnd) {
          this.callbacks.onSpeakEnd();
        }
        return;
      }

      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(text);

      if (this.selectedVoice && this.selectedVoice.startsWith("browser:")) {
        const voiceIndex = parseInt(this.selectedVoice.substring(8), 10);
        if (this.voices[voiceIndex]) {
          utterance.voice = this.voices[voiceIndex];
        }
      }

      utterance.rate = this.speechRate;
      utterance.pitch = this.speechPitch;

      utterance.onerror = (event: SpeechSynthesisErrorEvent): void => {
        console.error("Speech synthesis error:", event);
        if (this.callbacks.onSpeakEnd) {
          this.callbacks.onSpeakEnd();
        }
      };

      utterance.onend = (): void => {
        setTimeout(() => {
          if (this.callbacks.onSpeakEnd) {
            this.callbacks.onSpeakEnd();
          }
        }, 500);
      };

      window.speechSynthesis.speak(utterance);
    }
  }

  private updateVoiceOptionsVisibility(): void {
    const voiceResponsesEnabled = this.voiceResponsesToggle?.checked ?? false;
    if (voiceResponsesEnabled && this.voiceOptions) {
      this.voiceOptions.classList.remove("hidden");
    } else if (this.voiceOptions) {
      this.voiceOptions.classList.add("hidden");
    }
  }

  private async updateVoicePreferences(): Promise<void> {
    const voiceResponsesEnabled = this.voiceResponsesToggle?.checked ?? false;

    try {
      await fetch(`${this.baseUrl}/api/voice-preferences`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          voiceResponsesEnabled,
        }),
      });
    } catch (error) {
      console.error("Failed to update voice preferences:", error);
    }
  }

  private async syncStateWithServer(): Promise<void> {
    await this.updateVoicePreferences();
  }

  /**
   * Public method to sync voice preferences with the server.
   * This can be called externally (e.g., before delivering utterances).
   */
  public async syncPreferences(): Promise<void> {
    await this.updateVoicePreferences();
  }

  private updateVoiceWarnings(): void {
    if (this.selectedVoice === "system") {
      if (this.systemVoiceInfo) {
        this.systemVoiceInfo.classList.remove("hidden");
      }
      if (this.rateWarning) {
        this.rateWarning.classList.add("hidden");
      }
    } else if (
      this.selectedVoice &&
      this.selectedVoice.startsWith("browser:")
    ) {
      const voiceIndex = parseInt(this.selectedVoice.substring(8), 10);
      const voice = this.voices[voiceIndex];

      if (voice) {
        const isGoogleVoice = voice.name.toLowerCase().includes("google");
        const isLocalVoice = voice.localService === true;

        if (isGoogleVoice && this.rateWarning) {
          this.rateWarning.classList.remove("hidden");
        } else if (this.rateWarning) {
          this.rateWarning.classList.add("hidden");
        }

        if (isLocalVoice && this.systemVoiceInfo) {
          this.systemVoiceInfo.classList.remove("hidden");
        } else if (this.systemVoiceInfo) {
          this.systemVoiceInfo.classList.add("hidden");
        }
      } else {
        if (this.rateWarning) {
          this.rateWarning.classList.add("hidden");
        }
        if (this.systemVoiceInfo) {
          this.systemVoiceInfo.classList.add("hidden");
        }
      }
    } else {
      if (this.rateWarning) {
        this.rateWarning.classList.add("hidden");
      }
      if (this.systemVoiceInfo) {
        this.systemVoiceInfo.classList.add("hidden");
      }
    }
  }

  private handleWaitStatus(isWaiting: boolean): void {
    const listeningIndicator = document.getElementById("listeningIndicator");
    const listeningIndicatorText = listeningIndicator?.querySelector("span");

    if (listeningIndicatorText) {
      if (isWaiting) {
        listeningIndicatorText.textContent =
          "Claude est en pause et attend votre entrée vocale";

        if (this.callbacks.onWaitStatusChange) {
          this.callbacks.onWaitStatusChange(true);
        }
      } else {
        listeningIndicatorText.textContent = "À l'écoute de votre voix...";

        if (this.callbacks.onWaitStatusChange) {
          this.callbacks.onWaitStatusChange(false);
        }
      }
    }
  }
}
