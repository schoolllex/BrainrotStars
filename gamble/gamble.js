const API_BASE_URL = window.API_BASE_URL;
const RARITY_COLORS = window.BRAINROT_RARITY_COLORS || {};
const RARITY_LABELS = {
    commun: "Commun",
    "peu-commun": "Peu commun",
    rare: "Rare",
    "tres-rare": "Très rare",
    epique: "Épique",
    legendaire: "Légendaire",
    mythique: "Mythique",
    divin: "Divin",
    ultime: "Ultime",
    secret: "Secret",
    ancestral: "Ancestral",
    eternel: "Éternel",
    sti: "STI"
};
const SEEN_KEY = "brainrot_gamble_seen";
const REDUCED_MOTION = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
const SPIN_MS = REDUCED_MOTION ? 1500 : 7500;
const SPIN_TURNS = REDUCED_MOTION ? 1 : 4;
const TICK_DEG = 15;
const LOSS_COLOR = "#7f1d1d";

const ui = {
    root: document.getElementById("gb-root"),
    spins: document.getElementById("gb-spins"),
    wheel: document.getElementById("gb-wheel"),
    pointer: document.getElementById("gb-pointer"),
    chance: document.getElementById("gb-chance"),
    hubLabel: document.getElementById("gb-hub-label"),
    slots: document.getElementById("gb-slots"),
    stakeCount: document.getElementById("gb-stake-count"),
    clear: document.getElementById("gb-clear"),
    odds: document.getElementById("gb-odds"),
    spin: document.getElementById("gb-spin"),
    spinLabel: document.getElementById("gb-spin-label"),
    grid: document.getElementById("gb-grid"),
    error: document.getElementById("gb-error"),
    retry: document.getElementById("gb-retry"),
    result: document.getElementById("gb-result"),
    resultStage: document.getElementById("gb-result-stage"),
    resultCards: document.getElementById("gb-result-cards"),
    resultParticles: document.getElementById("gb-result-particles"),
    resultKicker: document.getElementById("gb-result-kicker"),
    resultTitle: document.getElementById("gb-result-title"),
    resultText: document.getElementById("gb-result-text"),
    resultActions: document.getElementById("gb-result-actions"),
    again: document.getElementById("gb-again"),
    resultClose: document.getElementById("gb-result-close"),
    flash: document.getElementById("gb-flash"),
    toast: document.getElementById("gb-toast")
};

const state = {
    config: null,
    inventory: [],
    prizes: [],
    spinsLeft: 0,
    stake: [],
    cardId: null,
    spinning: false,
    frozen: null,
    rotation: 0,
    lastSpin: null,
    loaded: false
};

function rarityKey(rarity) {
    return String(rarity ?? "")
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "-");
}

function rarityTier(rarity) {
    return state.config ? state.config.tiers.indexOf(rarityKey(rarity)) : -1;
}

function rarityLabel(rarity) {
    return RARITY_LABELS[rarityKey(rarity)] || String(rarity ?? "");
}

function rarityColor(rarity) {
    return RARITY_COLORS[rarity] || RARITY_COLORS[rarityKey(rarity)] || "#a3a3a3";
}

function formatCompact(value) {
    const num = Number(value || 0);
    if (num >= 1e12) return `${(num / 1e12).toFixed(2).replace(/\.?0+$/, "")}T`;
    if (num >= 1e9) return `${(num / 1e9).toFixed(2).replace(/\.?0+$/, "")}B`;
    if (num >= 1e6) return `${(num / 1e6).toFixed(2).replace(/\.?0+$/, "")}M`;
    if (num >= 1e3) return `${(num / 1e3).toFixed(2).replace(/\.?0+$/, "")}K`;
    return `${Math.round(num * 100) / 100}`;
}

function pct(ratio) {
    const value = Math.floor(Number(ratio || 0) * 1000) / 10;
    return `${String(value).replace(".", ",")} %`;
}

function escapeHtml(text) {
    return String(text ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function cardVisual(card) {
    const img = typeof card.link === "string" && /^https?:\/\//i.test(card.link) ? card.link : "";
    const emoji = escapeHtml(card.emoji || "🃏");
    return img ? `<img src="${escapeHtml(img)}" alt="" loading="lazy" data-emoji="${emoji}">` : emoji;
}

function plural(count, word) {
    return `${count} ${word}${count > 1 ? "s" : ""}`;
}

function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, REDUCED_MOTION ? Math.min(ms, 120) : ms));
}

let toastTimer = null;
function toast(message, kind = "info") {
    ui.toast.textContent = message;
    ui.toast.classList.toggle("is-error", kind === "error");
    ui.toast.classList.remove("hidden");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => ui.toast.classList.add("hidden"), 3000);
}

async function api(path, { method = "GET", body } = {}) {
    const token = await window.BrainrotAuth.waitUntilReady();
    if (!token) return { success: false, message: "Connecte-toi pour jouer." };
    try {
        const response = await apiFetch(`${API_BASE_URL}${path}`, {
            method,
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            ...(body ? { body: JSON.stringify(body) } : {})
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
            return { success: false, status: response.status, code: payload?.code, message: payload?.message || `Erreur serveur (${response.status})` };
        }
        return payload || { success: false, message: "Réponse invalide" };
    } catch {
        return { success: false, message: "Connexion au serveur impossible" };
    }
}

function inventoryById() {
    return new Map(state.inventory.map((card) => [card.id, card]));
}

function stakeCounts() {
    const counts = new Map();
    for (const cardId of state.stake) counts.set(cardId, (counts.get(cardId) || 0) + 1);
    return counts;
}

function stakeStats(stake = state.stake) {
    const inventory = inventoryById();
    let value = 0;
    let topTier = -1;
    let topValue = 0;
    let smallest = Infinity;
    for (const cardId of stake) {
        const card = inventory.get(cardId);
        if (!card) continue;
        value += card.goldPerSec;
        topTier = Math.max(topTier, rarityTier(card.rarity));
        topValue = Math.max(topValue, card.goldPerSec);
        smallest = Math.min(smallest, card.goldPerSec);
    }
    return { value, topTier, topValue, smallest };
}

function rawChance(stakeValue, prizeValue) {
    if (!(stakeValue > 0) || !(prizeValue > 0)) return 0;
    return (stakeValue / prizeValue) * (1 - state.config.houseEdge);
}

const EMPTY_REASONS = {
    rare: "Aucun brainrot du jour n'est plus rare que ta mise",
    big: "Mise trop grosse : retire un brainrot",
    small: "Mise trop faible : ajoute des brainrots"
};

function evaluateOdds(stake = state.stake) {
    if (stake.length === 0) return { odds: [], reason: null };
    const cfg = state.config;
    const stats = stakeStats(stake);
    const odds = [];
    let better = 0;
    let tooBig = 0;
    for (const prize of state.prizes) {
        const card = prize.card;
        if (!card || rarityTier(card.rarity) <= stats.topTier || card.goldPerSec <= stats.topValue) continue;
        better += 1;
        const raw = rawChance(stats.value, card.goldPerSec);
        if (raw < cfg.minChance) continue;
        if (stake.length > 1 && rawChance(stats.value - stats.smallest, card.goldPerSec) >= cfg.maxChance) {
            tooBig += 1;
            continue;
        }
        if (odds.length < cfg.maxChoices) odds.push({ card, chance: Math.floor(Math.min(raw, cfg.maxChance) * 10000) / 10000 });
    }
    const reason = odds.length > 0 ? null : better === 0 ? "rare" : tooBig > 0 ? "big" : "small";
    return { odds, reason };
}

function isPlayable(card) {
    const tier = rarityTier(card.rarity);
    return state.prizes.some((prize) => prize.card && rarityTier(prize.card.rarity) > tier && prize.card.goldPerSec > card.goldPerSec);
}

function selectedOdd(odds) {
    if (odds.length === 0) return null;
    const kept = odds.find((odd) => odd.card.id === state.cardId);
    if (kept) return kept;
    state.cardId = odds[0].card.id;
    return odds[0];
}

function setWheelChance(chance) {
    const p = Math.max(0, Math.min(1, Number(chance) || 0));
    ui.wheel.classList.toggle("is-empty", p <= 0);
    ui.wheel.style.setProperty("--p", `${p * 100}%`);
    ui.wheel.style.setProperty("--from", `${-p * 180}deg`);
}

function renderSpins() {
    if (!state.config) return;
    const left = state.spinsLeft;
    ui.spins.textContent = left > 0
        ? `${left} tour${left > 1 ? "s" : ""} restant${left > 1 ? "s" : ""} aujourd'hui`
        : "Plus de tours aujourd'hui";
    ui.spins.classList.toggle("is-empty", left <= 0);
    if (!state.spinning) ui.spinLabel.textContent = left > 0 ? "Lancer la roue" : "Reviens demain";
}

function renderStake() {
    const inventory = inventoryById();
    const max = state.config.maxStake;
    const cards = state.frozen || state.stake.map((cardId) => inventory.get(cardId)).filter(Boolean);
    const slots = [];
    for (let i = 0; i < max; i += 1) {
        const card = cards[i];
        if (!card) {
            slots.push(`<span class="gb-slot"></span>`);
        } else if (state.frozen) {
            slots.push(`<span class="gb-slot is-filled" style="--rarity:${rarityColor(card.rarity)}">${cardVisual(card)}</span>`);
        } else {
            slots.push(`<button type="button" class="gb-slot is-filled" data-slot="${i}" style="--rarity:${rarityColor(card.rarity)}" aria-label="Retirer ${escapeHtml(card.name)}">${cardVisual(card)}</button>`);
        }
    }
    ui.slots.innerHTML = slots.join("");
    ui.stakeCount.textContent = `${cards.length} / ${max}`;
    ui.clear.disabled = state.stake.length === 0 || Boolean(state.frozen);
}

function renderOdds(odds, odd, reason) {
    if (state.frozen) return;
    if (reason) {
        ui.odds.innerHTML = `<p class="gb-odds-empty">${escapeHtml(EMPTY_REASONS[reason])}</p>`;
        ui.odds.classList.remove("has-active");
        return;
    }
    const tiles = odds.map((entry) => {
        const active = entry.card.id === odd?.card.id;
        return `
        <button type="button" class="gb-odd${active ? " is-active" : ""}" data-card="${escapeHtml(entry.card.id)}" style="--rarity:${rarityColor(entry.card.rarity)}" aria-pressed="${active}" aria-label="${escapeHtml(entry.card.name)}, ${pct(entry.chance)}">
            ${active ? `<span class="gb-odd-check" aria-hidden="true">✓</span>` : ""}
            <span class="gb-odd-img">${cardVisual(entry.card)}</span>
            <span class="gb-odd-pct">${pct(entry.chance)}</span>
            <span class="gb-odd-name">${escapeHtml(entry.card.name)}</span>
            <span class="gb-odd-cps">⚡ ${formatCompact(entry.card.goldPerSec)}/s</span>
        </button>`;
    });
    while (tiles.length < state.config.maxChoices) {
        tiles.push(`<span class="gb-odd is-placeholder" aria-hidden="true"><span class="gb-odd-img"></span><span class="gb-odd-pct"></span><span class="gb-odd-name"></span><span class="gb-odd-cps"></span></span>`);
    }
    ui.odds.innerHTML = tiles.join("");
    ui.odds.classList.toggle("has-active", Boolean(odd));
}

function renderControls(odd) {
    if (state.frozen) {
        ui.spin.disabled = true;
        return;
    }
    const chance = odd?.chance ?? 0;
    setWheelChance(chance);
    ui.chance.textContent = chance > 0 ? pct(chance) : "—";
    ui.hubLabel.textContent = "de chance";
    ui.spin.disabled = !odd || state.spinsLeft <= 0 || state.spinning;
}

function renderInventory() {
    if (state.inventory.length === 0) {
        ui.grid.innerHTML = `
            <div class="gb-empty">
                <span>Aucun brainrot ${escapeHtml(rarityLabel(state.config.minRarity))} ou plus rare dans ta collection.</span>
                <a class="gb-btn nav-link" href="../shop/shop.html">Ouvrir des caisses</a>
            </div>`;
        return;
    }
    const counts = stakeCounts();
    const full = state.stake.length >= state.config.maxStake;
    ui.grid.innerHTML = state.inventory.map((card) => {
        const left = card.quantity - (counts.get(card.id) || 0);
        const locked = !isPlayable(card);
        return `
            <button type="button" class="gb-item${locked ? " is-locked" : ""}" data-add="${escapeHtml(card.id)}"${left <= 0 || full || locked ? " disabled" : ""}${locked ? ` title="${escapeHtml(EMPTY_REASONS.rare)}"` : ""}>
                <span class="gb-item-img">${cardVisual(card)}</span>
                <span class="gb-item-qty">${locked ? "🔒" : `x${left}`}</span>
                <span class="gb-item-name">${escapeHtml(card.name)}</span>
                <span class="gb-item-row">
                    <span style="color:${rarityColor(card.rarity)}">${escapeHtml(rarityLabel(card.rarity))}</span>
                    <span class="gb-cps">⚡ ${formatCompact(card.goldPerSec)}/s</span>
                </span>
            </button>`;
    }).join("");
}

function render() {
    if (!state.config) return;
    const { odds, reason } = evaluateOdds();
    const odd = selectedOdd(odds);
    renderSpins();
    renderStake();
    renderOdds(odds, odd, reason);
    renderControls(odd);
    renderInventory();
}

function sanitizeStake() {
    const inventory = inventoryById();
    const used = new Map();
    state.stake = state.stake.filter((cardId) => {
        const card = inventory.get(cardId);
        if (!card) return false;
        const count = (used.get(cardId) || 0) + 1;
        if (count > card.quantity) return false;
        used.set(cardId, count);
        return true;
    }).slice(0, state.config.maxStake);
}

async function load({ silent = false } = {}) {
    if (!silent) GlobalLoader.show();
    try {
        const payload = await api("/gamble");
        if (!payload?.success) throw new Error(payload?.message || "Chargement impossible");
        state.config = payload.config;
        state.inventory = Array.isArray(payload.inventory) ? payload.inventory : [];
        state.prizes = Array.isArray(payload.prizes) ? payload.prizes : [];
        state.spinsLeft = Number(payload.spinsLeft) || 0;
        sanitizeStake();
        state.loaded = true;
        ui.error.classList.add("hidden");
        render();
        return true;
    } catch (error) {
        console.error("Erreur chargement gambling :", error);
        if (!state.loaded) ui.error.classList.remove("hidden");
        else toast("Impossible de rafraîchir ta collection.", "error");
        return false;
    } finally {
        if (!silent) GlobalLoader.hide(true);
    }
}

function addToStake(cardId) {
    if (state.spinning || state.frozen) return;
    const card = inventoryById().get(cardId);
    if (!card || state.stake.length >= state.config.maxStake) return;
    if ((stakeCounts().get(cardId) || 0) >= card.quantity) return;
    const next = evaluateOdds([...state.stake, cardId]);
    if (next.reason === "rare" || next.reason === "big") {
        toast(EMPTY_REASONS[next.reason], "error");
        return;
    }
    state.stake.push(cardId);
    render();
}

function readWheelAngle() {
    const match = /matrix\(([^)]+)\)/.exec(getComputedStyle(ui.wheel).transform || "");
    if (!match) return 0;
    const [a, b] = match[1].split(",").map(Number);
    return (Math.atan2(b, a) * 180) / Math.PI;
}

function tickPointer() {
    ui.pointer.animate([
        { transform: "translateX(-50%) rotate(-26deg)" },
        { transform: "translateX(-50%) rotate(0deg)" }
    ], { duration: 170, easing: "ease-out" });
}

async function animateWheel(roll, chance) {
    const landing = roll * 360 - chance * 180;
    const offset = ((-landing % 360) + 360) % 360;
    const start = state.rotation;
    const next = Math.ceil(start / 360) * 360 + SPIN_TURNS * 360 + offset;
    state.rotation = next;
    ui.wheel.style.transition = "none";

    const frames = REDUCED_MOTION
        ? [{ transform: `rotate(${start}deg)` }, { transform: `rotate(${next}deg)` }]
        : [
            { transform: `rotate(${start}deg)`, easing: "ease-in-out" },
            { transform: `rotate(${start - 16}deg)`, offset: 0.07, easing: "cubic-bezier(0.3, 0.55, 0.18, 1)" },
            { transform: `rotate(${next}deg)` }
        ];
    const animation = ui.wheel.animate(frames, { duration: SPIN_MS, easing: REDUCED_MOTION ? "ease-out" : "linear", fill: "forwards" });

    let frame = 0;
    let lastSegment = null;
    let lastTick = 0;
    const watch = (now) => {
        const segment = Math.floor(readWheelAngle() / TICK_DEG);
        if (lastSegment !== null && segment !== lastSegment && now - lastTick > 55) {
            tickPointer();
            lastTick = now;
        }
        lastSegment = segment;
        frame = requestAnimationFrame(watch);
    };
    if (!REDUCED_MOTION) frame = requestAnimationFrame(watch);

    try {
        await animation.finished;
    } catch {}
    cancelAnimationFrame(frame);
    ui.wheel.style.transform = `rotate(${next}deg)`;
    animation.cancel();
}

function resetWheel() {
    const next = Math.ceil(state.rotation / 360) * 360;
    if (next === state.rotation) return;
    state.rotation = next;
    ui.wheel.style.transition = REDUCED_MOTION ? "none" : "transform 700ms ease";
    ui.wheel.style.transform = `rotate(${next}deg)`;
}

function setBusy(busy) {
    state.spinning = busy;
    ui.root.classList.toggle("gb-busy", busy);
    if (busy) {
        ui.spinLabel.textContent = "La roue tourne…";
        ui.spin.disabled = true;
    } else {
        renderSpins();
    }
}

function canReplay() {
    if (!state.lastSpin || state.spinsLeft <= 0) return false;
    const inventory = inventoryById();
    const needed = new Map();
    for (const cardId of state.lastSpin.stake) needed.set(cardId, (needed.get(cardId) || 0) + 1);
    for (const [cardId, count] of needed) {
        if ((inventory.get(cardId)?.quantity || 0) < count) return false;
    }
    return true;
}

function burst(color, count) {
    if (REDUCED_MOTION) return;
    for (let i = 0; i < count; i += 1) {
        const dot = document.createElement("span");
        dot.className = "gb-particle";
        dot.style.background = color;
        ui.resultParticles.appendChild(dot);
        const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5;
        const dist = 90 + Math.random() * 110;
        dot.animate([
            { transform: "translate(0, 0) scale(1)", opacity: 1 },
            { transform: `translate(${Math.cos(angle) * dist}px, ${Math.sin(angle) * dist}px) scale(0.2) rotate(${Math.random() * 180}deg)`, opacity: 0 }
        ], { duration: 600 + Math.random() * 300, easing: "cubic-bezier(0.2, 0.8, 0.3, 1)" }).onfinish = () => dot.remove();
    }
}

function flash(color, strength) {
    if (REDUCED_MOTION) return;
    ui.flash.style.background = color;
    ui.flash.animate([
        { opacity: 0 },
        { opacity: strength, offset: 0.3 },
        { opacity: 0 }
    ], { duration: 700, easing: "ease-out" });
}

function fadeUp(element, delay) {
    element.animate([
        { opacity: 0, transform: "translateY(10px)" },
        { opacity: 1, transform: "translateY(0)" }
    ], { duration: 350, delay: REDUCED_MOTION ? 0 : delay, easing: "ease-out", fill: "forwards" });
}

function prizeCardElement(card) {
    const color = rarityColor(card.rarity);
    const element = document.createElement("div");
    element.className = "gb-prize-card is-big";
    element.style.setProperty("--rarity", color);
    element.style.setProperty("--rarity-glow", `${color}55`);
    element.innerHTML = `
        <span class="gb-prize-img">${cardVisual(card)}</span>
        <span class="gb-prize-name">${escapeHtml(card.name)}</span>
        <span class="gb-prize-rarity" style="color:${color}">${escapeHtml(rarityLabel(card.rarity))}</span>
        <span class="gb-prize-cps">⚡ ${formatCompact(card.goldPerSec)}/s</span>`;
    return element;
}

async function revealWin(card) {
    const color = rarityColor(card.rarity);
    await wait(250);
    ui.result.classList.add("is-lit");
    flash(color, 0.85);
    burst(color, 24);
    await wait(250);
    const element = prizeCardElement(card);
    ui.resultCards.appendChild(element);
    element.animate([
        { opacity: 0, transform: "scale(0.4) rotate(-10deg)" },
        { opacity: 1, transform: "scale(1.12) rotate(3deg)", offset: 0.6 },
        { opacity: 1, transform: "scale(1) rotate(0deg)" }
    ], { duration: REDUCED_MOTION ? 1 : 560, easing: "ease-out", fill: "forwards" });
    burst(color, 12);
    await wait(450);
}

async function revealLoss(stakeCards) {
    const elements = stakeCards.map((card) => {
        const element = document.createElement("span");
        element.className = "gb-lost-card";
        element.style.setProperty("--rarity", rarityColor(card.rarity));
        element.innerHTML = cardVisual(card);
        ui.resultCards.appendChild(element);
        return element;
    });
    elements.forEach((element, index) => element.animate([
        { opacity: 0, transform: "translateY(-14px) scale(0.8)" },
        { opacity: 1, transform: "translateY(0) scale(1)" }
    ], { duration: 260, delay: REDUCED_MOTION ? 0 : index * 60, easing: "ease-out", fill: "both" }));
    await wait(450 + elements.length * 60);
    ui.result.classList.add("is-lit");
    flash(LOSS_COLOR, 0.35);
    for (const [index, element] of elements.entries()) {
        element.animate([
            { opacity: 1, transform: "translate(0, 0) rotate(0deg) scale(1)" },
            { opacity: 1, transform: "translate(-5px, 0) rotate(-8deg) scale(1)", offset: 0.12 },
            { opacity: 1, transform: "translate(5px, 0) rotate(8deg) scale(1)", offset: 0.24 },
            { opacity: 1, transform: "translate(0, 0) rotate(0deg) scale(1)", offset: 0.36 },
            { opacity: 0, transform: `translate(${index % 2 ? 18 : -18}px, 60px) rotate(${index % 2 ? 35 : -35}deg) scale(0.5)` }
        ], { duration: REDUCED_MOTION ? 1 : 900, delay: REDUCED_MOTION ? 0 : index * 90, easing: "ease-in", fill: "forwards" });
    }
    await wait(400);
    burst("#525252", 16);
    await wait(500 + elements.length * 90);
    ui.resultCards.innerHTML = "";
    const emblem = document.createElement("span");
    emblem.className = "gb-lost-emblem";
    emblem.textContent = "💀";
    ui.resultCards.appendChild(emblem);
    emblem.animate([
        { opacity: 0, transform: "scale(0.3) rotate(-20deg)" },
        { opacity: 1, transform: "scale(1.15) rotate(8deg)", offset: 0.6 },
        { opacity: 1, transform: "scale(1) rotate(0deg)" }
    ], { duration: REDUCED_MOTION ? 1 : 500, easing: "ease-out", fill: "forwards" });
    await wait(300);
}

async function playResult(result, stakeCards) {
    const card = result.card;
    const win = Boolean(result.win && card);

    ui.result.classList.remove("hidden", "is-win", "is-lose", "is-lit");
    ui.result.classList.add(win ? "is-win" : "is-lose");
    ui.resultStage.style.setProperty("--glow", win ? rarityColor(card.rarity) : LOSS_COLOR);
    ui.resultCards.innerHTML = "";
    ui.resultParticles.innerHTML = "";
    for (const element of [ui.resultKicker, ui.resultTitle, ui.resultText, ui.resultActions]) {
        element.getAnimations().forEach((animation) => animation.cancel());
    }
    ui.resultActions.style.pointerEvents = "none";
    document.body.style.overflow = "hidden";

    if (win) {
        ui.resultKicker.textContent = "Gagné !";
        ui.resultTitle.textContent = card.name.trim();
        ui.resultText.textContent = `Avec ${pct(result.chance)} de chance, il rejoint ta collection.`;
    } else {
        ui.resultKicker.textContent = "Perdu";
        ui.resultTitle.textContent = "La roue ne t'a pas souri";
        ui.resultText.textContent = `Tu avais ${pct(result.chance)} de chance de gagner ${card ? card.name.trim() : "ce brainrot"}. Ta mise de ${plural(stakeCards.length, "brainrot")} est perdue.`;
    }
    ui.again.classList.toggle("hidden", !canReplay());

    if (win) await revealWin(card);
    else await revealLoss(stakeCards);

    fadeUp(ui.resultKicker, 0);
    fadeUp(ui.resultTitle, 90);
    fadeUp(ui.resultText, 180);
    fadeUp(ui.resultActions, 300);
    ui.resultActions.style.pointerEvents = "";
}

function closeResult() {
    if (ui.result.classList.contains("hidden")) return;
    ui.result.classList.add("hidden");
    ui.result.classList.remove("is-lit");
    document.body.style.overflow = "";
    state.frozen = null;
    resetWheel();
    render();
}

function replay() {
    if (!canReplay()) return;
    state.stake = [...state.lastSpin.stake];
    state.cardId = state.lastSpin.cardId;
    closeResult();
}

async function spin() {
    if (state.spinning || state.frozen) return;
    const odd = selectedOdd(evaluateOdds().odds);
    if (!odd || state.spinsLeft <= 0) return;

    const stake = [...stakeCounts()].map(([cardId, quantity]) => ({ cardId, quantity }));
    const stakeSnapshot = [...state.stake];
    setBusy(true);

    const result = await api("/gamble/spin", { method: "POST", body: { stake, card: odd.card.id } });
    if (!result?.success) {
        setBusy(false);
        toast(result?.message || "La roue n'a pas pu tourner.", "error");
        await load({ silent: true });
        return;
    }

    state.spinsLeft = Number(result.spinsLeft) || 0;
    state.lastSpin = { stake: stakeSnapshot, cardId: odd.card.id };
    const inventory = inventoryById();
    const stakeCards = stakeSnapshot.map((cardId) => inventory.get(cardId)).filter(Boolean);
    state.frozen = stakeCards;
    state.stake = [];
    setWheelChance(result.chance);
    ui.chance.textContent = pct(result.chance);
    renderSpins();
    window.PlayWebAnalytics?.track?.("gamble_spin", { value: result.stakeValue });

    const refresh = load({ silent: true });
    await animateWheel(result.roll, result.chance);

    ui.chance.textContent = result.win ? "Gagné" : "Perdu";
    ui.hubLabel.textContent = result.win ? "bravo" : "dommage";

    await Promise.all([refresh, wait(700)]);
    setBusy(false);
    await playResult(result, stakeCards);
}

function bindEvents() {
    ui.spin.addEventListener("click", spin);
    ui.retry.addEventListener("click", () => load());
    ui.clear.addEventListener("click", () => {
        if (state.spinning || state.frozen) return;
        state.stake = [];
        render();
    });

    ui.slots.addEventListener("click", (event) => {
        const slot = event.target.closest("button[data-slot]");
        if (!slot || state.spinning || state.frozen) return;
        state.stake.splice(Number(slot.dataset.slot), 1);
        render();
    });

    ui.odds.addEventListener("click", (event) => {
        const odd = event.target.closest("button[data-card]");
        if (!odd || state.spinning || state.frozen) return;
        state.cardId = odd.dataset.card;
        render();
    });

    ui.grid.addEventListener("click", (event) => {
        const item = event.target.closest(".gb-item");
        if (item && !item.disabled && item.dataset.add) addToStake(item.dataset.add);
    });

    ui.again.addEventListener("click", replay);
    ui.resultClose.addEventListener("click", closeResult);
    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && !state.spinning) closeResult();
    });

    document.addEventListener("error", (event) => {
        const img = event.target;
        if (!(img instanceof HTMLImageElement) || !img.dataset.emoji) return;
        img.replaceWith(document.createTextNode(img.dataset.emoji));
    }, true);
}

document.addEventListener("DOMContentLoaded", () => {
    try {
        localStorage.setItem(SEEN_KEY, "1");
    } catch {}
    lucide.createIcons();
    bindEvents();
    load();
});
