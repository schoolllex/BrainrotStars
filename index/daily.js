const DailyHub = {
    api: window.API_BASE_URL,
    token: null,
    state: null,
    popOpen: false,
    claiming: false,
    clockOffset: 0,
    tickTimer: null,
    resetTimer: null,
    reducedMotion: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false,
    collapseStore: "brainrot_daily_collapsed",
    heightAnim: null,
    ready: false,
    checkSvg: '<span class="dh-day-check"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg></span>',

    ui: {
        hub: document.getElementById("daily-hub"),
        count: document.getElementById("dh-count"),
        unit: document.getElementById("dh-unit"),
        bonus: document.getElementById("dh-bonus"),
        best: document.getElementById("dh-best"),
        claim: document.getElementById("dh-claim"),
        timer: document.getElementById("dh-timer"),
        timerVal: document.getElementById("dh-timer-val"),
        toggle: document.getElementById("dh-toggle"),
        toggleLabel: document.getElementById("dh-toggle-label"),
        track: document.getElementById("dh-track"),
        weekLabel: document.getElementById("dh-week-label"),
        weekBar: document.getElementById("dh-week-bar"),
        weekVal: document.getElementById("dh-week-val"),
        pop: document.getElementById("streak-pop"),
        popClose: document.getElementById("sp-close"),
        popFlame: document.getElementById("sp-flame"),
        popCount: document.getElementById("sp-count"),
        popTitle: document.getElementById("sp-title"),
        popSub: document.getElementById("sp-sub"),
        popTrack: document.getElementById("sp-track"),
        popRewards: document.getElementById("sp-rewards"),
        popBtn: document.getElementById("sp-claim"),
        popBtnLabel: document.getElementById("sp-claim-label"),
        fx: document.getElementById("sp-fx"),
        flash: document.getElementById("sp-flash")
    },

    async init() {
        if (!this.ui.hub) return;
        const saved = this.readCollapsed();
        if (saved && Date.parse(saved.until) > Date.now()) this.setCollapsed(true);
        this.bind();
        DailyMissions.bind();
        DailyBoss.bind();
        this.token = await window.BrainrotAuth?.waitUntilReady?.();
        if (!this.token) return;
        await this.refresh();
    },

    async refresh() {
        await Promise.all([this.load(), DailyMissions.load(), DailyBoss.load()]);
        this.ready = true;
        this.syncCollapsed();
        this.autoPop();
    },

    bind() {
        this.ui.claim.addEventListener("click", () => this.openPop());
        this.ui.toggle.addEventListener("click", () => this.toggleCollapsed());
        this.ui.popBtn.addEventListener("click", () => {
            if (this.ui.pop.classList.contains("is-done")) this.closePop();
            else this.claim();
        });
        this.ui.popClose.addEventListener("click", () => this.closePop());
        document.addEventListener("keydown", (event) => {
            if (event.key === "Escape" && this.popOpen) this.closePop();
        });
        document.addEventListener("visibilitychange", () => {
            if (document.visibilityState !== "visible" || !this.state) return;
            if (this.now() >= Date.parse(this.state.nextResetAt)) {
                this.refresh();
                return;
            }
            this.tick();
            if (DailyMissions.isStale()) DailyMissions.load();
            if (DailyBoss.isStale()) DailyBoss.load();
        });
    },

    headers() {
        return { "Authorization": `Bearer ${this.token}` };
    },

    now() {
        return Date.now() + this.clockOffset;
    },

    async load() {
        try {
            const response = await apiFetch(`${this.api}/streak`, { headers: this.headers() });
            const payload = await response.json().catch(() => null);
            if (!response.ok || !payload?.success || !payload.streak) throw new Error(payload?.message || `HTTP ${response.status}`);
            this.apply(payload.streak);
        } catch (error) {
            console.error("Erreur chargement de la série :", error);
            this.ui.hub.classList.remove("is-loading");
        }
    },

    apply(streak) {
        this.state = streak;
        this.clockOffset = Date.parse(streak.serverNow) - Date.now();
        this.render();
        this.scheduleReset();
    },

    scheduleReset() {
        clearTimeout(this.resetTimer);
        clearInterval(this.tickTimer);
        const wait = Math.max(1000, Date.parse(this.state.nextResetAt) - this.now() + 1500);
        this.resetTimer = setTimeout(() => this.refresh(), Math.min(wait, 2 ** 31 - 1));
        this.tickTimer = setInterval(() => this.tick(), 15000);
        this.tick();
    },

    tick() {
        if (!this.state) return;
        const left = Math.max(0, Date.parse(this.state.nextResetAt) - this.now());
        const hours = Math.floor(left / 3_600_000);
        const minutes = Math.floor((left % 3_600_000) / 60_000);
        this.ui.timerVal.textContent = hours > 0
            ? `${hours} h ${String(minutes).padStart(2, "0")}`
            : minutes > 0 ? `${minutes} min` : "< 1 min";
    },

    format(value) {
        return typeof App !== "undefined" ? App.formatCompact(value) : String(Math.round(value));
    },

    escape(value) {
        return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    },

    chestShort(name) {
        const short = String(name || "").replace(/^Coffre\s+/i, "");
        return short.charAt(0).toUpperCase() + short.slice(1);
    },

    rewardLabel(reward) {
        if (reward.type === "gold") return `+${this.format(reward.gold)} pièces`;
        return reward.qty > 1 ? `${reward.qty} × ${reward.name}` : reward.name;
    },

    dayTile(day) {
        const gold = day.rewards.find((r) => r.type === "gold");
        const chests = day.rewards.filter((r) => r.type === "chest");
        const icons = day.rewards.map((r) => `<span>${this.escape(r.type === "gold" ? "💰" : r.icon)}</span>`).join("");
        let value = "";
        if (gold) value = `+${this.format(gold.gold)}`;
        else if (chests.length === 1) value = chests[0].qty > 1 ? `×${chests[0].qty}` : this.chestShort(chests[0].name);
        const tile = document.createElement("div");
        tile.className = `dh-day is-${day.status}${day.big ? " is-big" : ""}`;
        tile.dataset.day = String(day.day);
        tile.title = day.rewards.map((r) => this.rewardLabel(r)).join(" + ");
        tile.innerHTML = `
            <span class="dh-day-n">J${day.day}</span>
            <span class="dh-day-icons">${icons}</span>
            <span class="dh-day-val${gold ? " is-gold" : ""}">${this.escape(value)}</span>
            ${day.status === "claimed" ? this.checkSvg : ""}`;
        return tile;
    },

    render() {
        const { state, ui } = this;
        if (!state) return;
        ui.hub.classList.remove("is-loading");
        ui.hub.classList.toggle("is-claimable", state.claimable);
        ui.hub.classList.toggle("is-dead", state.count === 0);

        ui.count.textContent = String(state.count);
        ui.unit.textContent = state.count > 1 ? "jours" : "jour";
        ui.best.querySelector("span").textContent = String(state.best);
        ui.best.title = "Record";
        ui.bonus.querySelector("span").textContent = `+${state.bonusPct} %`;
        ui.bonus.title = "Bonus de pièces de la semaine";
        ui.bonus.classList.toggle("hidden", !(state.bonusPct > 0));

        ui.claim.classList.toggle("hidden", !state.claimable);
        ui.claim.disabled = this.claiming;
        ui.timer.classList.toggle("hidden", state.claimable);
        this.syncCollapsed();

        ui.track.replaceChildren(...state.track.map((day) => this.dayTile(day)));

        const done = state.track.filter((day) => day.status === "claimed").length;
        ui.weekLabel.textContent = `Semaine ${state.week}`;
        ui.weekVal.textContent = `${done} / ${state.track.length}`;
        ui.weekBar.style.width = `${(done / state.track.length) * 100}%`;
    },

    newsKey() {
        const extras = [...this.ui.hub.querySelectorAll("[data-news]")].map((el) => el.dataset.news);
        return [this.state?.nextResetAt || "", ...extras].join("|");
    },

    readCollapsed() {
        try {
            return JSON.parse(localStorage.getItem(this.collapseStore) || "null");
        } catch {
            return null;
        }
    },

    clearCollapsed() {
        try { localStorage.removeItem(this.collapseStore); } catch {}
    },

    isCollapsed() {
        return !!this.state && this.readCollapsed()?.key === this.newsKey();
    },

    syncCollapsed() {
        if (!this.ready || !this.state) return;
        this.ui.toggle.classList.remove("hidden");
        const collapsed = this.isCollapsed();
        if (!collapsed) this.clearCollapsed();
        this.setCollapsed(collapsed);
    },

    setCollapsed(collapsed) {
        const { hub, toggle, toggleLabel } = this.ui;
        hub.classList.toggle("is-collapsed", collapsed);
        toggle.setAttribute("aria-expanded", String(!collapsed));
        toggleLabel.textContent = collapsed ? "Ouvrir" : "Réduire";
    },

    toggleCollapsed() {
        if (!this.state) return;
        const collapse = !this.ui.hub.classList.contains("is-collapsed");
        if (collapse) {
            try {
                localStorage.setItem(this.collapseStore, JSON.stringify({ key: this.newsKey(), until: this.state.nextResetAt }));
            } catch {}
        } else {
            this.clearCollapsed();
        }
        this.animateHeight(() => this.setCollapsed(collapse));
    },

    animateHeight(change) {
        const { hub } = this.ui;
        const from = hub.offsetHeight;
        this.heightAnim?.cancel();
        change();
        if (this.reducedMotion) return;
        const to = hub.offsetHeight;
        hub.style.overflow = "hidden";
        const anim = hub.animate([
            { height: `${from}px` },
            { height: `${to}px` }
        ], { duration: 300, easing: "cubic-bezier(.4,0,.2,1)" });
        this.heightAnim = anim;
        anim.onfinish = () => {
            if (this.heightAnim !== anim) return;
            hub.style.overflow = "";
            this.heightAnim = null;
        };
    },

    dismissKey() {
        return `brainrot_streak_pop_${this.state?.nextResetAt || ""}`;
    },

    async whenFree() {
        const loader = document.getElementById("global-loader");
        const busy = () => (loader && !loader.classList.contains("hidden"))
            || document.querySelector(".tuto-root, .an-overlay, .discord-modal-overlay:not(.hidden), body.nav-menu-open");
        if (window.BrainrotTutorial?.idle) await window.BrainrotTutorial.idle;
        while (busy()) await new Promise((resolve) => setTimeout(resolve, 700));
    },

    async autoPop() {
        if (!this.state?.claimable || this.popOpen) return;
        try {
            if (sessionStorage.getItem(this.dismissKey())) return;
        } catch {}
        await this.whenFree();
        await new Promise((resolve) => setTimeout(resolve, 350));
        if (this.state?.claimable && !this.popOpen) this.openPop();
    },

    openPop() {
        const { state, ui } = this;
        if (!state?.claimable || this.popOpen) return;
        this.popOpen = true;
        ui.pop.classList.remove("hidden", "is-done", "is-leaving");
        ui.pop.classList.toggle("is-dead", state.count === 0);
        ui.popCount.replaceChildren(this.digit(state.count));
        ui.popTitle.textContent = state.count > 0 ? `Jour ${state.day}` : "Lance ta série !";
        this.setSub(state.lost > 1 ? `Ta série de ${state.lost} jours est perdue` : "");
        ui.popRewards.replaceChildren();
        ui.popBtnLabel.textContent = "Récupérer";
        ui.popBtn.disabled = false;
        ui.popClose.disabled = false;
        document.body.style.overflow = "hidden";

        const tiles = state.track.map((day) => this.dayTile(day));
        ui.popTrack.replaceChildren(...tiles);
        if (!this.reducedMotion) {
            tiles.forEach((tile, i) => tile.animate([
                { opacity: 0, transform: "translateY(14px) scale(0.92)" },
                { opacity: 1, transform: tile.classList.contains("is-today") ? "translateY(-3px)" : "none" }
            ], { duration: 360, delay: 120 + i * 55, easing: "cubic-bezier(.2,.9,.3,1.2)", fill: "backwards" }));
            ui.popBtn.animate([
                { opacity: 0, transform: "translateY(10px)" },
                { opacity: 1, transform: "none" }
            ], { duration: 320, delay: 120 + tiles.length * 55, easing: "ease-out", fill: "backwards" });
        }
        ui.popBtn.focus({ preventScroll: true });
    },

    closePop() {
        const { ui } = this;
        if (!this.popOpen || this.claiming) return;
        if (!ui.pop.classList.contains("is-done")) {
            try { sessionStorage.setItem(this.dismissKey(), "1"); } catch {}
        }
        this.popOpen = false;
        ui.pop.classList.add("is-leaving");
        setTimeout(() => {
            ui.pop.classList.add("hidden");
            ui.pop.classList.remove("is-leaving");
            document.body.style.overflow = "";
        }, this.reducedMotion ? 0 : 240);
    },

    setSub(text) {
        this.ui.popSub.textContent = text;
        this.ui.popSub.classList.toggle("hidden", !text);
    },

    digit(value) {
        const span = document.createElement("span");
        span.className = "sp-digit";
        span.textContent = String(value);
        return span;
    },

    async claim() {
        const { ui } = this;
        if (this.claiming || !this.popOpen || !this.state?.claimable) return;
        const before = this.state;
        this.claiming = true;
        ui.popBtn.disabled = true;
        ui.popClose.disabled = true;
        ui.popBtnLabel.textContent = "…";
        try {
            const response = await apiFetch(`${this.api}/streak/claim`, { method: "POST", headers: this.headers() });
            const payload = await response.json().catch(() => null);
            if (!response.ok || !payload?.success) {
                if (response.status === 409) {
                    this.claiming = false;
                    ui.popClose.disabled = false;
                    this.closePop();
                    await this.load();
                    return;
                }
                throw new Error(payload?.message || "Impossible de récupérer la récompense.");
            }
            await this.celebrate(before, payload.reward, payload.streak);
            if (typeof App !== "undefined") App.syncEconomyFromServer({ forceGoldSync: true });
        } catch (error) {
            this.setSub(error.message);
            ui.popBtnLabel.textContent = "Réessayer";
            ui.popBtn.disabled = false;
        } finally {
            this.claiming = false;
            ui.popClose.disabled = false;
            if (this.state) this.render();
        }
    },

    wait(ms) {
        return new Promise((resolve) => setTimeout(resolve, this.reducedMotion ? 0 : ms));
    },

    centerOf(element) {
        const rect = element.getBoundingClientRect();
        return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    },

    burst(x, y, colors, count) {
        if (this.reducedMotion) return;
        for (let i = 0; i < count; i += 1) {
            const particle = document.createElement("span");
            particle.className = "sp-particle";
            particle.style.left = `${x}px`;
            particle.style.top = `${y}px`;
            particle.style.background = colors[i % colors.length];
            if (i % 3 === 0) particle.style.borderRadius = "50%";
            this.ui.fx.appendChild(particle);
            const angle = Math.random() * Math.PI * 2;
            const distance = 70 + Math.random() * 130;
            const dx = Math.cos(angle) * distance;
            const dy = Math.sin(angle) * distance;
            const spin = (Math.random() - 0.5) * 720;
            particle.animate([
                { transform: "translate(0, 0) rotate(0deg) scale(1)", opacity: 1 },
                { transform: `translate(${dx * 0.75}px, ${dy * 0.75}px) rotate(${spin * 0.6}deg) scale(1)`, opacity: 1, offset: 0.55 },
                { transform: `translate(${dx}px, ${dy + 70}px) rotate(${spin}deg) scale(0.4)`, opacity: 0 }
            ], { duration: 800 + Math.random() * 450, easing: "cubic-bezier(.15,.7,.35,1)" }).onfinish = () => particle.remove();
        }
    },

    flashScreen(color, strength) {
        if (this.reducedMotion) return;
        this.ui.flash.style.background = color;
        this.ui.flash.animate([
            { opacity: 0 },
            { opacity: strength, offset: 0.3 },
            { opacity: 0 }
        ], { duration: 650, easing: "ease-out" });
    },

    rollCount(value) {
        const { popCount } = this.ui;
        const previous = popCount.querySelector(".sp-digit");
        const next = this.digit(value);
        popCount.appendChild(next);
        if (this.reducedMotion || !previous) {
            previous?.remove();
            return;
        }
        previous.animate([
            { transform: "translateY(0)", opacity: 1 },
            { transform: "translateY(-120%)", opacity: 0 }
        ], { duration: 380, easing: "cubic-bezier(.5,0,.75,0)", fill: "forwards" }).onfinish = () => previous.remove();
        next.animate([
            { transform: "translateY(120%)", opacity: 0 },
            { transform: "translateY(-12%)", opacity: 1, offset: 0.7 },
            { transform: "translateY(0)", opacity: 1 }
        ], { duration: 520, delay: 160, easing: "cubic-bezier(.2,.9,.3,1.3)", fill: "backwards" });
        popCount.animate([
            { transform: "translateX(-50%) scale(1)" },
            { transform: "translateX(-50%) scale(1.3)", offset: 0.45 },
            { transform: "translateX(-50%) scale(1)" }
        ], { duration: 620, delay: 140, easing: "ease-out" });
    },

    rewardTile(reward) {
        const gold = reward.type === "gold";
        const tile = document.createElement("div");
        tile.className = `sp-tile${gold ? " is-gold" : ""}`;
        tile.innerHTML = `
            <span class="sp-tile-icon">${gold ? "💰" : this.escape(reward.icon || "📦")}</span>
            <span class="sp-tile-label">${this.escape(gold ? "+0" : (reward.qty > 1 ? `${reward.qty} × ${reward.name}` : reward.name))}</span>`;
        this.ui.popRewards.appendChild(tile);
        tile.animate([
            { opacity: 0, transform: "scale(0.4) rotate(-8deg)" },
            { opacity: 1, transform: "scale(1.12) rotate(2deg)", offset: 0.6 },
            { opacity: 1, transform: "scale(1) rotate(0deg)" }
        ], { duration: this.reducedMotion ? 1 : 440, easing: "ease-out", fill: "forwards" });
        const center = this.centerOf(tile);
        this.burst(center.x, center.y, gold ? ["#facc15", "#fde68a", "#ffffff"] : ["#ffffff", "#f97316", "#facc15"], 14);
        return gold ? this.countUp(tile.querySelector(".sp-tile-label"), reward.gold) : Promise.resolve();
    },

    countUp(element, target) {
        if (this.reducedMotion || !(target > 0)) {
            element.textContent = `+${this.format(target)}`;
            return Promise.resolve();
        }
        return new Promise((resolve) => {
            const start = performance.now();
            const step = (now) => {
                const progress = Math.min(1, (now - start) / 1000);
                element.textContent = `+${this.format(target * (1 - Math.pow(1 - progress, 3)))}`;
                if (progress < 1) requestAnimationFrame(step);
                else resolve();
            };
            requestAnimationFrame(step);
        });
    },

    async celebrate(before, reward, streak) {
        const { ui } = this;
        const todayTile = ui.popTrack.querySelector(".dh-day.is-today");
        if (todayTile) {
            const center = this.centerOf(todayTile);
            todayTile.classList.remove("is-today");
            todayTile.classList.add("is-claimed");
            todayTile.insertAdjacentHTML("beforeend", this.checkSvg);
            if (!this.reducedMotion) {
                todayTile.animate([
                    { transform: "scale(1)" },
                    { transform: "scale(1.2)", offset: 0.35 },
                    { transform: "scale(1)" }
                ], { duration: 460, easing: "ease-out" });
                todayTile.querySelector(".dh-day-check")?.animate([
                    { transform: "scale(0)" },
                    { transform: "scale(1.25)", offset: 0.6 },
                    { transform: "scale(1)" }
                ], { duration: 380, easing: "ease-out" });
            }
            this.burst(center.x, center.y, ["#f97316", "#facc15", "#ffffff"], 16);
        }
        await this.wait(320);

        ui.pop.classList.remove("is-dead");
        ui.pop.classList.add("is-done");
        this.flashScreen("#f97316", 0.5);
        const flame = this.centerOf(ui.popFlame);
        this.burst(flame.x, flame.y, ["#f97316", "#facc15", "#dc2626", "#ffffff"], 30);
        if (!this.reducedMotion) {
            ui.popFlame.animate([
                { transform: "scale(1) rotate(0deg)" },
                { transform: "scale(1.4) rotate(-8deg)", offset: 0.35 },
                { transform: "scale(0.95) rotate(4deg)", offset: 0.7 },
                { transform: "scale(1) rotate(0deg)" }
            ], { duration: 700, easing: "ease-out" });
        }
        this.rollCount(reward.day);
        ui.popTitle.textContent = reward.day === 1 ? "Série lancée !" : `${reward.day} jours d'affilée !`;
        this.setSub(reward.day > 1 && reward.day > before.best ? "Nouveau record" : "");
        this.apply(streak);
        await this.wait(560);

        const counting = [];
        for (const item of reward.rewards) {
            counting.push(this.rewardTile(item));
            await this.wait(200);
        }
        if (reward.gold > 0) this.flashScreen("#facc15", 0.25);
        await Promise.all(counting);

        ui.popBtnLabel.textContent = "Continuer";
        ui.popBtn.disabled = false;
        if (!this.reducedMotion) {
            ui.popBtn.animate([
                { opacity: 0, transform: "translateY(10px)" },
                { opacity: 1, transform: "none" }
            ], { duration: 320, easing: "ease-out" });
        }
    }
};

document.addEventListener("DOMContentLoaded", () => {
    DailyHub.init();
});
