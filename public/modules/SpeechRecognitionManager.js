/**
 * SpeechRecognitionManager - Gestion de la reconnaissance vocale
 * Gère l'écoute, la transcription et l'envoi des messages vocaux
 */
export class SpeechRecognitionManager {
    constructor(baseUrl, callbacks = {}) {
        this.baseUrl = baseUrl;
        this.callbacks = callbacks;

        // Éléments DOM
        this.listenBtn = document.getElementById('listenBtn');
        this.listenBtnText = document.getElementById('listenBtnText');
        this.listeningIndicator = document.getElementById('listeningIndicator');
        this.interimText = document.getElementById('interimText');

        // État
        this.recognition = null;
        this.isListening = false;

        // Initialiser la reconnaissance vocale
        this.initialize();
    }

    /**
     * Initialise la reconnaissance vocale du navigateur
     */
    initialize() {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

        if (!SpeechRecognition) {
            console.error('Speech recognition not supported in this browser');
            this.listenBtn.disabled = true;
            this.listenBtn.setAttribute('aria-disabled', 'true');
            this.listenBtnText.textContent = 'Non Supporté';

            if (this.callbacks.onError) {
                this.callbacks.onError('La reconnaissance vocale n\'est pas supportée par ce navigateur');
            }
            return;
        }

        this.recognition = new SpeechRecognition();
        this.recognition.continuous = true;
        this.recognition.interimResults = true;
        this.recognition.lang = 'fr-FR'; // Langue française par défaut

        // Gestionnaire de résultats
        this.recognition.onresult = (event) => {
            let interimTranscript = '';

            for (let i = event.resultIndex; i < event.results.length; i++) {
                const transcript = event.results[i][0].transcript;

                if (event.results[i].isFinal) {
                    // Résultat final - envoyer le message
                    this.sendVoiceUtterance(transcript);
                    this.interimText.textContent = '';
                    this.interimText.classList.remove('active');

                    if (this.callbacks.onFinalResult) {
                        this.callbacks.onFinalResult(transcript);
                    }
                } else {
                    // Résultat intermédiaire
                    interimTranscript += transcript;
                }
            }

            // Afficher le texte intermédiaire
            if (interimTranscript) {
                this.interimText.textContent = interimTranscript;
                this.interimText.classList.add('active');
            }
        };

        // Gestionnaire d'erreurs
        this.recognition.onerror = (event) => {
            console.error('Speech recognition error:', event.error);

            // Ignorer les erreurs "no-speech" et continuer
            if (event.error === 'no-speech') {
                return;
            }

            let errorMessage = '';
            if (event.error === 'not-allowed') {
                errorMessage = 'Accès au microphone refusé. Veuillez autoriser l\'accès au microphone pour utiliser l\'entrée vocale.';
            } else if (event.error === 'network') {
                errorMessage = 'Erreur réseau. Veuillez vérifier votre connexion internet.';
            } else {
                errorMessage = `Erreur de reconnaissance vocale : ${event.error}`;
            }

            if (this.callbacks.onError) {
                this.callbacks.onError(errorMessage);
            }

            alert(errorMessage);
            this.stop();
        };

        // Gestionnaire de fin
        this.recognition.onend = () => {
            // Redémarrer si toujours en mode écoute
            if (this.isListening) {
                try {
                    this.recognition.start();
                } catch (e) {
                    console.error('Failed to restart recognition:', e);
                    this.stop();
                }
            }
        };
    }

    /**
     * Démarre l'écoute
     */
    async start() {
        if (!this.recognition) {
            const message = 'La reconnaissance vocale n\'est pas supportée par ce navigateur';
            if (this.callbacks.onError) {
                this.callbacks.onError(message);
            }
            alert(message);
            return;
        }

        try {
            this.recognition.start();
            this.isListening = true;

            // Mettre à jour l'interface
            this.listenBtn.classList.add('listening');
            this.listenBtn.setAttribute('aria-pressed', 'true');
            this.listenBtnText.textContent = 'Arrêter l\'Écoute';
            this.listeningIndicator.classList.add('active');

            if (this.callbacks.onStart) {
                this.callbacks.onStart();
            }

            // Notifier le serveur
            await this.updateServerState(true);
        } catch (e) {
            console.error('Failed to start recognition:', e);
            const message = 'Échec du démarrage de la reconnaissance vocale. Veuillez réessayer.';

            if (this.callbacks.onError) {
                this.callbacks.onError(message);
            }
            alert(message);
        }
    }

    /**
     * Arrête l'écoute
     */
    async stop() {
        if (this.recognition) {
            this.isListening = false;
            this.recognition.stop();

            // Mettre à jour l'interface
            this.listenBtn.classList.remove('listening');
            this.listenBtn.setAttribute('aria-pressed', 'false');
            this.listenBtnText.textContent = 'Commencer l\'Écoute';
            this.listeningIndicator.classList.remove('active');
            this.interimText.textContent = '';
            this.interimText.classList.remove('active');

            if (this.callbacks.onStop) {
                this.callbacks.onStop();
            }

            // Notifier le serveur
            await this.updateServerState(false);
        }
    }

    /**
     * Bascule l'état d'écoute
     */
    toggle() {
        if (this.isListening) {
            return this.stop();
        } else {
            return this.start();
        }
    }

    /**
     * Envoie un message vocal au serveur
     */
    async sendVoiceUtterance(text) {
        const trimmedText = text.trim();
        if (!trimmedText) return;

        try {
            const response = await fetch(`${this.baseUrl}/api/potential-utterances`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    text: trimmedText,
                    timestamp: new Date().toISOString()
                }),
            });

            if (response.ok) {
                if (this.callbacks.onUtteranceSent) {
                    this.callbacks.onUtteranceSent(trimmedText);
                }
            } else {
                const error = await response.json();
                console.error('Error sending voice utterance:', error);

                if (this.callbacks.onError) {
                    this.callbacks.onError('Échec de l\'envoi du message');
                }
            }
        } catch (error) {
            console.error('Failed to send voice utterance:', error);

            if (this.callbacks.onError) {
                this.callbacks.onError('Erreur réseau lors de l\'envoi du message');
            }
        }
    }

    /**
     * Met à jour l'état d'entrée vocale sur le serveur
     */
    async updateServerState(active) {
        try {
            await fetch(`${this.baseUrl}/api/voice-input-state`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ active }),
            });
        } catch (error) {
            console.error('Failed to update voice input state:', error);
        }
    }

    /**
     * Configure le bouton d'écoute
     */
    setupButton() {
        this.listenBtn.addEventListener('click', () => this.toggle());
    }
}
