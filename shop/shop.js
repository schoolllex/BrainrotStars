const API_BASE_URL = window.API_BASE_URL + "";
const SHOP_ROUTE_BASE = "/shop";
const USER_ROUTE_BASES = ["/user"];
const GOLD_SYNC_INTERVAL_MS = 5 * 60 * 1000;

const ui = {
    wallet: document.getElementById("wallet-value"),
    caissesGrid: document.getElementById("caisses-grid"),
    boostCaissesGrid: document.getElementById("boost-caisses-grid"),
    countCaisses: document.getElementById("count-caisses"),
    countBoostCaisses: document.getElementById("count-boost-caisses"),
    buyModal: document.getElementById("buy-modal"),
    buyModalClose: document.getElementById("buy-modal-close"),
    buyModalItemName: document.getElementById("buy-modal-item-name"),
    buyModalToInventory: document.getElementById("buy-modal-to-inventory"),
    buyModalOpenNow: document.getElementById("buy-modal-open-now"),
    lootModal: document.getElementById("loot-modal"),
    lootModalClose: document.getElementById("loot-modal-close"),
    lootModalItemName: document.getElementById("loot-modal-item-name"),
    lootModalList: document.getElementById("loot-modal-list"),
    lootModalBonus: document.getElementById("loot-modal-bonus"),
    lootModalBonusValue: document.getElementById("loot-modal-bonus-value"),
    openInventoryModal: document.getElementById("open-inventory-modal"),
    openInventoryClose: document.getElementById("open-inventory-close"),
    openInventoryItemName: document.getElementById("open-inventory-item-name"),
    openInventoryQty: document.getElementById("open-inventory-qty"),
    openInventoryMax: document.getElementById("open-inventory-max"),
    openInventoryConfirm: document.getElementById("open-inventory-confirm"),
    scrollToInventoryBtn: document.getElementById("scroll-to-inventory"),
    inventorySection: document.getElementById("inventory-section"),
    inventoryGrid: document.getElementById("inventory-grid"),
    countInventory: document.getElementById("count-inventory"),
    openingOverlay: document.getElementById("opening-overlay"),
    crateContainer: document.getElementById("crate-container"),
    crateStage: document.getElementById("crate-stage"),
    crateTap: document.getElementById("crate-tap"),
    crateParticles: document.getElementById("crate-particles"),
    crateQty: document.getElementById("crate-qty"),
    crateTaps: document.getElementById("crate-taps"),
    crateBonusHint: document.getElementById("crate-bonus-hint"),
    crateFlash: document.getElementById("crate-flash"),
    bonusContainer: document.getElementById("bonus-container"),
    bonusChest: document.getElementById("bonus-chest"),
    bonusParticles: document.getElementById("bonus-particles"),
    bonusTitle: document.getElementById("bonus-title"),
    bonusSub: document.getElementById("bonus-sub"),
    rewardContainer: document.getElementById("reward-container"),
    rewardImage: document.getElementById("reward-image"),
    rewardEmoji: document.getElementById("reward-emoji"),
    rewardName: document.getElementById("reward-name"),
    rewardRarity: document.getElementById("reward-rarity"),
    rewardCps: document.getElementById("reward-cps"),
    singleRewardContent: document.getElementById("single-reward-content"),
    multiRewardContent: document.getElementById("multi-reward-content"),
    multiGrid: document.getElementById("multi-grid"),
    multiTotalCps: document.getElementById("multi-total-cps"),
    multiFooter: document.querySelector(".multi-footer"),
    multiContinueBtn: document.getElementById("multi-continue-btn"),
    closeOpeningBtn: document.getElementById("close-opening-btn"),
    skipAnimBtn: document.getElementById("skip-animation-btn"),
    promoCodeInput: document.getElementById("promo-code-input"),
    promoFeedback: document.getElementById("promo-feedback"),
    promoModal: document.getElementById("promo-modal"),
    promoStage: document.getElementById("promo-stage"),
    promoParticles: document.getElementById("promo-particles"),
    promoVisual: document.getElementById("promo-visual"),
    promoTitle: document.getElementById("promo-modal-title"),
    promoSub: document.getElementById("promo-sub"),
    promoInventory: document.getElementById("promo-inventory"),
    promoClose: document.getElementById("promo-close"),
    promoCodeBtn: document.getElementById("promo-code-btn")
};

let currentShop = null;
let modalState = {
    item: null,
    category: null,
    qty: 1
};
let inventoryOpenState = {
    item: null,
    ownedQty: 0,
    cardElement: null
};

let animationState = {
    skipping: false,
    /** Etape en cours a interrompre quand le joueur passe l'animation. */
    onSkip: null
};

let purchaseBlockedUntil = 0;

const economyState = {
    syncedGold: 0,
    coinPerSec: 0,
    syncedAtMs: Date.now(),
    syncInFlight: null
};

let userInventory = {};

const RARITY_COLORS = window.BRAINROT_RARITY_COLORS || {
    commun: "#a3a3a3",
    "peu-commun": "#22c55e",
    rare: "#3b82f6",
    "tres-rare": "#8b5cf6",
    ancestral: "#3b82f6",
    epique: "#a855f7",
    legendaire: "#f97316",
    mythique: "#ec4899",
    divin: "#eab308",
    ultime: "#ef4444",
    secret: "#a855f7",
    eternel: "#ef4444",
    STI: "#ec4899"
};

const RARITY_WEIGHTS = {
    commun: 60,
    ancestral: 25,
    epique: 10,
    divin: 4,
    eternel: 1
};

function getAuthToken() {
    return window.BrainrotAuth.getToken();
}

function setEconomySnapshot(gold, coinPerSec) {
    economyState.syncedGold = Math.max(0, Number(gold || 0));
    economyState.coinPerSec = Math.max(0, Number(coinPerSec || 0));
    economyState.syncedAtMs = Date.now();
}

function getSimulatedGoldNow() {
    const elapsedSec = Math.max(0, (Date.now() - economyState.syncedAtMs) / 1000);
    return Math.max(0, economyState.syncedGold + elapsedSec * economyState.coinPerSec);
}

function renderWalletFromEconomy() {
    ui.wallet.textContent = `${formatCompactPrice(getSimulatedGoldNow())}\u00A0💰`;
}

function isUuid(value) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ""));
}

/**
 * withAnimation : le joueur a touche la caisse jusqu'au bout, seul cas ou le
 * serveur tire le Brainrot bonus.
 */
async function tryOpenChestApiForQty(itemId, qty, withAnimation = false) {
    if (!isUuid(itemId)) return { handled: false, opened: 0, chests: [] };
    const token = getAuthToken();
    if (!token) return { handled: false, opened: 0, chests: [] };
    const safeQty = Math.max(0, Math.floor(Number(qty || 0)));
    if (safeQty <= 0) return { handled: true, opened: 0, chests: [] };

    for (const base of USER_ROUTE_BASES) {
        try {
            const response = await apiFetch(`${API_BASE_URL}${base}/chest/open`, {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${token}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    chestId: itemId,
                    quantity: safeQty,
                    animation: withAnimation === true
                })
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok || !payload?.success) {
                return { handled: true, opened: 0, chests: [], message: payload?.message || "Erreur lors de l'ouverture" };
            }
            const chests = Array.isArray(payload?.chests) ? payload.chests : [];
            const opened = chests.length || safeQty;
            return { handled: true, opened: Math.max(0, opened), chests };
        } catch {
            continue;
        }
    }
    return { handled: false, opened: 0, chests: [] };
}

let cachedBrainrotCatalog = null;

async function fetchBrainrotItems() {
    try {
        if (cachedBrainrotCatalog) {
            return cachedBrainrotCatalog;
        }

        const response = await apiFetch(`${API_BASE_URL}/user/getAllBrainRot`);
        if (!response.ok) {
            return null;
        }
        
        const payload = await response.json();
        if (!payload?.success || !Array.isArray(payload?.result)) {
            return null;
        }

        const catalog = {};
        payload.result.forEach(card => {
            const rarity = card.rarity || "commun";
            if (!catalog[rarity]) {
                catalog[rarity] = {
                    color: window.BRAINROT_RARITY_COLORS?.[rarity] || "#a3a3a3",
                    items: []
                };
            }
            catalog[rarity].items.push({
                name: card.name,
                emoji: card.emoji || "🃏",
                image: card.link || card.imageUrl || card.image || "",
                cps: card.goldPerSec || card.cps || 0
            });
        });

        cachedBrainrotCatalog = catalog;
        return catalog;
    } catch (error) {
        console.error("Error fetching brainrot items:", error);
        return null;
    }
}

function pickRandomRarity() {
    const rand = Math.random() * 100;
    let accum = 0;
    for (const [rarity, weight] of Object.entries(RARITY_WEIGHTS)) {
        accum += weight;
        if (rand <= accum) return rarity;
    }
    return "commun";
}

function pickRandomItem(data, rarity) {
    const category = data[rarity];
    if (!category || !category.items || !category.items.length) return null;
    const items = category.items;
    return items[Math.floor(Math.random() * items.length)];
}

/** Nombre de touches pour ouvrir une caisse, facon Brawl Stars. */
const OPEN_TAPS = 3;

function collectRewardItems(realChests) {
    const items = [];
    for (const chest of Array.isArray(realChests) ? realChests : []) {
        for (const reward of Array.isArray(chest?.rewards) ? chest.rewards : []) {
            if (reward.type !== "Card") continue;
            items.push({
                name: reward.cardName || "Mystère",
                emoji: "🃏",
                cps: reward.cardGoldPerSec || 0,
                image: reward.cardLink || "",
                rarity: reward.cardRarity || "commun",
                bonus: reward.bonus === true
            });
        }
    }
    return items;
}

/** Lumiere de la caisse touche apres touche ; la vraie couleur arrive a l'eclat. */
const CRATE_TAP_COLORS = ["#ffffff", "#fdba74", "#f97316"];

/** Couleur de la meilleure carte obtenue (plus gros revenu). */
function bestRarityColor(items) {
    const best = items.reduce((a, b) => (Number(b.cps || 0) > Number(a.cps || 0) ? b : a), items[0]);
    return RARITY_COLORS[best?.rarity] || "#ffffff";
}

function formatChance(chance) {
    return `${(chance * 100).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %`;
}

/** Attend ms, ou moins si le joueur passe l'animation. */
function waitUnlessSkipped(ms) {
    return new Promise((resolve) => {
        if (animationState.skipping) return resolve();
        const timer = setTimeout(done, ms);
        function done() {
            clearTimeout(timer);
            if (animationState.onSkip === done) animationState.onSkip = null;
            resolve();
        }
        animationState.onSkip = done;
    });
}

function setCratePower(stage, power, color) {
    const light = stage.querySelector(".crate-light");
    stage.style.setProperty("--crate-color", color);
    light.style.opacity = String(0.15 + power * 0.75);
    light.style.transform = `scale(${0.7 + power * 0.6})`;
    stage.querySelector(".crate-rays").style.opacity = String(power * 0.9);
}

function burstParticles(container, color, count = 12) {
    for (let i = 0; i < count; i++) {
        const dot = document.createElement("span");
        dot.className = "crate-particle";
        dot.style.background = color;
        container.appendChild(dot);
        const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5;
        const dist = 80 + Math.random() * 80;
        dot.animate([
            { transform: "translate(0, 0) scale(1)", opacity: 1 },
            { transform: `translate(${Math.cos(angle) * dist}px, ${Math.sin(angle) * dist}px) scale(0.2)`, opacity: 0 }
        ], { duration: 500 + Math.random() * 250, easing: "cubic-bezier(0.2, 0.8, 0.3, 1)" }).onfinish = () => dot.remove();
    }
}

function renderCrateTaps(done) {
    ui.crateTaps.innerHTML = Array.from({ length: OPEN_TAPS }, (_, i) => `<span class="${i < done ? "done" : ""}"></span>`).join("");
}

function waitForCrateTaps(colors) {
    return new Promise((resolve) => {
        let taps = 0;
        const done = () => {
            ui.crateTap.removeEventListener("click", onTap);
            if (animationState.onSkip === done) animationState.onSkip = null;
            resolve();
        };
        const onTap = () => {
            taps += 1;
            const color = colors[taps - 1];
            setCratePower(ui.crateStage, taps / OPEN_TAPS, color);
            renderCrateTaps(taps);
            ui.crateTap.animate([
                { transform: "scale(1) rotate(0deg)" },
                { transform: "scale(1.18, 0.82) rotate(-6deg)", offset: 0.25 },
                { transform: "scale(0.94, 1.1) rotate(5deg)", offset: 0.55 },
                { transform: "scale(1) rotate(0deg)" }
            ], { duration: 360, easing: "ease-out" });
            burstParticles(ui.crateParticles, color, 8 + taps * 4);
            if (taps >= OPEN_TAPS) done();
        };
        ui.crateTap.addEventListener("click", onTap);
        animationState.onSkip = done;
    });
}

async function burstCrate(color) {
    setCratePower(ui.crateStage, 1, color);
    ui.crateFlash.style.background = color;
    ui.crateTap.animate([
        { transform: "scale(1)", opacity: 1 },
        { transform: "scale(1.6)", opacity: 0 }
    ], { duration: 320, easing: "ease-in", fill: "forwards" });
    ui.crateFlash.animate([
        { opacity: 0 },
        { opacity: 0.9, offset: 0.3 },
        { opacity: 0 }
    ], { duration: 650, easing: "ease-out" });
    await waitUnlessSkipped(300);
}

async function playBonusMoment(crateEmoji, count) {
    ui.crateContainer.classList.add("hidden");
    ui.bonusContainer.classList.remove("hidden");
    ui.bonusChest.textContent = crateEmoji;
    ui.bonusTitle.textContent = count > 1 ? `+${count} Brainrots bonus !` : "+1 Brainrot bonus !";
    ui.bonusSub.textContent = count > 1
        ? `Tes caisses t'ont donné ${count} Brainrots en plus`
        : "Ta caisse t'a donné un Brainrot en plus";
    setCratePower(ui.bonusContainer.querySelector(".crate-stage"), 1, "#f97316");
    ui.bonusChest.animate([
        { transform: "scale(0) rotate(-25deg)" },
        { transform: "scale(1.25) rotate(8deg)", offset: 0.6 },
        { transform: "scale(1) rotate(0deg)" }
    ], { duration: 600, easing: "ease-out" });
    burstParticles(ui.bonusParticles, "#fdba74", 18);
    await waitUnlessSkipped(1700);
    ui.bonusContainer.classList.add("hidden");
}

/**
 * Ouverture facon Brawl Stars : le joueur touche la caisse OPEN_TAPS fois,
 * PUIS on demande l'ouverture au serveur. Passer l'animation avant la fin
 * ouvre quand meme les caisses, mais sans chance de Brainrot bonus.
 * openChests(withAnimation) renvoie { opened, chests, message }.
 */
async function playOpeningAnimation(qty, chestItem, openChests) {
    animationState.skipping = false;
    animationState.onSkip = null;
    const crateEmoji = chestItem.emoji || "📦";

    ui.openingOverlay.classList.remove("hidden");
    void ui.openingOverlay.offsetWidth;
    ui.openingOverlay.classList.add("active");
    document.body.classList.add("no-scroll");

    ui.crateContainer.classList.remove("hidden");
    ui.bonusContainer.classList.add("hidden");
    ui.rewardContainer.classList.add("hidden");
    ui.singleRewardContent.classList.add("hidden");
    ui.multiRewardContent.classList.add("hidden");
    ui.skipAnimBtn.classList.remove("hidden");

    ui.closeOpeningBtn.classList.add("hidden");
    ui.closeOpeningBtn.style.display = "none";

    ui.crateTap.getAnimations().forEach((animation) => animation.cancel());
    ui.crateTap.querySelector(".crate-shake").textContent = crateEmoji;
    ui.crateQty.textContent = `x${qty}`;
    ui.crateQty.classList.toggle("hidden", qty <= 1);
    ui.crateBonusHint.textContent = `${formatChance(chestItem.bonusChance)} de chance de Brainrot bonus par caisse si tu ne passes pas l'animation`;
    ui.crateBonusHint.classList.toggle("hidden", !(chestItem.bonusChance > 0));
    setCratePower(ui.crateStage, 0, CRATE_TAP_COLORS[0]);
    renderCrateTaps(0);

    await waitForCrateTaps(CRATE_TAP_COLORS);
    const withAnimation = !animationState.skipping;

    // La caisse tremble le temps que le serveur reponde.
    ui.crateTap.classList.add("is-charging");
    const result = { opened: 0, chests: [], ...(await openChests(withAnimation)) };
    ui.crateTap.classList.remove("is-charging");

    const items = collectRewardItems(result.chests);
    if (!result.opened || items.length === 0) {
        closeOpeningOverlay();
        return { ...result, opened: 0 };
    }

    const bonusCount = items.filter((reward) => reward.bonus).length;
    if (!animationState.skipping) await burstCrate(bestRarityColor(items));
    if (bonusCount > 0 && !animationState.skipping) await playBonusMoment(crateEmoji, bonusCount);

    ui.crateContainer.classList.add("hidden");
    ui.bonusContainer.classList.add("hidden");
    ui.rewardContainer.classList.remove("hidden");

    if (items.length === 1) {
        const item = items[0];
        ui.singleRewardContent.classList.remove("hidden");

        if (item.image) {
            ui.rewardImage.src = item.image;
            ui.rewardImage.classList.remove("hidden");
            ui.rewardEmoji.classList.add("hidden");
        } else {
            ui.rewardImage.classList.add("hidden");
            ui.rewardEmoji.textContent = item.emoji;
            ui.rewardEmoji.classList.remove("hidden");
        }

        ui.rewardName.textContent = item.name;
        ui.rewardCps.textContent = formatCompactPrice(item.cps || 0);
        ui.rewardRarity.textContent = item.rarity.toUpperCase();

        const color = RARITY_COLORS[item.rarity] || "#fff";
        ui.rewardRarity.style.color = color;
        ui.rewardRarity.style.borderColor = color;
        ui.rewardRarity.style.boxShadow = `0 0 15px ${color}40`;
        ui.rewardRarity.className = `reward-rarity rarity-${item.rarity}`;
        ui.skipAnimBtn.classList.add("hidden");
        ui.closeOpeningBtn.classList.remove("hidden");
        ui.closeOpeningBtn.style.display = "inline-flex";

    } else {
        ui.multiRewardContent.classList.remove("hidden");
        ui.multiGrid.innerHTML = "";

        // Une a une jusqu'a x10 (+ bonus), sinon tout d'un coup.
        const revealOneByOne = items.length <= 12;
        if (revealOneByOne && !animationState.skipping) {
            if (ui.multiFooter) ui.multiFooter.classList.add("hidden");
        } else {
            if (ui.multiFooter) ui.multiFooter.classList.remove("hidden");
        }

        let totalCps = 0;

        items.sort((a, b) => (b.cps || 0) - (a.cps || 0));

        const cards = [];
        items.forEach(item => {
            totalCps += (item.cps || 0);
            const card = document.createElement("div");
            card.className = `multi-item-card multi-card-${item.rarity}${item.bonus ? " is-bonus" : ""}`;

            if (revealOneByOne) {
                card.style.opacity = "0";
                card.style.transform = "scale(0.5)";
            }

            const imgHtml = item.image
                ? `<img src="${item.image}" class="multi-item-img" alt="${item.name}">`
                : `<div style="font-size: 3rem;">${item.emoji}</div>`;

            card.innerHTML = `
                ${item.bonus ? `<span class="multi-item-bonus">Bonus</span>` : ""}
                ${imgHtml}
                <div class="multi-item-name" title="${item.name}">${item.name}</div>
                <div class="multi-item-cps">⚡ ${formatCompactPrice(item.cps)}/s</div>
            `;
            ui.multiGrid.appendChild(card);
            cards.push(card);
        });

        ui.multiTotalCps.textContent = formatCompactPrice(totalCps);

        if (revealOneByOne) {
            for (let i = 0; i < cards.length; i++) {
                await waitUnlessSkipped(400);
                const card = cards[i];
                card.style.transition = "all 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)";
                card.style.opacity = "1";
                card.style.transform = "scale(1)";
            }
            await waitUnlessSkipped(300);

            if (ui.multiFooter) {
                ui.multiFooter.classList.remove("hidden");
                ui.multiFooter.animate([
                    { opacity: 0, transform: 'translateY(20px)' },
                    { opacity: 1, transform: 'translateY(0)' }
                ], { duration: 500, fill: 'forwards' });
            }
        }

        ui.skipAnimBtn.classList.add("hidden");
    }
    return result;
}

function closeOpeningOverlay() {
    ui.openingOverlay.classList.remove("active");
    document.body.classList.remove("no-scroll");
    setTimeout(() => {
        ui.openingOverlay.classList.add("hidden");
    }, 300);
}


function formatCompactPrice(value) {
    const num = Number(value || 0);
    if (num >= 1_000_000_000_000) {
        return `${(num / 1_000_000_000_000).toFixed(2).replace(/\.00$/, "")}T`;
    }
    if (num >= 1_000_000_000) {
        return `${(num / 1_000_000_000).toFixed(2).replace(/\.00$/, "")}B`;
    }
    if (num >= 1_000_000) {
        return `${(num / 1_000_000).toFixed(2).replace(/\.00$/, "")}M`;
    }
    if (num >= 1_000) {
        return `${(num / 1_000).toFixed(2).replace(/\.00$/, "")}K`;
    }
    return `${(Math.round(num * 100) / 100).toFixed(2).replace(/\.00$/, "").replace(/(\.\d)0$/, "$1")}`;
}

async function fetchUserInventory() {
    const token = getAuthToken();
    if (!token) return;
    try {
        const response = await apiFetch(`${API_BASE_URL}/user/inv`, {
            method: "GET",
            headers: {
                "Authorization": `Bearer ${token}`
            }
        });
        if (!response.ok) return;
        const data = await response.json();
        if (!data?.success) return;
        const inventoryList = Array.isArray(data?.result)
            ? data.result
            : Array.isArray(data?.result?.result)
                ? data.result.result
                : Array.isArray(data?.inv)
                    ? data.inv
                    : Array.isArray(data?.value)
                        ? data.value
                        : [];
        userInventory = {};
        inventoryList.forEach((item) => {
            const chestId = item?.chest?.id || item?.chestId;
            if (!chestId) return;
            const rawQty = Number(item?.quantity ?? item?.qty ?? 1);
            const qty = Number.isFinite(rawQty) && rawQty > 0 ? Math.floor(rawQty) : 1;
            userInventory[chestId] = (userInventory[chestId] || 0) + qty;
        });
    } catch (error) {
    }
}

function getRandomDisplayMoney() {
    const min = 10_000_000;
    const max = 99_000_000_000;
    return Math.floor(Math.random() * (max - min + 1) + min);
}

async function fetchUserStats() {
    const token = getAuthToken();
    if (!token) return null;
    for (const base of USER_ROUTE_BASES) {
        try {
            const response = await apiFetch(`${API_BASE_URL}${base}/stats`, {
                headers: {
                    "Authorization": `Bearer ${token}`
                }
            });
            if (!response.ok) continue;
            const payload = await response.json();
            if (!payload?.success || !payload?.value) continue;
            return payload.value;
        } catch {
            continue;
        }
    }
    return null;
}

async function fetchUserGold(token) {
    for (const base of USER_ROUTE_BASES) {
        try {
            const response = await apiFetch(`${API_BASE_URL}${base}/gold`, {
                headers: {
                    "Authorization": `Bearer ${token}`
                }
            });
            if (!response.ok) continue;
            const payload = await response.json();
            if (payload?.success && typeof payload?.value !== "undefined") {
                return Number(payload.value || 0);
            }
            if (payload && typeof payload?.gold !== "undefined") {
                return Number(payload.gold || 0);
            }
            if (typeof payload === "number") {
                return Number(payload || 0);
            }
        } catch {
            continue;
        }
    }
    return null;
}

async function syncEconomyFromServer({ forceGoldSync = false } = {}) {
    if (economyState.syncInFlight) return economyState.syncInFlight;
    economyState.syncInFlight = (async () => {
        const token = getAuthToken();
        if (!token) return false;
        const stats = await fetchUserStats();
        if (!stats) return false;
        const nextCoinPerSec = Number(stats.coinPerSec || 0);
        let nextGold = Number(stats.gold || 0);
        const shouldSyncGold = forceGoldSync || Date.now() - economyState.syncedAtMs >= GOLD_SYNC_INTERVAL_MS;
        if (shouldSyncGold) {
            const apiGold = await fetchUserGold(token);
            if (apiGold !== null) nextGold = apiGold;
        }
        setEconomySnapshot(nextGold, nextCoinPerSec);
        renderWalletFromEconomy();
        return true;
    })().finally(() => {
        economyState.syncInFlight = null;
    });
    return economyState.syncInFlight;
}

async function buyShopItemByApi(itemId, qty) {
    if (!isUuid(itemId)) return { bought: 0, outOfMoney: false };
    const token = getAuthToken();
    if (!token) return { bought: 0, outOfMoney: false };
    const safeQty = Math.max(1, Math.floor(Number(qty || 1)));
    let outOfMoney = false;
    let bought = 0;
    
    // Un seul appel API pour acheter toutes les caisses
    try {
        const response = await apiFetch(`${API_BASE_URL}${SHOP_ROUTE_BASE}/buy/${encodeURIComponent(itemId)}/${safeQty}`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${token}`
            }
        });
        if (!response.ok) {
            try {
                const payload = await response.json();
                const message = String(payload?.message || payload?.error || "");
                if (message.toLowerCase().includes("no money")) outOfMoney = true;
            } catch {}
            return { bought: 0, outOfMoney };
        }
        const payload = await response.json();
        if (!payload?.success) {
            const message = String(payload?.message || payload?.error || "");
            if (message.toLowerCase().includes("no money")) outOfMoney = true;
            return { bought: 0, outOfMoney };
        }
        bought = safeQty;
    } catch {
        return { bought: 0, outOfMoney: false };
    }
    
    return { bought, outOfMoney };
}

function isSeasonalChestName(name) {
    return String(name || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .includes("saison");
}

function normalizeShopData(payload) {
    const chestList = Array.isArray(payload?.result?.result) ? payload.result.result : [];
    const caisses = [];
    const caissesBoost = [];

    chestList.forEach((chest) => {
        // Grouper les loots par rarity
        const lootsByRarity = {};
        if (Array.isArray(chest?.loot)) {
            chest.loot.forEach(loot => {
                const rarity = loot?.rarity || "unknown";
                const dropRate = Number(loot?.dropRate || 0);
                if (!lootsByRarity[rarity]) {
                    lootsByRarity[rarity] = 0;
                }
                lootsByRarity[rarity] += dropRate * 100;
            });
        }

        const item = {
            id: chest?.id,
            nom: chest?.name || "Caisse inconnue",
            emoji: chest?.icon || "📦",
            prix: Number(chest?.baseCoins || 0),
            probabilites: lootsByRarity,
            bonusChance: Number(chest?.bonusChance || 0),
            description: chest?.description || "",
            loot: chest?.loot || []
        };

        // Si le nom de la caisse contient "saison" (ex: "Caisse Saisonnière"),
        // elle va dans la section boost / caisses saisonnières plutôt que dans les caisses normales.
        if (isSeasonalChestName(chest?.name)) {
            caissesBoost.push(item);
        } else {
            caisses.push(item);
        }
    });

    return {
        categories: {
            caisses,
            boosts: { caisses_boost: caissesBoost }
        }
    };
}

function getSelectedQtyButtons() {
    return Array.from(document.querySelectorAll(".buy-qty-btn"));
}


function getTotalPrice(item, qty) {
    const unit = Number(item?.prix || 0);
    return unit * qty;
}

function setActionLabel(button, label, price) {
    const text = document.createElement("span");
    text.className = "buy-modal-action-label";
    text.textContent = label;
    const cost = document.createElement("span");
    cost.className = "buy-modal-action-price";
    cost.textContent = price;
    button.replaceChildren(text, cost);
}

function updateModalActionTexts() {
    if (!modalState.item) return;
    const total = getTotalPrice(modalState.item, modalState.qty);
    const totalText = `${formatCompactPrice(total)}\u00A0💰`;
    const currentGold = getSimulatedGoldNow();
    const canAfford = currentGold >= total;
    
    setActionLabel(ui.buyModalToInventory, "Mettre en inv", totalText);
    setActionLabel(ui.buyModalOpenNow, "Ouvrir tout de suite", totalText);
    
    ui.buyModalToInventory.disabled = !canAfford;
    ui.buyModalOpenNow.disabled = !canAfford;
    ui.buyModalToInventory.classList.toggle("disabled", !canAfford);
    ui.buyModalOpenNow.classList.toggle("disabled", !canAfford);
    
    if (!canAfford) {
        const needed = total - currentGold;
        const tooltip = `Tu as besoin de ${formatCompactPrice(needed)}\u00A0💰 de plus`;
        ui.buyModalToInventory.title = tooltip;
        ui.buyModalOpenNow.title = tooltip;
    } else {
        ui.buyModalToInventory.title = "";
        ui.buyModalOpenNow.title = "";
    }
}


function syncQtySelectionUI() {
    getSelectedQtyButtons().forEach((btn) => {
        const btnQty = Number(btn.dataset.qty);
        btn.classList.toggle("active", btnQty === modalState.qty);
    });
}

function openBuyModal(item, category) {
    modalState = { item, category, qty: 1 };
    ui.buyModalItemName.textContent = `${item.emoji || "📦"}\u00A0${item.nom}`;
    syncQtySelectionUI();
    ui.buyModal.classList.remove("hidden");
    document.body.classList.add("no-scroll");
    lucide.createIcons();
    syncEconomyFromServer({ forceGoldSync: true });
    
    // Mettre à jour l'état des boutons tous les 500ms
    const updateButtonsInterval = setInterval(() => {
        if (ui.buyModal.classList.contains("hidden")) {
            clearInterval(updateButtonsInterval);
            return;
        }
        if (Date.now() < purchaseBlockedUntil) return;
        updateModalActionTexts();
    }, 500);
}

function closeBuyModal() {
    ui.buyModal.classList.add("hidden");
    if (ui.openInventoryModal.classList.contains("hidden")) {
        document.body.classList.remove("no-scroll");
    }
}

function onSelectQuantity(qty) {
    modalState.qty = qty;
    syncQtySelectionUI();
    updateModalActionTexts();
}

function canPurchaseCurrentSelection() {
    if (!modalState.item) return false;
    return true;
}


function purchaseToInventory() {
    if (!canPurchaseCurrentSelection()) return;
    if (Date.now() < purchaseBlockedUntil) return;
    
    const total = getTotalPrice(modalState.item, modalState.qty);
    const currentGold = getSimulatedGoldNow();
    if (currentGold < total) {
        const needed = total - currentGold;
        alert(`Tu as besoin de ${formatCompactPrice(needed)}\u00A0💰 de plus pour effectuer cet achat.`);
        return;
    }

    purchaseBlockedUntil = Date.now() + 2000;
    ui.buyModalToInventory.disabled = true;
    ui.buyModalOpenNow.disabled = true;
    setTimeout(() => {
        ui.buyModalToInventory.disabled = false;
        ui.buyModalOpenNow.disabled = false;
        updateModalActionTexts();
    }, 2000);
    
    syncEconomyFromServer({ forceGoldSync: true })
        .then(() => buyShopItemByApi(modalState.item.id, modalState.qty))
        .then(async ({ bought, outOfMoney }) => {
            if (bought <= 0) {
                alert(outOfMoney ? "Vous n'avez pas assez d'argent pour ouvrir ce coffre." : "Achat impossible pour le moment.");
                return;
            }
            await fetchUserInventory();
            closeBuyModal();
            renderShop(currentShop);
            syncEconomyFromServer({ forceGoldSync: true });
        });
}

async function purchaseOpenNow() {
    if (!canPurchaseCurrentSelection()) return;
    if (Date.now() < purchaseBlockedUntil) return;
    const qty = modalState.qty;
    const item = modalState.item;

    await syncEconomyFromServer({ forceGoldSync: true });
    
    const total = getTotalPrice(item, qty);
    const currentGold = getSimulatedGoldNow();
    if (currentGold < total) {
        const needed = total - currentGold;
        alert(`Tu as besoin de ${formatCompactPrice(needed)}\u00A0💰 de plus pour effectuer cet achat.`);
        return;
    }

    purchaseBlockedUntil = Date.now() + 2000;
    ui.buyModalToInventory.disabled = true;
    ui.buyModalOpenNow.disabled = true;
    setTimeout(() => {
        ui.buyModalToInventory.disabled = false;
        ui.buyModalOpenNow.disabled = false;
        updateModalActionTexts();
    }, 2000);
    
    const { bought, outOfMoney } = await buyShopItemByApi(item.id, qty);
    if (bought <= 0) {
        alert(outOfMoney ? "Vous n'avez pas assez d'argent pour ouvrir ce coffre." : "Achat impossible pour le moment.");
        return;
    }

    closeBuyModal();
    const result = await playOpeningAnimation(bought, item, (withAnimation) => tryOpenChestApiForQty(item.id, bought, withAnimation));
    if (!result.opened) {
        alert(`${result.message || "Ouverture indisponible pour le moment."}\nTes caisses t'attendent dans ton inventaire.`);
    }

    await fetchUserInventory();
    renderShop(currentShop);
    await syncEconomyFromServer({ forceGoldSync: true });
}

function openInventoryOpenModal(item, ownedQty, cardElement) {
    const maxQty = Math.min(ownedQty, 50);

    inventoryOpenState = { item, ownedQty, cardElement };
    ui.openInventoryItemName.textContent = `${item.emoji || "📦"}\u00A0${item.nom}`;
    ui.openInventoryQty.value = "1";
    ui.openInventoryQty.max = `${maxQty}`;
    ui.openInventoryMax.textContent = `Tu possèdes ${formatCompactPrice(ownedQty)} exemplaire(s). (max 50 utilisables)`;
    ui.openInventoryModal.classList.remove("hidden");
    document.body.classList.add("no-scroll");
    lucide.createIcons();
}

function closeInventoryOpenModal() {
    ui.openInventoryModal.classList.add("hidden");
    if (ui.buyModal.classList.contains("hidden")) {
        document.body.classList.remove("no-scroll");
    }
}

function openLootModal(item) {
    ui.lootModalItemName.textContent = `${item.emoji || "📦"}\u00A0${item.nom}`;
    ui.lootModalList.innerHTML = createLootDisplay(item.probabilites);
    ui.lootModalBonusValue.textContent = formatChance(item.bonusChance);
    ui.lootModalBonus.classList.toggle("hidden", !(item.bonusChance > 0));
    ui.lootModal.classList.remove("hidden");
    document.body.classList.add("no-scroll");
}

function closeLootModal() {
    ui.lootModal.classList.add("hidden");
    if (ui.buyModal.classList.contains("hidden") && ui.openInventoryModal.classList.contains("hidden")) {
        document.body.classList.remove("no-scroll");
    }
}

function getOpenQtyValue() {
    const raw = Number(ui.openInventoryQty.value || 1);
    if (!Number.isFinite(raw)) return 1;
    return Math.floor(raw);
}

function triggerOpenAnimation(cardElement) {
    if (!cardElement) return;
    cardElement.classList.remove("open-flash");
    requestAnimationFrame(() => {
        cardElement.classList.add("open-flash");
        setTimeout(() => cardElement.classList.remove("open-flash"), 950);
    });
}

async function confirmOpenInventoryQuantity() {
    if (!inventoryOpenState.item) return;
    const requested = getOpenQtyValue();
    const qty = Math.min(Math.max(requested, 1), inventoryOpenState.ownedQty);
    if (qty <= 0) return;
    
    const item = inventoryOpenState.item;
    closeInventoryOpenModal();

    const result = await playOpeningAnimation(qty, item, (withAnimation) => tryOpenChestApiForQty(item.id, qty, withAnimation));
    if (!result.opened) alert(result.message || "Ouverture impossible pour le moment.");

    await fetchUserInventory();
    renderShop(currentShop);
}

function createLootDisplay(lootsByRarity) {
    const rarityOrder = ["commun", "peu-commun", "rare", "tres-rare", "epique", "legendaire", "mythique", "divin", "ultime", "secret", "ancestral", "eternel", "STI"];
    
    const sortedRarities = Object.entries(lootsByRarity)
        .sort((a, b) => {
            const indexA = rarityOrder.indexOf(a[0]);
            const indexB = rarityOrder.indexOf(b[0]);
            return indexA - indexB;
        });
    
    if (sortedRarities.length === 0) {
        return '<div class="loot-list">Aucun loot disponible</div>';
    }
    
    const lootHTML = sortedRarities.map(([rarity, percentage]) => {
        const color = RARITY_COLORS[rarity] || "#a3a3a3";
        const displayPercentage = percentage.toFixed(1);
        return `<div class="loot-item" style="border-left: 3px solid ${color}">
            <span class="loot-rarity" style="color: ${color}">${rarity.toUpperCase()}</span>
            <span class="loot-percentage">${displayPercentage}%</span>
        </div>`;
    }).join('');
    
    return `<div class="loot-list">${lootHTML}</div>`;
}

function createBuyCard(item, category) {
    const card = document.createElement("article");
    card.className = "shop-card";

    card.innerHTML = `
        <div class="shop-card-head">
            <div class="shop-card-name">${item.emoji || "📦"}\u00A0${item.nom}</div>
            <div class="shop-card-price">${formatCompactPrice(item.prix)}\u00A0💰</div>
        </div>
        <button class="loot-toggle" type="button">
            <span>Voir les raretés</span>
            <i data-lucide="chevron-right"></i>
        </button>
        <button class="buy-btn" type="button">Acheter</button>
    `;

    card.querySelector(".loot-toggle").addEventListener("click", () => openLootModal(item));

    const buyBtn = card.querySelector(".buy-btn");
    
    const updateButtonState = () => {
        const currentGold = getSimulatedGoldNow();
        const canAfford = currentGold >= item.prix;
        buyBtn.disabled = !canAfford;
        buyBtn.classList.toggle("disabled", !canAfford);
        if (!canAfford) {
            buyBtn.title = `Tu as besoin de ${formatCompactPrice(item.prix - currentGold)}\u00A0💰 de plus`;
        } else {
            buyBtn.title = "";
        }
    };
    
    updateButtonState();
    
    buyBtn.addEventListener("click", () => {
        updateButtonState();
        if (!buyBtn.disabled) {
            openBuyModal(item, category);
        }
    });
    
    // Mettre à jour l'état du bouton tous les 500ms quand le gold change
    const updateInterval = setInterval(updateButtonState, 500);
    
    // Nettoyer l'intervalle quand la carte est retirée du DOM
    const observer = new MutationObserver((mutations) => {
        if (!document.contains(card)) {
            clearInterval(updateInterval);
            observer.disconnect();
        }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    return card;
}

function buildShopItemMap(data) {
    const map = new Map();
    const caisses = Array.isArray(data?.categories?.caisses) ? data.categories.caisses : [];
    const boostCaisses = Array.isArray(data?.categories?.boosts?.caisses_boost)
        ? data.categories.boosts.caisses_boost
        : [];
    [...caisses, ...boostCaisses].forEach((item) => {
        if (item?.id) map.set(item.id, item);
    });
    return map;
}

function renderInventory(data) {
    const itemMap = buildShopItemMap(data);
    const ownedEntries = Object.entries(userInventory)
        .map(([itemId, qty]) => ({ itemId, qty: Number(qty || 0) }))
        .filter((entry) => entry.qty > 0 && itemMap.has(entry.itemId))
        .sort((a, b) => b.qty - a.qty);

    ui.countInventory.textContent = `${ownedEntries.length}`;
    ui.inventoryGrid.innerHTML = "";

    if (!ownedEntries.length) {
        ui.inventoryGrid.innerHTML = `<p class="empty-state inventory-empty">Ton inventaire est vide pour le moment.</p>`;
        return;
    }

    ownedEntries.forEach(({ itemId, qty }) => {
        const item = itemMap.get(itemId);
        const card = document.createElement("article");
        card.className = "shop-card inventory-card";
        card.innerHTML = `
            <div class="shop-card-head">
                <div class="shop-card-name">${item.emoji || "📦"}\u00A0${item.nom}</div>
                <div class="shop-card-price">x${formatCompactPrice(qty)}</div>
            </div>
            <div class="shop-card-details">Prix unitaire: ${formatCompactPrice(item.prix)}\u00A0💰</div>
            <button class="inventory-open-btn" type="button">Ouvrir une quantité personnalisée</button>
        `;
        const openBtn = card.querySelector(".inventory-open-btn");
        openBtn.addEventListener("click", () => {
            openInventoryOpenModal(item, qty, card);
        });
        ui.inventoryGrid.appendChild(card);
    });
}

function renderShop(data) {
    currentShop = data;

    const caisses = Array.isArray(data?.categories?.caisses) ? [...data.categories.caisses] : [];
    const boostCaisses = Array.isArray(data?.categories?.boosts?.caisses_boost)
        ? [...data.categories.boosts.caisses_boost]
        : [];
    caisses.sort((a, b) => Number(a?.prix || 0) - Number(b?.prix || 0));
    boostCaisses.sort((a, b) => Number(a?.prix || 0) - Number(b?.prix || 0));

    ui.countCaisses.textContent = `${caisses.length}`;
    ui.countBoostCaisses.textContent = `${boostCaisses.length}`;

    ui.caissesGrid.innerHTML = "";
    ui.boostCaissesGrid.innerHTML = "";

    if (!caisses.length) {
        ui.caissesGrid.innerHTML = `<p class="empty-state">Aucune caisse disponible.</p>`;
    } else {
        caisses.forEach((item) => ui.caissesGrid.appendChild(createBuyCard(item, "caisses")));
    }

    if (!boostCaisses.length) {
        const comingSoonCard = document.createElement("article");
        comingSoonCard.className = "shop-card coming-soon-card";
        comingSoonCard.innerHTML = `
            <div class="coming-soon-overlay">
                <div class="coming-soon-content">
                    <i data-lucide="lock" class="coming-soon-icon"></i>
                    <p class="coming-soon-label">Boost bientôt disponible</p>
                </div>
            </div>
            <div class="shop-card-head">
                <div class="shop-card-name">⚡ Caisse Boost</div>
                <div class="shop-card-price">???\u00A0💰</div>
            </div>
            <div class="shop-card-details">Bientôt disponible</div>
            <div class="shop-card-details">Restez connectés !</div>
            <button class="buy-btn" disabled>Bientôt disponible</button>
        `;
        ui.boostCaissesGrid.appendChild(comingSoonCard);
    } else {
        boostCaisses.forEach((item) => ui.boostCaissesGrid.appendChild(createBuyCard(item, "boosts")));
    }

    renderInventory(data);
    lucide.createIcons();
}

async function loadShop() {
    GlobalLoader.show();
    try {
        const token = await window.BrainrotAuth.waitUntilReady();
        if (!token) throw new Error("No auth token");
        const response = await apiFetch(`${API_BASE_URL}${SHOP_ROUTE_BASE}`, {
            headers: { "Authorization": `Bearer ${token}` }
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        const normalized = normalizeShopData(data);
        await fetchUserInventory();
        renderShop(normalized);
        await syncEconomyFromServer({ forceGoldSync: true });
    } catch (error) {
        console.error("Erreur chargement boutique:", error);
        ui.caissesGrid.innerHTML = `
            <p class="empty-state">
                Le backend n'est pas disponible. Lance <code>npm run dev</code> dans le dossier backend.
            </p>
        `;
    } finally {
        GlobalLoader.hide(true);

    }
}

// --- Code promo : modal du gain ---------------------------------------------------

/** Erreur sous le champ (le champ tremble), a la place d'une alerte. */
function showPromoFeedback(message) {
    ui.promoFeedback.textContent = message;
    ui.promoCodeInput?.animate([
        { transform: "translateX(0)" },
        { transform: "translateX(-6px)" },
        { transform: "translateX(6px)" },
        { transform: "translateX(-3px)" },
        { transform: "translateX(0)" }
    ], { duration: 320, easing: "ease-out" });
}

/** Le montant d'or defile jusqu'a sa valeur. */
function countUpGold(el, amount) {
    const start = performance.now();
    const step = (now) => {
        const t = Math.min(1, (now - start) / 700);
        el.textContent = `+${formatCompactPrice(amount * (1 - Math.pow(1 - t, 3)))} pièces`;
        if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
}

function showPromoReward(result) {
    const visual = ui.promoVisual;
    const times = Number(result?.quantity) > 1 ? `${Number(result.quantity)} × ` : "";
    visual.replaceChildren();
    ui.promoInventory.classList.add("hidden");
    let color = "#f97316";

    if (result?.type === "Gold") {
        const amount = Number(result.amount || 0);
        color = "#facc15";
        visual.textContent = "💰";
        countUpGold(ui.promoTitle, amount);
        ui.promoSub.textContent = "Ajoutées à ton argent.";
    } else if (result?.type === "Card") {
        color = RARITY_COLORS[result.rarity] || color;
        if (result.link) {
            const img = document.createElement("img");
            img.className = "promo-card-img";
            img.src = result.link;
            img.alt = result.name || "Brainrot";
            visual.appendChild(img);
        } else {
            visual.textContent = "🃏";
        }
        ui.promoTitle.textContent = times + (result.name || "Un nouveau Brainrot");
        const parts = [];
        if (result.rarity) parts.push(String(result.rarity).toUpperCase());
        if (result.goldPerSec) parts.push(`⚡ ${formatCompactPrice(result.goldPerSec)}/s`);
        ui.promoSub.textContent = parts.length ? parts.join(" · ") : "Ajouté à ta collection.";
        ui.promoSub.style.color = result.rarity ? color : "";
    } else if (result?.type === "Chest") {
        const known = buildShopItemMap(currentShop).get(result.id);
        visual.textContent = result.icon || known?.emoji || "📦";
        ui.promoTitle.textContent = times + (result.name || known?.nom || "Une caisse");
        ui.promoSub.textContent = times ? "Ajoutées à ton inventaire." : "Ajoutée à ton inventaire.";
        ui.promoInventory.classList.remove("hidden");
    } else {
        visual.textContent = "🎁";
        ui.promoTitle.textContent = "Une récompense";
        ui.promoSub.textContent = "";
    }
    if (result?.type !== "Card") ui.promoSub.style.color = "";

    ui.promoModal.classList.remove("hidden");
    document.body.classList.add("no-scroll");
    setCratePower(ui.promoStage, 1, color);
    ui.promoModal.querySelector(".promo-modal-card").animate([
        { transform: "scale(0.85)", opacity: 0 },
        { transform: "scale(1.03)", opacity: 1, offset: 0.7 },
        { transform: "scale(1)", opacity: 1 }
    ], { duration: 380, easing: "ease-out" });
    visual.animate([
        { transform: "scale(0) rotate(-20deg)" },
        { transform: "scale(1.2) rotate(6deg)", offset: 0.6 },
        { transform: "scale(1) rotate(0deg)" }
    ], { duration: 600, delay: 120, easing: "ease-out", fill: "backwards" });
    setTimeout(() => burstParticles(ui.promoParticles, color, 18), 250);
    ui.promoClose.focus({ preventScroll: true });
}

function closePromoModal() {
    if (ui.promoModal.classList.contains("hidden")) return;
    ui.promoModal.classList.add("hidden");
    document.body.classList.remove("no-scroll");
}

async function redeemPromoCode() {
    const code = ui.promoCodeInput?.value?.trim();
    if (!code) {
        showPromoFeedback("Entre un code.");
        return;
    }
    const token = getAuthToken();
    if (!token) {
        showPromoFeedback("Erreur d'authentification, recharge la page.");
        return;
    }

    ui.promoCodeBtn.disabled = true;
    ui.promoFeedback.textContent = "";
    try {
        const response = await apiFetch(`${API_BASE_URL}/code/${encodeURIComponent(code)}`, {
            method: "GET",
            headers: { "Authorization": `Bearer ${token}` }
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data.success) {
            showPromoFeedback(data.message || "Code invalide ou déjà utilisé.");
            return;
        }

        if (ui.promoCodeInput) ui.promoCodeInput.value = "";
        showPromoReward(data.result?.result);
        await syncEconomyFromServer({ forceGoldSync: true });
        loadShop();
    } catch (error) {
        console.error("Erreur validation code:", error);
        showPromoFeedback("Impossible de valider le code pour le moment.");
    } finally {
        ui.promoCodeBtn.disabled = false;
    }
}

document.addEventListener("DOMContentLoaded", () => {
    lucide.createIcons();
    ui.wallet.textContent = `${formatCompactPrice(getRandomDisplayMoney())}\u00A0💰`;
    setInterval(() => {
        renderWalletFromEconomy();
    }, 100);
    setInterval(() => {
        syncEconomyFromServer({ forceGoldSync: true });
    }, GOLD_SYNC_INTERVAL_MS);
    ui.buyModalClose.addEventListener("click", closeBuyModal);
    ui.buyModal.addEventListener("click", (event) => {
        const target = event.target;
        if (target instanceof HTMLElement && target.dataset.closeModal === "true") {
            closeBuyModal();
        }
    });
    ui.lootModalClose.addEventListener("click", closeLootModal);
    ui.lootModal.addEventListener("click", (event) => {
        const target = event.target;
        if (target instanceof HTMLElement && target.dataset.closeLootModal === "true") {
            closeLootModal();
        }
    });
    document.addEventListener("keydown", (event) => {
        if (event.key !== "Escape") return;
        if (!ui.promoModal.classList.contains("hidden")) {
            closePromoModal();
            return;
        }
        if (!ui.lootModal.classList.contains("hidden")) {
            closeLootModal();
            return;
        }
        if (!ui.openInventoryModal.classList.contains("hidden")) {
            closeInventoryOpenModal();
            return;
        }
        if (!ui.buyModal.classList.contains("hidden")) {
            closeBuyModal();
        }
    });
    ui.openInventoryClose.addEventListener("click", closeInventoryOpenModal);
    ui.openInventoryModal.addEventListener("click", (event) => {
        const target = event.target;
        if (target instanceof HTMLElement && target.dataset.closeOpenModal === "true") {
            closeInventoryOpenModal();
        }
    });
    ui.openInventoryConfirm.addEventListener("click", confirmOpenInventoryQuantity);
    ui.openInventoryQty.addEventListener("input", () => {
        const max = Number(ui.openInventoryQty.max || inventoryOpenState.ownedQty || 1);
        const value = getOpenQtyValue();
        if (value < 1) {
            ui.openInventoryQty.value = "1";
            return;
        }
        if (value > max) {
            ui.openInventoryQty.value = `${max}`;
        }
    });
    
    ui.closeOpeningBtn.addEventListener("click", closeOpeningOverlay);
    ui.multiContinueBtn?.addEventListener("click", closeOpeningOverlay);
    ui.skipAnimBtn?.addEventListener("click", () => {
        animationState.skipping = true;
        animationState.onSkip?.();
    });
    // Pendant le "Brainrot bonus !", toucher l'ecran passe a la suite.
    ui.bonusContainer.addEventListener("click", () => animationState.onSkip?.());
    
    getSelectedQtyButtons().forEach((btn) => {
        btn.addEventListener("click", () => {
            const qty = Number(btn.dataset.qty);
            onSelectQuantity(qty);
        });
    });
    ui.buyModalToInventory.addEventListener("click", purchaseToInventory);
    ui.buyModalOpenNow.addEventListener("click", purchaseOpenNow);
    if (ui.scrollToInventoryBtn && ui.inventorySection) {
        ui.scrollToInventoryBtn.addEventListener("click", () => {
            ui.inventorySection.scrollIntoView({ behavior: "smooth", block: "start" });
        });
    }
    ui.promoCodeBtn?.addEventListener("click", redeemPromoCode);
    ui.promoCodeInput?.addEventListener("keydown", (event) => {
        if (event.key === "Enter") redeemPromoCode();
    });
    ui.promoCodeInput?.addEventListener("input", () => {
        ui.promoFeedback.textContent = "";
    });
    ui.promoClose.addEventListener("click", closePromoModal);
    ui.promoInventory.addEventListener("click", () => {
        closePromoModal();
        ui.inventorySection?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    ui.promoModal.addEventListener("click", (event) => {
        if (event.target instanceof HTMLElement && event.target.dataset.closePromo === "true") closePromoModal();
    });

    ui.promoCodeInput?.addEventListener("keypress", (e) => {
        if (e.key === "Enter") {
            ui.promoCodeBtn?.click();
        }
    });

    loadShop();
});