import "./style.css";
import { AccessibilityManager } from "./managers/AccessibilityManager";
import { SpeechRecognitionManager } from "./managers/SpeechRecognitionManager";
import { SpeechSynthesisManager } from "./managers/SpeechSynthesisManager";
import { MessageManager } from "./managers/MessageManager";
import { initIcons } from "./icons";

class VoiceHooksClient {
  private baseUrl: string;
  private debug: boolean;
  private accessibilityManager: AccessibilityManager;
  private messageManager: MessageManager;
  private speechRecognition: SpeechRecognitionManager;
  private speechSynthesis: SpeechSynthesisManager;

  constructor() {
    this.baseUrl = window.location.origin;
    this.debug = localStorage.getItem("voiceHooksDebug") === "true";

    this.accessibilityManager = new AccessibilityManager();

    this.messageManager = new MessageManager(this.baseUrl, {
      onRefresh: () => {
        this.accessibilityManager.announceToScreenReader(
          "Actualisation des messages"
        );
      },
      onClearStart: () => {
        this.accessibilityManager.announceToScreenReader(
          "Effacement de tous les messages"
        );
      },
      onClearSuccess: () => {
        this.accessibilityManager.announceToScreenReader(
          "Tous les messages ont été effacés"
        );
        this.debugLog("Cleared all utterances");
      },
      onError: (message: string) => {
        this.accessibilityManager.announceToScreenReader(message);
      },
    });

    this.speechSynthesis = new SpeechSynthesisManager(this.baseUrl, {
      onLanguageChange: (language: string) => {
        this.accessibilityManager.announceToScreenReader(
          `Langue changée en ${language}`
        );
      },
      onVoiceChange: (voiceName: string) => {
        this.accessibilityManager.announceToScreenReader(
          `Voix changée en ${voiceName}`
        );
      },
      onTest: () => {
        this.accessibilityManager.announceToScreenReader("Test de la voix");
      },
      onToggleVoiceResponses: (enabled: boolean) => {
        this.accessibilityManager.announceToScreenReader(
          `Réponses vocales ${enabled ? "activées" : "désactivées"}`
        );
      },
      onWaitStatusChange: (isWaiting: boolean) => {
        if (isWaiting) {
          this.debugLog("Claude is waiting for voice input");
          this.accessibilityManager.announceToScreenReader(
            "Claude attend votre entrée vocale"
          );
        } else {
          this.debugLog("Claude finished waiting");
        }
      },
      onSpeakStart: () => {
        if (this.speechRecognition) {
          this.speechRecognition.pauseForSpeech();
          this.debugLog("Paused voice recognition during speech synthesis");
        }
      },
      onSpeakEnd: () => {
        if (this.speechRecognition) {
          this.speechRecognition.resumeAfterSpeech();
          this.debugLog("Resumed voice recognition after speech synthesis");
        }
      },
    });

    this.speechRecognition = new SpeechRecognitionManager(this.baseUrl, {
      onStart: () => {
        this.debugLog("Started listening");
        this.accessibilityManager.announceToScreenReader(
          "Reconnaissance vocale démarrée. Parlez maintenant."
        );
      },
      onStop: () => {
        this.debugLog("Stopped listening");
        this.accessibilityManager.announceToScreenReader(
          "Reconnaissance vocale arrêtée"
        );
      },
      onFirstStart: () => {
        if (this.speechSynthesis.voiceResponsesToggle?.checked) {
          this.speechSynthesis.speak(
            "Bonjour Gérald, comment puis-je vous aider ?"
          );
        }
      },
      onFinalResult: (transcript: string) => {
        this.accessibilityManager.announceToScreenReader(
          `Envoyé : ${transcript}`
        );
      },
      onUtteranceSent: () => {
        void this.messageManager.loadData();
      },
      onError: (message: string) => {
        this.accessibilityManager.announceToScreenReader(message);
      },
    });

    this.speechRecognition.setupButton();

    this.setupKeyboardShortcuts();

    this.accessibilityManager.announceToScreenReader(
      "Interface du mode vocal chargée et prête"
    );
  }

  private setupKeyboardShortcuts(): void {
    const keyboardHandler = this.accessibilityManager.createKeyboardHandler({
      toggleListening: () => {
        this.speechRecognition.toggle();
        this.accessibilityManager.announceToScreenReader(
          this.speechRecognition.isListening
            ? "Voice recognition started"
            : "Voice recognition stopped"
        );
      },
      refresh: () => {
        void this.messageManager.loadData();
      },
      testVoice: () => {
        if (this.speechSynthesis.voiceResponsesToggle?.checked) {
          this.speechSynthesis.speak(
            "This is Voice Mode for Claude Code. How can I help you today?"
          );
        }
      },
      stopListening: () => {
        if (this.speechRecognition.isListening) {
          this.speechRecognition.stop();
        }
      },
    });

    document.addEventListener("keydown", keyboardHandler);
  }

  private debugLog(...args: any[]): void {
    if (this.debug) {
      console.log(...args);
    }
  }

  public destroy(): void {
    this.messageManager.destroy();
    if (this.speechSynthesis.eventSource) {
      this.speechSynthesis.eventSource.close();
    }
  }
}

document.addEventListener("DOMContentLoaded", () => {
  initIcons();
  (window as any).voiceHooksClient = new VoiceHooksClient();
});
