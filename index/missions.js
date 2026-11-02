const DailyMissions = {
    state: null,
    loadedAt: 0,
    claiming: false,
    checkSvg: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>',

    modes: {
        combat: { icon: "swords", tone: "tone-orange", href: "../game/game.html?matchmaking=1" },
        shop: { icon: "store", tone: "tone-sky", href: "../shop/shop.html" },
        village: { icon: "castle", tone: "tone-yellow", href: "../village/village.html" },
        market: { icon: "shopping-bag", tone: "tone-green", href: "../ah/ah.html" },
        gamble: { icon: "dices", tone: "tone-red", href: "../gamble/gamble.html" }
    },

    ui: {
        panel: document.getElementById("dh-missions"),
        count: document.getElementById("dm-count"),
        list: document.getElementById("dm-list"),
        rewards: document.getElementById("dm-rewards"),
        claim: document.getElementById("dm-claim"),
        claimLabel: document.getElementById("dm-claim-label"),
        done: document.getElementById("dm-done")
    },

    bind() {
        if (!this.ui.panel) return;
        this.ui.claim.addEventListener("click", () => this.claim());
        window.addEventListener("pageshow", (event) => {
            if (event.persisted) this.load();
        });
    },

    isStale() {
        return Date.now() - this.loadedAt > 15000;
    },

    async load() {
        if (!this.ui.panel || !DailyHub.token) return;
        try {
            const response = await apiFetch(`${DailyHub.api}/missions`, { headers: DailyHub.headers() });
            const payload = await response.json().catch(() => null);
            if (!response.ok || !payload?.success || !payload.missions) throw new Error(payload?.message || `HTTP ${response.status}`);
            this.loadedAt = Date.now();
            this.apply(payload.missions);
        } catch (error) {
            console.error("Erreur chargement des missions :", error);
            if (!this.state) this.showError();
        }
    },

    showError() {
        const { ui } = this;
        ui.panel.classList.remove("is-loading");
        ui.panel.classList.add("is-error");
        const item = document.createElement("li");
        item.className = "dm-empty";
        item.textContent = "Missions indisponibles";
        ui.list.replaceChildren(item);
    },

    apply(state) {
        this.state = state;
        this.render();
        DailyHub.syncCollapsed();
    },

    rewardLabel(reward) {
        if (reward.type === "gold") return `+${DailyHub.format(reward.gold)}`;
        return reward.qty > 1 ? `${reward.qty} × ${reward.name}` : reward.name;
    },

    row(mission) {
        const mode = this.modes[mission.mode] || this.modes.shop;
        const pct = Math.round((mission.progress / Math.max(1, mission.target)) * 100);
        const item = document.createElement("li");
        item.innerHTML = `
            <a class="dm-item ${mode.tone} nav-link${mission.done ? " is-done" : ""}" href="${mode.href}">
                <span class="dm-icon"><i data-lucide="${mode.icon}"></i></span>
                <span class="dm-body">
                    <span class="dm-label">${DailyHub.escape(mission.label)}</span>
                    <span class="dm-track"><i style="width: ${pct}%"></i></span>
                </span>
                ${mission.done
                    ? `<span class="dm-check">${this.checkSvg}</span>`
                    : `<span class="dm-val">${mission.progress} / ${mission.target}</span>`}
            </a>`;
        return item;
    },

    rewardChip(reward) {
        const gold = reward.type === "gold";
        const chip = document.createElement("span");
        chip.className = `dm-reward${gold ? " is-gold" : ""}`;
        chip.innerHTML = `
            <span class="dm-reward-icon">${gold ? "💰" : DailyHub.escape(reward.icon || "📦")}</span>
            <span class="dm-reward-label">${DailyHub.escape(this.rewardLabel(reward))}</span>`;
        return chip;
    },

    render() {
        const { state, ui } = this;
        if (!state || !ui.panel) return;
        ui.panel.classList.remove("is-loading", "is-error");
        ui.panel.classList.toggle("is-complete", state.complete);
        ui.panel.classList.toggle("is-claimed", state.claimed);
        ui.panel.dataset.news = `missions:${state.day}:${state.claimable ? "ready" : state.claimed ? "claimed" : "todo"}`;
        ui.count.textContent = `${state.done} / ${state.total}`;
        ui.list.replaceChildren(...state.missions.map((mission) => this.row(mission)));
        ui.rewards.replaceChildren(...state.reward.map((reward) => this.rewardChip(reward)));
        ui.claim.classList.toggle("hidden", !state.claimable);
        ui.claim.disabled = this.claiming;
        ui.done.classList.toggle("hidden", !state.claimed);
        window.lucide?.createIcons?.();
    },

    async claim() {
        const { ui } = this;
        if (this.claiming || !this.state?.claimable) return;
        this.claiming = true;
        ui.claim.disabled = true;
        ui.claimLabel.textContent = "…";
        let failed = false;
        try {
            const response = await apiFetch(`${DailyHub.api}/missions/claim`, { method: "POST", headers: DailyHub.headers() });
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
            this.apply(payload.missions);
            this.celebrate(origin, payload.reward);
            if (typeof App !== "undefined") App.syncEconomyFromServer({ forceGoldSync: true });
        } catch (error) {
            console.error("Erreur récompense des missions :", error);
            failed = true;
        } finally {
            this.claiming = false;
            ui.claim.disabled = false;
            ui.claimLabel.textContent = failed ? "Réessayer" : "Récupérer";
        }
    },

    celebrate(origin, reward) {
        const { ui } = this;
        DailyHub.burst(origin.x, origin.y, ["#facc15", "#f97316", "#ffffff", "#38bdf8"], 34);
        DailyHub.flashScreen("#facc15", 0.28);
        if (DailyHub.reducedMotion) return;

        ui.panel.animate([
            { transform: "scale(1)" },
            { transform: "scale(1.025)", offset: 0.35 },
            { transform: "scale(1)" }
        ], { duration: 520, easing: "ease-out" });

        [...ui.rewards.children].forEach((chip, i) => {
            chip.animate([
                { opacity: 0, transform: "scale(0.4) rotate(-6deg)" },
                { opacity: 1, transform: "scale(1.15) rotate(2deg)", offset: 0.6 },
                { opacity: 1, transform: "scale(1) rotate(0deg)" }
            ], { duration: 460, delay: 120 + i * 140, easing: "ease-out", fill: "backwards" });
            setTimeout(() => {
                const center = DailyHub.centerOf(chip);
                DailyHub.burst(center.x, center.y, chip.classList.contains("is-gold") ? ["#facc15", "#fde68a", "#ffffff"] : ["#ffffff", "#a855f7", "#38bdf8"], 12);
            }, 200 + i * 140);
        });

        const gold = reward?.rewards?.find((r) => r.type === "gold");
        const goldLabel = ui.rewards.querySelector(".dm-reward.is-gold .dm-reward-label");
        if (gold && goldLabel) setTimeout(() => DailyHub.countUp(goldLabel, gold.gold), 260);

        ui.done.animate([
            { opacity: 0, transform: "translateY(8px) scale(0.8)" },
            { opacity: 1, transform: "none" }
        ], { duration: 360, delay: 420, easing: "cubic-bezier(.2,.9,.3,1.3)", fill: "backwards" });
    }
};
