/**
 * Voice Hooks Client - Accessible UI
 * Enhanced with full ARIA support, keyboard navigation, and accessibility features
 */

class VoiceHooksClient {
    constructor() {
        this.baseUrl = window.location.origin;
        this.debug = localStorage.getItem('voiceHooksDebug') === 'true';

        // Core UI Elements
        this.refreshBtn = document.getElementById('refreshBtn');
        this.clearAllBtn = document.getElementById('clearAllBtn');
        this.utterancesList = document.getElementById('utterancesList');
        this.infoMessage = document.getElementById('infoMessage');

        // Voice controls
        this.listenBtn = document.getElementById('listenBtn');
        this.listenBtnText = document.getElementById('listenBtnText');
        this.listeningIndicator = document.getElementById('listeningIndicator');
        this.interimText = document.getElementById('interimText');

        // Accessibility controls
        this.themeSelect = document.getElementById('theme-select');
        this.fontSizeSelect = document.getElementById('font-size-select');
        this.contrastToggle = document.getElementById('contrast-toggle');

        // Speech recognition
        this.recognition = null;
        this.isListening = false;
        this.initializeSpeechRecognition();

        // Speech synthesis
        this.initializeSpeechSynthesis();

        // Server-Sent Events for TTS
        this.initializeTTSEvents();

        // TTS controls
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

        // Load saved preferences
        this.loadPreferences();
        this.loadAccessibilityPreferences();

        // Setup event listeners
        this.setupEventListeners();
        this.setupAccessibilityListeners();
        this.setupKeyboardShortcuts();

        // Load initial data
        this.loadData();

        // Auto-refresh every 2 seconds
        setInterval(() => this.loadData(), 2000);

        // Announce page ready to screen readers
        this.announceToScreenReader('Interface du mode vocal chargée et prête');
    }

    /* ==========================================
       ACCESSIBILITY FEATURES
       ========================================== */

    loadAccessibilityPreferences() {
        // Load theme preference
        const savedTheme = localStorage.getItem('theme') || 'auto';
        this.themeSelect.value = savedTheme;
        this.applyTheme(savedTheme);

        // Load font size preference
        const savedFontSize = localStorage.getItem('fontSize') || 'medium';
        this.fontSizeSelect.value = savedFontSize;
        this.applyFontSize(savedFontSize);

        // Load contrast preference
        const savedContrast = localStorage.getItem('highContrast') === 'true';
        this.contrastToggle.checked = savedContrast;
        this.applyContrast(savedContrast);
    }

    setupAccessibilityListeners() {
        // Theme selector
        this.themeSelect.addEventListener('change', (e) => {
            const theme = e.target.value;
            const themeNames = {
                'light': 'clair',
                'dark': 'sombre',
                'auto': 'automatique'
            };
            localStorage.setItem('theme', theme);
            this.applyTheme(theme);
            this.announceToScreenReader(`Thème changé en mode ${themeNames[theme] || theme}`);
        });

        // Font size selector
        this.fontSizeSelect.addEventListener('change', (e) => {
            const size = e.target.value;
            const sizeNames = {
                'small': 'petit',
                'medium': 'moyen',
                'large': 'grand',
                'xlarge': 'très grand'
            };
            localStorage.setItem('fontSize', size);
            this.applyFontSize(size);
            this.announceToScreenReader(`Taille du texte changée en ${sizeNames[size] || size}`);
        });

        // Contrast toggle
        this.contrastToggle.addEventListener('change', (e) => {
            const enabled = e.target.checked;
            localStorage.setItem('highContrast', enabled);
            this.applyContrast(enabled);
            this.announceToScreenReader(`Contraste élevé ${enabled ? 'activé' : 'désactivé'}`);
        });
    }

    applyTheme(theme) {
        const body = document.body;

        if (theme === 'auto') {
            // Use system preference
            const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            body.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
        } else {
            body.setAttribute('data-theme', theme);
        }
    }

    applyFontSize(size) {
        const html = document.documentElement;
        html.className = html.className.replace(/font-size-\w+/g, '');
        html.classList.add(`font-size-${size}`);
    }

    applyContrast(enabled) {
        const body = document.body;
        if (enabled) {
            body.setAttribute('data-contrast', 'high');
        } else {
            body.removeAttribute('data-contrast');
        }
    }

    setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            // Ctrl/Cmd + L: Toggle listening
            if ((e.ctrlKey || e.metaKey) && e.key === 'l') {
                e.preventDefault();
                this.toggleListening();
                this.announceToScreenReader(
                    this.isListening ? 'Voice recognition started' : 'Voice recognition stopped'
                );
            }

            // Ctrl/Cmd + R: Refresh utterances
            if ((e.ctrlKey || e.metaKey) && e.key === 'r') {
                e.preventDefault();
                this.loadData();
                this.announceToScreenReader('Utterances refreshed');
            }

            // Ctrl/Cmd + T: Test voice
            if ((e.ctrlKey || e.metaKey) && e.key === 't') {
                e.preventDefault();
                if (this.voiceResponsesToggle.checked) {
                    this.speakText('This is Voice Mode for Claude Code. How can I help you today?');
                    this.announceToScreenReader('Testing voice output');
                }
            }

            // Escape: Stop listening
            if (e.key === 'Escape' && this.isListening) {
                this.stopListening();
                this.announceToScreenReader('Voice recognition stopped');
            }
        });

        // Listen for system theme changes
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
            if (this.themeSelect.value === 'auto') {
                this.applyTheme('auto');
                this.announceToScreenReader(`Thème automatiquement changé en mode ${e.matches ? 'sombre' : 'clair'}`);
            }
        });
    }

    announceToScreenReader(message) {
        // Create a live region announcement
        const announcement = document.createElement('div');
        announcement.setAttribute('role', 'status');
        announcement.setAttribute('aria-live', 'polite');
        announcement.setAttribute('aria-atomic', 'true');
        announcement.className = 'sr-only';
        announcement.style.position = 'absolute';
        announcement.style.left = '-10000px';
        announcement.style.width = '1px';
        announcement.style.height = '1px';
        announcement.style.overflow = 'hidden';
        announcement.textContent = message;

        document.body.appendChild(announcement);

        // Remove after announcement
        setTimeout(() => {
            document.body.removeChild(announcement);
        }, 1000);
    }

    /* ==========================================
       SPEECH RECOGNITION
       ========================================== */

    initializeSpeechRecognition() {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

        if (!SpeechRecognition) {
            console.error('Speech recognition not supported in this browser');
            this.listenBtn.disabled = true;
            this.listenBtn.setAttribute('aria-disabled', 'true');
            this.listenBtnText.textContent = 'Non Supporté';
            this.announceToScreenReader('La reconnaissance vocale n\'est pas supportée par ce navigateur');
            return;
        }

        this.recognition = new SpeechRecognition();
        this.recognition.continuous = true;
        this.recognition.interimResults = true;
        this.recognition.lang = 'fr-FR'; // Définir le français comme langue par défaut

        this.recognition.onresult = (event) => {
            let interimTranscript = '';

            for (let i = event.resultIndex; i < event.results.length; i++) {
                const transcript = event.results[i][0].transcript;

                if (event.results[i].isFinal) {
                    this.sendVoiceUtterance(transcript);
                    this.interimText.textContent = '';
                    this.interimText.classList.remove('active');
                    this.announceToScreenReader(`Envoyé : ${transcript}`);
                } else {
                    interimTranscript += transcript;
                }
            }

            if (interimTranscript) {
                this.interimText.textContent = interimTranscript;
                this.interimText.classList.add('active');
            }
        };

        this.recognition.onerror = (event) => {
            console.error('Speech recognition error:', event.error);

            if (event.error === 'no-speech') {
                return; // Continue listening
            }

            let errorMessage = '';
            if (event.error === 'not-allowed') {
                errorMessage = 'Accès au microphone refusé. Veuillez autoriser l\'accès au microphone pour utiliser l\'entrée vocale.';
            } else if (event.error === 'network') {
                errorMessage = 'Erreur réseau. Veuillez vérifier votre connexion internet.';
            } else {
                errorMessage = `Erreur de reconnaissance vocale : ${event.error}`;
            }

            this.announceToScreenReader(errorMessage);
            alert(errorMessage);
            this.stopListening();
        };

        this.recognition.onend = () => {
            if (this.isListening) {
                try {
                    this.recognition.start();
                } catch (e) {
                    console.error('Failed to restart recognition:', e);
                    this.stopListening();
                }
            }
        };
    }

    /* ==========================================
       EVENT LISTENERS
       ========================================== */

    setupEventListeners() {
        this.refreshBtn.addEventListener('click', () => {
            this.loadData();
            this.announceToScreenReader('Actualisation des messages');
        });

        this.clearAllBtn.addEventListener('click', () => this.clearAllUtterances());

        this.listenBtn.addEventListener('click', () => this.toggleListening());

        // Language filter
        if (this.languageSelect) {
            this.languageSelect.addEventListener('change', () => {
                localStorage.setItem('selectedLanguage', this.languageSelect.value);
                this.populateVoiceList();
                this.announceToScreenReader(`Langue changée en ${this.languageSelect.value}`);
            });
        }

        // TTS controls
        this.voiceSelect.addEventListener('change', (e) => {
            this.selectedVoice = e.target.value;
            localStorage.setItem('selectedVoice', this.selectedVoice);
            this.updateVoicePreferences();
            this.updateVoiceWarnings();

            const selectedOption = this.voiceSelect.options[this.voiceSelect.selectedIndex];
            this.announceToScreenReader(`Voix changée en ${selectedOption.text}`);
        });

        this.speechRateSlider.addEventListener('input', (e) => {
            this.speechRate = parseFloat(e.target.value);
            this.speechRateInput.value = this.speechRate.toFixed(1);
            this.speechRateSlider.setAttribute('aria-valuenow', this.speechRate);
            localStorage.setItem('speechRate', this.speechRate.toString());
        });

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

        this.testTTSBtn.addEventListener('click', () => {
            this.speakText('Ceci est le mode vocal pour Claude Code. Comment puis-je vous aider aujourd\'hui ?');
            this.announceToScreenReader('Test de la voix');
        });

        this.voiceResponsesToggle.addEventListener('change', (e) => {
            const enabled = e.target.checked;
            this.voiceResponsesToggle.setAttribute('aria-pressed', enabled);
            localStorage.setItem('voiceResponsesEnabled', enabled);
            this.updateVoicePreferences();
            this.updateVoiceOptionsVisibility();
            this.announceToScreenReader(`Réponses vocales ${enabled ? 'activées' : 'désactivées'}`);
        });
    }

    /* ==========================================
       DATA LOADING
       ========================================== */

    async loadData() {
        try {
            const utterancesResponse = await fetch(`${this.baseUrl}/api/utterances?limit=20`);
            if (utterancesResponse.ok) {
                const data = await utterancesResponse.json();
                this.updateUtterancesList(data.utterances);
            }
        } catch (error) {
            console.error('Failed to load data:', error);
            this.announceToScreenReader('Échec du chargement des messages');
        }
    }

    updateUtterancesList(utterances) {
        if (utterances.length === 0) {
            this.utterancesList.innerHTML = '<div class="empty-state">Aucun message pour le moment.</div>';
            this.infoMessage.classList.add('hidden');
            return;
        }

        const allPending = utterances.every(u => u.status === 'pending');
        if (allPending) {
            this.infoMessage.classList.remove('hidden');
        } else {
            this.infoMessage.classList.add('hidden');
        }

        const statusLabels = {
            'pending': 'EN ATTENTE',
            'delivered': 'LIVRÉ'
        };

        this.utterancesList.innerHTML = utterances.map((utterance, index) => `
            <div class="utterance-item" tabindex="0" role="article" aria-label="Message ${index + 1}">
                <div class="utterance-content">
                    <div class="utterance-text">${this.escapeHtml(utterance.text)}</div>
                    <div class="utterance-meta">
                        <time class="utterance-time" datetime="${utterance.timestamp}">
                            ${this.formatTimestamp(utterance.timestamp)}
                        </time>
                        <span class="utterance-status status-${utterance.status}"
                              role="status"
                              aria-label="Statut : ${statusLabels[utterance.status] || utterance.status}">
                            ${statusLabels[utterance.status] || utterance.status.toUpperCase()}
                        </span>
                    </div>
                </div>
            </div>
        `).join('');
    }

    formatTimestamp(timestamp) {
        const date = new Date(timestamp);
        return date.toLocaleTimeString();
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /* ==========================================
       VOICE CONTROLS
       ========================================== */

    toggleListening() {
        if (this.isListening) {
            this.stopListening();
        } else {
            this.startListening();
        }
    }

    async startListening() {
        if (!this.recognition) {
            const message = 'La reconnaissance vocale n\'est pas supportée par ce navigateur';
            this.announceToScreenReader(message);
            alert(message);
            return;
        }

        try {
            this.recognition.start();
            this.isListening = true;
            this.listenBtn.classList.add('listening');
            this.listenBtn.setAttribute('aria-pressed', 'true');
            this.listenBtnText.textContent = 'Arrêter l\'Écoute';
            this.listeningIndicator.classList.add('active');
            this.debugLog('Started listening');
            this.announceToScreenReader('Reconnaissance vocale démarrée. Parlez maintenant.');

            await this.updateVoiceInputState(true);
        } catch (e) {
            console.error('Failed to start recognition:', e);
            const message = 'Échec du démarrage de la reconnaissance vocale. Veuillez réessayer.';
            this.announceToScreenReader(message);
            alert(message);
        }
    }

    async stopListening() {
        if (this.recognition) {
            this.isListening = false;
            this.recognition.stop();
            this.listenBtn.classList.remove('listening');
            this.listenBtn.setAttribute('aria-pressed', 'false');
            this.listenBtnText.textContent = 'Commencer l\'Écoute';
            this.listeningIndicator.classList.remove('active');
            this.interimText.textContent = '';
            this.interimText.classList.remove('active');
            this.debugLog('Stopped listening');
            this.announceToScreenReader('Reconnaissance vocale arrêtée');

            await this.updateVoiceInputState(false);
        }
    }

    async sendVoiceUtterance(text) {
        const trimmedText = text.trim();
        if (!trimmedText) return;

        this.debugLog('Sending voice utterance:', trimmedText);

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
                this.loadData();
            } else {
                const error = await response.json();
                console.error('Error sending voice utterance:', error);
                this.announceToScreenReader('Échec de l\'envoi du message');
            }
        } catch (error) {
            console.error('Failed to send voice utterance:', error);
            this.announceToScreenReader('Erreur réseau lors de l\'envoi du message');
        }
    }

    async clearAllUtterances() {
        this.clearAllBtn.disabled = true;
        this.clearAllBtn.setAttribute('aria-busy', 'true');
        this.clearAllBtn.textContent = 'Effacement...';
        this.announceToScreenReader('Effacement de tous les messages');

        try {
            const response = await fetch(`${this.baseUrl}/api/utterances`, {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                }
            });

            if (response.ok) {
                const result = await response.json();
                this.loadData();
                this.debugLog('Cleared all utterances:', result);
                this.announceToScreenReader('Tous les messages ont été effacés');
            } else {
                const error = await response.json();
                const message = `Erreur : ${error.error || 'Échec de l\'effacement des messages'}`;
                alert(message);
                this.announceToScreenReader(message);
            }
        } catch (error) {
            console.error('Failed to clear utterances:', error);
            const message = 'Échec de l\'effacement des messages. Assurez-vous que le serveur est en cours d\'exécution.';
            alert(message);
            this.announceToScreenReader(message);
        } finally {
            this.clearAllBtn.disabled = false;
            this.clearAllBtn.setAttribute('aria-busy', 'false');
            this.clearAllBtn.textContent = 'Tout Effacer';
        }
    }

    /* ==========================================
       SPEECH SYNTHESIS
       ========================================== */

    initializeSpeechSynthesis() {
        if (!window.speechSynthesis) {
            console.warn('Speech synthesis not supported in this browser');
            return;
        }

        this.voices = [];

        const loadVoices = () => {
            const voices = window.speechSynthesis.getVoices();

            // Deduplicate voices
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

        this.speechRate = 1.0;
        this.speechPitch = 1.0;
        this.selectedVoice = 'system';
    }

    initializeTTSEvents() {
        this.eventSource = new EventSource(`${this.baseUrl}/api/tts-events`);

        this.eventSource.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                this.debugLog('TTS Event:', data);

                if (data.type === 'speak' && data.text) {
                    this.speakText(data.text);
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
            this.debugLog('TTS Events connected');
            this.syncStateWithServer();
        };
    }

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
            // Défaut au français si la sélection sauvegardée n'est pas disponible
            this.languageSelect.value = 'fr-FR';
        }
    }

    populateVoiceList() {
        if (!this.voiceSelect || !this.localVoicesGroup || !this.cloudVoicesGroup) return;

        this.populateLanguageFilter();

        this.localVoicesGroup.innerHTML = '';
        this.cloudVoicesGroup.innerHTML = '';

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
                        this.debugLog(voice.voiceURI);
                    } else {
                        this.cloudVoicesGroup.appendChild(option);
                    }
                }
            }
        });

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

        const savedVoice = localStorage.getItem('selectedVoice');
        if (savedVoice) {
            this.voiceSelect.value = savedVoice;
            this.selectedVoice = savedVoice;
        } else {
            // Chercher des voix françaises en priorité
            let googleFrenchIndex = -1;
            let microsoftFrenchIndex = -1;
            let anyFrenchIndex = -1;

            this.voices.forEach((voice, index) => {
                const voiceName = voice.name.toLowerCase();
                const voiceLang = voice.lang.toLowerCase();

                // Chercher les voix françaises
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
                this.debugLog('Voix par défaut : Google Français');
            } else if (microsoftFrenchIndex !== -1) {
                this.selectedVoice = `browser:${microsoftFrenchIndex}`;
                this.voiceSelect.value = this.selectedVoice;
                this.debugLog('Voix par défaut : Microsoft Français');
            } else if (anyFrenchIndex !== -1) {
                this.selectedVoice = `browser:${anyFrenchIndex}`;
                this.voiceSelect.value = this.selectedVoice;
                this.debugLog('Voix par défaut : Première voix française trouvée');
            } else {
                this.selectedVoice = 'system';
                this.debugLog('Aucune voix française trouvée, utilisation de la voix système');
            }
        }

        this.updateVoiceWarnings();
    }

    async speakText(text) {
        if (this.selectedVoice === 'system') {
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

            utterance.onstart = () => {
                this.debugLog('Started speaking:', text);
            };

            utterance.onend = () => {
                this.debugLog('Finished speaking');
            };

            utterance.onerror = (event) => {
                console.error('Speech synthesis error:', event);
            };

            window.speechSynthesis.speak(utterance);
        }
    }

    /* ==========================================
       PREFERENCES & STATE MANAGEMENT
       ========================================== */

    loadPreferences() {
        const storedVoiceResponses = localStorage.getItem('voiceResponsesEnabled');
        const voiceResponsesEnabled = storedVoiceResponses !== null
            ? storedVoiceResponses === 'true'
            : true;

        this.voiceResponsesToggle.checked = voiceResponsesEnabled;
        this.voiceResponsesToggle.setAttribute('aria-pressed', voiceResponsesEnabled);

        if (storedVoiceResponses === null) {
            localStorage.setItem('voiceResponsesEnabled', 'true');
        }

        const storedRate = localStorage.getItem('speechRate');
        if (storedRate !== null) {
            this.speechRate = parseFloat(storedRate);
            this.speechRateSlider.value = storedRate;
            this.speechRateSlider.setAttribute('aria-valuenow', this.speechRate);
            this.speechRateInput.value = this.speechRate.toFixed(1);
        }

        this.selectedVoice = localStorage.getItem('selectedVoice') || 'system';

        const savedLanguage = localStorage.getItem('selectedLanguage');
        if (savedLanguage && this.languageSelect) {
            this.languageSelect.value = savedLanguage;
        }

        this.updateVoiceOptionsVisibility();
        this.updateVoicePreferences();
        this.updateVoiceWarnings();
    }

    updateVoiceOptionsVisibility() {
        const voiceResponsesEnabled = this.voiceResponsesToggle.checked;
        if (voiceResponsesEnabled) {
            this.voiceOptions.classList.remove('hidden');
        } else {
            this.voiceOptions.classList.add('hidden');
        }
    }

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

            this.debugLog('Voice preferences updated:', { voiceResponsesEnabled });
        } catch (error) {
            console.error('Failed to update voice preferences:', error);
        }
    }

    async updateVoiceInputState(active) {
        try {
            await fetch(`${this.baseUrl}/api/voice-input-state`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ active }),
            });

            this.debugLog('Voice input state updated:', { active });
        } catch (error) {
            console.error('Failed to update voice input state:', error);
        }
    }

    async syncStateWithServer() {
        this.debugLog('Syncing state with server after reconnection');
        await this.updateVoicePreferences();

        if (this.isListening) {
            await this.updateVoiceInputState(true);
        }
    }

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

    handleWaitStatus(isWaiting) {
        const listeningIndicatorText = this.listeningIndicator.querySelector('span');

        if (isWaiting) {
            listeningIndicatorText.textContent = 'Claude est en pause et attend votre entrée vocale';
            this.debugLog('Claude is waiting for voice input');
            this.announceToScreenReader('Claude attend votre entrée vocale');
        } else {
            listeningIndicatorText.textContent = 'À l\'écoute de votre voix...';
            this.debugLog('Claude finished waiting');
        }
    }

    debugLog(...args) {
        if (this.debug) {
            console.log(...args);
        }
    }
}

// Initialize the client when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new VoiceHooksClient();
});
