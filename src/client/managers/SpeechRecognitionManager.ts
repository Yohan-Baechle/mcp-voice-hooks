import type { SpeechRecognitionCallbacks } from "../types";

interface SpeechRecognitionResultList {
  readonly length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
  readonly length: number;
  item(index: number): SpeechRecognitionAlternative;
  readonly isFinal: boolean;
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionAlternative {
  readonly transcript: string;
  readonly confidence: number;
}

interface SpeechRecognitionEventCustom extends Event {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEventCustom extends Event {
  readonly error: string;
}

interface SpeechRecognitionInstance {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEventCustom) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventCustom) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}

export class SpeechRecognitionManager {
  private baseUrl: string;
  private callbacks: SpeechRecognitionCallbacks;

  private listenBtn: HTMLButtonElement | null;
  private listenBtnText: HTMLElement | null;
  private listenIcon: HTMLElement | null;
  private interimText: HTMLElement | null;

  private recognition: SpeechRecognitionInstance | null;
  public isListening: boolean;
  private isFirstStart: boolean;
  private isPausedForSpeech: boolean;

  constructor(baseUrl: string, callbacks: SpeechRecognitionCallbacks = {}) {
    this.baseUrl = baseUrl;
    this.callbacks = callbacks;

    this.listenBtn = document.getElementById(
      "listenBtn"
    ) as HTMLButtonElement | null;
    this.listenBtnText = document.getElementById("listenBtnText");
    this.listenIcon = document.getElementById("listenIcon");
    this.interimText = document.getElementById("interimText");

    this.recognition = null;
    this.isListening = false;
    this.isFirstStart = true;
    this.isPausedForSpeech = false;

    this.initialize();
  }

  private initialize(): void {
    const SpeechRecognitionConstructor =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;

    if (!SpeechRecognitionConstructor) {
      console.error("Speech recognition not supported in this browser");
      if (this.listenBtn) {
        this.listenBtn.disabled = true;
        this.listenBtn.setAttribute("aria-disabled", "true");
      }
      if (this.listenBtnText) {
        this.listenBtnText.textContent = "Non Supporté";
      }

      if (this.callbacks.onError) {
        this.callbacks.onError(
          "La reconnaissance vocale n'est pas supportée par ce navigateur"
        );
      }
      return;
    }

    this.recognition = new SpeechRecognitionConstructor();
    if (!this.recognition) return;

    this.recognition.continuous = true;
    this.recognition.interimResults = true;
    this.recognition.lang = "fr-FR";

    this.recognition.onresult = (event: SpeechRecognitionEventCustom): void => {
      let interimTranscript = "";

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;

        if (event.results[i].isFinal) {
          this.sendVoiceUtterance(transcript);
          if (this.interimText) {
            if (this.interimText instanceof HTMLTextAreaElement) {
              this.interimText.value = "";
            } else {
              this.interimText.textContent = "";
            }
            this.interimText.classList.remove("active");
          }

          if (this.callbacks.onFinalResult) {
            this.callbacks.onFinalResult(transcript);
          }
        } else {
          interimTranscript += transcript;
        }
      }

      if (interimTranscript && this.interimText) {
        if (this.interimText instanceof HTMLTextAreaElement) {
          this.interimText.value = interimTranscript;
        } else {
          this.interimText.textContent = interimTranscript;
        }
        this.interimText.classList.add("active");
      }
    };

    this.recognition!.onerror = (
      event: SpeechRecognitionErrorEventCustom
    ): void => {
      console.error("Speech recognition error:", event.error);

      if (event.error === "no-speech") {
        return;
      }

      let errorMessage = "";
      if (event.error === "not-allowed") {
        errorMessage =
          "Accès au microphone refusé. Veuillez autoriser l'accès au microphone pour utiliser l'entrée vocale.";
      } else if (event.error === "network") {
        errorMessage =
          "Erreur réseau. Veuillez vérifier votre connexion internet.";
      } else {
        errorMessage = `Erreur de reconnaissance vocale : ${event.error}`;
      }

      if (this.callbacks.onError) {
        this.callbacks.onError(errorMessage);
      }

      alert(errorMessage);
      this.stop();
    };

    this.recognition!.onend = (): void => {
      if (this.isListening && !this.isPausedForSpeech && this.recognition) {
        try {
          this.recognition.start();
        } catch (e) {
          console.error("Failed to restart recognition:", e);
          this.stop();
        }
      }
    };
  }

  public async start(): Promise<void> {
    if (!this.recognition) {
      const message =
        "La reconnaissance vocale n'est pas supportée par ce navigateur";
      if (this.callbacks.onError) {
        this.callbacks.onError(message);
      }
      alert(message);
      return;
    }

    try {
      this.recognition.start();
      this.isListening = true;

      if (this.listenBtn) {
        this.listenBtn.classList.remove("btn-success");
        this.listenBtn.classList.add("btn-error", "listening");
        this.listenBtn.setAttribute("aria-pressed", "true");
      }
      if (this.listenBtnText) {
        this.listenBtnText.textContent = "Arrêter l'Écoute";
      }
      if (this.listenIcon) {
        this.listenIcon.classList.add("animate-pulse");
      }

      if (this.isFirstStart && this.callbacks.onFirstStart) {
        this.callbacks.onFirstStart();
        this.isFirstStart = false;
      }

      if (this.callbacks.onStart) {
        this.callbacks.onStart();
      }

      await this.updateServerState(true);
    } catch (e) {
      console.error("Failed to start recognition:", e);
      const message =
        "Échec du démarrage de la reconnaissance vocale. Veuillez réessayer.";

      if (this.callbacks.onError) {
        this.callbacks.onError(message);
      }
      alert(message);
    }
  }

  public async stop(): Promise<void> {
    if (this.recognition) {
      this.isListening = false;
      this.recognition.stop();

      if (this.listenBtn) {
        this.listenBtn.classList.remove("btn-error", "listening");
        this.listenBtn.classList.add("btn-success");
        this.listenBtn.setAttribute("aria-pressed", "false");
      }
      if (this.listenBtnText) {
        this.listenBtnText.textContent = "Commencer l'Écoute";
      }
      if (this.listenIcon) {
        this.listenIcon.classList.remove("animate-pulse");
      }
      if (this.interimText) {
        if (this.interimText instanceof HTMLTextAreaElement) {
          this.interimText.value = "";
        } else {
          this.interimText.textContent = "";
        }
        this.interimText.classList.remove("active");
      }

      if (this.callbacks.onStop) {
        this.callbacks.onStop();
      }

      await this.updateServerState(false);
    }
  }

  public toggle(): Promise<void> {
    if (this.isListening) {
      return this.stop();
    } else {
      return this.start();
    }
  }

  private async sendVoiceUtterance(text: string): Promise<void> {
    const trimmedText = text.trim();
    if (!trimmedText) return;

    try {
      const response = await fetch(`${this.baseUrl}/api/potential-utterances`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: trimmedText,
          timestamp: new Date().toISOString(),
        }),
      });

      if (response.ok) {
        if (this.callbacks.onUtteranceSent) {
          this.callbacks.onUtteranceSent(trimmedText);
        }
      } else {
        const error = await response.json();
        console.error("Error sending voice utterance:", error);

        if (this.callbacks.onError) {
          this.callbacks.onError("Échec de l'envoi du message");
        }
      }
    } catch (error) {
      console.error("Failed to send voice utterance:", error);

      if (this.callbacks.onError) {
        this.callbacks.onError("Erreur réseau lors de l'envoi du message");
      }
    }
  }

  private async updateServerState(active: boolean): Promise<void> {
    try {
      await fetch(`${this.baseUrl}/api/voice-input-state`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ active }),
      });
    } catch (error) {
      console.error("Failed to update voice input state:", error);
    }
  }

  public setupButton(): void {
    if (this.listenBtn) {
      this.listenBtn.addEventListener("click", () => this.toggle());
    }
  }

  public pauseForSpeech(): void {
    if (this.isListening && this.recognition) {
      this.isPausedForSpeech = true;
      this.recognition.stop();
    }
  }

  public resumeAfterSpeech(): void {
    if (this.isListening && this.isPausedForSpeech && this.recognition) {
      this.isPausedForSpeech = false;
      try {
        this.recognition.start();
      } catch (e) {
        console.error("Failed to resume recognition after speech:", e);
      }
    }
  }
}
