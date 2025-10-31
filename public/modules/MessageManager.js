/**
 * MessageManager - Gestion de l'affichage et des opérations sur les messages
 * Gère le chargement, l'affichage et la suppression des messages vocaux
 */
export class MessageManager {
    constructor(baseUrl, callbacks = {}) {
        this.baseUrl = baseUrl;
        this.callbacks = callbacks;

        // Éléments DOM
        this.refreshBtn = document.getElementById('refreshBtn');
        this.clearAllBtn = document.getElementById('clearAllBtn');
        this.utterancesList = document.getElementById('utterancesList');
        this.infoMessage = document.getElementById('infoMessage');

        // Configuration du rafraîchissement automatique
        this.autoRefreshInterval = null;
        this.setupEventListeners();
        this.startAutoRefresh(2000); // 2 secondes
    }

    /**
     * Configure les écouteurs d'événements
     */
    setupEventListeners() {
        this.refreshBtn.addEventListener('click', () => {
            this.loadData();

            if (this.callbacks.onRefresh) {
                this.callbacks.onRefresh();
            }
        });

        this.clearAllBtn.addEventListener('click', () => this.clearAll());
    }

    /**
     * Démarre le rafraîchissement automatique
     */
    startAutoRefresh(interval) {
        // Charger les données initiales
        this.loadData();

        // Configurer le rafraîchissement automatique
        if (this.autoRefreshInterval) {
            clearInterval(this.autoRefreshInterval);
        }

        this.autoRefreshInterval = setInterval(() => this.loadData(), interval);
    }

    /**
     * Arrête le rafraîchissement automatique
     */
    stopAutoRefresh() {
        if (this.autoRefreshInterval) {
            clearInterval(this.autoRefreshInterval);
            this.autoRefreshInterval = null;
        }
    }

    /**
     * Charge les données depuis le serveur
     */
    async loadData() {
        try {
            const utterancesResponse = await fetch(`${this.baseUrl}/api/utterances?limit=20`);
            if (utterancesResponse.ok) {
                const data = await utterancesResponse.json();
                this.updateUtterancesList(data.utterances);
            }
        } catch (error) {
            console.error('Failed to load data:', error);

            if (this.callbacks.onError) {
                this.callbacks.onError('Échec du chargement des messages');
            }
        }
    }

    /**
     * Met à jour la liste des messages dans l'interface
     */
    updateUtterancesList(utterances) {
        if (utterances.length === 0) {
            this.utterancesList.innerHTML = '<div class="empty-state">Aucun message pour le moment.</div>';
            this.infoMessage.classList.add('hidden');
            return;
        }

        // Vérifier si tous les messages sont en attente
        const allPending = utterances.every(u => u.status === 'pending');
        if (allPending) {
            this.infoMessage.classList.remove('hidden');
        } else {
            this.infoMessage.classList.add('hidden');
        }

        // Labels de statut
        const statusLabels = {
            'pending': 'EN ATTENTE',
            'delivered': 'LIVRÉ'
        };

        // Générer le HTML pour chaque message
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

    /**
     * Formate un timestamp en heure locale
     */
    formatTimestamp(timestamp) {
        const date = new Date(timestamp);
        return date.toLocaleTimeString();
    }

    /**
     * Échappe le HTML pour éviter les injections XSS
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Efface tous les messages
     */
    async clearAll() {
        this.clearAllBtn.disabled = true;
        this.clearAllBtn.setAttribute('aria-busy', 'true');
        this.clearAllBtn.textContent = 'Effacement...';

        if (this.callbacks.onClearStart) {
            this.callbacks.onClearStart();
        }

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

                if (this.callbacks.onClearSuccess) {
                    this.callbacks.onClearSuccess(result);
                }
            } else {
                const error = await response.json();
                const message = `Erreur : ${error.error || 'Échec de l\'effacement des messages'}`;
                alert(message);

                if (this.callbacks.onError) {
                    this.callbacks.onError(message);
                }
            }
        } catch (error) {
            console.error('Failed to clear utterances:', error);
            const message = 'Échec de l\'effacement des messages. Assurez-vous que le serveur est en cours d\'exécution.';
            alert(message);

            if (this.callbacks.onError) {
                this.callbacks.onError(message);
            }
        } finally {
            this.clearAllBtn.disabled = false;
            this.clearAllBtn.setAttribute('aria-busy', 'false');
            this.clearAllBtn.textContent = 'Tout Effacer';
        }
    }

    /**
     * Nettoie les ressources
     */
    destroy() {
        this.stopAutoRefresh();
    }
}
