const App = {
    apiBaseUrl: window.API_BASE_URL,
    userRouteBases: ["/user"],
    goldSyncIntervalMs: 5 * 60 * 1000,
    state: {
        brainrotsOwned: 0,
        brainrotsTotal: 0,
        coinsPerSec: 0,
        rebirthCount: 0,
        moneyTotal: 0,
        syncedGold: 0,
        syncedAtMs: Date.now(),
        syncInFlight: null,
        achievementsUnlocked: 0,
        achievementsTotal: 0
    },

    ui: {
        brainrotVal: document.getElementById('val-brainrots'),
        brainrotBar: document.getElementById('bar-brainrots'),
        cpsVal: document.getElementById('val-cps'),
        cpsBonus: document.getElementById('val-cps-bonus'),
        moneyVal: document.getElementById('val-money'),
        achievementsVal: document.getElementById('val-achievements'),
        achievementsBar: document.getElementById('bar-achievements')
    },

    init() {
        GlobalLoader.show();
        lucide.createIcons();
        this.render();
        this.bindEvents();
        this.hideSeenBadges();
        this.loadStatsFlow();
        setInterval(() => {
            this.refreshSimulatedMoney();
        }, 100);
        setInterval(() => {
            this.syncEconomyFromServer({ forceGoldSync: true });
        }, this.goldSyncIntervalMs);
    },

    hideSeenBadges() {
        try {
            if (localStorage.getItem("brainrot_gamble_seen")) document.getElementById("gamble-new-badge")?.classList.add("hidden");
        } catch {}
    },

    formatCompact(value) {
        const num = Number(value || 0);
        if (num >= 1_000_000_000_000) return `${(num / 1_000_000_000_000).toFixed(2).replace(/\.00$/, "")}T`;
        if (num >= 1_000_000_000) return `${(num / 1_000_000_000).toFixed(2).replace(/\.00$/, "")}B`;
        if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(2).replace(/\.00$/, "")}M`;
        if (num >= 1_000) return `${(num / 1_000).toFixed(2).replace(/\.00$/, "")}K`;
        return `${Math.round(num * 100) / 100}`;
    },

    percent(value, total) {
        return total > 0 ? `${Math.min(100, (value / total) * 100)}%` : "0%";
    },

    render() {
        const { state, ui } = this;
        ui.brainrotVal.textContent = `${state.brainrotsOwned} / ${state.brainrotsTotal}`;
        ui.brainrotBar.style.width = this.percent(state.brainrotsOwned, state.brainrotsTotal);
        ui.cpsVal.textContent = `+${this.formatCompact(state.coinsPerSec)} /s`;
        ui.cpsBonus.textContent = `Bonus rebirth +${state.rebirthCount * 10} %`;
        ui.cpsBonus.classList.toggle("hidden", state.rebirthCount <= 0);
        ui.achievementsVal.textContent = `${state.achievementsUnlocked} / ${state.achievementsTotal}`;
        ui.achievementsBar.style.width = this.percent(state.achievementsUnlocked, state.achievementsTotal);
        this.renderMoney();
    },

    /** Seule valeur qui bouge en continu (toutes les 100 ms). */
    renderMoney() {
        const text = this.formatCompact(this.state.moneyTotal);
        if (this.ui.moneyVal.textContent !== text) this.ui.moneyVal.textContent = text;
    },

    async loadStatsFlow() {
        try {
            this.loadBrainrotTotal();
            const token = await window.BrainrotAuth.waitUntilReady();
            if (!token) return;
            this.loadVillageBadge(token);
            this.loadAchievements(token);
            await this.syncEconomyFromServer({ forceGoldSync: true });
        } finally {
            GlobalLoader.hide(true);
        }
    },

    /** Nombre de Brainrots du jeu : la liste complete, comme la collection. */
    async loadBrainrotTotal() {
        try {
            const response = await apiFetch(`${this.apiBaseUrl}/user/getAllBrainRot`);
            if (!response.ok) return;
            const payload = await response.json();
            if (!Array.isArray(payload?.result)) return;
            this.state.brainrotsTotal = payload.result.length;
            this.render();
        } catch {
            // Le total reste a 0 : l'accueil fonctionne sans.
        }
    },

    /**
     * Pastille du Villaggio : chantiers finis, mines a moitie pleines, coffre
     * de forge pret, recherche terminee... et attaques subies pas encore vues.
     */
    async loadVillageBadge(token) {
        const badge = document.getElementById("village-notif-badge");
        if (!badge) return;
        try {
            const response = await apiFetch(`${this.apiBaseUrl}/village/status`, {
                headers: { "Authorization": `Bearer ${token}` }
            });
            if (!response.ok) return;
            const payload = await response.json();
            const status = payload?.status;
            if (!payload?.success || !status) return;
            const defenses = status.exists ? Number(status.defenses || 0) : 0;
            const count = status.exists ? Number(status.ready || 0) + defenses : 0;
            badge.textContent = !status.exists ? "!" : String(count);
            badge.title = defenses > 0 ? `${defenses} attaque(s) subie(s) pendant ton absence` : "";
            badge.classList.toggle("is-alert", defenses > 0);
            badge.classList.toggle("hidden", status.exists && count === 0);
        } catch {
            // La pastille est un bonus : l'accueil fonctionne sans.
        }
    },

    /**
     * Succes : compteur "Succes X / Y", et pastille sur la carte quand des
     * recompenses attendent. Tout vient du serveur (GET /achievements).
     */
    async loadAchievements(token) {
        try {
            const response = await apiFetch(`${this.apiBaseUrl}/achievements`, {
                headers: { "Authorization": `Bearer ${token}` }
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const payload = await response.json();
            const summary = payload?.summary;
            if (!payload?.success || !summary) return;

            this.state.achievementsUnlocked = Number(summary.unlocked || 0);
            this.state.achievementsTotal = Number(summary.total || 0);
            this.render();

            const claimable = Number(summary.claimable || 0);
            const badge = document.getElementById("ach-notif-badge");
            const sub = document.getElementById("ach-card-sub");
            if (badge) {
                badge.textContent = String(claimable);
                badge.classList.toggle("hidden", claimable === 0);
            }
            if (sub) {
                sub.textContent = claimable > 0
                    ? `${claimable} récompense${claimable > 1 ? "s" : ""} à récupérer`
                    : `${summary.unlocked} / ${summary.total} débloqués`;
            }
        } catch (error) {
            console.error("Erreur chargement des succès :", error);
        }
    },

    setEconomySnapshot(gold, coinPerSec, rebirthCount) {
        this.state.syncedGold = Math.max(0, Number(gold || 0));
        this.state.coinsPerSec = Math.max(0, Number(coinPerSec || 0));
        this.state.rebirthCount = Number(rebirthCount || 0);
        this.state.syncedAtMs = Date.now();
        this.state.moneyTotal = this.getSimulatedMoneyNow();
        this.render();
    },

    getSimulatedMoneyNow() {
        const elapsedSec = Math.max(0, (Date.now() - this.state.syncedAtMs) / 1000);
        return Math.max(0, this.state.syncedGold + elapsedSec * this.state.coinsPerSec);
    },

    refreshSimulatedMoney() {
        this.state.moneyTotal = this.getSimulatedMoneyNow();
        this.renderMoney();
    },

    async fetchUserStats(token) {
        for (const base of this.userRouteBases) {
            try {
                const response = await apiFetch(`${this.apiBaseUrl}${base}/stats`, {
                    headers: {
                        "Authorization": `Bearer ${token}`
                    }
                });
                if (response.status === 401) return { ok: false, unauthorized: true, payload: null };
                if (!response.ok) continue;
                const payload = await response.json();
                if (payload?.success) return { ok: true, unauthorized: false, payload };
            } catch {
                continue;
            }
        }

        return { ok: false, unauthorized: false, payload: null };
    },

    async fetchUserGold(token) {
        for (const base of this.userRouteBases) {
            try {
                const response = await apiFetch(`${this.apiBaseUrl}${base}/gold`, {
                    headers: {
                        "Authorization": `Bearer ${token}`
                    }
                });
                if (response.status === 401) return { ok: false, unauthorized: true, gold: null };
                if (!response.ok) continue;
                const payload = await response.json();
                if (payload?.success && typeof payload?.value !== "undefined") {
                    return { ok: true, unauthorized: false, gold: Number(payload.value || 0) };
                }
                if (payload && typeof payload?.gold !== "undefined") {
                    return { ok: true, unauthorized: false, gold: Number(payload.gold || 0) };
                }
                if (typeof payload === "number") {
                    return { ok: true, unauthorized: false, gold: Number(payload || 0) };
                }
            } catch {
                continue;
            }
        }
        return { ok: false, unauthorized: false, gold: null };
    },

    async syncEconomyFromServer({ forceGoldSync = false } = {}) {
        if (this.state.syncInFlight) return this.state.syncInFlight;
        this.state.syncInFlight = (async () => {
            const token = await window.BrainrotAuth.waitUntilReady();
            if (!token) return { ok: false, unauthorized: false };
            const result = await this.fetchUserStats(token);
            if (!result?.ok || !result?.payload?.success || !result?.payload?.value) {
                return { ok: false, unauthorized: Boolean(result?.unauthorized) };
            }
            const stats = result.payload.value;
            this.state.brainrotsOwned = Number(stats.card?.decks?.[0]?._count?.cards || 0);
            let nextGold = Number(stats.gold || 0);
            const shouldSyncGold = forceGoldSync || Date.now() - this.state.syncedAtMs >= this.goldSyncIntervalMs;
            if (shouldSyncGold) {
                const goldResult = await this.fetchUserGold(token);
                if (goldResult?.ok && goldResult.gold !== null) {
                    nextGold = Number(goldResult.gold || 0);
                }
            }
            this.setEconomySnapshot(nextGold, Number(stats.coinPerSec || 0), Number(stats.hasRebirth || 0));
            return { ok: true, unauthorized: false };
        })().catch((error) => {
            console.error("Erreur chargement stats index:", error);
            return { ok: false, unauthorized: false };
        }).finally(() => {
            this.state.syncInFlight = null;
        });
        return this.state.syncInFlight;
    },

    bindEvents() {
        document.getElementById('logout-btn')?.addEventListener('click', () => {
            localStorage.clear();
            location.reload();
        });

        const discordCard = document.getElementById('discord-card');
        const discordOverlay = document.getElementById('discord-modal-overlay');
        const discordClose = document.getElementById('discord-modal-close');
        const closeDiscordModal = () => {
            discordOverlay?.classList.add('hidden');
            document.body.style.overflow = '';
        };

        discordCard?.addEventListener('click', () => {
            discordOverlay?.classList.remove('hidden');
            document.body.style.overflow = 'hidden';
        });

        discordClose?.addEventListener('click', closeDiscordModal);
        discordOverlay?.addEventListener('click', (event) => {
            if (event.target === discordOverlay) closeDiscordModal();
        });

        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && !discordOverlay?.classList.contains('hidden')) {
                closeDiscordModal();
            }
        });
    }
};

document.addEventListener('DOMContentLoaded', () => {
  App.init();
});