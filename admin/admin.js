/**
 * Panneau d'administration BrainrotStar.
 * ---------------------------------------------------------------------------
 * 1. auth-gate.js valide le jeton du joueur (sinon retour a PlayWeb) ;
 * 2. GET /admin/me : le serveur verifie isAdmin en base. Refus -> retour a
 *    l'accueil du jeu, sans jamais afficher le panneau ;
 * 3. chargement des statistiques (toutes les routes /admin/* refont la
 *    verification cote serveur).
 *
 * Les graphiques sont des SVG dessines ici (aucune librairie) ; tous les
 * textes venant du serveur passent par html``, qui echappe chaque valeur.
 */
(() => {
    "use strict";

    const API = String(window.API_BASE_URL || "").replace(/\/+$/, "");
    const GAME_URL = "../index/index.html";
    const LIVE_EVERY_MS = 20000;

    const COLORS = { s1: "#3987e5", s2: "#d95926", s3: "#199e70" };

    const PAGE_NAMES = {
        index: "Accueil", shop: "Boutique", collection: "Collection", ranking: "Classement",
        rebirth: "Rebirth", battlepass: "Passe de combat", ah: "Marché", game: "Combat",
        village: "Villaggio", achievements: "Succès", admin: "Panneau admin", autre: "Autre"
    };
    const VILLAGE_MODES = {
        ranked: "Classé", revenge: "Vengeance", friendly: "Amical", bot: "Briganti", campaign: "Campagne"
    };
    /** Type d'evenement anti-macro : libelle et gravite (toujours affichee avec le libelle). */
    const EVENT_TYPES = {
        script: ["Clic simulé (script)", "critical"],
        rhythm: ["Rythme robotique", "critical"],
        blocked: ["Requêtes bloquées en boucle", "critical"],
        lockout: ["Blocage après erreurs", "serious"],
        fast: ["Réponse trop rapide", "serious"],
        clicks: ["Clics à côté", "warning"],
        fail: ["Mauvais symbole", "warning"],
        forced: ["Vérification forcée", "plain"]
    };

    const SESSION_KEY = "brainrot_admin_session";
    const DENIED_MESSAGE = "Vous n'êtes pas autorisé sur cette page.";

    const state = {
        token: "",
        session: "",
        bound: false,
        locked: false,
        security: null,
        admin: null,
        tab: "overview",
        range: 30,
        overview: null,
        players: null,
        banned: null,
        bannedUsers: null,
        catalog: null,
        promoDraft: null,
        promoCreated: null,
        announcements: null,
        draft: null,
        playerQuery: "",
        playerSort: "recent",
        anticheat: null,
        promoFilter: "",
        tournaments: null,
        liveRooms: null,
        tnOptions: null,
        tnDraft: null,
        tnCreated: null,
        live: null,
        liveTimer: null,
        loading: 0
    };

    const DURATIONS = [["online", "Connectés maintenant"], ["1", "1 heure"], ["6", "6 heures"], ["24", "24 heures"], ["72", "3 jours"], ["168", "7 jours"]];
    const REWARD_TYPES = [["", "Rien"], ["Gold", "💰 Or"], ["Chest", "📦 Caisse"], ["Card", "🃏 Carte"]];
    const ICONS = ["📢", "🎉", "🎁", "🏆", "🔥", "⚡", "💎", "🗳️", "⚠️", "🛠️", "🎄", "👑"];
    const RARITY_ORDER = ["commun", "peu commun", "rare", "epique", "épique", "legendaire", "légendaire", "mythique", "ultime", "divin", "secret", "saisonnier"];

    const newPromoDraft = (type = "Gold") => ({ code: "", type, goldAmount: "", chestId: "", cardId: "", quantity: "1", maxUses: "", expiresAt: "" });
    const newDraft = () => ({
        audience: "all", pseudos: [], pseudoInput: "", icon: "📢", theme: "flame", title: "", body: "",
        pollOn: false, question: "", options: ["", ""], showResults: true, buttonLabel: "", link: "", duration: "24",
        correct: null, reward: { type: "", goldAmount: "", chestId: "", cardId: "", quantity: "1", maxWinners: "" }
    });
    state.promoDraft = newPromoDraft();
    state.draft = newDraft();

    // --- Outils -----------------------------------------------------------------

    const $ = (selector, root = document) => root.querySelector(selector);

    const nf0 = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
    const nf1 = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });
    const dateFmt = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric" });
    const dateTimeFmt = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
    const timeFmt = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" });
    const dayFmt = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" });
    const dayLongFmt = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

    const fmtInt = (n) => nf0.format(Math.round(Number(n) || 0));

    function fmtCompact(n) {
        const v = Number(n) || 0;
        const abs = Math.abs(v);
        const units = [[1e15, " Bd"], [1e12, " Bn"], [1e9, " Md"], [1e6, " M"], [1e3, " k"]];
        for (const [size, suffix] of units) if (abs >= size) return nf1.format(v / size) + suffix;
        return nf0.format(v);
    }

    function fmtDuration(seconds) {
        const sec = Math.max(0, Math.round(Number(seconds) || 0));
        if (sec < 60) return `${sec} s`;
        const min = Math.floor(sec / 60);
        if (min < 60) return `${min} min`;
        const h = Math.floor(min / 60);
        if (h < 48) return `${h} h ${String(min % 60).padStart(2, "0")}`;
        return `${Math.floor(h / 24)} j ${h % 24} h`;
    }

    function fmtDurationTick(seconds) {
        if (seconds >= 3600) return `${nf1.format(seconds / 3600)} h`;
        if (seconds >= 60) return `${Math.round(seconds / 60)} min`;
        return `${Math.round(seconds)} s`;
    }

    const fmtMs = (ms) => (ms == null ? "—" : ms < 1000 ? `${Math.round(ms)} ms` : `${nf1.format(ms / 1000)} s`);
    const fmtDate = (value) => (value ? dateFmt.format(new Date(value)) : "—");
    const fmtDateTime = (value) => (value ? dateTimeFmt.format(new Date(value)) : "—");
    const fmtDay = (key) => dayFmt.format(new Date(`${key}T00:00:00Z`));
    const fmtDayLong = (key) => dayLongFmt.format(new Date(`${key}T00:00:00Z`));
    const pct = (part, total) => (total ? `${Math.round((part / total) * 100)} %` : "—");

    function fmtAgo(value) {
        if (!value) return "jamais";
        const diff = Date.now() - new Date(value).getTime();
        if (diff < 60000) return "à l'instant";
        const min = Math.floor(diff / 60000);
        if (min < 60) return `il y a ${min} min`;
        const h = Math.floor(min / 60);
        if (h < 24) return `il y a ${h} h`;
        const d = Math.floor(h / 24);
        if (d < 60) return `il y a ${d} j`;
        return `le ${fmtDate(value)}`;
    }

    function fmtIn(ms) {
        if (ms <= 0) return "maintenant";
        const min = Math.round(ms / 60000);
        return min < 1 ? `dans ${Math.round(ms / 1000)} s` : `dans ${min} min`;
    }

    const pageName = (page) => PAGE_NAMES[page] || page;

    // --- Gabarits HTML (echappement systematique) ------------------------------------

    class Safe {
        constructor(value) { this.value = value; }
        toString() { return this.value; }
    }
    const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
    const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ESC[c]);
    const raw = (value) => new Safe(String(value));

    function out(value) {
        if (value instanceof Safe) return value.value;
        if (Array.isArray(value)) return value.map(out).join("");
        if (value === false || value === null || value === undefined) return "";
        return esc(value);
    }

    function html(strings, ...values) {
        let result = strings[0];
        values.forEach((value, i) => { result += out(value) + strings[i + 1]; });
        return new Safe(result);
    }

    const kpi = (label, value, sub) => html`
        <div class="kpi">
            <div class="kpi-label">${label}</div>
            <div class="kpi-value">${value}</div>
            ${sub ? html`<div class="kpi-sub">${sub}</div>` : ""}
        </div>`;

    const card = (title, body, opts = {}) => html`
        <section class="card">
            <div class="card-head">
                <h3 class="card-title">${title}</h3>
                ${opts.total ? html`<span class="card-total">${opts.total}</span>` : ""}
                ${opts.sub ? html`<span class="card-sub">${opts.sub}</span>` : ""}
            </div>
            ${body}
        </section>`;

    const empty = (text = "Aucune donnée pour l'instant.") => html`<p class="empty">${text}</p>`;
    const unavailable = () => empty("Section indisponible (voir les logs du serveur).");

    /** Barres horizontales : classements et repartitions. */
    function bars(items, opts = {}) {
        if (!items.length) return empty();
        const format = opts.format || fmtInt;
        const top = Math.max(1, ...items.map((i) => i.value));
        const color = opts.color || COLORS.s1;
        return html`<div class="bars">${items.map((item) => html`
            <div class="bar-row" title="${item.label} : ${format(item.value)}">
                <span class="bar-label">${item.label}</span>
                <div class="bar-track"><div class="bar-fill" style="width:${raw(((item.value / top) * 100).toFixed(2))}%;background:${raw(color)}"></div></div>
                <span class="bar-value">${format(item.value)}</span>
            </div>`)}</div>`;
    }

    /** Tableau : colonnes { label, num, cell(row) }, lignes cliquables si rowUser(row). */
    function table(columns, rows, opts = {}) {
        if (!rows.length) return empty(opts.empty);
        return html`<div class="table-wrap"${opts.maxHeight ? raw(` style="max-height:${opts.maxHeight}px"`) : ""}>
            <table class="tbl">
                <thead><tr>${columns.map((c) => html`<th class="${c.num ? "num" : ""}${c.action ? " action" : ""}">${c.label}</th>`)}</tr></thead>
                <tbody>${rows.map((row) => {
                    const user = opts.rowUser ? opts.rowUser(row) : null;
                    return html`<tr${user ? html` class="clickable" data-user="${user}"` : ""}>${columns.map((c) =>
                        html`<td class="${c.num ? "num" : ""}${c.wrap ? " wrap" : ""}${c.action ? " action" : ""}">${c.cell(row)}</td>`)}</tr>`;
                })}</tbody>
            </table>
        </div>`;
    }

    const playerLink = (userId, pseudo, online) => html`<button type="button" class="player-link" data-user="${userId}">${online ? html`<span class="dot on" title="En ligne"></span>` : ""}${pseudo}</button>`;

    const chip = (label, level) => html`<span class="chip ${level || ""}">${label}</span>`;

    function eventChip(type) {
        const [label, level] = EVENT_TYPES[type] || [type, "plain"];
        return chip(label, level);
    }

    // --- Graphiques en colonnes (SVG) --------------------------------------------

    let chartSeq = 0;
    const pendingCharts = new Map();
    const resizer = typeof ResizeObserver === "function"
        ? new ResizeObserver((entries) => {
            for (const entry of entries) {
                const host = entry.target;
                const width = Math.round(entry.contentRect.width);
                if (host.isConnected && width && width !== host._width) drawChart(host);
            }
        })
        : null;

    /**
     * spec : { title, labels (jours YYYY-MM-DD), series: [{ name, values, color }],
     *          format (valeurs), tick (axe), integer, height }
     */
    function chart(spec) {
        const id = `c${++chartSeq}`;
        pendingCharts.set(id, spec);
        const legend = spec.series.length > 1
            ? html`<div class="legend">${spec.series.map((s) => html`<span><i style="background:${raw(s.color)}"></i>${s.name}</span>`)}</div>`
            : "";
        return html`${legend}<div class="chart" data-chart="${id}" style="height:${raw(spec.height || 190)}px"></div>
            <details class="data-toggle" data-table="${id}"><summary>Voir les données</summary></details>`;
    }

    /** Pas "ronds" pour un axe de durees (secondes) : 30 min, 1 h, 12 h... */
    const DURATION_STEPS = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1200, 1800, 3600, 7200, 10800,
        14400, 21600, 43200, 86400, 172800, 432000, 864000, 1728000];

    function niceScale(maxValue, spec = {}) {
        if (!(maxValue > 0)) return { max: 1, ticks: [0] };
        let step;
        if (spec.duration) {
            step = DURATION_STEPS.find((s) => Math.ceil(maxValue / s) <= 4) || DURATION_STEPS[DURATION_STEPS.length - 1];
        } else {
            const rough = maxValue / 4;
            const pow = 10 ** Math.floor(Math.log10(rough));
            const n = rough / pow;
            step = (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * pow;
            if (spec.integer) step = Math.max(1, Math.round(step));
        }
        const max = Math.ceil(maxValue / step) * step;
        const ticks = [];
        for (let t = 0; t <= max + step / 2; t += step) ticks.push(t);
        return { max, ticks };
    }

    const r2 = (n) => Math.round(n * 100) / 100;

    /** Colonne : extremite arrondie de 4 px, base carree sur l'axe. */
    function columnPath(x, y, w, h, r) {
        x = r2(x); y = r2(y); w = r2(w); h = r2(h);
        if (r < 0.75) return `M${x},${r2(y + h)}V${y}H${r2(x + w)}V${r2(y + h)}Z`;
        r = r2(r);
        return `M${x},${r2(y + h)}V${r2(y + r)}Q${x},${y} ${r2(x + r)},${y}H${r2(x + w - r)}Q${r2(x + w)},${y} ${r2(x + w)},${r2(y + r)}V${r2(y + h)}Z`;
    }

    function drawChart(host) {
        const spec = host._spec;
        if (!spec) return;
        const width = Math.max(260, Math.round(host.clientWidth));
        const height = host.clientHeight || spec.height || 190;
        host._width = Math.round(host.clientWidth);
        const tick = spec.tick || fmtCompact;
        const pad = { top: 10, right: 6, bottom: 22, left: 8 };
        const n = spec.labels.length;
        const k = spec.series.length;
        const { max, ticks } = niceScale(Math.max(0, ...spec.series.flatMap((s) => s.values)), spec);
        pad.left = Math.max(30, ...ticks.map((t) => tick(t).length * 6.2 + 10));

        const plotW = width - pad.left - pad.right;
        const plotH = height - pad.top - pad.bottom;
        const band = plotW / n;
        const gap = 2;
        const barW = Math.max(1, Math.min(24, (band - gap) / k - (k > 1 ? gap : 0)));
        const groupW = barW * k + gap * (k - 1);
        const y = (v) => pad.top + plotH - (v / max) * plotH;

        let svg = "";
        for (const t of ticks) {
            const ty = r2(y(t));
            svg += `<line class="${t === 0 ? "baseline" : "gridline"}" x1="${r2(pad.left)}" x2="${r2(width - pad.right)}" y1="${ty}" y2="${ty}"/>`;
            svg += `<text class="tick" x="${r2(pad.left - 6)}" y="${r2(ty + 3.5)}" text-anchor="end">${esc(tick(t))}</text>`;
        }
        for (let i = 0; i < n; i++) {
            spec.series.forEach((s, j) => {
                const v = Number(s.values[i]) || 0;
                if (v <= 0) return;
                const h = Math.max(1, (v / max) * plotH);
                const x = pad.left + i * band + (band - groupW) / 2 + j * (barW + gap);
                svg += `<path class="bar" data-i="${i}" fill="${s.color}" d="${columnPath(x, pad.top + plotH - h, barW, h, Math.min(4, barW / 2, h))}"/>`;
            });
        }
        // Etiquettes de dates : au plus 6, la derniere toujours visible.
        const step = n <= 8 ? 1 : Math.ceil(n / 6);
        for (let i = n - 1; i >= 0; i -= step) {
            const tx = r2(pad.left + i * band + band / 2);
            svg += `<text class="tick" x="${tx}" y="${height - 6}" text-anchor="middle">${esc(fmtDay(spec.labels[i]))}</text>`;
        }
        svg += `<rect class="hit" x="${r2(pad.left)}" y="0" width="${r2(plotW)}" height="${height}"/>`;

        host._geo = { pad, band, n, width };
        host.innerHTML = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(spec.title || "Graphique")}">${svg}</svg>`;
    }

    function mountCharts(root) {
        root.querySelectorAll(".chart[data-chart]").forEach((host) => {
            const spec = pendingCharts.get(host.dataset.chart);
            if (!spec) return;
            pendingCharts.delete(host.dataset.chart);
            host._spec = spec;
            const details = root.querySelector(`details[data-table="${host.dataset.chart}"]`);
            if (details) details._spec = spec;
            drawChart(host);
            resizer?.observe(host);
        });
    }

    function unmountCharts(root) {
        root.querySelectorAll(".chart[data-chart]").forEach((host) => resizer?.unobserve(host));
    }

    function mount(root, content) {
        unmountCharts(root);
        hideTooltip();
        root.innerHTML = out(content);
        // Rangees equilibrees sur grand ecran : 8 tuiles -> 4 + 4, pas 6 + 2.
        root.querySelectorAll(".kpis").forEach((grid) => {
            const n = grid.children.length;
            grid.style.setProperty("--cols", String(n === 7 || n === 8 ? 4 : Math.max(1, Math.min(n, 6))));
        });
        mountCharts(root);
    }

    // Tableau des donnees d'un graphique, construit a l'ouverture seulement.
    document.addEventListener("toggle", (event) => {
        const details = event.target;
        if (!(details instanceof HTMLDetailsElement) || !details.open || !details._spec || details._filled) return;
        details._filled = true;
        const spec = details._spec;
        const format = spec.format || fmtInt;
        const rows = spec.labels.map((label, i) => ({ label, values: spec.series.map((s) => s.values[i]) })).reverse();
        const content = table(
            [{ label: "Jour", cell: (r) => fmtDay(r.label) }, ...spec.series.map((s, j) => ({ label: s.name, num: true, cell: (r) => format(r.values[j]) }))],
            rows
        );
        details.insertAdjacentHTML("beforeend", out(content));
    }, true);

    // --- Infobulle des graphiques ----------------------------------------------

    const tooltip = () => $("#tooltip");
    let hotChart = null;

    function hideTooltip() {
        const tip = tooltip();
        if (tip) tip.hidden = true;
        if (hotChart) {
            hotChart.classList.remove("is-hovering");
            hotChart.querySelectorAll(".bar.is-hot").forEach((b) => b.classList.remove("is-hot"));
            hotChart = null;
        }
    }

    function showTooltipFor(host, event) {
        const geo = host._geo;
        const spec = host._spec;
        const svg = host.querySelector("svg");
        if (!geo || !spec || !svg) return;
        const rect = svg.getBoundingClientRect();
        const localX = ((event.clientX - rect.left) / rect.width) * geo.width;
        const i = Math.floor((localX - geo.pad.left) / geo.band);
        if (i < 0 || i >= geo.n) {
            hideTooltip();
            return;
        }
        if (hotChart && hotChart !== host) hideTooltip();
        hotChart = host;
        host.classList.add("is-hovering");
        host.querySelectorAll(".bar").forEach((b) => b.classList.toggle("is-hot", b.dataset.i === String(i)));

        const tip = tooltip();
        const format = spec.format || fmtInt;
        tip.textContent = "";
        const title = document.createElement("div");
        title.className = "tt-title";
        title.textContent = fmtDayLong(spec.labels[i]);
        tip.appendChild(title);
        for (const s of spec.series) {
            const row = document.createElement("div");
            row.className = "tt-row";
            const key = document.createElement("span");
            key.className = "tt-key";
            key.style.background = s.color;
            const value = document.createElement("b");
            value.textContent = format(s.values[i]);
            const name = document.createElement("span");
            name.className = "tt-name";
            name.textContent = s.name;
            row.append(key, value, name);
            tip.appendChild(row);
        }
        tip.hidden = false;
        const w = tip.offsetWidth;
        const h = tip.offsetHeight;
        let left = event.clientX + 14;
        if (left + w > window.innerWidth - 8) left = event.clientX - w - 14;
        let top = event.clientY - h - 12;
        if (top < 8) top = event.clientY + 16;
        tip.style.left = `${Math.max(8, left)}px`;
        tip.style.top = `${top}px`;
    }

    document.addEventListener("pointermove", (event) => {
        const host = event.target.closest?.(".chart");
        if (host) showTooltipFor(host, event);
        else if (hotChart && event.pointerType === "mouse") hideTooltip();
    }, { passive: true });
    document.addEventListener("pointerdown", (event) => {
        const host = event.target.closest?.(".chart");
        if (host) showTooltipFor(host, event);
        else hideTooltip();
    }, { passive: true });
    window.addEventListener("scroll", hideTooltip, { passive: true });

    // --- Acces a l'API ------------------------------------------------------------

    async function api(path, init = {}) {
        const headers = { Authorization: `Bearer ${state.token}` };
        if (state.session) headers["X-Admin-Session"] = state.session;
        if (init.body) headers["Content-Type"] = "application/json";
        const res = await apiFetch(`${API}${path}`, { ...init, headers });
        const payload = await res.json().catch(() => null);
        if (res.status === 401 && payload?.code === "ADMIN_SESSION") {
            sessionLost(payload.error);
            throw new Error("forbidden");
        }
        if (res.status === 401 || res.status === 403) {
            // Droits retires entre-temps : retour au jeu.
            location.replace(GAME_URL);
            throw new Error("forbidden");
        }
        if (!res.ok || !payload?.success) throw new Error(payload?.error || `HTTP ${res.status}`);
        return payload.data;
    }

    function readSession() {
        try {
            return sessionStorage.getItem(SESSION_KEY) || "";
        } catch {
            return "";
        }
    }

    function storeSession(value) {
        try {
            if (value) sessionStorage.setItem(SESSION_KEY, value);
            else sessionStorage.removeItem(SESSION_KEY);
        } catch {
            return;
        }
    }

    async function authCall(path, body) {
        const res = await apiFetch(`${API}/admin/auth/${path}`, {
            method: body ? "POST" : "GET",
            headers: { Authorization: `Bearer ${state.token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
            body: body ? JSON.stringify(body) : undefined
        });
        const payload = await res.json().catch(() => null);
        return { status: res.status, ok: res.ok && !!payload?.success, payload };
    }

    function showGate(content) {
        clearInterval(state.liveTimer);
        $("#app").hidden = true;
        closeDrawer();
        const gate = $("#gate");
        gate.hidden = false;
        mount(gate, content);
        gate.querySelector("input")?.focus();
    }

    function gateMessage(text) {
        state.locked = true;
        showGate(html`<div class="auth-card"><div class="auth-icon" aria-hidden="true">⛔</div><p class="auth-text">${text}</p><a class="auth-back" href="${GAME_URL}">Retour au jeu</a></div>`);
    }

    function showLogin(notice = "") {
        state.locked = true;
        showGate(html`
            <form class="auth-card" data-auth="login" novalidate>
                <div class="auth-icon" aria-hidden="true">🛡️</div>
                <h1 class="auth-title">Double authentification</h1>
                <p class="auth-text">Entre le code à 6 chiffres affiché dans ton application d'authentification (Google Authenticator, Authy…).</p>
                ${notice ? html`<p class="auth-notice">${notice}</p>` : ""}
                <input class="input auth-code" name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="000000" aria-label="Code à 6 chiffres">
                <p class="auth-error" aria-live="polite"></p>
                <button type="submit" class="btn btn-primary auth-submit">Valider</button>
                <a class="auth-back" href="${GAME_URL}">Retour au jeu</a>
            </form>`);
    }

    function showEnrollKey() {
        state.locked = true;
        showGate(html`
            <form class="auth-card" data-auth="enroll-key" novalidate>
                <div class="auth-icon" aria-hidden="true">🔐</div>
                <h1 class="auth-title">Active la double authentification</h1>
                <p class="auth-text">Le panneau admin est protégé par un code temporaire sur ton téléphone. Pour l'activer, entre la clé d'activation définie sur le serveur (ADMIN_ENROLL_KEY).</p>
                <input class="input" name="enrollKey" type="password" autocomplete="off" placeholder="Clé d'activation" aria-label="Clé d'activation">
                <p class="auth-error" aria-live="polite"></p>
                <button type="submit" class="btn btn-primary auth-submit">Continuer</button>
                <a class="auth-back" href="${GAME_URL}">Retour au jeu</a>
            </form>`);
    }

    function showEnrollSecret(secret, uri) {
        state.locked = true;
        showGate(html`
            <form class="auth-card" data-auth="enroll-code" novalidate>
                <div class="auth-icon" aria-hidden="true">📱</div>
                <h1 class="auth-title">Ajoute BrainrotStar Admin à ton appli</h1>
                <ol class="auth-steps">
                    <li>Ouvre Google Authenticator, Authy ou Microsoft Authenticator sur ton téléphone.</li>
                    <li>Choisis <b>Saisir une clé de configuration</b>, type <b>basé sur l'heure</b>, et colle cette clé :</li>
                </ol>
                <div class="auth-secret"><code>${secret.match(/.{1,4}/g).join(" ")}</code><button type="button" class="btn btn-small" data-gate-copy="${secret}">Copier</button></div>
                <a class="btn auth-open" href="${uri}">Ouvrir directement dans l'appli (sur téléphone)</a>
                <p class="auth-text">Puis entre le code à 6 chiffres qu'elle affiche :</p>
                <input class="input auth-code" name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="000000" aria-label="Code à 6 chiffres">
                <p class="auth-error" aria-live="polite"></p>
                <button type="submit" class="btn btn-primary auth-submit">Activer</button>
                <p class="auth-hint">Cette clé ne sera plus jamais affichée. Garde ton appli : sans elle, il faudra réinitialiser la double authentification en base.</p>
            </form>`);
    }

    function sessionLost(message) {
        state.session = "";
        storeSession("");
        if (state.locked) return;
        showLogin(message || "Ta session admin a expiré, reconnecte-toi.");
    }

    async function onGateSubmit(event) {
        const form = event.target.closest("[data-auth]");
        if (!form) return;
        event.preventDefault();
        const button = form.querySelector("button[type=submit]");
        const error = form.querySelector(".auth-error");
        if (button.disabled) return;
        button.disabled = true;
        error.textContent = "";
        try {
            if (form.dataset.auth === "enroll-key") {
                const result = await authCall("enroll", { enrollKey: form.elements.enrollKey.value });
                if (!result.ok) throw result;
                showEnrollSecret(result.payload.data.secret, result.payload.data.uri);
                return;
            }
            const code = form.elements.code.value.replace(/\D/g, "");
            const result = await authCall(form.dataset.auth === "login" ? "login" : "enroll/confirm", { code });
            if (!result.ok) throw result;
            state.session = result.payload.data.session;
            storeSession(state.session);
            await enterPanel();
        } catch (failure) {
            if ((failure?.status === 401 || failure?.status === 403) && failure.payload?.error === DENIED_MESSAGE) {
                leave();
                return;
            }
            error.textContent = failure?.payload?.error || "Serveur injoignable, réessaie.";
            button.disabled = false;
            const input = form.querySelector("input");
            if (input) {
                input.value = "";
                input.focus();
            }
        }
    }

    function bindGate() {
        const gate = $("#gate");
        gate.addEventListener("submit", onGateSubmit);
        gate.addEventListener("input", (event) => {
            const input = event.target;
            if (input.name !== "code") return;
            input.value = input.value.replace(/\D/g, "").slice(0, 6);
            if (input.value.length === 6) input.form?.requestSubmit();
        });
        gate.addEventListener("click", (event) => {
            const copy = event.target.closest("[data-gate-copy]");
            if (!copy) return;
            navigator.clipboard?.writeText(copy.dataset.gateCopy).then(() => toast("Clé copiée."), () => toast("Copie impossible, recopie-la à la main."));
        });
    }

    async function logout() {
        try {
            await api("/admin/auth/logout", { method: "POST", body: "{}" });
        } catch {
            return;
        }
        state.session = "";
        storeSession("");
        showLogin("Tu es déconnecté du panneau admin.");
    }

    function toast(message) {
        const el = $("#toast");
        el.textContent = message;
        el.hidden = false;
        clearTimeout(toast.timer);
        toast.timer = setTimeout(() => { el.hidden = true; }, 3500);
    }

    function setLoading(delta) {
        state.loading = Math.max(0, state.loading + delta);
        $("#view").classList.toggle("is-loading", state.loading > 0);
        $("#refresh-btn").disabled = state.loading > 0;
    }

    function markUpdated() {
        $("#updated-at").textContent = `Mis à jour à ${timeFmt.format(new Date())}`;
    }

    // --- Chargements -------------------------------------------------------------

    async function loadOverview(fresh = false) {
        setLoading(1);
        try {
            state.overview = await api(`/admin/overview?days=${state.range}${fresh ? "&fresh=1" : ""}`);
            if (state.overview.live) renderLive(state.overview.live);
            renderTrackingNote();
            markUpdated();
        } catch (error) {
            if (error.message !== "forbidden") toast(`Statistiques indisponibles : ${error.message}`);
        } finally {
            setLoading(-1);
        }
    }

    async function loadPlayers() {
        setLoading(1);
        try {
            const q = encodeURIComponent(state.playerQuery);
            state.players = await api(`/admin/players?q=${q}&sort=${state.playerSort}&limit=100`);
        } catch (error) {
            if (error.message !== "forbidden") toast(`Joueurs indisponibles : ${error.message}`);
        } finally {
            setLoading(-1);
        }
    }

    async function loadBanned() {
        try {
            state.banned = await api("/admin/banned-pseudos");
        } catch (error) {
            if (error.message !== "forbidden") toast(`Pseudos interdits indisponibles : ${error.message}`);
        }
    }

    async function loadBannedUsers() {
        try {
            state.bannedUsers = await api("/admin/banned-players");
        } catch (error) {
            if (error.message !== "forbidden") toast(`Joueurs bannis indisponibles : ${error.message}`);
        }
    }

    async function loadCatalog() {
        try {
            state.catalog = await api("/admin/catalog");
        } catch (error) {
            if (error.message !== "forbidden") toast(`Catalogue indisponible : ${error.message}`);
        }
    }

    async function loadAnnouncements() {
        try {
            state.announcements = await api("/admin/announcements");
        } catch (error) {
            if (error.message !== "forbidden") toast(`Messages indisponibles : ${error.message}`);
        }
    }

    async function loadAnticheat() {
        setLoading(1);
        try {
            state.anticheat = await api("/admin/anticheat");
            markUpdated();
        } catch (error) {
            if (error.message !== "forbidden") toast(`Anti-macro indisponible : ${error.message}`);
        } finally {
            setLoading(-1);
        }
    }

    async function loadLive() {
        try {
            renderLive(await api("/admin/live"));
        } catch { /* le prochain passage reessaiera */ }
    }

    async function loadSecurity() {
        setLoading(1);
        try {
            state.security = await api("/admin/security");
            markUpdated();
        } catch (error) {
            if (error.message !== "forbidden") toast(`Sécurité indisponible : ${error.message}`);
        } finally {
            setLoading(-1);
        }
    }

    function startLive() {
        clearInterval(state.liveTimer);
        state.liveTimer = setInterval(() => {
            if (document.visibilityState === "hidden") return;
            loadLive();
            if (state.tab === "messages") loadAnnouncements().then(updateAnnouncementList);
        }, LIVE_EVERY_MS);
    }

    /** Recharge ce dont l'onglet courant a besoin, puis l'affiche. */
    async function refresh(fresh = false) {
        const jobs = [];
        if (state.tab === "players") jobs.push(loadPlayers(), loadBanned(), loadBannedUsers());
        else if (state.tab === "messages") jobs.push(loadAnnouncements());
        else if (state.tab === "security") jobs.push(loadSecurity());
        else jobs.push(loadOverview(fresh));
        if (state.tab === "anticheat") jobs.push(loadAnticheat());
        if (fresh && state.tab !== "players") jobs.push(loadLive());
        await Promise.all(jobs);
        renderView();
    }

    // --- En direct ------------------------------------------------------------------

    function renderLive(live) {
        state.live = live;
        const items = [
            ["Connectés", fmtInt(live.online)],
            ["Actifs maintenant", fmtInt(live.activeNow)],
            ["Pic du jour", fmtInt(live.peakToday)],
            ["Record", fmtInt(live.peakAllTime)],
            ["En file (combat)", fmtInt(live.inQueue)],
            ["Matchs en cours", fmtInt(live.activeMatches)],
            ["Serveurs", fmtInt(live.servers)],
            ["Vérifs en attente", fmtInt(live.checksPending)]
        ];
        $("#live-grid").innerHTML = out(items.map(([label, value]) => html`<div class="live-item"><span>${label}</span><strong>${value}</strong></div>`));
        $("#live-uptime").textContent = `Serveur lancé depuis ${fmtDuration(live.uptimeSec)}`;
    }

    function renderTrackingNote() {
        const since = state.overview?.trackingSince;
        $("#tracking-note").textContent = since
            ? `Suivi détaillé (temps de jeu, pages, caisses) depuis le ${fmtDay(since)}`
            : "";
    }

    function notices(o) {
        const list = [];
        if (!o.trackingSince) {
            list.push(html`<div class="notice"><strong>Suivi détaillé pas encore démarré.</strong>
                Le temps de jeu, les pages vues, les caisses ouvertes et l'anti-macro s'enregistrent dans les tables
                de la migration <code>20261004000000_admin_stats</code>. Tant qu'elle n'est pas appliquée en base, ces chiffres restent à zéro
                (le reste, tiré des tables existantes, est complet).</div>`);
        }
        if (o.errors?.length) {
            list.push(html`<div class="notice">Sections en erreur : <strong>${o.errors.join(", ")}</strong> (voir les logs du serveur).</div>`);
        }
        return list;
    }

    // --- Onglet : vue d'ensemble -----------------------------------------------------

    function series(name, values, color = COLORS.s1) {
        return { name, values, color };
    }

    function renderOverview(o) {
        const p = o.players;
        const a = o.activity;
        const c = o.chests;
        const pr = o.promo;
        const e = o.economy;
        const cb = o.combat;
        const range = `${o.range} j`;

        const activityBars = p ? bars([
            { label: "Moins d'1 h", value: p.activity.h1 },
            { label: "1 h – 24 h", value: p.activity.h24 },
            { label: "1 – 7 jours", value: p.activity.d7 },
            { label: "7 – 30 jours", value: p.activity.d30 },
            { label: "Plus de 30 jours", value: p.activity.older },
            { label: "Aucune donnée", value: p.activity.never }
        ]) : unavailable();

        const livePages = Object.entries(state.live?.pages || o.live?.pages || {})
            .map(([page, count]) => ({ label: pageName(page), value: count }))
            .sort((x, y) => y.value - x.value);

        return html`
            ${notices(o)}
            <div class="kpis">
                ${p ? kpi("Joueurs inscrits", fmtInt(p.total), `+${fmtInt(p.newUsers.h24)} en 24 h · +${fmtInt(p.newUsers.d7)} en 7 j`) : ""}
                ${p ? kpi("Actifs (7 derniers jours)", fmtInt(p.active7d), `${fmtInt(p.inactive7d)} inactifs · ${pct(p.active7d, p.total)} d'actifs`) : ""}
                ${a ? kpi("Joueurs aujourd'hui", fmtInt(a.dau), `7 j : ${fmtInt(a.wau)} · 30 j : ${fmtInt(a.mau)}`) : ""}
                ${a ? kpi("Temps de jeu aujourd'hui", fmtDuration(a.playtime.today), `${fmtDuration(a.playtime.avgPerPlayerToday)} par joueur`) : ""}
                ${c ? kpi("Caisses ouvertes aujourd'hui", fmtInt(c.openedToday), `${fmtInt(c.openedRange)} sur ${range}`) : ""}
                ${pr ? kpi("Codes promo utilisés", fmtInt(pr.usesRange), `sur ${range} · ${fmtInt(pr.usesToday)} aujourd'hui`) : ""}
                ${cb ? kpi("Matchs joués", fmtInt(cb.matchesRange), `sur ${range} · ${fmtInt(cb.matchesToday)} aujourd'hui`) : ""}
                ${e ? kpi("Or en circulation", fmtCompact(e.goldTotal), `${fmtCompact(e.cpsTotal)} pièces/s au total`) : ""}
            </div>

            <div class="grid-2">
                ${card("Joueurs actifs par jour", a ? chart({
                    title: "Joueurs actifs par jour", labels: o.days, integer: true,
                    series: [series("Joueurs actifs", a.series.players)]
                }) : unavailable(), { total: a ? `${fmtInt(a.mau)} différents sur 30 j` : "" })}
                ${card("Temps de jeu par jour", a ? chart({
                    title: "Temps de jeu par jour", labels: o.days, format: fmtDuration, tick: fmtDurationTick, duration: true,
                    series: [series("Temps de jeu", a.series.playtime)]
                }) : unavailable(), { total: a ? `${fmtDuration(a.playtime.range)} au total` : "" })}
                ${card("Caisses par jour", c ? chart({
                    title: "Caisses ouvertes et achetées par jour", labels: o.days, integer: true,
                    series: [series("Ouvertes", c.series.opened, COLORS.s1), series("Achetées", c.series.bought, COLORS.s2)]
                }) : unavailable())}
                ${card("Nouveaux joueurs par jour", p ? chart({
                    title: "Nouveaux joueurs par jour", labels: o.days, integer: true,
                    series: [series("Nouveaux joueurs", p.newUsers.series)]
                }) : unavailable(), { total: p ? `${fmtInt(p.newUsers.d30)} sur 30 j` : "" })}
            </div>

            <div class="grid-2">
                ${card("Dernière activité des joueurs", activityBars, { sub: "d'après le dernier calcul des pièces (accueil, boutique, rebirth, Villaggio)" })}
                ${card("Pages ouvertes en ce moment", bars(livePages), { sub: "onglets connectés" })}
            </div>`;
    }

    // --- Onglet : activite -------------------------------------------------------------

    function renderActivity(o) {
        const a = o.activity;
        if (!a) return html`${notices(o)}${unavailable()}`;
        const totalSeconds = a.pages.reduce((s, p) => s + p.seconds, 0);
        const livePages = Object.entries(state.live?.pages || {})
            .map(([page, count]) => ({ label: pageName(page), value: count }))
            .sort((x, y) => y.value - x.value);

        return html`
            ${notices(o)}
            <div class="kpis">
                ${kpi(`Temps de jeu (${o.range} j)`, fmtDuration(a.playtime.range), `${fmtDuration(a.playtime.today)} aujourd'hui`)}
                ${kpi("Par joueur et par jour", fmtDuration(a.playtime.avgPerPlayerDay), "temps actif moyen")}
                ${kpi(`Sessions (${o.range} j)`, fmtInt(a.sessions.range), `${fmtInt(a.sessions.today)} aujourd'hui`)}
                ${kpi("Durée moyenne d'une session", fmtDuration(a.sessions.avgLength), "jeu actif, sans les pauses")}
                ${kpi(`Pages vues (${o.range} j)`, fmtInt(a.pageviews.range), `${fmtInt(a.pageviews.today)} aujourd'hui`)}
                ${kpi("Joueurs uniques", fmtInt(a.dau), `aujourd'hui · 7 j : ${fmtInt(a.wau)} · 30 j : ${fmtInt(a.mau)}`)}
            </div>

            <div class="grid-2">
                ${card("Temps de jeu par jour", chart({
                    title: "Temps de jeu par jour", labels: o.days, format: fmtDuration, tick: fmtDurationTick, duration: true,
                    series: [series("Temps de jeu", a.series.playtime)]
                }))}
                ${card("Joueurs actifs par jour", chart({
                    title: "Joueurs actifs par jour", labels: o.days, integer: true,
                    series: [series("Joueurs actifs", a.series.players)]
                }))}
                ${card("Sessions par jour", chart({
                    title: "Sessions par jour", labels: o.days, integer: true,
                    series: [series("Sessions", a.series.sessions)]
                }))}
                ${card("Pages vues par jour", chart({
                    title: "Pages vues par jour", labels: o.days, integer: true,
                    series: [series("Pages vues", a.series.pageviews)]
                }))}
            </div>

            <h2 class="section-title">Pages <small>sur ${o.range} jours</small></h2>
            <div class="grid-2">
                ${card("Temps passé par page", table([
                    { label: "Page", cell: (r) => pageName(r.page) },
                    { label: "Vues", num: true, cell: (r) => fmtInt(r.views) },
                    { label: "Temps total", num: true, cell: (r) => fmtDuration(r.seconds) },
                    { label: "Moyen / vue", num: true, cell: (r) => (r.views ? fmtDuration(r.seconds / r.views) : "—") },
                    { label: "Part du temps", num: true, cell: (r) => html`${pct(r.seconds, totalSeconds)}<span class="meter"><i style="width:${raw(totalSeconds ? ((r.seconds / totalSeconds) * 100).toFixed(1) : 0)}%"></i></span>` }
                ], a.pages))}
                ${card("Pages ouvertes en ce moment", bars(livePages), { sub: "onglets connectés" })}
            </div>

            <h2 class="section-title">Plus gros temps de jeu <small>sur ${o.range} jours</small></h2>
            ${table([
                { label: "#", num: true, cell: (r) => r.rank },
                { label: "Joueur", cell: (r) => playerLink(r.userId, r.pseudo) },
                { label: "Temps de jeu", num: true, cell: (r) => fmtDuration(r.seconds) },
                { label: "Sessions", num: true, cell: (r) => fmtInt(r.sessions) },
                { label: "Caisses ouvertes", num: true, cell: (r) => fmtInt(r.chestsOpened) }
            ], a.topPlaytime.map((r, i) => ({ ...r, rank: i + 1 })), { rowUser: (r) => r.userId })}`;
    }

    // --- Onglet : caisses ------------------------------------------------------------

    function renderChests(o) {
        const c = o.chests;
        if (!c) return html`${notices(o)}${unavailable()}`;
        return html`
            ${notices(o)}
            <div class="kpis">
                ${kpi("Ouvertes aujourd'hui", fmtInt(c.openedToday), `${fmtInt(c.opened7d)} sur 7 j`)}
                ${kpi(`Ouvertes (${o.range} j)`, fmtInt(c.openedRange))}
                ${kpi("Achetées aujourd'hui", fmtInt(c.boughtToday), `${fmtInt(c.boughtRange)} sur ${o.range} j`)}
                ${kpi(`Or dépensé en boutique (${o.range} j)`, fmtCompact(c.goldRange), `${fmtCompact(c.goldToday)} aujourd'hui`)}
                ${kpi("En inventaire, pas ouvertes", fmtInt(c.inInventory), "tous joueurs confondus")}
            </div>

            <div class="grid-2">
                ${card("Caisses ouvertes et achetées par jour", chart({
                    title: "Caisses ouvertes et achetées par jour", labels: o.days, integer: true,
                    series: [series("Ouvertes", c.series.opened, COLORS.s1), series("Achetées", c.series.bought, COLORS.s2)]
                }))}
                ${card(`Caisses ouvertes par type (${o.range} j)`, bars(c.byChest.filter((x) => x.opened > 0)
                    .map((x) => ({ label: `${x.icon} ${x.name}`, value: x.opened }))))}
            </div>

            <h2 class="section-title">Par caisse</h2>
            ${table([
                { label: "Caisse", cell: (r) => `${r.icon} ${r.name}` },
                { label: "Prix", num: true, cell: (r) => fmtCompact(r.price) },
                { label: `Ouvertes (${o.range} j)`, num: true, cell: (r) => fmtInt(r.opened) },
                { label: `Achetées (${o.range} j)`, num: true, cell: (r) => fmtInt(r.bought) },
                { label: "En inventaire", num: true, cell: (r) => fmtInt(r.inInventory) }
            ], c.byChest)}

            <h2 class="section-title">Plus gros ouvreurs aujourd'hui</h2>
            ${openersTable(c.topToday)}`;
    }

    function openersTable(rows) {
        return table([
            { label: "Joueur", cell: (r) => playerLink(r.userId, r.pseudo) },
            { label: "Ouvertes", num: true, cell: (r) => fmtInt(r.opened) },
            { label: "Achetées", num: true, cell: (r) => fmtInt(r.bought) },
            { label: "Temps de jeu", num: true, cell: (r) => fmtDuration(r.seconds) },
            { label: "Par heure de jeu", num: true, cell: (r) => (r.seconds > 60 ? fmtInt(r.opened / (r.seconds / 3600)) : "—") },
            { label: "Vérifs réussies / ratées", num: true, cell: (r) => `${fmtInt(r.checksPassed)} / ${fmtInt(r.checksFailed)}` }
        ], rows, { rowUser: (r) => r.userId, empty: "Aucune caisse ouverte aujourd'hui." });
    }

    // --- Onglet : economie -------------------------------------------------------

    function richTable(rows) {
        return table([
            { label: "#", num: true, cell: (r) => r.rank },
            { label: "Joueur", cell: (r) => playerLink(r.userId, r.pseudo) },
            { label: "Or", num: true, cell: (r) => fmtCompact(r.gold) },
            { label: "Pièces/s", num: true, cell: (r) => fmtCompact(r.cps) },
            { label: "Rebirth", num: true, cell: (r) => r.rebirth }
        ], rows.map((r, i) => ({ ...r, rank: i + 1 })), { rowUser: (r) => r.userId });
    }

    function cardList(cards, valueLabel) {
        return table([
            { label: "Carte", cell: (r) => `${r.emoji || "🃏"} ${r.name}` },
            { label: "Rareté", cell: (r) => r.rarity },
            { label: "Joueurs", num: true, cell: (r) => fmtInt(r.owners) },
            { label: valueLabel, num: true, cell: (r) => fmtInt(r.total) }
        ], cards);
    }

    function renderEconomy(o) {
        const e = o.economy;
        const cards = o.cards;
        const m = o.market;
        return html`
            ${notices(o)}
            <h2 class="section-title">Or et progression</h2>
            ${e ? html`
                <div class="kpis">
                    ${kpi("Or en circulation", fmtCompact(e.goldTotal), `${fmtCompact(e.goldAvg)} en moyenne par joueur`)}
                    ${kpi("Production totale", `${fmtCompact(e.cpsTotal)} /s`, `${fmtCompact(e.cpsAvg)} /s en moyenne`)}
                    ${kpi(`Or dépensé en caisses (${o.range} j)`, fmtCompact(e.shopGoldRange))}
                    ${kpi(`Rebirths (${o.range} j)`, fmtInt(e.rebirthsRange))}
                </div>
                <div class="grid-2">
                    ${card("Répartition de la richesse", bars(e.wealth.map((w) => ({ label: w.label, value: w.count }))), { sub: "joueurs par tranche d'or" })}
                    ${card("Niveaux de rebirth", bars(e.rebirths.map((r) => ({ label: r.level === 0 ? "Aucun rebirth" : `Rebirth ${r.level}`, value: r.count }))))}
                    ${card("Les plus riches", richTable(e.topGold))}
                    ${card("Les plus gros producteurs", richTable(e.topCps), { sub: "pièces/s au dernier calcul" })}
                </div>` : unavailable()}

            <h2 class="section-title">Cartes</h2>
            ${cards ? html`
                <div class="kpis">
                    ${kpi("Cartes au catalogue", fmtInt(cards.catalog))}
                    ${kpi("Exemplaires possédés", fmtCompact(cards.totalOwned), "toutes collections confondues")}
                    ${kpi("Jamais obtenues", fmtInt(cards.neverOwned), "cartes que personne ne possède")}
                </div>
                <div class="grid-2">
                    ${card("Par rareté", table([
                        { label: "Rareté", cell: (r) => r.rarity },
                        { label: "Cartes", num: true, cell: (r) => fmtInt(r.cards) },
                        { label: "Déjà obtenues", num: true, cell: (r) => `${fmtInt(r.owned)} / ${fmtInt(r.cards)}` },
                        { label: "Exemplaires", num: true, cell: (r) => fmtCompact(r.total) }
                    ], cards.byRarity))}
                    ${card("Les plus répandues", cardList(cards.mostOwned, "Exemplaires"))}
                    ${card("Les plus rares (déjà obtenues)", cardList(cards.rarest, "Exemplaires"))}
                </div>` : unavailable()}

            <h2 class="section-title">Marché des Brainrots <small>sur ${o.range} jours</small></h2>
            ${m ? html`
                <div class="kpis">
                    ${kpi("Annonces actives", fmtInt(m.active))}
                    ${kpi("Mises en vente", fmtInt(m.listedRange))}
                    ${kpi("Ventes", fmtInt(m.salesRange))}
                    ${kpi("Volume échangé", fmtCompact(m.volumeRange), "or")}
                    ${kpi("Commissions prélevées", fmtCompact(m.feesRange), "or retiré du jeu")}
                </div>
                <div class="grid-2">
                    ${card("Ventes par jour", chart({
                        title: "Ventes par jour", labels: o.days, integer: true,
                        series: [series("Ventes", m.series.sales)]
                    }))}
                    ${card("Cartes les plus vendues", table([
                        { label: "Carte", cell: (r) => r.name },
                        { label: "Ventes", num: true, cell: (r) => fmtInt(r.count) },
                        { label: "Volume", num: true, cell: (r) => fmtCompact(r.volume) }
                    ], m.topCards))}
                </div>` : unavailable()}`;
    }

    // --- Onglet : modes de jeu ---------------------------------------------------------

    function renderModes(o) {
        const cb = o.combat;
        const v = o.village;
        const s = o.social;
        const p = o.players;
        const live = state.live || o.live;
        return html`
            ${notices(o)}
            <h2 class="section-title">Combats multijoueur</h2>
            ${cb ? html`
                <div class="kpis">
                    ${kpi("Matchs en cours", fmtInt(live?.activeMatches), `${fmtInt(live?.inQueue)} joueur(s) en file`)}
                    ${kpi("Matchs aujourd'hui", fmtInt(cb.matchesToday))}
                    ${kpi(`Matchs (${o.range} j)`, fmtInt(cb.matchesRange), `${fmtInt(cb.forfeitsRange)} abandons · ${fmtInt(cb.drawsRange)} nuls`)}
                    ${kpi("Victoires (total)", fmtInt(cb.totalWins))}
                </div>
                <div class="grid-2">
                    ${card("Matchs terminés par jour", chart({
                        title: "Matchs terminés par jour", labels: o.days, integer: true,
                        series: [series("Matchs", cb.series)]
                    }))}
                    ${card("Meilleurs combattants", table([
                        { label: "#", num: true, cell: (r) => r.rank },
                        { label: "Joueur", cell: (r) => playerLink(r.userId, r.pseudo) },
                        { label: "Victoires", num: true, cell: (r) => fmtInt(r.wins) }
                    ], cb.topWinners.map((r, i) => ({ ...r, rank: i + 1 })), { rowUser: (r) => r.userId }))}
                </div>` : unavailable()}

            <h2 class="section-title">Villaggio</h2>
            ${v ? html`
                <div class="kpis">
                    ${kpi("Villages construits", fmtInt(v.villages), p ? `${pct(v.villages, p.total)} des joueurs` : "")}
                    ${kpi(`Raids (${o.range} j)`, fmtInt(v.raidsRange), `${fmtInt(v.threeStarsRange)} à 3 étoiles`)}
                </div>
                <div class="grid-2">
                    ${card("Raids par jour", chart({
                        title: "Raids par jour", labels: o.days, integer: true,
                        series: [series("Raids", v.series)]
                    }))}
                    ${card(`Raids par mode (${o.range} j)`, bars(v.byMode.map((x) => ({ label: VILLAGE_MODES[x.mode] || x.mode, value: x.count }))))}
                    ${card("Niveau du Palazzo", bars(v.palazzo.map((x) => ({ label: x.level === 0 ? "En construction" : `Niveau ${x.level}`, value: x.count }))))}
                    ${card("Trophées", table([
                        { label: "#", num: true, cell: (r) => r.rank },
                        { label: "Joueur", cell: (r) => playerLink(r.userId, r.pseudo) },
                        { label: "Trophées", num: true, cell: (r) => fmtInt(r.trophies) }
                    ], v.topTrophies.map((r, i) => ({ ...r, rank: i + 1 })), { rowUser: (r) => r.userId }))}
                </div>` : unavailable()}

            <h2 class="section-title">Passe de combat et amis</h2>
            ${s ? html`
                <div class="kpis">
                    ${p ? kpi("Passe de combat acheté", fmtInt(p.withPass), `${pct(p.withPass, p.total)} des joueurs`) : ""}
                    ${kpi(`Récompenses réclamées (${o.range} j)`, fmtInt(s.passClaimsRange))}
                    ${kpi("Amitiés", fmtInt(s.friendships))}
                    ${kpi("Demandes en attente", fmtInt(s.pendingRequests))}
                </div>
                <div class="grid-2">
                    ${card("Récompenses du passe réclamées par jour", chart({
                        title: "Récompenses du passe réclamées par jour", labels: o.days, integer: true,
                        series: [series("Récompenses", s.passClaimsSeries)]
                    }))}
                </div>` : unavailable()}`;
    }

    // --- Onglet : codes promo ---------------------------------------------------------

    function promoRows(promo) {
        const q = state.promoFilter.trim().toLowerCase();
        if (!q) return promo.codes;
        return promo.codes.filter((c) => c.code.toLowerCase().includes(q)
            || c.reward.label.toLowerCase().includes(q)
            || (c.owner || "").toLowerCase().includes(q));
    }

    function promoTable(promo, range) {
        return table([
            { label: "Code", cell: (r) => html`<strong>${r.code}</strong>` },
            { label: "Récompense", cell: (r) => r.reward.label },
            {
                label: "Utilisations", num: true, cell: (r) => r.maxUses
                    ? html`${fmtInt(r.uses)} / ${fmtInt(r.maxUses)}<span class="meter"><i style="width:${raw(Math.min(100, (r.uses / r.maxUses) * 100).toFixed(1))}%"></i></span>`
                    : html`${fmtInt(r.uses)} <span class="card-sub">/ illimité</span>`
            },
            { label: `Sur ${range} j`, num: true, cell: (r) => fmtInt(r.usesRange) },
            { label: "Dernière utilisation", cell: (r) => (r.lastUsedAt ? fmtAgo(r.lastUsedAt) : "jamais") },
            { label: "Parrain", cell: (r) => r.owner || "—" },
            { label: "Créé le", cell: (r) => html`${fmtDate(r.createdAt)}${r.createdBy ? html` <span class="card-sub">par ${r.createdBy}</span>` : ""}` },
            { label: "Expire", cell: (r) => (r.expiresAt ? fmtDateTime(r.expiresAt) : "jamais") },
            { label: "Statut", cell: (r) => (r.expired ? chip("Expiré", "plain") : r.exhausted ? chip("Épuisé", "serious") : chip("Actif", "good")) },
            {
                label: "", action: true, cell: (r) => (r.expired || r.exhausted)
                    ? ""
                    : html`<button type="button" class="btn btn-small btn-danger" data-disable-code="${r.id}" data-code="${r.code}">Désactiver</button>`
            }
        ], promoRows(promo), { empty: "Aucun code ne correspond.", maxHeight: 620 });
    }

    function rarityRank(rarity) {
        const index = RARITY_ORDER.indexOf(String(rarity || "").toLowerCase());
        return index < 0 ? RARITY_ORDER.length : index;
    }

    function chestOptions(selected) {
        const chests = state.catalog?.chests || [];
        if (!chests.length) return html`<option value="">Aucune caisse en base</option>`;
        return chests.map((c) => html`<option value="${c.id}"${c.id === selected ? raw(" selected") : ""}>${c.icon || "📦"} ${c.name || "Caisse"}</option>`);
    }

    const sortedCards = () => [...(state.catalog?.cards || [])].sort((a, b) => rarityRank(a.rarity) - rarityRank(b.rarity) || a.name.localeCompare(b.name, "fr"));

    function cardOptions(selected) {
        const cards = state.catalog?.cards || [];
        if (!cards.length) return html`<option value="">Aucune carte en base</option>`;
        const groups = new Map();
        for (const c of sortedCards()) {
            const key = c.rarity || "Sans rareté";
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push(c);
        }
        return [...groups].map(([rarity, list]) => html`<optgroup label="${rarity}">${list.map((c) =>
            html`<option value="${c.id}"${c.id === selected ? raw(" selected") : ""}>${c.emojie || "🃏"} ${c.name}</option>`)}</optgroup>`);
    }

    function promoCreator() {
        const d = state.promoDraft;
        const types = [["Gold", "💰 Or"], ["Chest", "📦 Caisse"], ["Card", "🃏 Carte"]];
        const loading = !state.catalog && d.type !== "Gold";
        return html`
            <section class="card creator">
                <div class="card-head">
                    <h3 class="card-title">Créer un code promo</h3>
                    <span class="card-sub">Chaque joueur ne peut l'utiliser qu'une seule fois.</span>
                </div>
                <form class="form" data-form="promo" novalidate>
                    <div class="field reward-type"><span>Récompense</span>
                        <div class="segmented" role="radiogroup" aria-label="Récompense">
                            ${types.map(([value, label]) => html`<button type="button" role="radio" data-promo-type="${value}" aria-checked="${String(d.type === value)}" class="${d.type === value ? "is-active" : ""}">${label}</button>`)}
                        </div>
                    </div>
                    <div class="form-grid">
                        <label class="field"><span>Code <small>vide = généré</small></span>
                            <input class="input" name="code" maxlength="32" placeholder="EVENT-XXXXXX" value="${d.code}" autocomplete="off" autocapitalize="characters" spellcheck="false">
                        </label>
                        ${d.type === "Gold" ? html`
                            <label class="field"><span>Quantité d'or</span>
                                <input class="input" name="goldAmount" type="number" min="1" step="1" inputmode="numeric" placeholder="50000" value="${d.goldAmount}">
                            </label>` : ""}
                        ${d.type === "Chest" ? html`
                            <label class="field"><span>Caisse</span>
                                <select class="select" name="chestId"${loading ? raw(" disabled") : ""}>${loading ? html`<option>Chargement…</option>` : chestOptions(d.chestId)}</select>
                            </label>` : ""}
                        ${d.type === "Card" ? html`
                            <label class="field"><span>Carte</span>
                                <select class="select" name="cardId"${loading ? raw(" disabled") : ""}>${loading ? html`<option>Chargement…</option>` : cardOptions(d.cardId)}</select>
                            </label>` : ""}
                        ${d.type !== "Gold" ? html`
                            <label class="field"><span>${d.type === "Chest" ? "Nombre de caisses" : "Exemplaires"}</span>
                                <input class="input" name="quantity" type="number" min="1" max="50" step="1" inputmode="numeric" value="${d.quantity}">
                            </label>` : ""}
                        <label class="field"><span>Utilisations max <small>vide = illimité</small></span>
                            <input class="input" name="maxUses" type="number" min="1" step="1" inputmode="numeric" placeholder="Illimité" value="${d.maxUses}">
                        </label>
                        <label class="field"><span>Expire le <small>vide = jamais</small></span>
                            <input class="input" name="expiresAt" type="datetime-local" value="${d.expiresAt}">
                        </label>
                    </div>
                    <div class="form-actions">
                        <button type="submit" class="btn btn-primary">Créer le code</button>
                        ${state.promoCreated ? html`<div class="created"><span>Code créé :</span><strong class="code-pill">${state.promoCreated}</strong><button type="button" class="btn btn-small" data-copy="${state.promoCreated}">Copier</button></div>` : ""}
                    </div>
                </form>
            </section>`;
    }

    function updatePromoCreator() {
        const box = $("#promo-creator");
        if (box && state.tab === "promo") mount(box, promoCreator());
    }

    function renderPromo(o) {
        const pr = o.promo;
        const creator = html`<div id="promo-creator">${promoCreator()}</div>`;
        if (!pr) return html`${creator}${notices(o)}${unavailable()}`;
        const top = [...pr.codes].filter((c) => c.usesRange > 0).sort((a, b) => b.usesRange - a.usesRange).slice(0, 10);
        return html`
            ${creator}
            <div class="kpis">
                ${kpi("Codes créés", fmtInt(pr.totalCodes), `${fmtInt(pr.activeCodes)} encore utilisables`)}
                ${kpi("Codes de parrainage", fmtInt(pr.referralCodes))}
                ${kpi("Utilisations (total)", fmtInt(pr.totalUses))}
                ${kpi(`Utilisations (${o.range} j)`, fmtInt(pr.usesRange), `${fmtInt(pr.usesToday)} aujourd'hui`)}
                ${kpi(`Joueurs différents (${o.range} j)`, fmtInt(pr.usersRange))}
            </div>
            <div class="grid-2">
                ${card("Codes utilisés par jour", chart({
                    title: "Codes utilisés par jour", labels: o.days, integer: true,
                    series: [series("Utilisations", pr.series, COLORS.s3)]
                }))}
                ${card(`Codes les plus utilisés (${o.range} j)`, bars(top.map((c) => ({ label: c.code, value: c.usesRange })), { color: COLORS.s3 }))}
            </div>
            <h2 class="section-title">Tous les codes</h2>
            <div class="toolbar">
                <input id="promo-filter" class="input" type="search" placeholder="Filtrer par code, récompense ou parrain…" value="${state.promoFilter}" autocomplete="off">
            </div>
            <div id="promo-table">${promoTable(pr, o.range)}</div>`;
    }

    const announceThemes = () => window.BrainrotAnnounce?.themes || [{ key: "flame", name: "Brasier", a: "#f97316", b: "#dc2626" }];
    const announceLinks = () => window.BrainrotAnnounce?.links || [];
    const themeOf = (key) => announceThemes().find((t) => t.key === key) || announceThemes()[0];

    function prizeLabel(r) {
        const qty = Math.max(1, Number(r.quantity) || 1);
        const times = qty > 1 ? `${qty} × ` : "";
        if (r.type === "Gold") return `${fmtInt(Number(r.goldAmount) || 0)} or`;
        if (r.type === "Chest") {
            const chest = (state.catalog?.chests || []).find((c) => c.id === r.chestId);
            return chest ? `${times}${chest.icon || "📦"} ${chest.name || "Caisse"}` : "une caisse";
        }
        if (r.type === "Card") {
            const card = (state.catalog?.cards || []).find((c) => c.id === r.cardId);
            return card ? `${times}${card.emojie || "🃏"} ${card.name}` : "une carte";
        }
        return "";
    }

    const isQuiz = () => state.draft.pollOn && state.draft.correct !== null;

    function draftToPreview() {
        const d = state.draft;
        return {
            title: d.title.trim() || "Titre du message",
            body: d.body.trim(),
            icon: d.icon.trim() || "📢",
            theme: d.theme,
            buttonLabel: d.buttonLabel.trim(),
            link: d.link || null,
            poll: d.pollOn ? {
                question: d.question.trim() || "Question du sondage",
                options: d.options.map((o, i) => o.trim() || `Réponse ${i + 1}`),
                showResults: d.showResults,
                quiz: isQuiz(),
                prize: isQuiz() && d.reward.type ? { label: prizeLabel(d.reward), maxWinners: Number(d.reward.maxWinners) || null } : null
            } : null
        };
    }

    function rewardPayload() {
        const r = state.draft.reward;
        if (!isQuiz() || !r.type) return null;
        const reward = { type: r.type, maxWinners: r.maxWinners ? Number(r.maxWinners) : null };
        if (r.type === "Gold") reward.goldAmount = Number(r.goldAmount);
        else reward.quantity = Number(r.quantity || 1);
        if (r.type === "Chest") reward.chestId = r.chestId || $('[data-reward-field="chestId"]')?.value;
        if (r.type === "Card") reward.cardId = r.cardId || $('[data-reward-field="cardId"]')?.value;
        return reward;
    }

    function draftToPayload() {
        const d = state.draft;
        return {
            title: d.title.trim(),
            body: d.body.trim(),
            icon: d.icon.trim(),
            theme: d.theme,
            buttonLabel: d.buttonLabel.trim(),
            link: d.link || null,
            poll: d.pollOn ? { question: d.question.trim(), options: d.options.map((o) => o.trim()), showResults: d.showResults, correct: isQuiz() ? d.correct : null } : null,
            reward: rewardPayload(),
            audience: d.audience,
            pseudos: d.audience === "users" ? d.pseudos : [],
            onlineOnly: d.duration === "online",
            durationHours: d.duration === "online" ? 1 : Number(d.duration)
        };
    }

    function sendLabel() {
        const d = state.draft;
        const online = d.duration === "online";
        if (d.audience === "all") return online ? "Envoyer aux joueurs connectés" : "Envoyer à tous les joueurs";
        const n = d.pseudos.length;
        if (!n) return "Envoyer";
        return `Envoyer à ${n} joueur${n > 1 ? "s" : ""}${online ? " (s'ils sont connectés)" : ""}`;
    }

    function rewardBox() {
        const r = state.draft.reward;
        const loading = !state.catalog && (r.type === "Chest" || r.type === "Card");
        return html`
            <div class="quiz-box">
                <div class="field"><span>Récompense pour une bonne réponse</span>
                    <div class="segmented" role="radiogroup" aria-label="Récompense du quiz">
                        ${REWARD_TYPES.map(([value, label]) => html`<button type="button" role="radio" data-reward-type="${value}" aria-checked="${String(r.type === value)}" class="${r.type === value ? "is-active" : ""}">${label}</button>`)}
                    </div>
                </div>
                ${r.type ? html`<div class="form-grid">
                    ${r.type === "Gold" ? html`<label class="field"><span>Quantité d'or</span>
                        <input class="input" data-reward-field="goldAmount" type="number" min="1" step="1" inputmode="numeric" placeholder="50000" value="${r.goldAmount}">
                    </label>` : ""}
                    ${r.type === "Chest" ? html`<label class="field"><span>Caisse</span>
                        <select class="select" data-reward-field="chestId"${loading ? raw(" disabled") : ""}>${loading ? html`<option>Chargement…</option>` : chestOptions(r.chestId)}</select>
                    </label>` : ""}
                    ${r.type === "Card" ? html`<label class="field"><span>Carte</span>
                        <select class="select" data-reward-field="cardId"${loading ? raw(" disabled") : ""}>${loading ? html`<option>Chargement…</option>` : cardOptions(r.cardId)}</select>
                    </label>` : ""}
                    ${r.type !== "Gold" ? html`<label class="field"><span>${r.type === "Chest" ? "Nombre de caisses" : "Exemplaires"}</span>
                        <input class="input" data-reward-field="quantity" type="number" min="1" max="50" step="1" inputmode="numeric" value="${r.quantity}">
                    </label>` : ""}
                    <label class="field"><span>Gagnants max <small>vide = tous les bons</small></span>
                        <input class="input" data-reward-field="maxWinners" type="number" min="1" step="1" inputmode="numeric" placeholder="Illimité" value="${r.maxWinners}">
                    </label>
                </div>
                <p class="card-sub">Chaque joueur ne répond qu'une fois : la récompense va aux bonnes réponses${r.maxWinners ? `, aux ${r.maxWinners} premiers seulement` : ""}.</p>` : ""}
            </div>`;
    }

    function composerForm() {
        const d = state.draft;
        const custom = d.icon && !ICONS.includes(d.icon) ? d.icon : "";
        return html`
            <form class="form" data-form="announce" novalidate>
                <div class="field"><span>Destinataires</span>
                    <div class="segmented" role="radiogroup" aria-label="Destinataires">
                        <button type="button" role="radio" data-audience="all" aria-checked="${String(d.audience === "all")}" class="${d.audience === "all" ? "is-active" : ""}">Tous les joueurs</button>
                        <button type="button" role="radio" data-audience="users" aria-checked="${String(d.audience === "users")}" class="${d.audience === "users" ? "is-active" : ""}">Joueurs choisis</button>
                    </div>
                </div>
                ${d.audience === "users" ? html`
                    <div class="field"><span>Pseudos <small>Entrée pour ajouter</small></span>
                        <div class="inline">
                            <input class="input" name="pseudoInput" list="pseudo-suggest" maxlength="64" placeholder="Pseudo du joueur" value="${d.pseudoInput}" autocomplete="off" spellcheck="false">
                            <button type="button" class="btn" data-add-pseudo>Ajouter</button>
                        </div>
                        <datalist id="pseudo-suggest"></datalist>
                        ${d.pseudos.length ? html`<div class="chips">${d.pseudos.map((p, i) => html`<span class="pseudo-chip">${p}<button type="button" data-remove-pseudo="${i}" aria-label="Retirer ${p}">×</button></span>`)}</div>` : ""}
                    </div>` : ""}
                <div class="field"><span>Icône</span>
                    <div class="icon-picks">
                        ${ICONS.map((icon) => html`<button type="button" class="icon-pick${icon === d.icon ? " is-active" : ""}" data-ann-icon="${icon}" aria-label="Icône ${icon}">${icon}</button>`)}
                        <input class="input icon-custom${custom ? " is-active" : ""}" name="icon" maxlength="16" placeholder="Autre" value="${custom}" autocomplete="off" aria-label="Autre icône (emoji)">
                    </div>
                </div>
                <div class="field"><span>Couleur</span>
                    <div class="swatches">
                        ${announceThemes().map((t) => html`<button type="button" class="swatch${t.key === d.theme ? " is-active" : ""}" data-ann-theme="${t.key}" title="${t.name}" aria-label="Couleur ${t.name}" style="background:linear-gradient(135deg,${t.a},${t.b})"></button>`)}
                    </div>
                </div>
                <label class="field"><span>Titre</span>
                    <input class="input" name="title" maxlength="80" placeholder="Ex. Week-end double or !" value="${d.title}" autocomplete="off">
                </label>
                <label class="field"><span>Texte <small>facultatif si tu mets un sondage</small></span>
                    <textarea class="input" name="body" maxlength="1000" rows="4" placeholder="Ton message aux joueurs…">${d.body}</textarea>
                </label>
                <label class="check"><input type="checkbox" name="pollOn"${d.pollOn ? raw(" checked") : ""}> Ajouter un sondage</label>
                ${d.pollOn ? html`
                    <div class="fieldset">
                        <label class="field"><span>Question</span>
                            <input class="input" name="question" maxlength="160" placeholder="Ex. Quel event pour samedi ?" value="${d.question}" autocomplete="off">
                        </label>
                        <div class="field"><span>Réponses <small>2 à 6</small></span>
                            ${d.options.map((o, i) => html`<div class="inline">
                                <button type="button" class="correct-pick${d.correct === i ? " is-active" : ""}" data-correct="${i}" aria-pressed="${String(d.correct === i)}" title="${d.correct === i ? "Bonne réponse (cliquer pour retirer)" : "Marquer comme bonne réponse"}" aria-label="Bonne réponse : réponse ${i + 1}">✓</button>
                                <input class="input" name="option" data-index="${i}" maxlength="60" placeholder="Réponse ${i + 1}" value="${o}" autocomplete="off">
                                ${d.options.length > 2 ? html`<button type="button" class="btn btn-small" data-remove-option="${i}" aria-label="Retirer la réponse ${i + 1}">×</button>` : ""}
                            </div>`)}
                            ${d.options.length < 6 ? html`<button type="button" class="btn btn-small add-option" data-add-option>+ Ajouter une réponse</button>` : ""}
                            <p class="card-sub">${d.correct === null ? "Clique sur ✓ à côté d'une réponse pour en faire un quiz avec une bonne réponse (et une récompense si tu veux)." : "Quiz : la bonne réponse est en vert. Le joueur ne la découvre qu'après avoir répondu."}</p>
                        </div>
                        ${d.correct !== null ? rewardBox() : ""}
                        <label class="check"><input type="checkbox" name="showResults"${d.showResults ? raw(" checked") : ""}> Montrer les résultats aux joueurs après leur vote</label>
                    </div>` : ""}
                <div class="form-grid">
                    <label class="field"><span>Texte du bouton <small>facultatif</small></span>
                        <input class="input" name="buttonLabel" maxlength="32" placeholder="${d.link ? "Aller : …" : d.pollOn ? "Fermer" : "Compris !"}" value="${d.buttonLabel}" autocomplete="off">
                    </label>
                    <label class="field"><span>Le bouton emmène vers</span>
                        <select class="select" name="link">
                            <option value="">Nulle part (ferme le message)</option>
                            ${announceLinks().map((l) => html`<option value="${l.key}"${l.key === d.link ? raw(" selected") : ""}>${l.name}</option>`)}
                        </select>
                    </label>
                    <label class="field"><span>Visible pendant</span>
                        <select class="select" name="duration">
                            ${DURATIONS.map(([value, label]) => html`<option value="${value}"${value === d.duration ? raw(" selected") : ""}>${label}</option>`)}
                        </select>
                    </label>
                </div>
                <p class="card-sub">${d.duration === "online"
                    ? "Seuls les joueurs connectés à l'instant le reçoivent. Ceux qui se connectent après ne le verront jamais."
                    : "Les joueurs connectés le reçoivent tout de suite, les autres à leur prochaine connexion pendant cette durée. Chacun ne le voit qu'une fois."}</p>
                <div class="form-actions">
                    <button type="submit" class="btn btn-primary" id="announce-send">${sendLabel()}</button>
                </div>
            </form>`;
    }

    function pollBar(label, count, total, isCorrect = false) {
        const share = total ? Math.round((count / total) * 100) : 0;
        return html`<div class="ann-bar${isCorrect ? " is-correct" : ""}">
            <div class="ann-bar-top"><span>${isCorrect ? "✓ " : ""}${label}</span><b>${fmtInt(count)} · ${share} %</b></div>
            <div class="ann-track"><i style="width:${raw(String(share))}%"></i></div>
        </div>`;
    }

    function announcementCard(a) {
        const theme = themeOf(a.theme);
        const status = a.status === "active" ? chip("En cours", "good") : a.status === "closed" ? chip("Arrêté", "plain") : chip("Terminé", "plain");
        const names = `${a.targets.join(", ")}${a.targetCount > a.targets.length ? "…" : ""}`;
        const audience = a.audience === "all"
            ? "Tous les joueurs"
            : a.audience === "online"
                ? `Joueurs connectés à l'envoi (${a.targetCount}) : ${names}`
                : `${a.targetCount} joueur${a.targetCount > 1 ? "s" : ""} : ${names}`;
        const quiz = a.poll && a.correct !== null && a.correct !== undefined;
        const goodAnswers = quiz ? a.votes?.[a.correct] || 0 : 0;
        const total = a.votes ? a.votes.reduce((sum, n) => sum + n, 0) : 0;
        const when = a.status === "active"
            ? `Visible jusqu'au ${fmtDateTime(a.expiresAt)}`
            : a.closedAt ? `Arrêté ${fmtAgo(a.closedAt)}` : `Terminé le ${fmtDateTime(a.expiresAt)}`;
        return html`
            <article class="card ann-card" style="--ann-a:${theme.a};--ann-b:${theme.b}">
                <div class="ann-head">
                    <span class="ann-icon" aria-hidden="true">${a.icon || "📢"}</span>
                    <div class="ann-main">
                        <div class="ann-title">${a.title}</div>
                        <div class="card-sub">${audience}</div>
                    </div>
                    ${status}
                </div>
                ${a.body ? html`<p class="ann-body">${a.body}</p>` : ""}
                ${a.poll ? html`<div class="ann-poll">
                    <div class="ann-q">${quiz ? "🧠" : "🗳️"} ${a.poll.question} <span class="card-sub">${fmtInt(total)} vote${total > 1 ? "s" : ""}${a.poll.showResults ? "" : " · résultats cachés aux joueurs"}</span></div>
                    ${quiz ? html`<div class="ann-quiz">
                        <span>${fmtInt(goodAnswers)} bonne${goodAnswers > 1 ? "s" : ""} réponse${goodAnswers > 1 ? "s" : ""}</span>
                        ${a.rewardLabel
                            ? html`<span>🎁 <b>${a.rewardLabel}</b> · gagnants <b>${fmtInt(a.winners)}${a.maxWinners ? ` / ${fmtInt(a.maxWinners)}` : ""}</b></span>`
                            : html`<span>sans récompense</span>`}
                    </div>` : ""}
                    ${a.poll.options.map((label, i) => pollBar(label, a.votes?.[i] || 0, total, quiz && a.correct === i))}
                </div>` : ""}
                <div class="ann-foot">
                    <span>Lu par <b>${fmtInt(a.seen)}</b>${a.audience !== "all" ? ` / ${fmtInt(a.targetCount)}` : ""}</span>
                    <span>Envoyé ${fmtAgo(a.createdAt)}${a.createdBy ? ` par ${a.createdBy}` : ""}</span>
                    <span>${when}</span>
                    ${a.status === "active" ? html`<button type="button" class="btn btn-small btn-danger" data-close-announce="${a.id}">Arrêter</button>` : ""}
                </div>
            </article>`;
    }

    function announcementList() {
        if (!state.announcements) return empty("Chargement…");
        if (!state.announcements.length) return empty("Aucun message envoyé pour l'instant.");
        return html`<div class="ann-list">${state.announcements.map(announcementCard)}</div>`;
    }

    function renderMessages() {
        return html`
            <div class="composer">
                <section class="card">
                    <div class="card-head">
                        <h3 class="card-title">Nouveau message</h3>
                        <span class="card-sub">Pop-up sur l'écran des joueurs</span>
                    </div>
                    <div id="announce-form">${composerForm()}</div>
                </section>
                <section class="card preview-card">
                    <div class="card-head">
                        <h3 class="card-title">Aperçu</h3>
                        <span class="card-sub">Ce que verront les joueurs</span>
                    </div>
                    <div class="preview-stage" id="announce-preview"></div>
                </section>
            </div>
            <h2 class="section-title">Messages envoyés</h2>
            <div id="announce-list">${announcementList()}</div>`;
    }

    let previewFrame = 0;
    function updatePreview() {
        cancelAnimationFrame(previewFrame);
        previewFrame = requestAnimationFrame(() => {
            const box = $("#announce-preview");
            if (box && window.BrainrotAnnounce) window.BrainrotAnnounce.preview(box, draftToPreview());
        });
    }

    function refreshComposer(focusSelector) {
        const box = $("#announce-form");
        if (!box || state.tab !== "messages") return;
        mount(box, composerForm());
        updatePreview();
        if (focusSelector) $(focusSelector)?.focus();
    }

    function updateAnnouncementList() {
        const box = $("#announce-list");
        if (box && state.tab === "messages") mount(box, announcementList());
    }

    function addPseudo() {
        const d = state.draft;
        const value = d.pseudoInput.trim();
        if (!value) return;
        if (!d.pseudos.some((p) => p.toLowerCase() === value.toLowerCase())) d.pseudos.push(value);
        d.pseudoInput = "";
        refreshComposer('[name="pseudoInput"]');
    }

    let suggestTimer = null;
    function suggestPseudos(q) {
        clearTimeout(suggestTimer);
        if (q.trim().length < 2) return;
        suggestTimer = setTimeout(async () => {
            try {
                const rows = await api(`/admin/players?q=${encodeURIComponent(q.trim())}&sort=recent&limit=8`);
                const list = $("#pseudo-suggest");
                if (list) mount(list, rows.map((r) => html`<option value="${r.pseudo}"></option>`));
            } catch {
                return;
            }
        }, 250);
    }

    async function sendAnnouncement() {
        const d = state.draft;
        if (d.audience === "users" && d.pseudoInput.trim()) addPseudo();
        if (!d.title.trim()) return toast("Ajoute un titre.");
        if (!d.body.trim() && !d.pollOn) return toast("Ajoute un texte, un sondage, ou les deux.");
        if (d.audience === "users" && !d.pseudos.length) return toast("Ajoute au moins un pseudo.");
        if (isQuiz() && d.reward.type === "Gold" && !(Number(d.reward.goldAmount) > 0)) return toast("Indique la quantité d'or à gagner.");
        const sendButton = $("#announce-send");
        if (!armButton(sendButton, d.audience === "all" ? "Confirmer : envoyer à TOUS" : "Confirmer l'envoi")) return;
        disarmButton(sendButton);
        sendButton.disabled = true;
        try {
            const result = await api("/admin/announcements", { method: "POST", body: JSON.stringify(draftToPayload()) });
            toast(result.delivered
                ? `Message envoyé : affiché tout de suite à ${fmtInt(result.delivered)} joueur${result.delivered > 1 ? "s" : ""} en ligne.`
                : "Message envoyé : les joueurs le verront à leur prochaine connexion.");
            if (d.duration === "online" && d.audience === "users" && result.targets < d.pseudos.length) {
                toast(`Envoyé à ${result.targets} joueur${result.targets > 1 ? "s" : ""} sur ${d.pseudos.length} : les autres ne sont pas connectés.`);
            }
            const keep = { theme: d.theme, icon: d.icon };
            state.draft = { ...newDraft(), ...keep };
            refreshComposer();
            await loadAnnouncements();
            updateAnnouncementList();
        } catch (error) {
            if (error.message !== "forbidden") toast(`Impossible : ${error.message}`);
            const retry = $("#announce-send");
            if (retry) retry.disabled = false;
        }
    }

    async function closeAnnouncement(button) {
        if (!armButton(button, "Confirmer : arrêter")) return;
        disarmButton(button);
        button.disabled = true;
        try {
            await api(`/admin/announcements/${encodeURIComponent(button.dataset.closeAnnounce)}/close`, { method: "POST", body: "{}" });
            toast("Message arrêté : il disparaît de l'écran des joueurs.");
            await loadAnnouncements();
            updateAnnouncementList();
        } catch (error) {
            if (error.message !== "forbidden") toast(`Impossible : ${error.message}`);
            button.disabled = false;
        }
    }

    async function createPromo(form) {
        const d = state.promoDraft;
        const button = form.querySelector("button[type=submit]");
        const body = {
            type: d.type,
            code: d.code.trim() || undefined,
            maxUses: d.maxUses ? Number(d.maxUses) : null,
            expiresAt: d.expiresAt ? new Date(d.expiresAt).toISOString() : null
        };
        if (d.type === "Gold") body.goldAmount = Number(d.goldAmount);
        if (d.type === "Chest") body.chestId = d.chestId || form.elements.chestId?.value;
        if (d.type === "Card") body.cardId = d.cardId || form.elements.cardId?.value;
        if (d.type !== "Gold") body.quantity = Number(d.quantity || 1);
        if (d.type === "Gold" && !(body.goldAmount > 0)) return toast("Indique la quantité d'or.");
        button.disabled = true;
        try {
            const result = await api("/admin/promo-codes", { method: "POST", body: JSON.stringify(body) });
            state.promoCreated = result.code;
            state.promoDraft = newPromoDraft(d.type);
            toast(`Code ${result.code} créé.`);
            await loadOverview(true);
            if (state.tab === "promo") renderView();
        } catch (error) {
            if (error.message !== "forbidden") toast(`Impossible : ${error.message}`);
            button.disabled = false;
        }
    }

    async function disableCode(button) {
        if (!armButton(button, "Confirmer")) return;
        disarmButton(button);
        button.disabled = true;
        try {
            await api(`/admin/promo-codes/${encodeURIComponent(button.dataset.disableCode)}/disable`, { method: "POST", body: "{}" });
            toast(`Code ${button.dataset.code} désactivé.`);
            await loadOverview(true);
            if (state.tab === "promo") renderView();
        } catch (error) {
            if (error.message !== "forbidden") toast(`Impossible : ${error.message}`);
            button.disabled = false;
        }
    }

    function bindEventTools() {
        document.addEventListener("click", (event) => {
            const target = event.target;
            const type = target.closest("[data-promo-type]");
            if (type) {
                state.promoDraft.type = type.dataset.promoType;
                state.promoDraft.quantity = "1";
                updatePromoCreator();
                return;
            }
            const copy = target.closest("[data-copy]");
            if (copy) {
                navigator.clipboard?.writeText(copy.dataset.copy).then(() => toast("Code copié."), () => toast("Copie impossible."));
                return;
            }
            const disable = target.closest("[data-disable-code]");
            if (disable) {
                if (!disable.disabled) disableCode(disable);
                return;
            }
            const audience = target.closest("[data-audience]");
            if (audience) {
                state.draft.audience = audience.dataset.audience;
                refreshComposer();
                return;
            }
            const icon = target.closest("[data-ann-icon]");
            if (icon) {
                state.draft.icon = icon.dataset.annIcon;
                refreshComposer();
                return;
            }
            const theme = target.closest("[data-ann-theme]");
            if (theme) {
                state.draft.theme = theme.dataset.annTheme;
                refreshComposer();
                return;
            }
            if (target.closest("[data-add-option]")) {
                if (state.draft.options.length < 6) state.draft.options.push("");
                refreshComposer(`[name="option"][data-index="${state.draft.options.length - 1}"]`);
                return;
            }
            const removeOption = target.closest("[data-remove-option]");
            if (removeOption) {
                const index = Number(removeOption.dataset.removeOption);
                const d = state.draft;
                d.options.splice(index, 1);
                if (d.correct === index) d.correct = null;
                else if (d.correct !== null && d.correct > index) d.correct -= 1;
                refreshComposer();
                return;
            }
            const correct = target.closest("[data-correct]");
            if (correct) {
                const index = Number(correct.dataset.correct);
                state.draft.correct = state.draft.correct === index ? null : index;
                refreshComposer();
                return;
            }
            const rewardType = target.closest("[data-reward-type]");
            if (rewardType) {
                const r = state.draft.reward;
                r.type = rewardType.dataset.rewardType;
                r.quantity = "1";
                if (r.type === "Chest" && !r.chestId) r.chestId = state.catalog?.chests?.[0]?.id || "";
                if (r.type === "Card" && !r.cardId) r.cardId = sortedCards()[0]?.id || "";
                refreshComposer();
                return;
            }
            if (target.closest("[data-add-pseudo]")) {
                addPseudo();
                return;
            }
            const removePseudo = target.closest("[data-remove-pseudo]");
            if (removePseudo) {
                state.draft.pseudos.splice(Number(removePseudo.dataset.removePseudo), 1);
                refreshComposer();
                return;
            }
            const close = target.closest("[data-close-announce]");
            if (close && !close.disabled) {
                closeAnnouncement(close);
                return;
            }
            const revoke = target.closest("[data-revoke-session]");
            if (revoke && !revoke.disabled) revokeSession(revoke);
        });

        document.addEventListener("input", (event) => {
            const t = event.target;
            const form = t.form?.dataset.form;
            if (form === "promo" && t.name in state.promoDraft) {
                state.promoDraft[t.name] = t.value;
                return;
            }
            if (form !== "announce") return;
            const d = state.draft;
            if (t.dataset.rewardField) {
                d.reward[t.dataset.rewardField] = t.value;
                updatePreview();
                return;
            }
            if (t.name === "option") d.options[Number(t.dataset.index)] = t.value;
            else if (t.name === "icon") {
                d.icon = t.value.trim() || "📢";
                document.querySelectorAll(".icon-pick").forEach((b) => b.classList.toggle("is-active", b.dataset.annIcon === d.icon));
            } else if (t.name === "pseudoInput") {
                d.pseudoInput = t.value;
                suggestPseudos(t.value);
                return;
            } else if (t.name in d && t.type !== "checkbox") d[t.name] = t.value;
            updatePreview();
        });

        document.addEventListener("change", (event) => {
            const t = event.target;
            const form = t.form?.dataset.form;
            if (form === "promo" && t.tagName === "SELECT") {
                state.promoDraft[t.name] = t.value;
                return;
            }
            if (form !== "announce") return;
            if (t.dataset.rewardField) {
                state.draft.reward[t.dataset.rewardField] = t.value;
                updatePreview();
                return;
            }
            if (t.name === "pollOn") {
                state.draft.pollOn = t.checked;
                refreshComposer(t.checked ? '[name="question"]' : null);
            } else if (t.name === "showResults") {
                state.draft.showResults = t.checked;
                updatePreview();
            } else if (t.tagName === "SELECT") {
                state.draft[t.name] = t.value;
                if (t.name === "link" || t.name === "duration") refreshComposer();
                else updatePreview();
            }
        });

        document.addEventListener("keydown", (event) => {
            if (event.target.name === "pseudoInput" && (event.key === "Enter" || event.key === ",")) {
                event.preventDefault();
                state.draft.pseudoInput = event.target.value;
                addPseudo();
            }
        });

        document.addEventListener("submit", (event) => {
            const form = event.target.closest("[data-form]");
            if (!form) return;
            event.preventDefault();
            if (form.dataset.form === "promo") createPromo(form);
            else if (form.dataset.form === "announce") sendAnnouncement();
            else if (form.dataset.form === "tournament") createTournament();
        });
    }

    // --- Onglet : joueurs ------------------------------------------------------------

    const SORTS = [
        ["recent", "Dernière activité"], ["new", "Inscription récente"], ["gold", "Or"],
        ["cps", "Pièces/s"], ["wins", "Victoires"], ["rebirth", "Rebirth"]
    ];

    function playersTable() {
        if (!state.players) return empty("Chargement…");
        return table([
            { label: "Joueur", cell: (r) => html`${playerLink(r.userId, r.pseudo, r.online)}${r.isAdmin ? html` ${chip("Admin", "plain")}` : ""}${r.pseudoBanned ? html` ${chip("Pseudo banni", "critical")}` : ""}` },
            { label: "Dernière activité", cell: (r) => fmtAgo(r.lastComing) },
            { label: "Or", num: true, cell: (r) => fmtCompact(r.gold) },
            { label: "Pièces/s", num: true, cell: (r) => fmtCompact(r.cps) },
            { label: "Rebirth", num: true, cell: (r) => r.rebirth },
            { label: "Passe", cell: (r) => (r.hasPass ? "Oui" : "—") },
            { label: "Victoires", num: true, cell: (r) => fmtInt(r.wins) },
            { label: "Temps 7 j", num: true, cell: (r) => fmtDuration(r.playtime7d) },
            { label: "Caisses 7 j", num: true, cell: (r) => fmtInt(r.chests7d) },
            { label: "Alertes 7 j", num: true, cell: (r) => (r.flags7d ? chip(fmtInt(r.flags7d), "serious") : "—") },
            { label: "Inscrit le", cell: (r) => fmtDate(r.createdAt) }
        ], state.players, { rowUser: (r) => r.userId, empty: "Aucun joueur trouvé.", maxHeight: 680 });
    }

    function renderPlayers() {
        return html`
            <div class="toolbar">
                <input id="player-search" class="input" type="search" placeholder="Rechercher un pseudo…" value="${state.playerQuery}" autocomplete="off">
                <select id="player-sort" class="select" aria-label="Trier par">
                    ${SORTS.map(([value, label]) => html`<option value="${value}"${value === state.playerSort ? raw(" selected") : ""}>${label}</option>`)}
                </select>
            </div>
            <div id="players-table">${playersTable()}</div>
            <div id="banned-table" class="mod-block">${bannedTable()}</div>
            <div id="banned-users-table" class="mod-block">${bannedUsersTable()}</div>`;
    }

    function bannedUsersTable() {
        if (!state.bannedUsers?.length) return "";
        return html`
            <h2 class="section-title">Joueurs bannis <small>compte supprimé, identifiant PlayWeb bloqué sur BrainrotStar</small></h2>
            ${table([
                { label: "Joueur", cell: (r) => html`<strong>${r.pseudo}</strong>` },
                { label: "Raison", wrap: true, cell: (r) => r.reason || "—" },
                { label: "Banni par", cell: (r) => r.bannedBy || "—" },
                { label: "Le", cell: (r) => fmtDateTime(r.bannedAt) },
                { label: "", action: true, cell: (r) => html`<button type="button" class="btn btn-small btn-danger" data-unban-account="${r.userId}" data-pseudo="${r.pseudo}">Débannir</button>` }
            ], state.bannedUsers, { maxHeight: 420 })}`;
    }

    function bannedTable() {
        if (!state.banned?.length) return "";
        return html`
            <h2 class="section-title">Pseudos interdits <small>personne ne peut les reprendre, ni ici ni sur PlayWeb</small></h2>
            ${table([
                { label: "Pseudo", cell: (r) => html`<strong>${r.pseudo}</strong>` },
                { label: "Banni par", cell: (r) => r.bannedBy || "—" },
                { label: "Le", cell: (r) => fmtDateTime(r.bannedAt) },
                { label: "", action: true, cell: (r) => html`<button type="button" class="btn btn-small" data-unban="${r.pseudo}">Retirer</button>` }
            ], state.banned, { maxHeight: 420 })}`;
    }

    // --- Onglet : anti-macro -------------------------------------------------------

    function checkStatus(s) {
        if (s.lockedForMs > 0) return chip(`Bloqué ${Math.ceil(s.lockedForMs / 1000)} s`, "critical");
        if (s.pending) {
            const since = fmtDuration((s.pendingForMs || 0) / 1000);
            return chip(`En attente depuis ${since}`, s.blocked >= 10 ? "critical" : "warning");
        }
        if (s.paused) return chip(`Hors boutique · prochaine après ${Math.ceil(s.nextInMs / 60000)} min de boutique`, "plain");
        return chip(`OK · prochaine ${fmtIn(s.nextInMs)}`, "good");
    }

    function renderAnticheat(o) {
        const ac = state.anticheat;
        const sum = o.antiCheat;
        if (!ac) return empty("Chargement…");
        const cfg = ac.config;
        const flags24 = sum ? Object.entries(sum.events24h || {}).map(([type, count]) => ({ type, count })) : [];

        return html`
            ${notices(o)}
            <section class="card">
                <div class="card-head"><h3 class="card-title">Comment ça marche</h3></div>
                <div class="rules">
                    <span>Toutes les <b>${Math.round(cfg.checkMinMs / 60000)} à ${Math.round(cfg.checkMaxMs / 60000)} min passées sur la boutique</b>, le joueur doit cliquer sur le bon symbole parmi 5, placés au hasard sur une grille de 9 cases.</span>
                    <span>Le chrono ne tourne que sur la boutique (ou pendant qu'il ouvre/achète des caisses) : ailleurs dans le jeu, il est en pause et aucune fenêtre ne s'affiche.</span>
                    <span>Tant qu'il n'a pas répondu, <b>ouvrir ou acheter des caisses est refusé par le serveur</b> (même une macro qui appelle l'API directement).</span>
                    <span><b>${cfg.maxFails} erreurs</b> d'affilée bloquent ${Math.round(cfg.lockMs / 1000)} s. Une réponse en moins de <b>${cfg.fastAnswerMs} ms</b>, un clic simulé par script, des clics à côté en rafale, un <b>rythme d'ouverture trop régulier</b> (${cfg.rhythmSamples} ouvertures, écart &lt; ${Math.round(cfg.rhythmMaxCv * 100)} %) ou une macro qui insiste sans répondre sont journalisés ci-dessous. Le rythme trop régulier déclenche aussi une vérification immédiate.</span>
                </div>
            </section>

            ${sum ? html`
                <div class="kpis" style="margin-top:12px">
                    ${kpi("Vérifications déclenchées aujourd'hui", fmtInt(sum.issuedToday), `${fmtInt(sum.passedToday)} réussie(s) · ${fmtInt(sum.failedToday)} mauvaise(s) réponse(s)`)}
                    ${kpi(`Réussies (${o.range} j)`, fmtInt(sum.passedRange), `${pct(sum.passedRange, sum.passedRange + sum.failedRange)} de bonnes réponses`)}
                    ${kpi(`Mauvaises réponses (${o.range} j)`, fmtInt(sum.failedRange), `${fmtInt(sum.lockoutsRange)} blocage(s) de 30 s`)}
                    ${kpi("Temps de réponse moyen", fmtMs(sum.avgResponseMs), "plafonné à 60 s par réponse")}
                    ${kpi("En attente maintenant", fmtInt(state.live?.checksPending), `${fmtInt(state.live?.checksLocked)} bloqué(s)`)}
                </div>
                <div class="grid-2">
                    ${card("Vérifications par jour", chart({
                        title: "Vérifications réussies et ratées par jour", labels: o.days, integer: true,
                        series: [series("Réussies", sum.series.passed, COLORS.s1), series("Ratées", sum.series.failed, COLORS.s2)]
                    }))}
                    ${card("Alertes des dernières 24 h", flags24.length
                        ? html`<div class="list">${flags24.sort((a, b) => b.count - a.count).map((f) => html`<div class="list-row">${eventChip(f.type)}<b>${fmtInt(f.count)}</b></div>`)}</div>`
                        : empty("Aucune alerte en 24 h."))}
                </div>` : ""}

            <h2 class="section-title">Suspects <small>score sur 7 jours, pondéré par la gravité</small></h2>
            ${table([
                { label: "Joueur", cell: (r) => playerLink(r.userId, r.pseudo, r.online) },
                { label: "Score", num: true, cell: (r) => html`<strong>${fmtInt(r.score)}</strong>` },
                { label: "Alertes", wrap: true, cell: (r) => Object.entries(r.counts).filter(([t]) => t !== "forced").map(([t, n]) => html`${eventChip(t)} <b>${n}</b> `) },
                { label: "", cell: (r) => html`<button type="button" class="btn btn-small" data-force="${r.userId}">Vérifier maintenant</button>` }
            ], ac.suspects, { empty: "Aucun suspect sur 7 jours." })}

            <h2 class="section-title">Joueurs suivis en ce moment</h2>
            ${table([
                { label: "Joueur", cell: (r) => playerLink(r.userId, r.pseudo, r.online) },
                { label: "Statut", cell: (r) => checkStatus(r) },
                { label: "Où", cell: (r) => (!r.online ? "Hors ligne" : r.canShow ? "Sur la boutique" : "Ailleurs dans le jeu") },
                { label: "Requêtes bloquées", num: true, cell: (r) => fmtInt(r.blocked) },
                { label: "Réussies / ratées", num: true, cell: (r) => `${fmtInt(r.passes)} / ${fmtInt(r.failsTotal)}` },
                { label: "Réponse moy.", num: true, cell: (r) => fmtMs(r.avgResponseMs) },
                { label: "Régularité", num: true, cell: (r) => (r.rhythmCv == null ? "—" : `${nf1.format(r.rhythmCv * 100)} %`) },
                { label: "", cell: (r) => html`<button type="button" class="btn btn-small" data-force="${r.userId}">Vérifier</button>` }
            ], ac.live, { empty: "Aucun joueur suivi depuis le démarrage du serveur.", maxHeight: 520 })}

            <h2 class="section-title">Plus gros ouvreurs aujourd'hui</h2>
            ${openersTable(ac.openersToday)}

            <h2 class="section-title">Journal <small>100 derniers événements</small></h2>
            ${table([
                { label: "Quand", cell: (r) => fmtDateTime(r.createdAt) },
                { label: "Joueur", cell: (r) => playerLink(r.userId, r.pseudo) },
                { label: "Type", cell: (r) => eventChip(r.type) },
                { label: "Détail", wrap: true, cell: (r) => r.detail || "" },
                { label: "Réponse", num: true, cell: (r) => fmtMs(r.responseMs) }
            ], ac.events, { empty: "Rien de suspect pour l'instant.", maxHeight: 620 })}`;
    }

    // --- Fiche joueur ------------------------------------------------------------------

    async function openPlayer(userId) {
        const drawer = $("#drawer");
        const body = $("#drawer-body");
        body.dataset.view = "player";
        drawer.hidden = false;
        document.body.style.overflow = "hidden";
        mount(body, empty("Chargement de la fiche…"));
        try {
            const p = await api(`/admin/players/${encodeURIComponent(userId)}`);
            if (drawer.hidden) return;
            mount(body, renderPlayer(p));
        } catch (error) {
            if (error.message !== "forbidden") mount(body, empty(`Fiche indisponible : ${error.message}`));
        }
    }

    function closeDrawer() {
        const drawer = $("#drawer");
        unmountCharts(drawer);
        drawer.hidden = true;
        document.body.style.overflow = "";
        hideTooltip();
    }

    function renderPlayer(p) {
        const act = p.activity;
        const total = (values) => values.reduce((a, b) => a + b, 0);
        const check = p.check;
        return html`
            <h2 class="drawer-title" id="drawer-title">${p.pseudo}</h2>
            <div class="drawer-badges">
                ${check?.online ? chip("En ligne", "good") : chip(`Vu ${fmtAgo(p.lastComing)}`, "plain")}
                ${p.isAdmin ? chip("Admin", "plain") : ""}
                ${p.pseudoBanned ? chip("Pseudo banni", "critical") : ""}
                ${p.hasPass ? chip("Passe de combat", "plain") : ""}
                ${p.rebirth ? chip(`Rebirth ${p.rebirth}`, "plain") : ""}
            </div>
            <div class="kpis">
                ${kpi("Or", fmtCompact(p.gold), `${fmtCompact(p.cps)} pièces/s`)}
                ${kpi("Cartes", fmtInt(p.cards.distinct), `${fmtInt(p.cards.total)} exemplaires`)}
                ${kpi("Victoires", fmtInt(p.wins))}
                ${kpi("Amis", fmtInt(p.friends))}
                ${kpi("Temps de jeu (30 j)", fmtDuration(total(act.playtime)), `${fmtInt(total(act.sessions))} sessions`)}
                ${kpi("Caisses ouvertes (30 j)", fmtInt(total(act.chestsOpened)), `${fmtInt(total(act.chestsBought))} achetées`)}
                ${kpi("Marché", `${fmtInt(p.market.sold)} ventes`, `${fmtInt(p.market.bought)} achats`)}
                ${kpi("Villaggio", p.village ? `${fmtInt(p.village.trophies)} 🏆` : "—", p.village ? `Palazzo niveau ${p.village.palazzo ?? "?"}` : "pas de village")}
            </div>
            <div class="list" style="margin-top:12px">
                <div class="list-row"><span>Inscrit le</span><b>${fmtDate(p.createdAt)}</b></div>
                <div class="list-row"><span>Dernière activité</span><b>${fmtAgo(p.lastComing)}</b></div>
                <div class="list-row"><span>Identifiant</span><b>${p.userId}</b></div>
            </div>

            <h2 class="section-title">Modération</h2>
            <section class="card">
                <div class="card-head">
                    <h3 class="card-title">${p.pseudoBanned ? chip("Pseudo banni", "critical") : chip("Pseudo autorisé", "good")}</h3>
                    ${p.pseudoBanned
                        ? html`<button type="button" class="btn btn-small" data-unban="${p.pseudo}" data-reopen="${p.userId}">Retirer le ban</button>`
                        : html`<button type="button" class="btn btn-small btn-danger" data-ban="${p.userId}" data-pseudo="${p.pseudo}">Bannir le pseudo</button>`}
                </div>
                <div class="rules">
                    ${p.pseudoBanned
                        ? html`<span><b>${p.pseudo}</b> est interdit : le joueur doit choisir un nouveau pseudo à sa prochaine connexion.</span>`
                        : html`<span>Le pseudo s'affiche <b>« Pseudo banni »</b> dans les classements du jeu et du site PlayWeb. À sa prochaine connexion, le joueur doit en choisir un autre, et personne ne pourra reprendre celui-ci.</span>`}
                </div>
            </section>
            ${accountBanCard(p)}

            <h2 class="section-title">Anti-macro</h2>
            <section class="card">
                <div class="card-head">
                    <h3 class="card-title">${check ? checkStatus(check) : chip("Pas encore suivi depuis le démarrage", "plain")}</h3>
                    <button type="button" class="btn btn-small btn-primary" data-force="${p.userId}">Vérifier maintenant</button>
                </div>
                ${check ? html`<div class="list">
                    <div class="list-row"><span>Réussies / ratées (depuis le démarrage)</span><b>${fmtInt(check.passes)} / ${fmtInt(check.failsTotal)}</b></div>
                    <div class="list-row"><span>Temps de réponse moyen</span><b>${fmtMs(check.avgResponseMs)}</b></div>
                    <div class="list-row"><span>Régularité des ouvertures</span><b>${check.rhythmCv == null ? "—" : `${nf1.format(check.rhythmCv * 100)} %`}</b></div>
                </div>` : ""}
                <div class="list" style="margin-top:10px">
                    <div class="list-row"><span>Vérifications réussies / ratées (30 j)</span><b>${fmtInt(total(act.checksPassed))} / ${fmtInt(total(act.checksFailed))}</b></div>
                </div>
            </section>
            ${p.events.length ? html`<div style="margin-top:10px">${table([
                { label: "Quand", cell: (r) => fmtDateTime(r.createdAt) },
                { label: "Type", cell: (r) => eventChip(r.type) },
                { label: "Détail", wrap: true, cell: (r) => r.detail || "" },
                { label: "Réponse", num: true, cell: (r) => fmtMs(r.responseMs) }
            ], p.events, { maxHeight: 320 })}</div>` : ""}

            <h2 class="section-title">30 derniers jours</h2>
            <div class="grid-2" style="margin-top:0">
                ${card("Temps de jeu par jour", chart({
                    title: "Temps de jeu par jour", labels: act.days, format: fmtDuration, tick: fmtDurationTick, duration: true, height: 160,
                    series: [{ name: "Temps de jeu", values: act.playtime, color: COLORS.s1 }]
                }))}
                ${card("Caisses par jour", chart({
                    title: "Caisses ouvertes et achetées par jour", labels: act.days, integer: true, height: 160,
                    series: [{ name: "Ouvertes", values: act.chestsOpened, color: COLORS.s1 }, { name: "Achetées", values: act.chestsBought, color: COLORS.s2 }]
                }))}
            </div>

            <div class="grid-2">
                ${card("Caisses en inventaire", bars(p.chests.map((c) => ({ label: `${c.icon} ${c.name}`, value: c.count }))))}
                ${card("Codes promo utilisés", p.promos.length
                    ? html`<div class="list">${p.promos.map((c) => html`<div class="list-row"><b>${c.code}</b><span>${fmtDateTime(c.usedAt)}</span></div>`)}</div>`
                    : empty("Aucun code utilisé."))}
            </div>`;
    }

    function accountBanCard(p) {
        const protectedAccount = p.isAdmin || p.userId === state.admin?.userId;
        return html`
            <section class="card ban-card">
                <div class="card-head">
                    <h3 class="card-title">${chip("Bannir le joueur", "critical")}</h3>
                </div>
                ${protectedAccount
                    ? html`<div class="rules"><span>Un compte admin ne peut pas être banni.</span></div>`
                    : html`<div class="rules">
                            <span>Supprime <b>définitivement</b> son compte BrainrotStar : or, cartes, caisses, village, succès, amis et annonces du marché.</span>
                            <span>Il est déconnecté tout de suite et renvoyé sur PlayWeb. Son identifiant reste bloqué : pour rejouer, il devra créer un nouveau compte PlayWeb.</span>
                        </div>
                        <form class="ban-form" data-ban-account="${p.userId}" data-pseudo="${p.pseudo}" novalidate>
                            <input class="input" name="reason" type="text" maxlength="191" placeholder="Raison (facultatif)" autocomplete="off">
                            <input class="input" name="confirm" type="text" placeholder="Tape « ${p.pseudo} » pour confirmer" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="Pseudo à taper pour confirmer">
                            <button type="submit" class="btn btn-danger" disabled>Supprimer le compte et bannir</button>
                        </form>`}
            </section>`;
    }

    async function forceCheck(userId, button) {
        if (button) button.disabled = true;
        try {
            const result = await api(`/admin/anticheat/check/${encodeURIComponent(userId)}`, { method: "POST", body: "{}" });
            toast(result.shown
                ? "Vérification affichée au joueur (il est sur la boutique)."
                : result.online
                    ? "Vérification en attente : elle s'affichera dès qu'il ira sur la boutique."
                    : "Joueur hors ligne : vérification à son prochain passage sur la boutique.");
        } catch (error) {
            if (error.message !== "forbidden") toast(`Impossible : ${error.message}`);
        } finally {
            if (button) button.disabled = false;
        }
    }

    function armButton(button, label) {
        if (button.classList.contains("is-armed")) return true;
        button.dataset.label = button.textContent;
        button.textContent = label;
        button.classList.add("is-armed");
        clearTimeout(button._disarmTimer);
        button._disarmTimer = setTimeout(() => disarmButton(button), 4000);
        return false;
    }

    function disarmButton(button) {
        clearTimeout(button._disarmTimer);
        if (!button.classList.contains("is-armed")) return;
        button.classList.remove("is-armed");
        button.textContent = button.dataset.label;
    }

    async function afterModeration(userId) {
        await Promise.all([loadBanned(), state.players ? loadPlayers() : null]);
        updatePlayersTable();
        updateBannedTable();
        if (userId && !$("#drawer").hidden) openPlayer(userId);
    }

    async function banPseudo(button) {
        if (!armButton(button, `Confirmer : bannir « ${button.dataset.pseudo} »`)) return;
        disarmButton(button);
        button.disabled = true;
        try {
            const result = await api(`/admin/players/${encodeURIComponent(button.dataset.ban)}/ban-pseudo`, { method: "POST", body: "{}" });
            toast(result.playweb
                ? `« ${result.pseudo} » est banni sur BrainrotStar et PlayWeb.`
                : `« ${result.pseudo} » est banni sur BrainrotStar, mais PlayWeb n'a pas répondu (${result.playwebError}).`);
            await afterModeration(button.dataset.ban);
        } catch (error) {
            if (error.message !== "forbidden") toast(`Impossible : ${error.message}`);
            button.disabled = false;
        }
    }

    async function banAccount(form) {
        const button = form.querySelector("button[type=submit]");
        if (form.elements.confirm.value.trim() !== form.dataset.pseudo || button.disabled) return;
        const userId = form.dataset.banAccount;
        button.disabled = true;
        try {
            const result = await api(`/admin/players/${encodeURIComponent(userId)}/ban`, {
                method: "POST",
                body: JSON.stringify({ reason: form.elements.reason.value.trim() || undefined })
            });
            toast(`« ${result.pseudo} » est banni : son compte a été supprimé.`);
            closeDrawer();
            await Promise.all([loadBannedUsers(), state.players ? loadPlayers() : null]);
            updatePlayersTable();
            updateBannedUsersTable();
        } catch (error) {
            if (error.message !== "forbidden") toast(`Impossible : ${error.message}`);
            button.disabled = false;
        }
    }

    async function unbanAccount(button) {
        if (!armButton(button, `Confirmer : débannir « ${button.dataset.pseudo} »`)) return;
        disarmButton(button);
        button.disabled = true;
        try {
            await api("/admin/banned-players/unban", { method: "POST", body: JSON.stringify({ userId: button.dataset.unbanAccount }) });
            toast(`« ${button.dataset.pseudo} » est débanni : il repartira de zéro à sa prochaine connexion.`);
            await loadBannedUsers();
            updateBannedUsersTable();
        } catch (error) {
            if (error.message !== "forbidden") toast(`Impossible : ${error.message}`);
            button.disabled = false;
        }
    }

    async function unbanPseudo(button) {
        const pseudo = button.dataset.unban;
        button.disabled = true;
        try {
            const result = await api("/admin/banned-pseudos/unban", { method: "POST", body: JSON.stringify({ pseudo }) });
            toast(result.playweb
                ? `« ${pseudo} » est de nouveau autorisé.`
                : `« ${pseudo} » est autorisé sur BrainrotStar, mais PlayWeb n'a pas répondu (${result.playwebError}).`);
            await afterModeration(button.dataset.reopen);
        } catch (error) {
            if (error.message !== "forbidden") toast(`Impossible : ${error.message}`);
            button.disabled = false;
        }
    }

    // --- Rendu et navigation ---------------------------------------------------------

    function shortAgent(ua) {
        if (!ua) return "—";
        const os = /iPad/.test(ua) ? "iPad" : /iPhone/.test(ua) ? "iPhone" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /Mac OS X/.test(ua) ? "Mac" : /Linux/.test(ua) ? "Linux" : "";
        const browser = /Edg\//.test(ua) ? "Edge" : /OPR\//.test(ua) ? "Opera" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "Navigateur";
        return os ? `${browser} · ${os}` : browser;
    }

    function statusChip(code) {
        if (code == null) return "—";
        if (code < 300) return chip("OK", "good");
        if (code === 429) return chip("Bloqué", "serious");
        if (code < 500) return chip(`Refusé (${code})`, "serious");
        return chip(`Erreur (${code})`, "critical");
    }

    function renderSecurity() {
        const sec = state.security;
        if (!sec) return empty("Chargement…");
        const c = sec.config;
        const check = (ok, label, good, bad, tip) => html`<div class="list-row sec-row"><span>${label}${tip ? html`<small>${tip}</small>` : ""}</span>${ok ? chip(good, "good") : chip(bad, "serious")}</div>`;
        return html`
            <div class="grid-2" style="margin-top:0">
                ${card("Protections actives", html`<div class="list">
                    ${check(c.secretKey, "Double authentification (code à 6 chiffres)", "Obligatoire", "Désactivée")}
                    ${check(true, "Sessions admin", `${c.sessionHours} h max · ${c.idleMinutes} min d'inactivité`, "")}
                    ${check(c.jwtStrong, "JWT_SECRET du serveur", "Solide", "Trop faible", c.jwtStrong ? "" : "Mets une longue valeur aléatoire dans le .env.")}
                    ${check(c.webhook, "Alertes Discord (ADMIN_ALERT_WEBHOOK)", "Activées", "Non configurées", c.webhook ? "" : "Recommandé : alerte à chaque connexion et action sensible.")}
                    ${check(c.allowlist, "Liste blanche des admins (ADMIN_USER_IDS)", "Activée", "Non configurée", c.allowlist ? "" : "Optionnel : seuls ces comptes peuvent être admin, même si la base est modifiée.")}
                    ${check(!c.enrollKey, "Clé d'activation (ADMIN_ENROLL_KEY)", "Retirée", "Encore présente", c.enrollKey ? "Retire-la du .env quand tous les admins ont activé la double authentification." : "")}
                </div>`)}
                ${card("Sessions admin ouvertes", sec.sessions.length ? table([
                    { label: "Admin", cell: (r) => html`<strong>${r.pseudo}</strong>` },
                    { label: "Dernière activité", cell: (r) => fmtAgo(r.lastSeenAt) },
                    { label: "Appareil", cell: (r) => shortAgent(r.userAgent) },
                    { label: "IP", cell: (r) => r.ip || "—" },
                    { label: "", action: true, cell: (r) => r.current ? chip("Cette session", "plain") : html`<button type="button" class="btn btn-small btn-danger" data-revoke-session="${r.id}">Révoquer</button>` }
                ], sec.sessions, { maxHeight: 320 }) : empty("Aucune session ouverte."))}
            </div>
            <h2 class="section-title">Journal des actions <small>connexions, échecs et chaque action faite dans le panneau</small></h2>
            ${table([
                { label: "Quand", cell: (r) => fmtDateTime(r.createdAt) },
                { label: "Admin", cell: (r) => r.pseudo || "—" },
                { label: "Action", cell: (r) => html`<strong>${r.action}</strong>` },
                { label: "Cible", wrap: true, cell: (r) => r.target || "—" },
                { label: "Détail", wrap: true, cell: (r) => (r.detail ? (r.detail.length > 160 ? `${r.detail.slice(0, 160)}…` : r.detail) : "—") },
                { label: "IP", cell: (r) => r.ip || "—" },
                { label: "Résultat", cell: (r) => statusChip(r.status) }
            ], sec.audit, { empty: "Rien dans le journal pour l'instant.", maxHeight: 620 })}`;
    }

    async function revokeSession(button) {
        if (!armButton(button, "Confirmer")) return;
        disarmButton(button);
        button.disabled = true;
        try {
            const result = await api(`/admin/security/sessions/${encodeURIComponent(button.dataset.revokeSession)}/revoke`, { method: "POST", body: "{}" });
            if (result.self) {
                sessionLost("Session fermée.");
                return;
            }
            toast("Session révoquée : cet appareil devra se reconnecter.");
            await loadSecurity();
            if (state.tab === "security") renderView();
        } catch (error) {
            if (error.message !== "forbidden") toast(`Impossible : ${error.message}`);
            button.disabled = false;
        }
    }

    const TN_ICONS = ["🏆", "⚔️", "👑", "🔥", "💎", "🎯", "⚡", "🐉", "🎉", "🍝"];
    const TN_ACCENTS = {
        flame: ["Brasier", "#f97316", "#dc2626"],
        gold: ["Or", "#facc15", "#d97706"],
        violet: ["Mystique", "#a855f7", "#6d28d9"],
        ocean: ["Océan", "#38bdf8", "#2563eb"],
        toxic: ["Toxique", "#84cc16", "#16a34a"],
        pink: ["Bonbon", "#f472b6", "#db2777"]
    };
    const TN_MODES = { combat: "Combat", shop: "Boutique", village: "Villaggio", market: "Marché", gamble: "Gambling" };
    const TN_PRESETS = {
        all: ["Tous les modes", { match_won: 100, match_played: 20, chest_opened: 1, village_attack: 30, village_stars: 20, market_buy: 10, gamble_spin: 10 }],
        combat: ["Combat", { match_won: 100, match_played: 20 }],
        shop: ["Boutique", { chest_opened: 1, chest_bought: 2 }],
        village: ["Villaggio", { village_attack: 30, village_stars: 20, village_build: 10, village_train: 1 }]
    };
    const TN_STATUS = { upcoming: ["À venir", "warning"], running: ["En cours", "good"], finished: ["Terminé", "plain"], cancelled: ["Annulé", "critical"] };
    const TN_REASONS = { forfeit: "Forfait", no_show: "Absence des deux joueurs", admin: "Décision admin" };
    const TN_ITEM_TYPES = [["Gold", "💰 Or"], ["Chest", "📦 Caisse"], ["Card", "🃏 Carte"]];
    const TN_CONFIRM = {
        start: ["Confirmer : démarrer", "Tournoi démarré."],
        end: ["Confirmer : terminer et récompenser", "Tournoi terminé : récompenses distribuées."],
        cancel: ["Confirmer : annuler", "Tournoi annulé."]
    };

    let tnTimer = 0;

    function toLocalInput(ms) {
        const d = new Date(ms);
        const pad = (n) => String(n).padStart(2, "0");
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }

    const roundedSoon = (minutes) => Math.ceil((Date.now() + minutes * 60000) / 300000) * 300000;
    const validDate = (value) => !Number.isNaN(new Date(value).getTime());

    function newTnItem(type = "Gold") {
        return {
            type,
            goldAmount: type === "Gold" ? "100000" : "",
            chestId: type === "Chest" ? state.catalog?.chests?.[0]?.id || "" : "",
            cardId: type === "Card" ? sortedCards()[0]?.id || "" : "",
            quantity: "1"
        };
    }

    function newTournamentDraft() {
        const start = roundedSoon(10);
        return {
            name: "", description: "", icon: "🏆", accent: "gold", visibility: "public", format: "points",
            startsAt: toLocalInput(start), endsAt: toLocalInput(start + 86400000),
            weights: { ...TN_PRESETS.all[1] }, minLevel: "", maxPlayers: "", minPlayers: "2",
            bestOf: "1", matchMinutes: "20", seeding: "random",
            tiers: [
                { from: "1", to: "1", items: [newTnItem()] },
                { from: "2", to: "3", items: [newTnItem()] }
            ],
            participation: []
        };
    }

    function tnLink(t) {
        const query = t.visibility === "private" && t.code ? `code=${encodeURIComponent(t.code)}` : `id=${encodeURIComponent(t.id)}`;
        return new URL(`../tournament/tournament.html?${query}`, location.href).href;
    }

    const tnAccentStyle = (key) => {
        const [, a, b] = TN_ACCENTS[key] || TN_ACCENTS.gold;
        return raw(`--tn-a:${a};--tn-b:${b}`);
    };
    const tnStatusChip = (status) => chip(...(TN_STATUS[status] || [status, "plain"]));
    const tnFormat = (t) => (t.format === "points" ? "Aux points" : `Élimination${Number(t.bestOf) > 1 ? ` · BO${t.bestOf}` : ""}`);

    function tnList(key) {
        const d = state.tnDraft;
        return key === "p" ? d.participation : d.tiers[Number(key)].items;
    }

    function tnItemAt(path) {
        const [key, index] = path.split(":");
        return tnList(key)[Number(index)];
    }

    function tnSegmented(key, options) {
        const current = String(state.tnDraft[key]);
        return html`<div class="segmented" role="radiogroup">${options.map(([value, label]) => html`<button type="button" role="radio" data-tn-set="${key}" data-tn-value="${value}" aria-checked="${String(current === value)}" class="${current === value ? "is-active" : ""}">${label}</button>`)}</div>`;
    }

    function tnWeights() {
        const d = state.tnDraft;
        const events = state.tnOptions?.events || [];
        const groups = Object.keys(TN_MODES).map((mode) => [mode, events.filter((e) => e.mode === mode)]).filter(([, list]) => list.length);
        return html`<div class="field"><span>Points par action</span>
            <div class="tn-presets">
                ${Object.entries(TN_PRESETS).map(([key, [label]]) => html`<button type="button" class="btn btn-small" data-tn-preset="${key}">${label}</button>`)}
                <button type="button" class="btn btn-small btn-ghost" data-tn-preset="none">Tout à zéro</button>
            </div>
            ${groups.length ? html`<div class="tn-weights">${groups.map(([mode, list]) => html`<div class="tn-weight-group">
                <b>${TN_MODES[mode]}</b>
                ${list.map((e) => html`<label class="tn-weight${Number(d.weights[e.key]) > 0 ? " is-on" : ""}">
                    <span>${e.label}</span>
                    <input class="input" type="number" min="0" max="100000" step="1" inputmode="numeric" data-tn-weight="${e.key}" value="${d.weights[e.key] ?? ""}" placeholder="0">
                </label>`)}
            </div>`)}</div>` : empty("Chargement…")}
        </div>`;
    }

    function tnBracketFields() {
        const d = state.tnDraft;
        return html`<div class="form-grid">
            <div class="field"><span>Manches par match</span>${tnSegmented("bestOf", [["1", "BO1"], ["3", "BO3"], ["5", "BO5"]])}</div>
            <div class="field"><span>Tirage</span>${tnSegmented("seeding", [["random", "Aléatoire"], ["level", "Par niveau"]])}</div>
            <label class="field"><span>Minutes pour jouer une manche</span>
                <input class="input" type="number" min="5" max="240" step="1" inputmode="numeric" data-tn-field="matchMinutes" value="${d.matchMinutes}">
            </label>
            <label class="field"><span>Joueurs minimum</span>
                <input class="input" type="number" min="2" max="256" step="1" inputmode="numeric" data-tn-field="minPlayers" value="${d.minPlayers}">
            </label>
        </div>`;
    }

    function tnItemRow(item, path) {
        const loading = !state.catalog && item.type !== "Gold";
        const target = item.type === "Chest" ? "chestId" : "cardId";
        return html`<div class="tn-item">
            <select class="select" data-tn-item="${path}" data-tn-key="type" aria-label="Type de récompense">
                ${TN_ITEM_TYPES.map(([value, label]) => html`<option value="${value}"${value === item.type ? raw(" selected") : ""}>${label}</option>`)}
            </select>
            ${item.type === "Gold"
                ? html`<input class="input" type="number" min="1" step="1" inputmode="numeric" data-tn-item="${path}" data-tn-key="goldAmount" value="${item.goldAmount}" placeholder="Quantité d'or" aria-label="Quantité d'or">`
                : html`<select class="select" data-tn-item="${path}" data-tn-key="${target}"${loading ? raw(" disabled") : ""}>${loading ? html`<option>Chargement…</option>` : item.type === "Chest" ? chestOptions(item.chestId) : cardOptions(item.cardId)}</select>`}
            ${item.type === "Gold"
                ? html`<span></span>`
                : html`<input class="input" type="number" min="1" max="100" step="1" inputmode="numeric" data-tn-item="${path}" data-tn-key="quantity" value="${item.quantity}" aria-label="Quantité">`}
            <button type="button" class="btn btn-small" data-tn-remove-item="${path}" aria-label="Retirer">×</button>
        </div>`;
    }

    function tnRewards() {
        const d = state.tnDraft;
        return html`<div class="field"><span>Récompenses</span>
            <div class="tn-tiers">
                ${d.tiers.map((tier, i) => html`<div class="tn-tier">
                    <div class="tn-tier-head">
                        <span>Du rang</span>
                        <input class="input" type="number" min="1" step="1" inputmode="numeric" data-tn-tier="${i}" data-tn-key="from" value="${tier.from}" aria-label="Premier rang">
                        <span>au</span>
                        <input class="input" type="number" min="1" step="1" inputmode="numeric" data-tn-tier="${i}" data-tn-key="to" value="${tier.to}" aria-label="Dernier rang">
                        <button type="button" class="btn btn-small btn-ghost" data-tn-remove-tier="${i}">Retirer</button>
                    </div>
                    ${tier.items.map((item, j) => tnItemRow(item, `${i}:${j}`))}
                    ${tier.items.length < 4 ? html`<button type="button" class="btn btn-small tn-add" data-tn-add-item="${i}">+ Récompense</button>` : ""}
                </div>`)}
                ${d.tiers.length < 10 ? html`<button type="button" class="btn btn-small tn-add" data-tn-add-tier>+ Tranche de classement</button>` : ""}
                <div class="tn-tier">
                    <div class="tn-tier-head"><span>Participation</span></div>
                    ${d.participation.map((item, j) => tnItemRow(item, `p:${j}`))}
                    ${d.participation.length < 4 ? html`<button type="button" class="btn btn-small tn-add" data-tn-add-item="p">+ Récompense</button>` : ""}
                </div>
            </div>
        </div>`;
    }

    function tnCreator() {
        const d = state.tnDraft;
        const custom = d.icon && !TN_ICONS.includes(d.icon) ? d.icon : "";
        const created = state.tnCreated;
        return html`
            <form class="form" data-form="tournament" novalidate>
                <div class="form-grid">
                    <div class="field"><span>Format</span>${tnSegmented("format", [["points", "Aux points"], ["bracket", "Élimination directe"]])}</div>
                    <div class="field"><span>Accès</span>${tnSegmented("visibility", [["public", "Public"], ["private", "Privé (lien)"]])}</div>
                </div>
                <label class="field"><span>Nom</span>
                    <input class="input" data-tn-field="name" maxlength="64" placeholder="Ex. Coupe du week-end" value="${d.name}" autocomplete="off">
                </label>
                <label class="field"><span>Description <small>facultatif</small></span>
                    <textarea class="input" data-tn-field="description" maxlength="600" rows="2">${d.description}</textarea>
                </label>
                <div class="field"><span>Icône</span>
                    <div class="icon-picks">
                        ${TN_ICONS.map((icon) => html`<button type="button" class="icon-pick${icon === d.icon ? " is-active" : ""}" data-tn-set="icon" data-tn-value="${icon}" aria-label="Icône ${icon}">${icon}</button>`)}
                        <input class="input icon-custom${custom ? " is-active" : ""}" data-tn-field="icon" maxlength="8" placeholder="Autre" value="${custom}" autocomplete="off" aria-label="Autre icône">
                    </div>
                </div>
                <div class="field"><span>Couleur</span>
                    <div class="swatches">
                        ${Object.entries(TN_ACCENTS).map(([key, [name, a, b]]) => html`<button type="button" class="swatch${key === d.accent ? " is-active" : ""}" data-tn-set="accent" data-tn-value="${key}" title="${name}" aria-label="Couleur ${name}" style="background:linear-gradient(135deg,${raw(a)},${raw(b)})"></button>`)}
                    </div>
                </div>
                <div class="form-grid">
                    <label class="field"><span>${d.format === "bracket" ? "Début du tableau" : "Début"}</span>
                        <input class="input" type="datetime-local" data-tn-field="startsAt" value="${d.startsAt}">
                    </label>
                    ${d.format === "points" ? html`<label class="field"><span>Fin</span>
                        <input class="input" type="datetime-local" data-tn-field="endsAt" value="${d.endsAt}">
                    </label>` : ""}
                    <label class="field"><span>Niveau minimum <small>vide = aucun</small></span>
                        <input class="input" type="number" min="0" step="1" inputmode="numeric" data-tn-field="minLevel" value="${d.minLevel}" placeholder="0">
                    </label>
                    <label class="field"><span>Joueurs max <small>vide = illimité</small></span>
                        <input class="input" type="number" min="2" max="256" step="1" inputmode="numeric" data-tn-field="maxPlayers" value="${d.maxPlayers}" placeholder="Illimité">
                    </label>
                </div>
                ${d.format === "points" ? tnWeights() : tnBracketFields()}
                ${tnRewards()}
                <div class="form-actions">
                    <button type="submit" class="btn btn-primary" id="tn-create">Créer le tournoi</button>
                    ${created ? html`<div class="created">
                        <span>Créé :</span><strong>${created.name}</strong>
                        ${created.visibility === "private" ? html`<strong class="code-pill">${created.code}</strong>` : ""}
                        <button type="button" class="btn btn-small" data-tn-copy="${tnLink(created)}">Copier le lien</button>
                        <button type="button" class="btn btn-small" data-tn-open="${created.id}">Ouvrir</button>
                    </div>` : ""}
                </div>
            </form>`;
    }

    function tnPreview() {
        const d = state.tnDraft;
        const when = validDate(d.startsAt)
            ? `${fmtDateTime(new Date(d.startsAt))}${d.format === "points" && validDate(d.endsAt) ? ` → ${fmtDateTime(new Date(d.endsAt))}` : ""}`
            : "Date à choisir";
        return html`<div class="tn-prev" style="${tnAccentStyle(d.accent)}">
            <span class="tn-badge">${d.icon.trim() || "🏆"}</span>
            <div class="tn-prev-main">
                <div class="tn-chips">${chip(d.visibility === "private" ? "Privé" : "Public", "plain")}${chip(tnFormat(d), "plain")}</div>
                <b>${d.name.trim() || "Nom du tournoi"}</b>
                ${d.description.trim() ? html`<p>${d.description.trim()}</p>` : ""}
                <small>${when}</small>
            </div>
        </div>`;
    }

    function tnLiveRooms() {
        const rooms = state.liveRooms;
        if (!rooms) return empty("Chargement…");
        if (!rooms.length) return empty("Aucun match en cours.");
        return html`<div class="tn-rooms">${rooms.map((r) => html`<div class="tn-room">
            <div class="tn-chips">
                ${r.tournament ? chip(`🏆 ${r.tournament.name}`, "plain") : chip(r.vsBot ? "Contre un bot" : "Partie classique", "plain")}
                ${r.started ? chip("En jeu", "good") : chip("Choix des decks", "warning")}
            </div>
            <div class="tn-room-vs">
                <span>${r.players[0]?.name || "?"}</span>
                <b>${r.players[0]?.crowns || 0} – ${r.players[1]?.crowns || 0}</b>
                <span>${r.players[1]?.name || "?"}</span>
            </div>
            <div class="tn-room-foot">
                <span class="card-sub">${r.spectators ? `${r.spectators} spectateur${r.spectators > 1 ? "s" : ""}` : ""}</span>
                <button type="button" class="btn btn-small" data-tn-watch="${r.id}">Regarder</button>
            </div>
        </div>`)}</div>`;
    }

    function tnActions(t, small = true) {
        const size = small ? " btn-small" : "";
        return html`<div class="tn-actions">
            ${t.visibility === "private" ? html`<button type="button" class="btn${size}" data-tn-copy="${tnLink(t)}">Copier le lien</button>` : ""}
            ${t.status === "upcoming" ? html`<button type="button" class="btn${size}" data-tn-action="start" data-tn-id="${t.id}">Démarrer</button>` : ""}
            ${t.status === "running" ? html`<button type="button" class="btn${size}" data-tn-action="end" data-tn-id="${t.id}">Terminer</button>` : ""}
            ${t.status === "upcoming" || t.status === "running" ? html`<button type="button" class="btn${size} btn-danger" data-tn-action="cancel" data-tn-id="${t.id}">Annuler</button>` : ""}
        </div>`;
    }

    function tnTable() {
        const list = state.tournaments;
        if (!list) return empty("Chargement…");
        return table([
            { label: "Tournoi", wrap: true, cell: (t) => html`<button type="button" class="player-link" data-tn-open="${t.id}">${t.icon} ${t.name}</button>` },
            { label: "Statut", cell: (t) => tnStatusChip(t.status) },
            { label: "Format", cell: (t) => tnFormat(t) },
            { label: "Accès", cell: (t) => (t.visibility === "private" ? html`Privé <span class="code-pill">${t.code}</span>` : "Public") },
            { label: "Joueurs", num: true, cell: (t) => fmtInt(t.participants) },
            { label: "Début", cell: (t) => fmtDateTime(t.startsAt) },
            { label: "Fin", cell: (t) => (t.endsAt ? fmtDateTime(t.endsAt) : "—") },
            { label: "", action: true, cell: (t) => tnActions(t) }
        ], list, { empty: "Aucun tournoi pour l'instant.", maxHeight: 620 });
    }

    function renderTournaments() {
        if (!state.tnDraft) state.tnDraft = newTournamentDraft();
        return html`
            <div class="composer">
                <section class="card">
                    <div class="card-head"><h3 class="card-title">Nouveau tournoi</h3></div>
                    <div id="tn-creator">${tnCreator()}</div>
                </section>
                <section class="card preview-card">
                    <div class="card-head"><h3 class="card-title">Aperçu</h3></div>
                    <div id="tn-preview">${tnPreview()}</div>
                </section>
            </div>
            <h2 class="section-title">Matchs en cours <button type="button" class="btn btn-small" data-tn-refresh>Actualiser</button></h2>
            <div id="tn-live">${tnLiveRooms()}</div>
            <h2 class="section-title">Tournois</h2>
            <div id="tn-list">${tnTable()}</div>`;
    }

    function refreshTnCreator(focusSelector) {
        const box = $("#tn-creator");
        if (!box || state.tab !== "tournaments") return;
        mount(box, tnCreator());
        updateTnPreview();
        if (focusSelector) $(focusSelector)?.focus();
    }

    function updateTnPreview() {
        const box = $("#tn-preview");
        if (box && state.tab === "tournaments") mount(box, tnPreview());
    }

    function updateTnLists() {
        if (state.tab !== "tournaments") return;
        const live = $("#tn-live");
        if (live) mount(live, tnLiveRooms());
        const list = $("#tn-list");
        if (list) mount(list, tnTable());
    }

    async function loadTournaments() {
        try {
            const [list, rooms] = await Promise.all([api("/admin/tournaments"), api("/admin/live-rooms")]);
            state.tournaments = list;
            state.liveRooms = rooms;
        } catch (error) {
            if (error.message !== "forbidden") toast(`Tournois indisponibles : ${error.message}`);
        }
    }

    async function loadTournamentOptions() {
        if (state.tnOptions) return;
        try {
            state.tnOptions = await api("/admin/tournament-options");
        } catch (error) {
            if (error.message !== "forbidden") toast(`Options indisponibles : ${error.message}`);
        }
    }

    async function refreshTournaments() {
        await loadTournaments();
        updateTnLists();
        const body = $("#drawer-body");
        const id = body?.dataset.view?.startsWith("tn:") ? body.dataset.view.slice(3) : "";
        if (id && !$("#drawer").hidden) await loadTournamentDetail(id);
    }

    function scheduleTournaments() {
        clearInterval(tnTimer);
        tnTimer = 0;
        if (state.tab !== "tournaments") return;
        tnTimer = setInterval(() => {
            if (state.tab !== "tournaments") {
                clearInterval(tnTimer);
                tnTimer = 0;
                return;
            }
            if (document.visibilityState === "visible") refreshTournaments();
        }, 15000);
    }

    function tnItemPayload(r) {
        if (r.type === "Gold") return { type: "Gold", goldAmount: Math.round(Number(r.goldAmount)) };
        const quantity = Math.max(1, Math.round(Number(r.quantity) || 1));
        if (r.type === "Chest") return { type: "Chest", chestId: r.chestId || state.catalog?.chests?.[0]?.id || "", quantity };
        return { type: "Card", cardId: r.cardId || sortedCards()[0]?.id || "", quantity };
    }

    function tnPayload() {
        const d = state.tnDraft;
        const weights = Object.fromEntries(Object.entries(d.weights)
            .filter(([, w]) => Number(w) > 0)
            .map(([key, w]) => [key, Number(w)]));
        return {
            name: d.name.trim(),
            description: d.description.trim() || null,
            icon: d.icon.trim() || "🏆",
            visibility: d.visibility,
            format: d.format,
            startsAt: new Date(d.startsAt).toISOString(),
            endsAt: d.format === "points" ? new Date(d.endsAt).toISOString() : null,
            config: {
                weights: d.format === "points" ? weights : {},
                minLevel: Math.max(0, Math.round(Number(d.minLevel) || 0)),
                maxPlayers: d.maxPlayers ? Math.round(Number(d.maxPlayers)) : null,
                minPlayers: Math.max(2, Math.round(Number(d.minPlayers) || 2)),
                bestOf: Number(d.bestOf),
                matchMinutes: Math.round(Number(d.matchMinutes) || 20),
                seeding: d.seeding,
                accent: d.accent
            },
            rewards: {
                tiers: d.tiers
                    .filter((t) => t.items.length)
                    .map((t) => ({ from: Math.round(Number(t.from)), to: Math.round(Number(t.to)), items: t.items.map(tnItemPayload) })),
                participation: d.participation.map(tnItemPayload)
            }
        };
    }

    async function createTournament() {
        const d = state.tnDraft;
        if (d.name.trim().length < 3) return toast("Donne un nom au tournoi (3 caractères minimum).");
        if (!validDate(d.startsAt)) return toast("Indique la date de début.");
        if (d.format === "points") {
            if (!validDate(d.endsAt) || new Date(d.endsAt) <= new Date(d.startsAt)) return toast("La fin doit être après le début.");
            if (!Object.values(d.weights).some((w) => Number(w) > 0)) return toast("Choisis au moins une action qui rapporte des points.");
        }
        if (d.format === "bracket" && new Date(d.startsAt).getTime() < Date.now() + 60000) return toast("Le tableau doit commencer dans au moins une minute.");
        const badTier = d.tiers.find((t) => !(Number(t.from) >= 1) || Number(t.to) < Number(t.from));
        if (badTier) return toast("Une tranche de classement est incomplète ou à l'envers.");
        const items = [...d.tiers.flatMap((t) => t.items), ...d.participation];
        if (items.some((r) => r.type === "Gold" && !(Number(r.goldAmount) > 0))) return toast("Indique la quantité d'or de chaque récompense.");
        const button = $("#tn-create");
        if (!armButton(button, d.visibility === "public" ? "Confirmer : visible par tous" : "Confirmer la création")) return;
        disarmButton(button);
        button.disabled = true;
        try {
            const result = await api("/admin/tournaments", { method: "POST", body: JSON.stringify(tnPayload()) });
            state.tnCreated = { ...result, name: d.name.trim(), visibility: d.visibility };
            state.tnDraft = { ...newTournamentDraft(), icon: d.icon, accent: d.accent, format: d.format, visibility: d.visibility };
            toast(d.visibility === "private" ? "Tournoi privé créé : partage le lien." : "Tournoi créé.");
            refreshTnCreator();
            await refreshTournaments();
        } catch (error) {
            if (error.message !== "forbidden") toast(`Impossible : ${error.message}`);
            const retry = $("#tn-create");
            if (retry) retry.disabled = false;
        }
    }

    async function tnAction(button) {
        const [confirm, done] = TN_CONFIRM[button.dataset.tnAction] || [];
        if (!confirm) return;
        if (!armButton(button, confirm)) return;
        disarmButton(button);
        button.disabled = true;
        try {
            await api(`/admin/tournaments/${encodeURIComponent(button.dataset.tnId)}/${button.dataset.tnAction}`, { method: "POST", body: "{}" });
            toast(done);
            await refreshTournaments();
        } catch (error) {
            if (error.message !== "forbidden") toast(`Impossible : ${error.message}`);
            button.disabled = false;
        }
    }

    async function tnForceWinner(button) {
        if (!armButton(button, `Confirmer : ${button.dataset.pseudo} gagne`)) return;
        disarmButton(button);
        button.disabled = true;
        try {
            await api(`/admin/tournaments/${encodeURIComponent(button.dataset.tnId)}/matches/${encodeURIComponent(button.dataset.tnMatch)}/winner`, {
                method: "POST",
                body: JSON.stringify({ userId: button.dataset.tnWin })
            });
            toast("Résultat enregistré : le tableau avance dans quelques secondes.");
            await refreshTournaments();
        } catch (error) {
            if (error.message !== "forbidden") toast(`Impossible : ${error.message}`);
            button.disabled = false;
        }
    }

    function tnMatch(t, m) {
        const side = (p, key) => {
            const score = m.scoreA || m.scoreB ? (key === "a" ? m.scoreA : m.scoreB) : "";
            const won = m.winner === key;
            const lost = m.winner && m.winner !== key;
            const here = m.status === "ready" && m.joined?.[key];
            return html`<div class="tn-slot${won ? " is-won" : ""}${lost ? " is-lost" : ""}">
                <span>${p ? p.pseudo : m.status === "done" ? "—" : "À déterminer"}${here ? html` <small>connecté</small>` : ""}</span><b>${score}</b>
            </div>`;
        };
        const decide = t.status === "running" && m.status !== "done" && m.a && m.b;
        const watch = m.status === "ready" && m.roomId && (m.joined?.a || m.joined?.b);
        const notes = [];
        if (m.status === "ready") notes.push(`Manche ${m.game}${m.deadline ? ` · limite ${timeFmt.format(new Date(m.deadline))}` : ""}`);
        if (m.reason && TN_REASONS[m.reason]) notes.push(TN_REASONS[m.reason]);
        return html`<div class="tn-match${m.status === "ready" ? " is-live" : ""}">
            ${side(m.a, "a")}${side(m.b, "b")}
            ${notes.length || decide || watch ? html`<div class="tn-match-foot">
                ${notes.length ? html`<span class="card-sub">${notes.join(" · ")}</span>` : ""}
                ${watch ? html`<button type="button" class="btn btn-small" data-tn-watch="${m.roomId}">Regarder</button>` : ""}
                ${decide ? [m.a, m.b].map((p) => html`<button type="button" class="btn btn-small" data-tn-win="${p.id}" data-tn-match="${m.id}" data-tn-id="${t.id}" data-pseudo="${p.pseudo}">${p.pseudo} gagne</button>`) : ""}
            </div>` : ""}
        </div>`;
    }

    function tnBoard(t) {
        if (t.format === "points") {
            return card(`Classement${t.leaderboard?.length ? ` (top ${t.leaderboard.length})` : ""}`, table([
                { label: "#", num: true, cell: (r) => r.rank },
                { label: "Joueur", cell: (r) => r.pseudo },
                { label: "Points", num: true, cell: (r) => fmtInt(r.points) }
            ], t.leaderboard || [], { empty: t.status === "upcoming" ? "Le classement démarre avec le tournoi." : "Personne n'a encore marqué de points.", maxHeight: 420 }));
        }
        if (!t.bracket) return card("Tableau", empty(t.status === "upcoming" ? "Le tableau sera tiré au sort au début du tournoi." : "Pas de tableau."));
        return card("Tableau", html`<div class="tn-bracket">${t.bracket.rounds.map((round) => html`<div class="tn-round">
            <span class="card-sub">${round.label}</span>
            ${round.matches.map((m) => tnMatch(t, m))}
        </div>`)}</div>`);
    }

    function tnRewardSummary(t) {
        const chips = (items) => items.map((r) => html`<span class="tn-reward">${r.icon} ${r.type === "Gold" ? r.label : `${r.quantity > 1 ? `${r.quantity} × ` : ""}${r.label}`}</span>`);
        const rank = (from, to) => (from === to ? `${from}${from === 1 ? "er" : "e"}` : `${from}e – ${to}e`);
        const rows = [
            ...(t.rewards?.tiers || []).map((tier) => html`<div class="list-row"><span>${rank(tier.from, tier.to)}</span><div class="tn-chips">${chips(tier.items)}</div></div>`),
            ...(t.rewards?.participation?.length ? [html`<div class="list-row"><span>Participation</span><div class="tn-chips">${chips(t.rewards.participation)}</div></div>`] : [])
        ];
        return card("Récompenses", rows.length ? html`<div class="list">${rows}</div>` : empty("Aucune récompense."));
    }

    function tnDetail(t) {
        const scoring = t.format === "points" && t.scoring?.length
            ? card("Barème", html`<div class="list">${t.scoring.map((s) => html`<div class="list-row"><span>${TN_MODES[s.mode] || s.mode} · ${s.label}</span><b>+${fmtInt(s.points)}</b></div>`)}</div>`)
            : "";
        return html`<div data-tn-detail="${t.id}">
            <div class="tn-detail-head" style="${tnAccentStyle(t.accent)}">
                <span class="tn-badge">${t.icon}</span>
                <div>
                    <h2 class="drawer-title" id="drawer-title">${t.name}</h2>
                    <div class="drawer-badges">${tnStatusChip(t.status)}${chip(t.visibility === "private" ? "Privé" : "Public", "plain")}${chip(tnFormat(t), "plain")}</div>
                </div>
            </div>
            ${t.description ? html`<p class="tn-desc">${t.description}</p>` : ""}
            <div class="list">
                <div class="list-row"><span>Début</span><b>${fmtDateTime(t.startsAt)}</b></div>
                ${t.endsAt ? html`<div class="list-row"><span>Fin</span><b>${fmtDateTime(t.endsAt)}</b></div>` : ""}
                <div class="list-row"><span>Joueurs</span><b>${fmtInt(t.participants)}${t.maxPlayers ? ` / ${fmtInt(t.maxPlayers)}` : ""}</b></div>
                ${t.minLevel ? html`<div class="list-row"><span>Niveau minimum</span><b>${fmtInt(t.minLevel)}</b></div>` : ""}
                ${t.format === "bracket" ? html`<div class="list-row"><span>Manches</span><b>BO${t.bestOf} · ${t.matchMinutes} min par manche · tirage ${t.seeding === "level" ? "par niveau" : "aléatoire"}</b></div>` : ""}
                ${t.code ? html`<div class="list-row"><span>Code</span><b class="code-pill">${t.code}</b></div>` : ""}
            </div>
            <div class="tn-detail-actions">
                ${tnActions(t, false)}
                <a class="btn" href="${tnLink(t)}" target="_blank" rel="noopener">Page des joueurs</a>
            </div>
            ${tnBoard(t)}
            ${scoring}
            ${tnRewardSummary(t)}
        </div>`;
    }

    async function loadTournamentDetail(id) {
        const body = $("#drawer-body");
        try {
            const t = await api(`/admin/tournaments/${encodeURIComponent(id)}`);
            if ($("#drawer").hidden || body.dataset.view !== `tn:${id}`) return;
            const scroller = body.closest(".drawer-panel");
            const top = scroller?.scrollTop || 0;
            const bracket = body.querySelector(".tn-bracket")?.scrollLeft || 0;
            mount(body, tnDetail(t));
            if (scroller) scroller.scrollTop = top;
            const strip = body.querySelector(".tn-bracket");
            if (strip) strip.scrollLeft = bracket;
        } catch (error) {
            if (error.message !== "forbidden" && body.dataset.view === `tn:${id}`) mount(body, empty(`Tournoi indisponible : ${error.message}`));
        }
    }

    async function openTournament(id) {
        const drawer = $("#drawer");
        const body = $("#drawer-body");
        body.dataset.view = `tn:${id}`;
        drawer.hidden = false;
        document.body.style.overflow = "hidden";
        mount(body, empty("Chargement du tournoi…"));
        await loadTournamentDetail(id);
    }

    function bindTournamentTools() {
        document.addEventListener("click", (event) => {
            const target = event.target;
            const d = state.tnDraft;
            const set = target.closest("[data-tn-set]");
            if (set && d) {
                d[set.dataset.tnSet] = set.dataset.tnValue;
                refreshTnCreator();
                return;
            }
            const preset = target.closest("[data-tn-preset]");
            if (preset && d) {
                d.weights = preset.dataset.tnPreset === "none" ? {} : { ...TN_PRESETS[preset.dataset.tnPreset][1] };
                refreshTnCreator();
                return;
            }
            if (target.closest("[data-tn-add-tier]") && d) {
                const last = d.tiers[d.tiers.length - 1];
                const from = last ? Math.max(1, Number(last.to) || 0) + 1 : 1;
                d.tiers.push({ from: String(from), to: String(from), items: [newTnItem()] });
                refreshTnCreator();
                return;
            }
            const removeTier = target.closest("[data-tn-remove-tier]");
            if (removeTier && d) {
                d.tiers.splice(Number(removeTier.dataset.tnRemoveTier), 1);
                refreshTnCreator();
                return;
            }
            const addItem = target.closest("[data-tn-add-item]");
            if (addItem && d) {
                tnList(addItem.dataset.tnAddItem).push(newTnItem());
                refreshTnCreator();
                return;
            }
            const removeItem = target.closest("[data-tn-remove-item]");
            if (removeItem && d) {
                const [key, index] = removeItem.dataset.tnRemoveItem.split(":");
                tnList(key).splice(Number(index), 1);
                refreshTnCreator();
                return;
            }
            const open = target.closest("[data-tn-open]");
            if (open) {
                openTournament(open.dataset.tnOpen);
                return;
            }
            const action = target.closest("[data-tn-action]");
            if (action) {
                if (!action.disabled) tnAction(action);
                return;
            }
            const copy = target.closest("[data-tn-copy]");
            if (copy) {
                navigator.clipboard?.writeText(copy.dataset.tnCopy).then(() => toast("Lien copié."), () => toast("Copie impossible."));
                return;
            }
            const watch = target.closest("[data-tn-watch]");
            if (watch) {
                window.open(`../game/game.html?spectate=${encodeURIComponent(watch.dataset.tnWatch)}`, "_blank", "noopener");
                return;
            }
            const win = target.closest("[data-tn-win]");
            if (win) {
                if (!win.disabled) tnForceWinner(win);
                return;
            }
            const refresh = target.closest("[data-tn-refresh]");
            if (refresh) {
                refresh.disabled = true;
                refreshTournaments().finally(() => { refresh.disabled = false; });
            }
        });
        document.addEventListener("input", (event) => {
            const el = event.target;
            const d = state.tnDraft;
            if (!d || !el.dataset) return;
            if (el.dataset.tnField) {
                d[el.dataset.tnField] = el.value;
                if (el.dataset.tnField === "icon") {
                    el.classList.toggle("is-active", !!el.value.trim());
                    document.querySelectorAll('[data-tn-set="icon"]').forEach((b) => b.classList.toggle("is-active", b.dataset.tnValue === el.value));
                }
                updateTnPreview();
                return;
            }
            if (el.dataset.tnWeight) {
                d.weights[el.dataset.tnWeight] = el.value;
                el.closest(".tn-weight")?.classList.toggle("is-on", Number(el.value) > 0);
                return;
            }
            if (el.dataset.tnTier) {
                const tier = d.tiers[Number(el.dataset.tnTier)];
                if (tier) tier[el.dataset.tnKey] = el.value;
                return;
            }
            if (el.dataset.tnItem && el.dataset.tnKey !== "type") {
                const item = tnItemAt(el.dataset.tnItem);
                if (item) item[el.dataset.tnKey] = el.value;
            }
        });
        document.addEventListener("change", (event) => {
            const el = event.target;
            if (!state.tnDraft || !el.dataset?.tnItem) return;
            const item = tnItemAt(el.dataset.tnItem);
            if (!item) return;
            if (el.dataset.tnKey === "type") {
                Object.assign(item, newTnItem(el.value));
                refreshTnCreator();
                return;
            }
            item[el.dataset.tnKey] = el.value;
        });
    }

    const RENDERERS = {
        overview: renderOverview,
        activity: renderActivity,
        chests: renderChests,
        economy: renderEconomy,
        modes: renderModes,
        promo: renderPromo,
        anticheat: renderAnticheat
    };

    const STANDALONE_TABS = ["players", "messages", "security", "tournaments"];

    function renderView() {
        const view = $("#view");
        $("#range-filter").hidden = STANDALONE_TABS.includes(state.tab);
        if (state.tab === "tournaments") {
            mount(view, renderTournaments());
            return;
        }
        if (state.tab === "security") {
            mount(view, renderSecurity());
            return;
        }
        if (state.tab === "players") {
            mount(view, renderPlayers());
            return;
        }
        if (state.tab === "messages") {
            mount(view, renderMessages());
            updatePreview();
            return;
        }
        if (!state.overview) {
            mount(view, empty("Chargement…"));
            return;
        }
        mount(view, RENDERERS[state.tab](state.overview));
    }

    function selectTab(tab) {
        if (!RENDERERS[tab] && !STANDALONE_TABS.includes(tab)) return;
        state.tab = tab;
        document.querySelectorAll(".tab").forEach((btn) => {
            const active = btn.dataset.tab === tab;
            btn.classList.toggle("is-active", active);
            btn.setAttribute("aria-selected", String(active));
        });
        try { sessionStorage.setItem("admin_tab", tab); } catch { /* stockage indisponible */ }
        renderView();
        if (tab === "players" && !state.players) loadPlayers().then(updatePlayersTable);
        if (tab === "players" && !state.banned) loadBanned().then(updateBannedTable);
        if (tab === "players" && !state.bannedUsers) loadBannedUsers().then(updateBannedUsersTable);
        if (tab === "anticheat") loadAnticheat().then(() => { if (state.tab === "anticheat") renderView(); });
        if (tab === "messages") loadAnnouncements().then(updateAnnouncementList);
        if (tab === "security") loadSecurity().then(() => { if (state.tab === "security") renderView(); });
        if (tab === "messages" && !state.catalog) {
            loadCatalog().then(() => {
                const r = state.draft.reward;
                if (r.type === "Chest" && !r.chestId) r.chestId = state.catalog?.chests?.[0]?.id || "";
                if (r.type === "Card" && !r.cardId) r.cardId = sortedCards()[0]?.id || "";
                if (isQuiz() && (r.type === "Chest" || r.type === "Card")) refreshComposer();
            });
        }
        if (tab === "promo" && !state.catalog) loadCatalog().then(updatePromoCreator);
        if (tab === "tournaments") {
            Promise.all([loadTournamentOptions(), state.catalog ? null : loadCatalog()]).then(() => {
                if (!state.tnDraft) return;
                for (const item of [...state.tnDraft.tiers.flatMap((t) => t.items), ...state.tnDraft.participation]) {
                    if (item.type === "Chest" && !item.chestId) item.chestId = state.catalog?.chests?.[0]?.id || "";
                    if (item.type === "Card" && !item.cardId) item.cardId = sortedCards()[0]?.id || "";
                }
                refreshTnCreator();
            });
            loadTournaments().then(updateTnLists);
        }
        scheduleTournaments();
    }

    function updatePlayersTable() {
        const box = $("#players-table");
        if (box && state.tab === "players") mount(box, playersTable());
    }

    function updateBannedTable() {
        const box = $("#banned-table");
        if (box && state.tab === "players") mount(box, bannedTable());
    }

    function updateBannedUsersTable() {
        const box = $("#banned-users-table");
        if (box && state.tab === "players") mount(box, bannedUsersTable());
    }

    function bindEvents() {
        $(".tabs").addEventListener("click", (event) => {
            const btn = event.target.closest(".tab");
            if (btn) selectTab(btn.dataset.tab);
        });

        $("#range-filter").addEventListener("click", (event) => {
            const btn = event.target.closest("button[data-range]");
            if (!btn) return;
            const range = Number(btn.dataset.range);
            if (range === state.range) return;
            state.range = range;
            document.querySelectorAll("#range-filter button").forEach((b) => {
                const active = b === btn;
                b.classList.toggle("is-active", active);
                b.setAttribute("aria-checked", String(active));
            });
            loadOverview().then(renderView);
        });

        $("#refresh-btn").addEventListener("click", () => refresh(true));

        let searchTimer = null;
        document.addEventListener("input", (event) => {
            if (event.target.id === "player-search") {
                state.playerQuery = event.target.value;
                clearTimeout(searchTimer);
                searchTimer = setTimeout(() => loadPlayers().then(updatePlayersTable), 300);
            } else if (event.target.name === "confirm" && event.target.form?.dataset.banAccount) {
                const form = event.target.form;
                form.querySelector("button[type=submit]").disabled = event.target.value.trim() !== form.dataset.pseudo;
            } else if (event.target.id === "promo-filter") {
                state.promoFilter = event.target.value;
                const box = $("#promo-table");
                if (box && state.overview?.promo) mount(box, promoTable(state.overview.promo, state.overview.range));
            }
        });
        document.addEventListener("change", (event) => {
            if (event.target.id === "player-sort") {
                state.playerSort = event.target.value;
                loadPlayers().then(updatePlayersTable);
            }
        });

        document.addEventListener("click", (event) => {
            const force = event.target.closest("[data-force]");
            if (force) {
                event.stopPropagation();
                forceCheck(force.dataset.force, force);
                return;
            }
            const ban = event.target.closest("[data-ban]");
            if (ban) {
                event.stopPropagation();
                if (!ban.disabled) banPseudo(ban);
                return;
            }
            const unbanAccountButton = event.target.closest("[data-unban-account]");
            if (unbanAccountButton) {
                event.stopPropagation();
                if (!unbanAccountButton.disabled) unbanAccount(unbanAccountButton);
                return;
            }
            const unban = event.target.closest("[data-unban]");
            if (unban) {
                event.stopPropagation();
                if (!unban.disabled) unbanPseudo(unban);
                return;
            }
            if (event.target.closest("[data-close-drawer]")) {
                closeDrawer();
                return;
            }
            const row = event.target.closest("[data-user]");
            if (row) openPlayer(row.dataset.user);
        });
        document.addEventListener("submit", (event) => {
            const form = event.target.closest("[data-ban-account]");
            if (!form) return;
            event.preventDefault();
            banAccount(form);
        });
        document.addEventListener("keydown", (event) => {
            if (event.key === "Escape" && !$("#drawer").hidden) closeDrawer();
        });
        document.addEventListener("visibilitychange", () => {
            if (document.visibilityState === "visible") loadLive();
        });
    }

    // --- Demarrage -------------------------------------------------------------------

    function leave() {
        location.replace(GAME_URL);
    }

    async function enterPanel() {
        const me = await api("/admin/me");
        state.admin = me;
        state.locked = false;
        $("#gate").hidden = true;
        $("#app").hidden = false;
        $("#admin-name").textContent = `Connecté : ${state.admin.pseudo}`;
        if (!state.bound) {
            state.bound = true;
            bindEvents();
            bindEventTools();
            bindTournamentTools();
            $("#logout-btn").addEventListener("click", logout);
        }
        startLive();

        let tab = "overview";
        try { tab = sessionStorage.getItem("admin_tab") || tab; } catch { /* stockage indisponible */ }
        selectTab(RENDERERS[tab] || STANDALONE_TABS.includes(tab) ? tab : "overview");
        if (!STANDALONE_TABS.includes(state.tab)) await loadOverview();
        else loadOverview();
        renderView();
    }

    async function boot() {
        if (window.top !== window.self) {
            document.documentElement.textContent = "";
            return;
        }
        let token = "";
        try {
            token = await window.BrainrotAuth.waitUntilReady();
        } catch { /* auth-gate redirige deja vers PlayWeb */ }
        if (!token) return;
        state.token = token;
        bindGate();

        // Le serveur verifie isAdmin en base ; rien n'est affiche avant sa reponse.
        let status;
        try {
            status = await authCall("status");
        } catch {
            $("#gate-text").textContent = "Serveur injoignable. Réessaie dans un instant.";
            return;
        }
        if (status.status === 503) {
            gateMessage(status.payload?.error || "Panneau admin désactivé sur le serveur.");
            return;
        }
        if (!status.ok) {
            leave();
            return;
        }

        const info = status.payload.data;
        state.session = readSession();
        if (state.session && info.enrolled) {
            try {
                await enterPanel();
                return;
            } catch (error) {
                if (error.message === "forbidden") return;
                gateMessage("Serveur injoignable. Réessaie dans un instant.");
                return;
            }
        }
        if (info.enrolled) showLogin(info.lockedUntil ? "Trop d'essais ratés : réessaie un peu plus tard." : "");
        else if (info.enrollAvailable) showEnrollKey();
        else gateMessage("La double authentification n'est pas encore activée sur ton compte et aucune clé d'activation (ADMIN_ENROLL_KEY) n'est configurée sur le serveur.");
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
    else boot();
})();
