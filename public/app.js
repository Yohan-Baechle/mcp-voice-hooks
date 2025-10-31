/**
 * Voice Hooks Client - Accessible UI
 * Enhanced with full ARIA support, keyboard navigation, and accessibility features
 * Refactored into modular components
 */

import { AccessibilityManager } from './modules/AccessibilityManager.js';
import { SpeechRecognitionManager } from './modules/SpeechRecognitionManager.js';
import { SpeechSynthesisManager } from './modules/SpeechSynthesisManager.js';
import { MessageManager } from './modules/MessageManager.js';

class VoiceHooksClient {
    constructor() {
        this.baseUrl = window.location.origin;
        this.debug = localStorage.getItem('voiceHooksDebug') === 'true';

        // Initialiser le gestionnaire d'accessibilité
        this.accessibilityManager = new AccessibilityManager();

        // Initialiser le gestionnaire de messages
        this.messageManager = new MessageManager(this.baseUrl, {
            onRefresh: () => {
                this.accessibilityManager.announceToScreenReader('Actualisation des messages');
            },
            onClearStart: () => {
                this.accessibilityManager.announceToScreenReader('Effacement de tous les messages');
            },
            onClearSuccess: () => {
                this.accessibilityManager.announceToScreenReader('Tous les messages ont été effacés');
                this.debugLog('Cleared all utterances');
            },
            onError: (message) => {
                this.accessibilityManager.announceToScreenReader(message);
            }
        });

        // Initialiser le gestionnaire de reconnaissance vocale
        this.speechRecognition = new SpeechRecognitionManager(this.baseUrl, {
            onStart: () => {
                this.debugLog('Started listening');
                this.accessibilityManager.announceToScreenReader('Reconnaissance vocale démarrée. Parlez maintenant.');
            },
            onStop: () => {
                this.debugLog('Stopped listening');
                this.accessibilityManager.announceToScreenReader('Reconnaissance vocale arrêtée');
            },
            onFinalResult: (transcript) => {
                this.accessibilityManager.announceToScreenReader(`Envoyé : ${transcript}`);
            },
            onUtteranceSent: () => {
                this.messageManager.loadData();
            },
            onError: (message) => {
                this.accessibilityManager.announceToScreenReader(message);
            }
        });

        // Configurer le bouton d'écoute
        this.speechRecognition.setupButton();

        // Initialiser le gestionnaire de synthèse vocale
        this.speechSynthesis = new SpeechSynthesisManager(this.baseUrl, {
            onLanguageChange: (language) => {
                this.accessibilityManager.announceToScreenReader(`Langue changée en ${language}`);
            },
            onVoiceChange: (voiceName) => {
                this.accessibilityManager.announceToScreenReader(`Voix changée en ${voiceName}`);
            },
            onTest: () => {
                this.accessibilityManager.announceToScreenReader('Test de la voix');
            },
            onToggleVoiceResponses: (enabled) => {
                this.accessibilityManager.announceToScreenReader(`Réponses vocales ${enabled ? 'activées' : 'désactivées'}`);
            },
            onWaitStatusChange: (isWaiting) => {
                if (isWaiting) {
                    this.debugLog('Claude is waiting for voice input');
                    this.accessibilityManager.announceToScreenReader('Claude attend votre entrée vocale');
                } else {
                    this.debugLog('Claude finished waiting');
                }
            }
        });

        // Configurer les raccourcis clavier
        this.setupKeyboardShortcuts();

        // Annoncer que l'interface est prête
        this.accessibilityManager.announceToScreenReader('Interface du mode vocal chargée et prête');
    }

    /**
     * Configure les raccourcis clavier globaux
     */
    setupKeyboardShortcuts() {
        const keyboardHandler = this.accessibilityManager.createKeyboardHandler({
            toggleListening: () => {
                this.speechRecognition.toggle();
                this.accessibilityManager.announceToScreenReader(
                    this.speechRecognition.isListening ? 'Voice recognition started' : 'Voice recognition stopped'
                );
            },
            refresh: () => {
                this.messageManager.loadData();
            },
            testVoice: () => {
                if (this.speechSynthesis.voiceResponsesToggle.checked) {
                    this.speechSynthesis.speak('This is Voice Mode for Claude Code. How can I help you today?');
                }
            },
            stopListening: () => {
                if (this.speechRecognition.isListening) {
                    this.speechRecognition.stop();
                }
            }
        });

        document.addEventListener('keydown', keyboardHandler);
    }

    /**
     * Log de débogage conditionnel
     */
    debugLog(...args) {
        if (this.debug) {
            console.log(...args);
        }
    }

    /**
     * Nettoie les ressources lors de la destruction
     */
    destroy() {
        this.messageManager.destroy();
        if (this.speechSynthesis.eventSource) {
            this.speechSynthesis.eventSource.close();
        }
    }
}

// Initialiser le client quand la page est chargée
document.addEventListener('DOMContentLoaded', () => {
    window.voiceHooksClient = new VoiceHooksClient();
});
