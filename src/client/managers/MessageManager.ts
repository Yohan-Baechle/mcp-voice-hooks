import type { Utterance, MessageManagerCallbacks } from "../types";

export class MessageManager {
  private baseUrl: string;
  private callbacks: MessageManagerCallbacks;

  private refreshBtn: HTMLButtonElement | null;
  private clearAllBtn: HTMLButtonElement | null;
  private utterancesList: HTMLElement | null;
  private infoMessage: HTMLElement | null;

  private autoRefreshInterval: ReturnType<typeof setInterval> | null;

  constructor(baseUrl: string, callbacks: MessageManagerCallbacks = {}) {
    this.baseUrl = baseUrl;
    this.callbacks = callbacks;

    this.refreshBtn = document.getElementById(
      "refreshBtn"
    ) as HTMLButtonElement | null;
    this.clearAllBtn = document.getElementById(
      "clearAllBtn"
    ) as HTMLButtonElement | null;
    this.utterancesList = document.getElementById("utterancesList");
    this.infoMessage = document.getElementById("infoMessage");

    this.autoRefreshInterval = null;
    this.setupEventListeners();
    this.startAutoRefresh(2000);
  }

  private setupEventListeners(): void {
    if (this.refreshBtn) {
      this.refreshBtn.addEventListener("click", (): void => {
        void this.loadData();

        if (this.callbacks.onRefresh) {
          this.callbacks.onRefresh();
        }
      });
    }

    if (this.clearAllBtn) {
      this.clearAllBtn.addEventListener("click", (): void => {
        void this.clearAll();
      });
    }
  }

  public startAutoRefresh(interval: number): void {
    this.loadData();

    if (this.autoRefreshInterval) {
      clearInterval(this.autoRefreshInterval);
    }

    this.autoRefreshInterval = setInterval((): void => {
      void this.loadData();
    }, interval);
  }

  public stopAutoRefresh(): void {
    if (this.autoRefreshInterval) {
      clearInterval(this.autoRefreshInterval);
      this.autoRefreshInterval = null;
    }
  }

  public async loadData(): Promise<void> {
    try {
      const utterancesResponse = await fetch(
        `${this.baseUrl}/api/utterances?limit=20`
      );
      if (utterancesResponse.ok) {
        const data = (await utterancesResponse.json()) as {
          utterances: Utterance[];
        };
        this.updateUtterancesList(data.utterances);
      }
    } catch (error) {
      console.error("Failed to load data:", error);

      if (this.callbacks.onError) {
        this.callbacks.onError("Échec du chargement des messages");
      }
    }
  }

  private updateUtterancesList(utterances: Utterance[]): void {
    if (utterances.length === 0 || !this.utterancesList) {
      if (this.utterancesList) {
        this.utterancesList.innerHTML =
          '<div class="flex justify-center items-center h-48"><p class="text-base-content opacity-50">Aucun message pour le moment.</p></div>';
      }
      if (this.infoMessage) {
        this.infoMessage.classList.add("hidden");
      }
      return;
    }

    const allPending = utterances.every((u) => u.status === "pending");
    if (allPending && this.infoMessage) {
      this.infoMessage.classList.remove("hidden");
    } else if (this.infoMessage) {
      this.infoMessage.classList.add("hidden");
    }

    this.utterancesList!.innerHTML = utterances
      .map((utterance, index) => {
        const bubbleClass =
          utterance.status === "pending"
            ? "chat-bubble-warning"
            : "chat-bubble-success";
        const statusLabel =
          utterance.status === "pending" ? "En attente" : "Livré";

        return `
            <div class="chat chat-start">
                <div class="chat-header">
                    Message ${index + 1}
                    <time class="text-xs opacity-50">${this.formatTimestamp(
                      utterance.timestamp
                    )}</time>
                </div>
                <div class="chat-bubble ${bubbleClass}">${this.escapeHtml(
          utterance.text
        )}</div>
                <div class="chat-footer opacity-50">
                    ${statusLabel}
                </div>
            </div>
            `;
      })
      .join("");
  }

  private formatTimestamp(timestamp: string): string {
    const date = new Date(timestamp);
    return date.toLocaleTimeString();
  }

  private escapeHtml(text: string): string {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  private async clearAll(): Promise<void> {
    if (!this.clearAllBtn) return;

    this.clearAllBtn.disabled = true;
    this.clearAllBtn.setAttribute("aria-busy", "true");
    this.clearAllBtn.textContent = "Effacement...";

    if (this.callbacks.onClearStart) {
      this.callbacks.onClearStart();
    }

    try {
      const response = await fetch(`${this.baseUrl}/api/utterances`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (response.ok) {
        const result = (await response.json()) as any;
        this.loadData();

        if (this.callbacks.onClearSuccess) {
          this.callbacks.onClearSuccess(result);
        }
      } else {
        const error = (await response.json()) as any;
        const message = `Erreur : ${
          error.error || "Échec de l'effacement des messages"
        }`;
        alert(message);

        if (this.callbacks.onError) {
          this.callbacks.onError(message);
        }
      }
    } catch (error) {
      console.error("Failed to clear utterances:", error);
      const message =
        "Échec de l'effacement des messages. Assurez-vous que le serveur est en cours d'exécution.";
      alert(message);

      if (this.callbacks.onError) {
        this.callbacks.onError(message);
      }
    } finally {
      this.clearAllBtn.disabled = false;
      this.clearAllBtn.setAttribute("aria-busy", "false");
      this.clearAllBtn.textContent = "Tout Effacer";
    }
  }

  public destroy(): void {
    this.stopAutoRefresh();
  }
}
