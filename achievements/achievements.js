/**
 * Page des succes : tout est calcule et verifie par le serveur
 * (GET /achievements, POST /achievements/:key/claim). La page ne fait
 * qu'afficher la progression et demander les recompenses.
 */
const API_BASE_URL = window.API_BASE_URL;

/** Icone et couleur de chaque categorie (meme palette que l'accueil). */
const CATEGORY_STYLE = {
    collection: { icon: "library", tone: "teal" },
    economie: { icon: "coins", tone: "purple" },
    caisses: { icon: "package", tone: "orange" },
    combat: { icon: "swords", tone: "sky" },
    villaggio: { icon: "castle", tone: "yellow" },
    social: { icon: "users", tone: "green" },
    progression: { icon: "trending-up", tone: "pink" }
};

const ui = {
    summaryText: document.getElementById("ach-summary-text"),
    summaryBar: document.getElementById("ach-summary-bar"),
    claimAll: document.getElementById("ach-claim-all"),
    filters: document.getElementById("ach-filters"),
    list: document.getElementById("ach-list"),
    error: document.getElementById("ach-error"),
    retry: document.getElementById("ach-retry"),
    toast: document.getElementById("ach-toast"),
    fx: document.getElementById("ach-fx"),
    flash: document.getElementById("ach-flash"),
    celebrate: document.getElementById("ach-celebrate"),
    celebrateTrophy: document.getElementById("ach-celebrate-trophy"),
    celebrateTitle: document.getElementById("ach-celebrate-title"),
    celebrateGold: document.getElementById("ach-celebrate-gold"),
    celebrateRewards: document.getElementById("ach-celebrate-rewards"),
    celebrateClose: document.getElementById("ach-celebrate-close")
};

const state = {
    categories: [],
    achievements: [],
    summary: { total: 0, unlocked: 0, claimable: 0 },
    filter: "all",
    claiming: new Set(),
    claimingAll: false
};

function formatCompact(value) {
    const num = Number(value || 0);
    if (num >= 1e12) return `${(num / 1e12).toFixed(2).replace(/\.?0+$/, "")} T`;
    if (num >= 1e9) return `${(num / 1e9).toFixed(2).replace(/\.?0+$/, "")} B`;
    if (num >= 1e6) return `${(num / 1e6).toFixed(2).replace(/\.?0+$/, "")} M`;
    if (num >= 1e3) return `${(num / 1e3).toFixed(2).replace(/\.?0+$/, "")} K`;
    return `${Math.floor(num)}`;
}

function escapeHtml(text) {
    return String(text).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

async function authHeaders() {
    const token = await window.BrainrotAuth.waitUntilReady();
    return token ? { Authorization: `Bearer ${token}` } : null;
}

// --- Rendu ----------------------------------------------------------------------

function renderSummary() {
    const { total, unlocked, claimable } = state.summary;
    ui.summaryText.textContent = claimable > 0
        ? `${unlocked} / ${total} débloqués · ${claimable} à récupérer`
        : `${unlocked} / ${total} débloqués`;
    ui.summaryBar.style.width = total > 0 ? `${(unlocked / total) * 100}%` : "0%";
    ui.claimAll.classList.toggle("hidden", claimable < 2);
}

function renderFilters() {
    const claimableIn = (category) => state.achievements.some((a) => a.category === category && a.unlocked && !a.claimed);
    const chips = [{ key: "all", label: "Tous" }, ...state.categories].map((category) => {
        const dot = category.key !== "all" && claimableIn(category.key) ? `<span class="ach-filter-dot"></span>` : "";
        const active = state.filter === category.key ? " active" : "";
        return `<button type="button" class="ach-filter${active}" data-filter="${category.key}">${escapeHtml(category.label)}${dot}</button>`;
    });
    ui.filters.innerHTML = chips.join("");
}

/** A recuperer d'abord, puis a faire (dans l'ordre des paliers), puis termines. */
function sortForDisplay(list) {
    const rank = (a) => (a.unlocked && !a.claimed ? 0 : a.unlocked ? 2 : 1);
    return list.map((a, i) => ({ a, i })).sort((x, y) => rank(x.a) - rank(y.a) || x.i - y.i).map(({ a }) => a);
}

function achievementCard(a) {
    const style = CATEGORY_STYLE[a.category] || CATEGORY_STYLE.collection;
    const claimable = a.unlocked && !a.claimed;
    const percent = a.target > 0 ? Math.min(100, (a.progress / a.target) * 100) : 0;
    const progressText = `${formatCompact(a.progress)} / ${formatCompact(a.target)}`;
    const rewardIcon = a.reward.type === "gold" ? "coins" : "package";

    let action;
    if (claimable) {
        const busy = state.claiming.has(a.key);
        action = `<button type="button" class="ach-claim" data-claim="${a.key}"${busy ? " disabled" : ""}>${busy ? "…" : "Récupérer"}<span class="shine" aria-hidden="true"></span></button>`;
    } else if (a.claimed) {
        action = `<span class="ach-state done"><i data-lucide="check"></i>Récupéré</span>`;
    } else {
        action = `<span class="ach-state"><i data-lucide="lock"></i></span>`;
    }

    const status = claimable ? " is-claimable" : a.claimed ? " is-claimed" : a.unlocked ? "" : " is-locked";
    return `
        <article class="ach-card tone-${style.tone}${status}">
            <span class="ach-icon tone-${style.tone}"><i data-lucide="${style.icon}"></i></span>
            <div class="ach-body">
                <div class="ach-title">${escapeHtml(a.title)}</div>
                <div class="ach-desc">${escapeHtml(a.description)}</div>
                <div class="ach-progress-row">
                    <div class="ach-progress small"><i style="width:${percent}%"></i></div>
                    <span class="ach-progress-text">${progressText}</span>
                </div>
                <div class="ach-reward"><i data-lucide="${rewardIcon}"></i>${escapeHtml(a.reward.label)}</div>
            </div>
            <div class="ach-action">${action}</div>
        </article>`;
}

function renderList() {
    const categories = state.filter === "all"
        ? state.categories
        : state.categories.filter((c) => c.key === state.filter);

    ui.list.innerHTML = categories.map((category) => {
        const items = sortForDisplay(state.achievements.filter((a) => a.category === category.key));
        if (items.length === 0) return "";
        const done = items.filter((a) => a.unlocked).length;
        return `
            <section class="ach-section">
                <div class="ach-section-title">
                    <h2>${escapeHtml(category.label)}</h2>
                    <span>${done} / ${items.length}</span>
                </div>
                <div class="ach-grid">${items.map(achievementCard).join("")}</div>
            </section>`;
    }).join("");
    lucide.createIcons();
}

function render() {
    renderSummary();
    renderFilters();
    renderList();
}

// --- Donnees --------------------------------------------------------------------

async function loadAchievements() {
    GlobalLoader.show();
    try {
        const headers = await authHeaders();
        if (!headers) return;
        const response = await apiFetch(`${API_BASE_URL}/achievements`, { headers });
        const payload = await response.json().catch(() => null);
        if (!response.ok || !payload?.success) throw new Error(payload?.message || `HTTP ${response.status}`);

        state.categories = Array.isArray(payload.categories) ? payload.categories : [];
        state.achievements = Array.isArray(payload.achievements) ? payload.achievements : [];
        state.summary = payload.summary || state.summary;
        ui.error.classList.add("hidden");
        render();
    } catch (error) {
        console.error("Erreur chargement des succès :", error);
        ui.summaryText.textContent = "Indisponibles pour le moment";
        ui.list.innerHTML = "";
        ui.error.classList.remove("hidden");
    } finally {
        GlobalLoader.hide(true);
    }
}

let toastTimer = null;
function showToast(text, isError = false) {
    ui.toast.textContent = text;
    ui.toast.classList.toggle("is-error", isError);
    ui.toast.classList.remove("hidden");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => ui.toast.classList.add("hidden"), 2600);
}

/** Recupere un succes. Renvoie la recompense, ou null en cas de refus. */
async function claimAchievement(key) {
    const headers = await authHeaders();
    if (!headers) return null;
    const response = await apiFetch(`${API_BASE_URL}/achievements/${encodeURIComponent(key)}/claim`, { method: "POST", headers });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.success) throw new Error(payload?.message || "Récupération impossible.");

    const achievement = state.achievements.find((a) => a.key === key);
    if (achievement) achievement.claimed = true;
    if (payload.summary) state.summary = payload.summary;
    return payload.reward;
}

const REDUCED_MOTION = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, REDUCED_MOTION ? Math.min(ms, 80) : ms));
}

function rewardText(reward) {
    if (reward?.type === "gold") return `+${formatCompact(reward.gold)} 💰`;
    return `${reward?.icon || "📦"} ×${Number(reward?.qty) || 1}`;
}

function burstAt(x, y, colors, count) {
    if (REDUCED_MOTION) return;
    for (let i = 0; i < count; i += 1) {
        const dot = document.createElement("span");
        dot.className = "ach-particle";
        dot.style.left = `${x}px`;
        dot.style.top = `${y}px`;
        dot.style.background = colors[i % colors.length];
        ui.fx.appendChild(dot);
        const angle = (Math.PI * 2 * i) / count + Math.random() * 0.6;
        const dist = 50 + Math.random() * 80;
        dot.animate([
            { transform: "translate(0, 0) scale(1)", opacity: 1 },
            { transform: `translate(${Math.cos(angle) * dist}px, ${Math.sin(angle) * dist}px) scale(0.2) rotate(${Math.random() * 180}deg)`, opacity: 0 }
        ], { duration: 550 + Math.random() * 300, easing: "cubic-bezier(0.2, 0.8, 0.3, 1)" }).onfinish = () => dot.remove();
    }
}

function floatReward(x, y, reward) {
    const chip = document.createElement("span");
    chip.className = `ach-float${reward?.type === "gold" ? " is-gold" : ""}`;
    chip.textContent = rewardText(reward);
    chip.style.left = `${x}px`;
    chip.style.top = `${y}px`;
    ui.fx.appendChild(chip);
    chip.animate([
        { opacity: 0, transform: "translate(-50%, -50%) scale(0.6)" },
        { opacity: 1, transform: "translate(-50%, -120%) scale(1.12)", offset: 0.25 },
        { opacity: 1, transform: "translate(-50%, -170%) scale(1)", offset: 0.7 },
        { opacity: 0, transform: "translate(-50%, -230%) scale(0.95)" }
    ], { duration: REDUCED_MOTION ? 900 : 1500, easing: "ease-out" }).onfinish = () => chip.remove();
}

function flash(color, strength) {
    if (REDUCED_MOTION) return;
    ui.flash.style.background = color;
    ui.flash.animate([
        { opacity: 0 },
        { opacity: strength, offset: 0.3 },
        { opacity: 0 }
    ], { duration: 650, easing: "ease-out" });
}

async function celebrateCard(key, reward) {
    const button = ui.list.querySelector(`[data-claim="${CSS.escape(key)}"]`);
    const card = button?.closest(".ach-card");
    if (!button || !card) return;
    const rect = button.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const tone = getComputedStyle(card).getPropertyValue("--tone-a").trim() || "#f97316";
    button.textContent = "✓";
    floatReward(x, y, reward);
    burstAt(x, y, [tone, "#facc15", "#ffffff"], 18);
    if (!REDUCED_MOTION) {
        const sweep = document.createElement("span");
        sweep.className = "ach-card-shine";
        card.appendChild(sweep);
        sweep.animate([
            { transform: "translateX(-120%) skewX(-20deg)" },
            { transform: "translateX(320%) skewX(-20deg)" }
        ], { duration: 700, easing: "ease-out" }).onfinish = () => sweep.remove();
        card.animate([
            { transform: "scale(1)" },
            { transform: "scale(1.025)", offset: 0.35 },
            { transform: "scale(1)" }
        ], { duration: 480, easing: "ease-out" });
        card.querySelector(".ach-icon")?.animate([
            { transform: "rotate(0deg) scale(1)" },
            { transform: "rotate(-12deg) scale(1.15)", offset: 0.3 },
            { transform: "rotate(10deg) scale(1.1)", offset: 0.6 },
            { transform: "rotate(0deg) scale(1)" }
        ], { duration: 600, easing: "ease-out" });
    }
    await wait(650);
}

async function onClaim(key) {
    if (state.claiming.has(key) || state.claimingAll) return;
    state.claiming.add(key);
    renderList();
    try {
        const reward = await claimAchievement(key);
        if (reward) await celebrateCard(key, reward);
    } catch (error) {
        showToast(error.message, true);
    } finally {
        state.claiming.delete(key);
        render();
    }
}

function celebrateTile(reward) {
    const gold = reward.type === "gold";
    const tile = document.createElement("div");
    tile.className = `ach-celebrate-tile${gold ? " is-gold" : ""}`;
    tile.innerHTML = `
        <span class="ach-celebrate-tile-icon">${gold ? "💰" : escapeHtml(reward.icon || "📦")}</span>
        <span class="ach-celebrate-tile-label">${escapeHtml(gold ? `+${formatCompact(reward.gold)}` : reward.label)}</span>`;
    ui.celebrateRewards.appendChild(tile);
    tile.animate([
        { opacity: 0, transform: "scale(0.4) rotate(-8deg)" },
        { opacity: 1, transform: "scale(1.12) rotate(2deg)", offset: 0.6 },
        { opacity: 1, transform: "scale(1) rotate(0deg)" }
    ], { duration: REDUCED_MOTION ? 1 : 420, easing: "ease-out", fill: "forwards" });
    const rect = tile.getBoundingClientRect();
    burstAt(rect.left + rect.width / 2, rect.top + rect.height / 2, gold ? ["#facc15", "#fde68a"] : ["#ffffff", "#f97316"], 10);
}

function countUp(element, target) {
    if (!(target > 0)) {
        element.textContent = "";
        return Promise.resolve();
    }
    if (REDUCED_MOTION) {
        element.textContent = `+${formatCompact(target)} pièces`;
        return Promise.resolve();
    }
    return new Promise((resolve) => {
        const start = performance.now();
        const step = (now) => {
            const progress = Math.min(1, (now - start) / 900);
            element.textContent = `+${formatCompact(target * (1 - Math.pow(1 - progress, 3)))} pièces`;
            if (progress < 1) requestAnimationFrame(step);
            else resolve();
        };
        requestAnimationFrame(step);
    });
}

function openCelebrate() {
    ui.celebrate.classList.remove("hidden", "is-done");
    ui.celebrateTitle.textContent = "Récupération…";
    ui.celebrateGold.textContent = "";
    ui.celebrateRewards.innerHTML = "";
    ui.celebrateClose.getAnimations().forEach((animation) => animation.cancel());
    document.body.style.overflow = "hidden";
}

async function finishCelebrate(count, gold) {
    ui.celebrate.classList.add("is-done");
    ui.celebrateTitle.textContent = count > 0
        ? `${count} récompense${count > 1 ? "s" : ""} récupérée${count > 1 ? "s" : ""} !`
        : "Aucune récompense récupérée";
    if (count > 0) {
        flash("#facc15", 0.55);
        const rect = ui.celebrateTrophy.getBoundingClientRect();
        burstAt(rect.left + rect.width / 2, rect.top + rect.height / 2, ["#facc15", "#f97316", "#ffffff"], 28);
        ui.celebrateTrophy.animate([
            { transform: "scale(1) rotate(0deg)" },
            { transform: "scale(1.3) rotate(-8deg)", offset: 0.4 },
            { transform: "scale(1) rotate(0deg)" }
        ], { duration: 600, easing: "ease-out" });
    }
    await countUp(ui.celebrateGold, gold);
    ui.celebrateClose.animate([
        { opacity: 0, transform: "translateY(10px)" },
        { opacity: 1, transform: "translateY(0)" }
    ], { duration: 350, easing: "ease-out", fill: "forwards" });
}

function closeCelebrate() {
    if (ui.celebrate.classList.contains("hidden") || state.claimingAll) return;
    ui.celebrate.classList.add("hidden");
    document.body.style.overflow = "";
    render();
}

async function onClaimAll() {
    const keys = state.achievements.filter((a) => a.unlocked && !a.claimed).map((a) => a.key);
    if (keys.length === 0 || state.claimingAll) return;
    state.claimingAll = true;
    ui.claimAll.disabled = true;
    openCelebrate();
    let gold = 0;
    let count = 0;
    let failure = null;
    await wait(350);
    for (const key of keys) {
        try {
            const reward = await claimAchievement(key);
            if (!reward) continue;
            count += 1;
            if (reward.type === "gold") gold += Number(reward.gold || 0);
            celebrateTile(reward);
            await wait(170);
        } catch (error) {
            failure = error.message;
            break;
        }
    }
    await finishCelebrate(count, gold);
    state.claimingAll = false;
    ui.claimAll.disabled = false;
    if (failure) showToast(failure, true);
}

// --- Evenements -----------------------------------------------------------------

ui.filters.addEventListener("click", (event) => {
    const chip = event.target.closest("[data-filter]");
    if (!chip) return;
    state.filter = chip.dataset.filter;
    renderFilters();
    renderList();
});

ui.list.addEventListener("click", (event) => {
    const button = event.target.closest("[data-claim]");
    if (button) onClaim(button.dataset.claim);
});

ui.claimAll.addEventListener("click", onClaimAll);
ui.celebrateClose.addEventListener("click", closeCelebrate);
document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeCelebrate();
});
ui.retry.addEventListener("click", loadAchievements);

document.addEventListener("DOMContentLoaded", () => {
    lucide.createIcons();
    loadAchievements();
});
