const DailyBoss = {
    state: null,
    loadedAt: 0,
    claiming: false,
    timer: null,
    checkSvg: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>',

    ui: {
        panel: document.getElementById("dh-boss"),
        name: document.getElementById("db-name"),
        timer: document.getElementById("db-timer"),
        timerVal: document.getElementById("db-timer-val"),
        face: document.getElementById("db-face"),
        hp: document.getElementById("db-hp"),
        hpVal: document.getElementById("db-hp-val"),
        players: document.getElementById("db-players"),
        goals: document.getElementById("db-goals"),
        tiers: document.getElementById("db-tiers"),
        me: document.getElementById("db-me"),
        claim: document.getElementById("db-claim"),
        claimLabel: document.getElementById("db-claim-label")
    },

    bind() {
        if (!this.ui.panel) return;
        this.ui.claim.addEventListener("click", () => this.claim());
        window.BrainrotRealtime?.on?.("boss", () => this.load());
        window.addEventListener("pageshow", (event) => {
            if (event.persisted) this.load();
        });
    },

    isStale() {
        return Date.now() - this.loadedAt > 30000;
    },

    async load() {
        if (!this.ui.panel || !DailyHub.token) return;
        try {
            const response = await apiFetch(`${DailyHub.api}/boss`, { headers: DailyHub.headers() });
            const payload = await response.json().catch(() => null);
            if (!response.ok || !payload?.success || !payload.boss) throw new Error(payload?.message || `HTTP ${response.status}`);
            this.loadedAt = Date.now();
            this.apply(payload.boss);
        } catch (error) {
            console.error("Erreur chargement du boss :", error);
            if (!this.state) this.showError();
        }
    },

    showError() {
        const { ui } = this;
        ui.panel.classList.remove("is-loading");
        ui.panel.classList.add("is-error");
        ui.name.textContent = "Indisponible";
    },

    apply(state) {
        this.state = state;
        this.render();
        this.tick();
        clearInterval(this.timer);
        this.timer = setInterval(() => this.tick(), 30000);
        DailyHub.syncCollapsed();
    },

    pending() {
        const { state } = this;
        if (!state) return null;
        if (state.claimable > 0) return { week: state.week, count: state.claimable };
        if (state.previous?.claimable > 0) return { week: state.previous.week, count: state.previous.claimable, previous: true };
        return null;
    },

    tick() {
        if (!this.state) return;
        const left = Math.max(0, Date.parse(this.state.endsAt) - Date.now());
        const days = Math.floor(left / 86_400_000);
        const hours = Math.floor((left % 86_400_000) / 3_600_000);
        const minutes = Math.floor((left % 3_600_000) / 60_000);
        this.ui.timerVal.textContent = days > 0 ? `${days} j ${hours} h` : hours > 0 ? `${hours} h ${String(minutes).padStart(2, "0")}` : `${minutes} min`;
        if (left <= 0) setTimeout(() => this.load(), 5000);
    },

    goal(goal) {
        const mode = DailyMissions.modes[goal.mode] || DailyMissions.modes.shop;
        const pct = Math.round((goal.progress / Math.max(1, goal.target)) * 100);
        const item = document.createElement("li");
        item.innerHTML = `
            <a class="dm-item db-goal ${mode.tone} nav-link${goal.done ? " is-done" : ""}" href="${mode.href}">
                <span class="dm-icon"><i data-lucide="${mode.icon}"></i></span>
                <span class="dm-body">
                    <span class="dm-label">${DailyHub.escape(goal.label)}</span>
                    <span class="dm-track"><i style="width: ${pct}%"></i></span>
                </span>
                ${goal.done
                    ? `<span class="dm-check">${this.checkSvg}</span>`
                    : `<span class="dm-val">${pct} %</span>`}
            </a>`;
        return item;
    },

    tier(tier, index) {
        const chip = document.createElement("span");
        const icons = tier.rewards.map((r) => (r.type === "gold" ? "💰" : r.icon)).join("");
        chip.className = `db-tier${tier.reached ? " is-reached" : ""}${tier.claimed ? " is-claimed" : ""}`;
        chip.title = tier.rewards.map((r) => (r.type === "gold" ? `+${DailyHub.format(r.gold)} pièces` : r.name)).join(" + ");
        chip.innerHTML = `
            <span class="db-tier-icons">${DailyHub.escape(icons)}</span>
            <span class="db-tier-label">${index === this.state.tiers.length - 1 ? "K.O." : `${tier.pct} %`}</span>
            ${tier.claimed ? `<span class="db-tier-check">${this.checkSvg}</span>` : ""}`;
        return chip;
    },

    render() {
        const { state, ui } = this;
        if (!state || !ui.panel) return;
        const pending = this.pending();
        ui.panel.classList.remove("is-loading", "is-error");
        ui.panel.classList.toggle("is-defeated", state.defeated);
        ui.panel.dataset.news = `boss:${state.week}:${pending ? "ready" : state.tier}`;

        ui.name.textContent = state.boss.name;
        ui.face.textContent = state.boss.emoji;
        ui.face.dataset.ko = state.defeated ? "K.O." : "";
        ui.hp.style.width = `${Math.max(0, 100 - state.pct)}%`;
        ui.hpVal.textContent = state.defeated ? "Vaincu" : `${DailyHub.format(state.hp - state.damage)} PV`;
        ui.players.textContent = DailyHub.format(state.participants);
        ui.players.parentElement.title = "Joueurs qui ont participé";

        ui.goals.replaceChildren(...state.goals.map((goal) => this.goal(goal)));
        ui.tiers.replaceChildren(...state.tiers.map((tier, i) => this.tier(tier, i)));

        const me = state.me;
        ui.me.innerHTML = me.eligible
            ? `<span>Tes dégâts</span><b>${DailyHub.escape(DailyHub.format(me.damage))}</b>${me.rank ? `<span class="db-rank">#${me.rank}</span>` : ""}`
            : `<span>Participation</span><b>${Math.min(me.hits, me.minHits)} / ${me.minHits}</b>`;

        ui.claim.classList.toggle("hidden", !pending);
        ui.claim.disabled = this.claiming;
        if (pending && !this.claiming) ui.claimLabel.textContent = pending.previous ? "Récupérer (semaine passée)" : "Récupérer";
        window.lucide?.createIcons?.();
    },

    async claim() {
        const { ui } = this;
        const pending = this.pending();
        if (this.claiming || !pending) return;
        this.claiming = true;
        ui.claim.disabled = true;
        ui.claimLabel.textContent = "…";
        let failed = false;
        try {
            const response = await apiFetch(`${DailyHub.api}/boss/claim`, {
                method: "POST",
                headers: { ...DailyHub.headers(), "Content-Type": "application/json" },
                body: JSON.stringify({ week: pending.week })
            });
            const payload = await response.json().catch(() => null);
            if (!response.ok || !payload?.success) {
                if (response.status === 409) {
                    await this.load();
                    return;
                }
                throw new Error(payload?.message || "Impossible de récupérer la récompense.");
            }
            const origin = DailyHub.centerOf(ui.claim);
            this.claiming = false;
            this.apply(payload.boss);
            this.celebrate(origin);
            if (typeof App !== "undefined") App.syncEconomyFromServer({ forceGoldSync: true });
        } catch (error) {
            console.error("Erreur récompense du boss :", error);
            failed = true;
        } finally {
            this.claiming = false;
            ui.claim.disabled = false;
            if (failed) ui.claimLabel.textContent = "Réessayer";
        }
    },

    celebrate(origin) {
        const { ui } = this;
        DailyHub.burst(origin.x, origin.y, ["#ef4444", "#facc15", "#ffffff", "#a855f7"], 36);
        DailyHub.flashScreen("#ef4444", 0.22);
        if (DailyHub.reducedMotion) return;
        ui.panel.animate([
            { transform: "scale(1)" },
            { transform: "scale(1.025)", offset: 0.35 },
            { transform: "scale(1)" }
        ], { duration: 520, easing: "ease-out" });
        [...ui.tiers.querySelectorAll(".db-tier.is-claimed")].forEach((chip, i) => {
            chip.animate([
                { transform: "scale(1)" },
                { transform: "scale(1.12)", offset: 0.5 },
                { transform: "scale(1)" }
            ], { duration: 420, delay: 100 + i * 120, easing: "ease-out" });
        });
    }
};
