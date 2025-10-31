/**
 * AccessibilityManager - Gestion des fonctionnalités d'accessibilité
 * Gère les thèmes, tailles de police, contraste élevé, raccourcis clavier et annonces vocales
 */
export class AccessibilityManager {
    constructor() {
        // Éléments DOM
        this.themeSelect = document.getElementById('theme-select');
        this.fontSizeSelect = document.getElementById('font-size-select');
        this.contrastToggle = document.getElementById('contrast-toggle');

        // Charger les préférences sauvegardées
        this.loadPreferences();

        // Configurer les écouteurs d'événements
        this.setupListeners();

        // Écouter les changements de thème système
        this.setupSystemThemeListener();
    }

    /**
     * Charge les préférences d'accessibilité depuis localStorage
     */
    loadPreferences() {
        // Charger le thème
        const savedTheme = localStorage.getItem('theme') || 'auto';
        this.themeSelect.value = savedTheme;
        this.applyTheme(savedTheme);

        // Charger la taille de police
        const savedFontSize = localStorage.getItem('fontSize') || 'medium';
        this.fontSizeSelect.value = savedFontSize;
        this.applyFontSize(savedFontSize);

        // Charger le contraste
        const savedContrast = localStorage.getItem('highContrast') === 'true';
        this.contrastToggle.checked = savedContrast;
        this.applyContrast(savedContrast);
    }

    /**
     * Configure les écouteurs d'événements pour les contrôles d'accessibilité
     */
    setupListeners() {
        // Sélecteur de thème
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

        // Sélecteur de taille de police
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

        // Bouton de contraste
        this.contrastToggle.addEventListener('change', (e) => {
            const enabled = e.target.checked;
            localStorage.setItem('highContrast', enabled);
            this.applyContrast(enabled);
            this.announceToScreenReader(`Contraste élevé ${enabled ? 'activé' : 'désactivé'}`);
        });
    }

    /**
     * Applique un thème (clair, sombre ou auto)
     */
    applyTheme(theme) {
        const body = document.body;

        if (theme === 'auto') {
            // Utiliser la préférence système
            const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            body.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
        } else {
            body.setAttribute('data-theme', theme);
        }
    }

    /**
     * Applique une taille de police
     */
    applyFontSize(size) {
        const html = document.documentElement;
        html.className = html.className.replace(/font-size-\w+/g, '');
        html.classList.add(`font-size-${size}`);
    }

    /**
     * Applique ou désactive le mode contraste élevé
     */
    applyContrast(enabled) {
        const body = document.body;
        if (enabled) {
            body.setAttribute('data-contrast', 'high');
        } else {
            body.removeAttribute('data-contrast');
        }
    }

    /**
     * Configure l'écouteur pour les changements de thème système
     */
    setupSystemThemeListener() {
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
            if (this.themeSelect.value === 'auto') {
                this.applyTheme('auto');
                this.announceToScreenReader(`Thème automatiquement changé en mode ${e.matches ? 'sombre' : 'clair'}`);
            }
        });
    }

    /**
     * Annonce un message aux lecteurs d'écran
     */
    announceToScreenReader(message) {
        // Créer une région live pour l'annonce
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

        // Supprimer après l'annonce
        setTimeout(() => {
            document.body.removeChild(announcement);
        }, 1000);
    }

    /**
     * Configure les raccourcis clavier d'accessibilité
     * Retourne une fonction à appeler lors des événements keydown
     */
    createKeyboardHandler(callbacks) {
        return (e) => {
            // Ctrl/Cmd + L: Basculer l'écoute
            if ((e.ctrlKey || e.metaKey) && e.key === 'l') {
                e.preventDefault();
                if (callbacks.toggleListening) {
                    callbacks.toggleListening();
                }
            }

            // Ctrl/Cmd + R: Actualiser les messages
            if ((e.ctrlKey || e.metaKey) && e.key === 'r') {
                e.preventDefault();
                if (callbacks.refresh) {
                    callbacks.refresh();
                    this.announceToScreenReader('Utterances refreshed');
                }
            }

            // Ctrl/Cmd + T: Tester la voix
            if ((e.ctrlKey || e.metaKey) && e.key === 't') {
                e.preventDefault();
                if (callbacks.testVoice) {
                    callbacks.testVoice();
                    this.announceToScreenReader('Testing voice output');
                }
            }

            // Échap: Arrêter l'écoute
            if (e.key === 'Escape' && callbacks.stopListening) {
                callbacks.stopListening();
                this.announceToScreenReader('Voice recognition stopped');
            }
        };
    }
}
