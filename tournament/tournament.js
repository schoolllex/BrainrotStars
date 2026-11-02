(() => {
    "use strict";

    const API = String(window.API_BASE_URL || "").replace(/\/+$/, "");
    const params = new URLSearchParams(location.search);
    const ACCENTS = {
        flame: ["#f97316", "#dc2626"],
        gold: ["#facc15", "#d97706"],
        violet: ["#a855f7", "#6d28d9"],
        ocean: ["#38bdf8", "#2563eb"],
        toxic: ["#84cc16", "#16a34a"],
        pink: ["#f472b6", "#db2777"]
    };
    const MODES = {
        combat: { icon: "swords", label: "Combat" },
        shop: { icon: "store", label: "Boutique" },
        village: { icon: "castle", label: "Villaggio" },
        market: { icon: "shopping-bag", label: "Marché" },
        gamble: { icon: "dices", label: "Gambling" }
    };
    const STATUS = {
        upcoming: ["À venir", "is-upcoming"],
        running: ["En cours", "is-running"],
        finished: ["Terminé", "is-finished"],
        cancelled: ["Annulé", "is-cancelled"]
    };
    const REASONS = { forfeit: "forfait", no_show: "absence", bye: "qualifié d'office", admin: "décision admin" };

    const page = document.getElementById("tn-page");
    const state = { token: "", id: params.get("id"), code: params.get("code"), data: null, list: null, busy: false, reloadTimer: 0, error: null };

    const nf = new Intl.NumberFormat("fr-FR");
    const compact = new Intl.NumberFormat("fr-FR", { notation: "compact", maximumFractionDigits: 1 });
    const dateFmt = new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

    const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    const fmt = (n) => (Math.abs(Number(n) || 0) >= 100000 ? compact.format(Number(n) || 0) : nf.format(Math.round(Number(n) || 0)));

    function accentStyle(key) {
        const [a, b] = ACCENTS[key] || ACCENTS.gold;
        return `--tn-a:${a};--tn-b:${b}`;
    }

    function headers(json) {
        return { Authorization: `Bearer ${state.token}`, ...(json ? { "Content-Type": "application/json" } : {}) };
    }

    async function api(method, path, body) {
        const res = await apiFetch(`${API}${path}`, { method, headers: headers(!!body), body: body ? JSON.stringify(body) : undefined });
        const payload = await res.json().catch(() => null);
        return { ok: res.ok && !!payload?.success, status: res.status, payload };
    }

    function left(iso) {
        const ms = Date.parse(iso) - Date.now();
        if (!(ms > 0)) return "0 min";
        const d = Math.floor(ms / 86_400_000);
        const h = Math.floor((ms % 86_400_000) / 3_600_000);
        const m = Math.floor((ms % 3_600_000) / 60_000);
        const s = Math.floor((ms % 60_000) / 1000);
        if (d > 0) return `${d} j ${h} h`;
        if (h > 0) return `${h} h ${String(m).padStart(2, "0")}`;
        if (m > 0) return `${m} min ${String(s).padStart(2, "0")}`;
        return `${s} s`;
    }

    function tickCountdowns() {
        page.querySelectorAll("[data-countdown]").forEach((el) => {
            el.textContent = left(el.dataset.countdown);
        });
    }

    function toast(message) {
        let el = document.getElementById("tn-toast");
        if (!el) {
            el = document.createElement("div");
            el.id = "tn-toast";
            el.className = "tn-toast";
            document.body.appendChild(el);
        }
        el.textContent = message;
        el.classList.add("is-on");
        clearTimeout(el._t);
        el._t = setTimeout(() => el.classList.remove("is-on"), 2600);
    }

    const icons = () => window.lucide?.createIcons?.();

    function listCard(t) {
        const [label, cls] = STATUS[t.status] || STATUS.upcoming;
        const href = `tournament.html?${t.visibility === "private" && t.code ? `code=${encodeURIComponent(t.code)}` : `id=${encodeURIComponent(t.id)}`}`;
        const when = t.status === "upcoming" ? ["Commence dans", t.startsAt] : t.endsAt ? ["Se termine dans", t.endsAt] : null;
        const mine = t.myMatch?.status === "ready"
            ? `<span class="tn-pill is-hot"><i data-lucide="swords"></i>Ton match est prêt</span>`
            : t.joined ? `<span class="tn-pill"><i data-lucide="check"></i>${t.format === "points" ? `${fmt(t.points)} pts${t.rank ? ` · #${t.rank}` : ""}` : "Inscrit"}</span>` : "";
        return `<a class="tn-list-item" href="${href}" style="${accentStyle(t.accent)}">
            <span class="tn-list-icon">${esc(t.icon)}</span>
            <span class="tn-list-main">
                <span class="tn-list-chips"><span class="tn-status ${cls}">${label}</span>${t.visibility === "private" ? `<span class="tn-tag"><i data-lucide="lock"></i>Privé</span>` : ""}</span>
                <b>${esc(t.name)}</b>
                <small>${t.format === "points" ? "Tournoi aux points" : `Élimination directe${t.bestOf > 1 ? ` · BO${t.bestOf}` : ""}`}${when ? ` · ${when[0]} <span data-countdown="${esc(when[1])}">${left(when[1])}</span>` : ""}</small>
            </span>
            ${mine}
            <i data-lucide="chevron-right" class="tn-list-go"></i>
        </a>`;
    }

    function codeForm() {
        return `<form class="tn-card tn-code" id="tn-code-form">
            <div class="tn-code-text"><b>Tournoi privé</b><small>Entre le code reçu</small></div>
            <input class="tn-input" name="code" maxlength="16" placeholder="CODE" autocomplete="off" autocapitalize="characters" spellcheck="false">
            <button class="tn-btn" type="submit">Ouvrir</button>
        </form>`;
    }

    function renderList() {
        const list = state.list?.tournaments || [];
        page.innerHTML = `
            <section class="tn-card tn-head">
                <div><h1>Tournois</h1></div>
            </section>
            ${list.length ? `<section class="tn-list">${list.map(listCard).join("")}</section>` : `<section class="tn-card tn-empty"><i data-lucide="trophy"></i><p>Aucun tournoi en ce moment.</p></section>`}
            ${codeForm()}`;
        icons();
    }

    function heroActions(t) {
        const out = [];
        if (t.canJoin) out.push(`<button class="tn-btn is-primary" type="button" data-act="join"><i data-lucide="log-in"></i>${t.format === "bracket" ? "S'inscrire" : "Participer"}</button>`);
        else if (t.me.joined && t.status === "upcoming") out.push(`<span class="tn-pill"><i data-lucide="check"></i>Inscrit</span><button class="tn-btn is-ghost" type="button" data-act="leave">Se désinscrire</button>`);
        else if (t.me.joined) out.push(`<span class="tn-pill"><i data-lucide="check"></i>Participant</span>`);
        else if (t.format === "points" && t.visibility === "public" && t.status === "running") out.push(`<span class="tn-pill"><i data-lucide="zap"></i>Joue pour marquer des points</span>`);
        if (t.visibility === "private" && t.code) out.push(`<button class="tn-btn is-ghost" type="button" data-act="copy"><i data-lucide="link"></i>Copier le lien</button>`);
        return out.join("");
    }

    function hero(t) {
        const [label, cls] = STATUS[t.status] || STATUS.upcoming;
        const clock = t.status === "upcoming"
            ? ["Commence dans", t.startsAt]
            : t.status === "running" && t.endsAt ? ["Se termine dans", t.endsAt] : null;
        const dates = `${dateFmt.format(new Date(t.startsAt))}${t.endsAt ? ` → ${dateFmt.format(new Date(t.endsAt))}` : ""}`;
        return `<section class="tn-card tn-hero" style="${accentStyle(t.accent)}">
            <div class="tn-hero-icon">${esc(t.icon)}</div>
            <div class="tn-hero-main">
                <div class="tn-hero-chips">
                    <span class="tn-status ${cls}">${label}</span>
                    <span class="tn-tag"><i data-lucide="${t.visibility === "private" ? "lock" : "globe"}"></i>${t.visibility === "private" ? "Privé" : "Public"}</span>
                    <span class="tn-tag"><i data-lucide="${t.format === "points" ? "chart-no-axes-column" : "git-fork"}"></i>${t.format === "points" ? "Aux points" : `Élimination${t.bestOf > 1 ? ` · BO${t.bestOf}` : ""}`}</span>
                </div>
                <h1>${esc(t.name)}</h1>
                ${t.description ? `<p class="tn-desc">${esc(t.description)}</p>` : ""}
                <div class="tn-meta">
                    <span><i data-lucide="calendar"></i>${esc(dates)}</span>
                    <span><i data-lucide="users"></i>${fmt(t.participants)}${t.maxPlayers ? ` / ${t.maxPlayers}` : ""} joueur${t.participants > 1 ? "s" : ""}</span>
                    ${t.minLevel ? `<span><i data-lucide="shield"></i>Niveau ${fmt(t.minLevel)}+</span>` : ""}
                    ${t.format === "bracket" ? `<span><i data-lucide="timer"></i>${t.matchMinutes} min par manche</span>` : ""}
                </div>
            </div>
            <div class="tn-hero-side">
                ${clock ? `<div class="tn-clock"><small>${clock[0]}</small><strong data-countdown="${esc(clock[1])}">${left(clock[1])}</strong></div>` : ""}
                <div class="tn-actions">${heroActions(t)}</div>
            </div>
        </section>`;
    }

    function rewardChips(items) {
        return items.map((r) => `<span class="tn-reward"><span>${esc(r.icon)}</span>${r.type === "Gold" ? esc(r.label) : `${r.quantity > 1 ? `${r.quantity} × ` : ""}${esc(r.label)}`}</span>`).join("");
    }

    function grantedChips(list) {
        return (list || []).map((g) => {
            if (g.type === "Gold") return `<span class="tn-reward"><span>💰</span>${fmt(g.amount)} or</span>`;
            return `<span class="tn-reward"><span>${esc(g.icon || (g.type === "Card" ? "🃏" : "📦"))}</span>${g.quantity > 1 ? `${g.quantity} × ` : ""}${esc(g.name || "")}</span>`;
        }).join("");
    }

    function rankLabel(from, to) {
        const one = (n) => (n === 1 ? "1er" : `${n}e`);
        return from === to ? one(from) : `${one(from)} – ${one(to)}`;
    }

    function rewardsCard(t) {
        const tiers = t.rewards.tiers || [];
        const part = t.rewards.participation || [];
        if (!tiers.length && !part.length) return "";
        return `<section class="tn-card">
            <h2 class="tn-title"><i data-lucide="gift"></i>Récompenses</h2>
            <div class="tn-tiers">
                ${tiers.map((tier) => `<div class="tn-tier"><span class="tn-tier-rank">${rankLabel(tier.from, tier.to)}</span><div class="tn-tier-items">${rewardChips(tier.items)}</div></div>`).join("")}
                ${part.length ? `<div class="tn-tier"><span class="tn-tier-rank">Participation</span><div class="tn-tier-items">${rewardChips(part)}</div></div>` : ""}
            </div>
        </section>`;
    }

    function gameUrl(t, roomId) {
        return `../game/game.html?room=${encodeURIComponent(roomId)}&tournament=1&tid=${encodeURIComponent(t.id)}`;
    }

    function meCard(t) {
        const me = t.me;
        if (!me.joined) return "";
        if (t.status === "finished") {
            const rank = me.finalRank ?? me.rank;
            return `<section class="tn-card tn-me is-final" style="${accentStyle(t.accent)}">
                <div class="tn-me-rank"><small>Classement final</small><strong>${rank ? `#${rank}` : "—"}</strong></div>
                ${me.reward?.length ? `<div class="tn-me-rewards"><small>Tu as reçu</small><div class="tn-tier-items">${grantedChips(me.reward)}</div></div>` : ""}
            </section>`;
        }
        if (t.format === "points") {
            return `<section class="tn-card tn-me" style="${accentStyle(t.accent)}">
                <div class="tn-me-rank"><small>Ton rang</small><strong>${me.rank ? `#${me.rank}` : "—"}</strong></div>
                <div class="tn-me-rank"><small>Tes points</small><strong>${fmt(me.points)}</strong></div>
            </section>`;
        }
        const m = t.myMatch;
        if (m?.status === "ready" && m.roomId) {
            return `<section class="tn-card tn-me is-ready" style="${accentStyle(t.accent)}">
                <div class="tn-me-match">
                    <small>${t.bestOf > 1 ? `Manche ${m.game} · ${m.myScore} – ${m.foeScore}` : "Ton match"}</small>
                    <strong>contre ${esc(m.opponent || "?")}</strong>
                    ${m.deadline ? `<span class="tn-deadline"><i data-lucide="timer"></i>À jouer avant <b data-countdown="${esc(m.deadline)}">${left(m.deadline)}</b></span>` : ""}
                </div>
                <a class="tn-btn is-primary is-big" href="${gameUrl(t, m.roomId)}"><i data-lucide="swords"></i>Jouer</a>
            </section>`;
        }
        if (m?.status === "pending") {
            return `<section class="tn-card tn-me" style="${accentStyle(t.accent)}">
                <div class="tn-me-match"><small>Prochain match</small><strong>En attente de ton adversaire</strong></div>
            </section>`;
        }
        if (me.eliminated) {
            return `<section class="tn-card tn-me is-out"><div class="tn-me-match"><small>Tournoi</small><strong>Éliminé</strong></div></section>`;
        }
        if (t.status === "upcoming") {
            return `<section class="tn-card tn-me" style="${accentStyle(t.accent)}"><div class="tn-me-match"><small>Inscription confirmée</small><strong>Le tableau sera tiré au début du tournoi</strong></div></section>`;
        }
        return "";
    }

    function scoringCard(t) {
        if (t.format !== "points" || !t.scoring?.length) return "";
        return `<section class="tn-card">
            <h2 class="tn-title"><i data-lucide="zap"></i>Barème</h2>
            <div class="tn-scoring">${t.scoring.map((s) => `<div class="tn-score-item">
                <span class="tn-mode is-${s.mode}"><i data-lucide="${MODES[s.mode]?.icon || "star"}"></i></span>
                <span class="tn-score-label">${esc(s.label)}</span>
                <b>+${fmt(s.points)}</b>
            </div>`).join("")}</div>
        </section>`;
    }

    function leaderboardCard(t) {
        if (t.format !== "points") return "";
        const rows = t.leaderboard || [];
        return `<section class="tn-card">
            <div class="tn-card-head"><h2 class="tn-title"><i data-lucide="trophy"></i>Classement</h2><button class="tn-icon-btn" type="button" data-act="reload" aria-label="Actualiser"><i data-lucide="refresh-cw"></i></button></div>
            ${rows.length ? `<ol class="tn-board">${rows.map((r) => `<li class="${r.me ? "is-me" : ""}${r.rank <= 3 ? ` is-top is-top-${r.rank}` : ""}">
                <span class="tn-board-rank">${r.rank <= 3 ? ["🥇", "🥈", "🥉"][r.rank - 1] : r.rank}</span>
                <span class="tn-board-name">${esc(r.pseudo)}</span>
                <b>${fmt(r.points)} pts</b>
            </li>`).join("")}</ol>` : `<p class="tn-muted">${t.status === "upcoming" ? "Le classement s'affichera au début du tournoi." : "Personne n'a encore marqué de points."}</p>`}
        </section>`;
    }

    function slot(side, match, key) {
        if (!side) return `<div class="tn-slot is-empty"><span>${match.status === "done" && match.reason === "bye" ? "—" : "À déterminer"}</span></div>`;
        const won = match.winner === key;
        const lost = match.winner && match.winner !== key;
        const score = match.status !== "pending" && (match.scoreA || match.scoreB) ? (key === "a" ? match.scoreA : match.scoreB) : "";
        return `<div class="tn-slot${side.me ? " is-me" : ""}${won ? " is-won" : ""}${lost ? " is-lost" : ""}">
            <span>${esc(side.pseudo)}</span>${score !== "" ? `<b>${score}</b>` : won ? `<i data-lucide="check"></i>` : ""}
        </div>`;
    }

    function bracketCard(t) {
        if (t.format !== "bracket") return "";
        if (!t.bracket) {
            return `<section class="tn-card"><h2 class="tn-title"><i data-lucide="git-fork"></i>Tableau</h2>
                <p class="tn-muted">${t.status === "upcoming" ? `Le tableau sera tiré au sort au début du tournoi. ${fmt(t.participants)} inscrit${t.participants > 1 ? "s" : ""} pour l'instant.` : "Pas de tableau."}</p></section>`;
        }
        return `<section class="tn-card">
            <div class="tn-card-head"><h2 class="tn-title"><i data-lucide="git-fork"></i>Tableau</h2><button class="tn-icon-btn" type="button" data-act="reload" aria-label="Actualiser"><i data-lucide="refresh-cw"></i></button></div>
            <div class="tn-bracket">${t.bracket.rounds.map((round) => `<div class="tn-round">
                <span class="tn-round-label">${esc(round.label)}</span>
                <div class="tn-round-matches">${round.matches.map((m) => `<div class="tn-match${m.mine ? " is-mine" : ""}${m.status === "ready" ? " is-live" : ""}">
                    ${slot(m.a, m, "a")}${slot(m.b, m, "b")}
                    ${m.status === "ready" ? `<span class="tn-match-live">En jeu${t.bestOf > 1 ? ` · manche ${m.game}` : ""}</span>` : m.reason && m.reason !== "bye" && REASONS[m.reason] ? `<span class="tn-match-note">${REASONS[m.reason]}</span>` : ""}
                </div>`).join("")}</div>
            </div>`).join("")}</div>
        </section>`;
    }

    function renderOne() {
        const t = state.data;
        document.title = `BrainrotStars - ${t.name}`;
        page.innerHTML = `
            <a class="tn-back" href="tournament.html"><i data-lucide="arrow-left"></i>Tous les tournois</a>
            ${hero(t)}
            ${meCard(t)}
            <div class="tn-grid">
                <div class="tn-col">${leaderboardCard(t)}${bracketCard(t)}</div>
                <div class="tn-col">${scoringCard(t)}${rewardsCard(t)}</div>
            </div>`;
        icons();
    }

    function renderError(message, withCode) {
        page.innerHTML = `
            <a class="tn-back" href="tournament.html"><i data-lucide="arrow-left"></i>Tous les tournois</a>
            <section class="tn-card tn-empty"><i data-lucide="lock"></i><p>${esc(message)}</p></section>
            ${withCode ? codeForm() : ""}`;
        icons();
    }

    async function loadOne() {
        const key = state.id || state.code;
        const query = state.code ? `?code=${encodeURIComponent(state.code)}` : "";
        const res = await api("GET", `/tournaments/${encodeURIComponent(key)}${query}`);
        if (!res.ok) {
            renderError(res.payload?.message || "Tournoi introuvable.", res.status === 403 || res.status === 404);
            return;
        }
        state.data = res.payload.tournament;
        if (!state.id) state.id = state.data.id;
        watch(state.data.id);
        renderOne();
    }

    function watch(id) {
        state.watching = id;
        window.BrainrotRealtime?.socket?.()?.emit("tn:watch", { id });
    }

    async function loadList() {
        const res = await api("GET", "/tournaments/current");
        state.list = res.ok ? res.payload.tournaments : { tournaments: [] };
        renderList();
    }

    function reload(delay = 300) {
        clearTimeout(state.reloadTimer);
        state.reloadTimer = setTimeout(() => {
            state.reloadTimer = 0;
            (state.data || state.id || state.code ? loadOne() : loadList());
        }, delay);
    }

    async function act(name, el) {
        const t = state.data;
        if (name === "reload") return reload(0);
        if (name === "copy" && t?.code) {
            const url = `${location.origin}${location.pathname}?code=${encodeURIComponent(t.code)}`;
            try {
                await navigator.clipboard.writeText(url);
                toast("Lien copié !");
            } catch {
                prompt("Copie ce lien :", url);
            }
            return;
        }
        if (state.busy || !t) return;
        state.busy = true;
        el.disabled = true;
        try {
            const res = await api("POST", `/tournaments/${encodeURIComponent(t.id)}/${name}`, { code: state.code || t.code || undefined });
            if (!res.ok) {
                toast(res.payload?.message || "Action impossible.");
                return;
            }
            state.data = res.payload.tournament;
            renderOne();
            toast(name === "join" ? "Inscription confirmée !" : "Désinscription faite.");
        } finally {
            state.busy = false;
            el.disabled = false;
        }
    }

    page.addEventListener("click", (event) => {
        const btn = event.target.closest("[data-act]");
        if (btn) act(btn.dataset.act, btn);
    });

    page.addEventListener("submit", (event) => {
        if (event.target.id !== "tn-code-form") return;
        event.preventDefault();
        const code = String(new FormData(event.target).get("code") || "").trim().toUpperCase();
        if (!code) return;
        location.href = `tournament.html?code=${encodeURIComponent(code)}`;
    });

    async function boot() {
        try {
            state.token = await window.BrainrotAuth?.waitUntilReady?.();
        } catch {
            return;
        }
        if (!state.token) return;
        window.BrainrotRealtime?.on?.("tournament", (event) => {
            if (state.data && event?.id && event.id !== state.data.id) return;
            if (event?.type !== "points") return reload();
            if (document.visibilityState === "visible" && !state.reloadTimer) reload(500 + Math.random() * 2500);
        });
        window.BrainrotRealtime?.on?.("connect", () => {
            if (state.watching) watch(state.watching);
        });
        document.addEventListener("visibilitychange", () => {
            if (document.visibilityState === "visible") reload();
        });
        setInterval(tickCountdowns, 1000);
        if (state.id || state.code) await loadOne();
        else await loadList();
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
    else boot();
})();
