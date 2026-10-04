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

    const state = {
        token: "",
        admin: null,
        tab: "overview",
        range: 30,
        overview: null,
        players: null,
        playerQuery: "",
        playerSort: "recent",
        anticheat: null,
        promoFilter: "",
        live: null,
        liveTimer: null,
        loading: 0
    };

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
                <thead><tr>${columns.map((c) => html`<th class="${c.num ? "num" : ""}">${c.label}</th>`)}</tr></thead>
                <tbody>${rows.map((row) => {
                    const user = opts.rowUser ? opts.rowUser(row) : null;
                    return html`<tr${user ? html` class="clickable" data-user="${user}"` : ""}>${columns.map((c) =>
                        html`<td class="${c.num ? "num" : ""}${c.wrap ? " wrap" : ""}">${c.cell(row)}</td>`)}</tr>`;
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
        if (init.body) headers["Content-Type"] = "application/json";
        const res = await apiFetch(`${API}${path}`, { ...init, headers });
        if (res.status === 401 || res.status === 403) {
            // Droits retires entre-temps : retour au jeu.
            location.replace(GAME_URL);
            throw new Error("forbidden");
        }
        const payload = await res.json().catch(() => null);
        if (!res.ok || !payload?.success) throw new Error(payload?.error || `HTTP ${res.status}`);
        return payload.data;
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

    function startLive() {
        clearInterval(state.liveTimer);
        state.liveTimer = setInterval(() => {
            if (document.visibilityState !== "hidden") loadLive();
        }, LIVE_EVERY_MS);
    }

    /** Recharge ce dont l'onglet courant a besoin, puis l'affiche. */
    async function refresh(fresh = false) {
        const jobs = [];
        if (state.tab === "players") jobs.push(loadPlayers());
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
            { label: "Créé le", cell: (r) => fmtDate(r.createdAt) },
            { label: "Statut", cell: (r) => (r.exhausted ? chip("Épuisé", "serious") : chip("Actif", "good")) }
        ], promoRows(promo), { empty: "Aucun code ne correspond.", maxHeight: 620 });
    }

    function renderPromo(o) {
        const pr = o.promo;
        if (!pr) return html`${notices(o)}${unavailable()}`;
        const top = [...pr.codes].filter((c) => c.usesRange > 0).sort((a, b) => b.usesRange - a.usesRange).slice(0, 10);
        return html`
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

    // --- Onglet : joueurs ------------------------------------------------------------

    const SORTS = [
        ["recent", "Dernière activité"], ["new", "Inscription récente"], ["gold", "Or"],
        ["cps", "Pièces/s"], ["wins", "Victoires"], ["rebirth", "Rebirth"]
    ];

    function playersTable() {
        if (!state.players) return empty("Chargement…");
        return table([
            { label: "Joueur", cell: (r) => html`${playerLink(r.userId, r.pseudo, r.online)}${r.isAdmin ? html` ${chip("Admin", "plain")}` : ""}` },
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
            <div id="players-table">${playersTable()}</div>`;
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

    // --- Rendu et navigation ---------------------------------------------------------

    const RENDERERS = {
        overview: renderOverview,
        activity: renderActivity,
        chests: renderChests,
        economy: renderEconomy,
        modes: renderModes,
        promo: renderPromo,
        anticheat: renderAnticheat
    };

    function renderView() {
        const view = $("#view");
        $("#range-filter").hidden = state.tab === "players";
        if (state.tab === "players") {
            mount(view, renderPlayers());
            return;
        }
        if (!state.overview) {
            mount(view, empty("Chargement…"));
            return;
        }
        mount(view, RENDERERS[state.tab](state.overview));
    }

    function selectTab(tab) {
        if (!RENDERERS[tab] && tab !== "players") return;
        state.tab = tab;
        document.querySelectorAll(".tab").forEach((btn) => {
            const active = btn.dataset.tab === tab;
            btn.classList.toggle("is-active", active);
            btn.setAttribute("aria-selected", String(active));
        });
        try { sessionStorage.setItem("admin_tab", tab); } catch { /* stockage indisponible */ }
        renderView();
        if (tab === "players" && !state.players) loadPlayers().then(updatePlayersTable);
        if (tab === "anticheat") loadAnticheat().then(() => { if (state.tab === "anticheat") renderView(); });
    }

    function updatePlayersTable() {
        const box = $("#players-table");
        if (box && state.tab === "players") mount(box, playersTable());
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
            if (event.target.closest("[data-close-drawer]")) {
                closeDrawer();
                return;
            }
            const row = event.target.closest("[data-user]");
            if (row) openPlayer(row.dataset.user);
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

    async function boot() {
        let token = "";
        try {
            token = await window.BrainrotAuth.waitUntilReady();
        } catch { /* auth-gate redirige deja vers PlayWeb */ }
        if (!token) return;
        state.token = token;

        // Le serveur verifie isAdmin en base ; rien n'est affiche avant sa reponse.
        try {
            const res = await apiFetch(`${API}/admin/me`, { headers: { Authorization: `Bearer ${token}` } });
            const payload = await res.json().catch(() => null);
            if (!res.ok || !payload?.success) {
                leave();
                return;
            }
            state.admin = payload.admin;
        } catch {
            $("#gate-text").textContent = "Serveur injoignable. Réessaie dans un instant.";
            return;
        }

        $("#gate").hidden = true;
        $("#app").hidden = false;
        $("#admin-name").textContent = `Connecté : ${state.admin.pseudo}`;
        bindEvents();
        startLive();

        let tab = "overview";
        try { tab = sessionStorage.getItem("admin_tab") || tab; } catch { /* stockage indisponible */ }
        selectTab(RENDERERS[tab] || tab === "players" ? tab : "overview");
        if (state.tab !== "players") await loadOverview();
        else loadOverview();
        renderView();
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
    else boot();
})();
