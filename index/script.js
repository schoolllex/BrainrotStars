const App = {
    apiBaseUrl: "http://darkgoldenrod-frog-258465.hostingersite.com",
    userRouteBases: ["/user"],
    goldSyncIntervalMs: 5 * 60 * 1000,
    state: {
        brainrots: "14 420/69 000",
        coinsPerSec: 0,
        moneyTotal: 0,
        syncedGold: 0,
        syncedAtMs: Date.now(),
        syncInFlight: null,
        achievements: "Non disponible",
        playTime: "42h 15m"
    },

    ui: {
        brainrotVal: document.getElementById('val-brainrots'),
        cpsVal: document.getElementById('val-cps'),
        moneyVal: document.getElementById('val-money'),
        achievementsVal: document.getElementById('val-achievements'),
        timeVal: document.getElementById('val-time'),
        mainBtn: document.querySelector('.btn-main-play'),
        achievementsBtn: document.getElementById('btn-achievements')
    },

    init() {
        GlobalLoader.show();
        lucide.createIcons();
        this.render();
        this.bindEvents();
        this.loadStatsFlow();
        setInterval(() => {
            this.refreshSimulatedMoney();
        }, 1000);
        setInterval(() => {
            this.syncEconomyFromServer({ forceGoldSync: true });
        }, this.goldSyncIntervalMs);
    },

    formatCompact(value) {
        const num = Number(value || 0);
        if (num >= 1_000_000_000_000) return `${(num / 1_000_000_000_000).toFixed(2).replace(/\.00$/, "")}T`;
        if (num >= 1_000_000_000) return `${(num / 1_000_000_000).toFixed(2).replace(/\.00$/, "")}B`;
        if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(2).replace(/\.00$/, "")}M`;
        if (num >= 1_000) return `${(num / 1_000).toFixed(2).replace(/\.00$/, "")}K`;
        return `${Math.round(num * 100) / 100}`;
    },

    render() {
        this.ui.brainrotVal.textContent = this.state.brainrots;
        this.ui.cpsVal.textContent = `+${this.formatCompact(this.state.coinsPerSec)} /s`;
        if (this.ui.moneyVal) this.ui.moneyVal.textContent = this.formatCompact(this.state.moneyTotal);
        if (this.ui.achievementsVal) this.ui.achievementsVal.textContent = this.state.achievements;
        if (this.ui.timeVal) this.ui.timeVal.textContent = this.state.playTime;
    },

    async loadStatsFlow() {
        try {
            const token = await window.BrainrotAuth.waitUntilReady();
            if (!token) return;
            await this.syncEconomyFromServer({ forceGoldSync: true });
        } finally {
            GlobalLoader.hide(true);
        }
    },

    setEconomySnapshot(gold, coinPerSec) {
        this.state.syncedGold = Math.max(0, Number(gold || 0));
        this.state.coinsPerSec = Math.max(0, Number(coinPerSec || 0));
        this.state.syncedAtMs = Date.now();
        this.refreshSimulatedMoney();
    },

    getSimulatedMoneyNow() {
        const elapsedSec = Math.max(0, (Date.now() - this.state.syncedAtMs) / 1000);
        return Math.max(0, this.state.syncedGold + elapsedSec * this.state.coinsPerSec);
    },

    refreshSimulatedMoney() {
        this.state.moneyTotal = this.getSimulatedMoneyNow();
        this.render();
    },

    async fetchUserStats(token) {
        for (const base of this.userRouteBases) {
            try {
                const response = await fetch(`${this.apiBaseUrl}${base}/stats`, {
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
                const response = await fetch(`${this.apiBaseUrl}${base}/gold`, {
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
            this.state.brainrots = `${stats.card?.decks?.[0]?._count?.cards || 0} / 200`;
            let nextGold = Number(stats.gold || 0);
            const shouldSyncGold = forceGoldSync || Date.now() - this.state.syncedAtMs >= this.goldSyncIntervalMs;
            if (shouldSyncGold) {
                const goldResult = await this.fetchUserGold(token);
                if (goldResult?.ok && goldResult.gold !== null) {
                    nextGold = Number(goldResult.gold || 0);
                }
            }
            this.setEconomySnapshot(nextGold, Number(stats.coinPerSec || 0));
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
    if (this.ui.mainBtn) {
        this.ui.mainBtn.addEventListener('click', () => {
            alert("Matchmaking en cours...");
        });
    }

    if (this.ui.achievementsBtn) {
        this.ui.achievementsBtn.addEventListener('click', (e) => {
            e.preventDefault();
            alert("Non disponible pour le moment");
        });
    }
  }
};

document.addEventListener('DOMContentLoaded', () => App.init());