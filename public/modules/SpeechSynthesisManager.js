/**
 * SpeechSynthesisManager - Gestion de la synthèse vocale (TTS)
 * Gère les voix, le débit de parole, et la lecture du texte
 */
export class SpeechSynthesisManager {
    constructor(baseUrl, callbacks = {}) {
        this.baseUrl = baseUrl;
        this.callbacks = callbacks;

        // Éléments DOM
        this.languageSelect = document.getElementById('languageSelect');
        this.voiceSelect = document.getElementById('voiceSelect');
        this.speechRateSlider = document.getElementById('speechRate');
        this.speechRateInput = document.getElementById('speechRateInput');
        this.testTTSBtn = document.getElementById('testTTSBtn');
        this.voiceResponsesToggle = document.getElementById('voiceResponsesToggle');
        this.voiceOptions = document.getElementById('voiceOptions');
        this.localVoicesGroup = document.getElementById('localVoicesGroup');
        this.cloudVoicesGroup = document.getElementById('cloudVoicesGroup');
        this.rateWarning = document.getElementById('rateWarning');
        this.systemVoiceInfo = document.getElementById('systemVoiceInfo');

        // État
        this.voices = [];
        this.selectedVoice = 'system';
        this.speechRate = 1.0;
        this.speechPitch = 1.0;
        this.eventSource = null;

        // Initialiser
        this.initialize();
        this.initializeTTSEvents();
        this.loadPreferences();
        this.setupEventListeners();
    }

    /**
     * Initialise la synthèse vocale du navigateur
     */
    initialize() {
        if (!window.speechSynthesis) {
            console.warn('Speech synthesis not supported in this browser');
            return;
        }

        const loadVoices = () => {
            const voices = window.speechSynthesis.getVoices();

            // Dédupliquer les voix
            const deduplicatedVoices = [];
            const seen = new Set();

            voices.forEach(voice => {
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

    /**
     * Initialise les événements Server-Sent Events pour le TTS
     */
    initializeTTSEvents() {
        this.eventSource = new EventSource(`${this.baseUrl}/api/tts-events`);

        this.eventSource.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);

                if (data.type === 'speak' && data.text) {
                    this.speak(data.text);
                } else if (data.type === 'waitStatus') {
                    this.handleWaitStatus(data.isWaiting);
                }
            } catch (error) {
                console.error('Failed to parse TTS event:', error);
            }
        };

        this.eventSource.onerror = (error) => {
            console.error('SSE connection error:', error);
        };

        this.eventSource.onopen = () => {
            this.syncStateWithServer();
        };
    }

    /**
     * Charge les préférences depuis localStorage
     */
    loadPreferences() {
        // Réponses vocales
        const storedVoiceResponses = localStorage.getItem('voiceResponsesEnabled');
        const voiceResponsesEnabled = storedVoiceResponses !== null
            ? storedVoiceResponses === 'true'
            : true;

        this.voiceResponsesToggle.checked = voiceResponsesEnabled;
        this.voiceResponsesToggle.setAttribute('aria-pressed', voiceResponsesEnabled);

        if (storedVoiceResponses === null) {
            localStorage.setItem('voiceResponsesEnabled', 'true');
        }

        // Débit de parole
        const storedRate = localStorage.getItem('speechRate');
        if (storedRate !== null) {
            this.speechRate = parseFloat(storedRate);
            this.speechRateSlider.value = storedRate;
            this.speechRateSlider.setAttribute('aria-valuenow', this.speechRate);
            this.speechRateInput.value = this.speechRate.toFixed(1);
        }

        // Voix sélectionnée
        this.selectedVoice = localStorage.getItem('selectedVoice') || 'system';

        // Langue
        const savedLanguage = localStorage.getItem('selectedLanguage');
        if (savedLanguage && this.languageSelect) {
            this.languageSelect.value = savedLanguage;
        }

        this.updateVoiceOptionsVisibility();
        this.updateVoicePreferences();
        this.updateVoiceWarnings();
    }

    /**
     * Configure les écouteurs d'événements
     */
    setupEventListeners() {
        // Filtre de langue
        if (this.languageSelect) {
            this.languageSelect.addEventListener('change', () => {
                localStorage.setItem('selectedLanguage', this.languageSelect.value);
                this.populateVoiceList();

                if (this.callbacks.onLanguageChange) {
                    this.callbacks.onLanguageChange(this.languageSelect.value);
                }
            });
        }

        // Sélection de voix
        this.voiceSelect.addEventListener('change', (e) => {
            this.selectedVoice = e.target.value;
            localStorage.setItem('selectedVoice', this.selectedVoice);
            this.updateVoicePreferences();
            this.updateVoiceWarnings();

            if (this.callbacks.onVoiceChange) {
                const selectedOption = this.voiceSelect.options[this.voiceSelect.selectedIndex];
                this.callbacks.onVoiceChange(selectedOption.text);
            }
        });

        // Curseur de débit
        this.speechRateSlider.addEventListener('input', (e) => {
            this.speechRate = parseFloat(e.target.value);
            this.speechRateInput.value = this.speechRate.toFixed(1);
            this.speechRateSlider.setAttribute('aria-valuenow', this.speechRate);
            localStorage.setItem('speechRate', this.speechRate.toString());
        });

        // Champ de saisie de débit
        this.speechRateInput.addEventListener('input', (e) => {
            let value = parseFloat(e.target.value);
            if (!isNaN(value)) {
                value = Math.max(0.5, Math.min(5, value));
                this.speechRate = value;
                this.speechRateSlider.value = value.toString();
                this.speechRateSlider.setAttribute('aria-valuenow', value);
                this.speechRateInput.value = value.toFixed(1);
                localStorage.setItem('speechRate', this.speechRate.toString());
            }
        });

        // Bouton de test
        this.testTTSBtn.addEventListener('click', () => {
            this.speak('Ceci est le mode vocal pour Claude Code. Comment puis-je vous aider aujourd\'hui ?');

            if (this.callbacks.onTest) {
                this.callbacks.onTest();
            }
        });

        // Bascule des réponses vocales
        this.voiceResponsesToggle.addEventListener('change', (e) => {
            const enabled = e.target.checked;
            this.voiceResponsesToggle.setAttribute('aria-pressed', enabled);
            localStorage.setItem('voiceResponsesEnabled', enabled);
            this.updateVoicePreferences();
            this.updateVoiceOptionsVisibility();

            if (this.callbacks.onToggleVoiceResponses) {
                this.callbacks.onToggleVoiceResponses(enabled);
            }
        });
    }

    /**
     * Remplit le filtre de langues
     */
    populateLanguageFilter() {
        if (!this.languageSelect || !this.voices) return;

        const currentSelection = this.languageSelect.value || 'fr-FR';
        this.languageSelect.innerHTML = '';

        const allOption = document.createElement('option');
        allOption.value = 'all';
        allOption.textContent = 'Toutes les Langues';
        this.languageSelect.appendChild(allOption);

        const languageCodes = new Set();
        this.voices.forEach(voice => {
            languageCodes.add(voice.lang);
        });

        Array.from(languageCodes).sort().forEach(lang => {
            const option = document.createElement('option');
            option.value = lang;
            option.textContent = lang;
            this.languageSelect.appendChild(option);
        });

        this.languageSelect.value = currentSelection;
        if (this.languageSelect.value !== currentSelection) {
            this.languageSelect.value = 'fr-FR';
        }
    }

    /**
     * Remplit la liste des voix disponibles
     */
    populateVoiceList() {
        if (!this.voiceSelect || !this.localVoicesGroup || !this.cloudVoicesGroup) return;

        this.populateLanguageFilter();

        this.localVoicesGroup.innerHTML = '';
        this.cloudVoicesGroup.innerHTML = '';

        // Voix exclues (voix noveltés/effets spéciaux)
        const excludedVoices = [
            'Eddy', 'Flo', 'Grandma', 'Grandpa', 'Reed', 'Rocko', 'Sandy', 'Shelley',
            'Albert', 'Bad News', 'Bahh', 'Bells', 'Boing', 'Bubbles', 'Cellos',
            'Good News', 'Jester', 'Organ', 'Superstar', 'Trinoids', 'Whisper',
            'Wobble', 'Zarvox',
            'Fred', 'Junior', 'Kathy', 'Ralph'
        ];

        const selectedLanguage = this.languageSelect ? this.languageSelect.value : 'fr-FR';

        this.voices.forEach((voice, index) => {
            const voiceLang = voice.lang;
            let shouldInclude = false;

            if (selectedLanguage === 'all') {
                shouldInclude = true;
            } else {
                shouldInclude = voiceLang === selectedLanguage;
            }

            if (shouldInclude) {
                const voiceName = voice.name;
                const isExcluded = excludedVoices.some(excluded =>
                    voiceName.toLowerCase().startsWith(excluded.toLowerCase())
                );

                if (!isExcluded) {
                    const option = document.createElement('option');
                    option.value = `browser:${index}`;
                    option.textContent = `${voice.name} (${voice.lang})`;

                    if (voice.localService) {
                        this.localVoicesGroup.appendChild(option);
                    } else {
                        this.cloudVoicesGroup.appendChild(option);
                    }
                }
            }
        });

        // Gérer la visibilité des groupes
        if (this.localVoicesGroup.children.length === 0) {
            this.localVoicesGroup.style.display = 'none';
        } else {
            this.localVoicesGroup.style.display = '';
        }

        if (this.cloudVoicesGroup.children.length === 0) {
            this.cloudVoicesGroup.style.display = 'none';
        } else {
            this.cloudVoicesGroup.style.display = '';
        }

        // Sélectionner la voix sauvegardée ou par défaut
        const savedVoice = localStorage.getItem('selectedVoice');
        if (savedVoice) {
            this.voiceSelect.value = savedVoice;
            this.selectedVoice = savedVoice;
        } else {
            this.selectDefaultFrenchVoice();
        }

        this.updateVoiceWarnings();
    }

    /**
     * Sélectionne une voix française par défaut
     */
    selectDefaultFrenchVoice() {
        let googleFrenchIndex = -1;
        let microsoftFrenchIndex = -1;
        let anyFrenchIndex = -1;

        this.voices.forEach((voice, index) => {
            const voiceName = voice.name.toLowerCase();
            const voiceLang = voice.lang.toLowerCase();

            if (voiceLang.startsWith('fr')) {
                if (anyFrenchIndex === -1) {
                    anyFrenchIndex = index;
                }

                if (voiceName.includes('google') && voiceName.includes('fr')) {
                    googleFrenchIndex = index;
                }

                if (voiceName.includes('microsoft') && (voiceName.includes('france') || voiceName.includes('french'))) {
                    microsoftFrenchIndex = index;
                }
            }
        });

        // Priorité : Google FR > Microsoft FR > N'importe quelle voix FR > Système
        if (googleFrenchIndex !== -1) {
            this.selectedVoice = `browser:${googleFrenchIndex}`;
            this.voiceSelect.value = this.selectedVoice;
        } else if (microsoftFrenchIndex !== -1) {
            this.selectedVoice = `browser:${microsoftFrenchIndex}`;
            this.voiceSelect.value = this.selectedVoice;
        } else if (anyFrenchIndex !== -1) {
            this.selectedVoice = `browser:${anyFrenchIndex}`;
            this.voiceSelect.value = this.selectedVoice;
        } else {
            this.selectedVoice = 'system';
        }
    }

    /**
     * Prononce un texte
     */
    async speak(text) {
        if (this.selectedVoice === 'system') {
            // Utiliser la voix système via l'API du serveur
            try {
                const response = await fetch(`${this.baseUrl}/api/speak-system`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        text: text,
                        rate: Math.round(this.speechRate * 150)
                    }),
                });

                if (!response.ok) {
                    const error = await response.json();
                    console.error('Failed to speak via system voice:', error);
                }
            } catch (error) {
                console.error('Failed to call speak-system API:', error);
            }
        } else {
            // Utiliser la synthèse vocale du navigateur
            if (!window.speechSynthesis) {
                console.error('Speech synthesis not available');
                return;
            }

            window.speechSynthesis.cancel();

            const utterance = new SpeechSynthesisUtterance(text);

            if (this.selectedVoice && this.selectedVoice.startsWith('browser:')) {
                const voiceIndex = parseInt(this.selectedVoice.substring(8));
                if (this.voices[voiceIndex]) {
                    utterance.voice = this.voices[voiceIndex];
                }
            }

            utterance.rate = this.speechRate;
            utterance.pitch = this.speechPitch;

            utterance.onerror = (event) => {
                console.error('Speech synthesis error:', event);
            };

            window.speechSynthesis.speak(utterance);
        }
    }

    /**
     * Met à jour la visibilité des options vocales
     */
    updateVoiceOptionsVisibility() {
        const voiceResponsesEnabled = this.voiceResponsesToggle.checked;
        if (voiceResponsesEnabled) {
            this.voiceOptions.classList.remove('hidden');
        } else {
            this.voiceOptions.classList.add('hidden');
        }
    }

    /**
     * Met à jour les préférences vocales sur le serveur
     */
    async updateVoicePreferences() {
        const voiceResponsesEnabled = this.voiceResponsesToggle.checked;

        try {
            await fetch(`${this.baseUrl}/api/voice-preferences`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    voiceResponsesEnabled
                }),
            });
        } catch (error) {
            console.error('Failed to update voice preferences:', error);
        }
    }

    /**
     * Synchronise l'état avec le serveur
     */
    async syncStateWithServer() {
        await this.updateVoicePreferences();
    }

    /**
     * Met à jour les avertissements selon la voix sélectionnée
     */
    updateVoiceWarnings() {
        if (this.selectedVoice === 'system') {
            this.systemVoiceInfo.classList.remove('hidden');
            this.rateWarning.classList.add('hidden');
        } else if (this.selectedVoice && this.selectedVoice.startsWith('browser:')) {
            const voiceIndex = parseInt(this.selectedVoice.substring(8));
            const voice = this.voices[voiceIndex];

            if (voice) {
                const isGoogleVoice = voice.name.toLowerCase().includes('google');
                const isLocalVoice = voice.localService === true;

                if (isGoogleVoice) {
                    this.rateWarning.classList.remove('hidden');
                } else {
                    this.rateWarning.classList.add('hidden');
                }

                if (isLocalVoice) {
                    this.systemVoiceInfo.classList.remove('hidden');
                } else {
                    this.systemVoiceInfo.classList.add('hidden');
                }
            } else {
                this.rateWarning.classList.add('hidden');
                this.systemVoiceInfo.classList.add('hidden');
            }
        } else {
            this.rateWarning.classList.add('hidden');
            this.systemVoiceInfo.classList.add('hidden');
        }
    }

    /**
     * Gère le statut d'attente de Claude
     */
    handleWaitStatus(isWaiting) {
        const listeningIndicator = document.getElementById('listeningIndicator');
        const listeningIndicatorText = listeningIndicator?.querySelector('span');

        if (listeningIndicatorText) {
            if (isWaiting) {
                listeningIndicatorText.textContent = 'Claude est en pause et attend votre entrée vocale';

                if (this.callbacks.onWaitStatusChange) {
                    this.callbacks.onWaitStatusChange(true);
                }
            } else {
                listeningIndicatorText.textContent = 'À l\'écoute de votre voix...';

                if (this.callbacks.onWaitStatusChange) {
                    this.callbacks.onWaitStatusChange(false);
                }
            }
        }
    }
}
