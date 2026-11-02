(() => {
    "use strict";

    const SCRIPT = document.currentScript;
    const MODE = SCRIPT?.dataset.mode === "toast" ? "toast" : "banner";
    const API = String(window.API_BASE_URL || "").replace(/\/+$/, "");
    const PAGE = "../tournament/tournament.html";
    const params = new URLSearchParams(location.search);
    const ACCENTS = {
        flame: ["#f97316", "#dc2626"],
        gold: ["#facc15", "#d97706"],
        violet: ["#a855f7", "#6d28d9"],
        ocean: ["#38bdf8", "#2563eb"],
        toxic: ["#84cc16", "#16a34a"],
        pink: ["#f472b6", "#db2777"]
    };
    const REASONS = { forfeit: "forfait", no_show: "absence", admin: "décision admin" };

    const STYLE = `
.tb-bar{display:flex;align-items:center;gap:.75rem;margin:-.6rem 0 1.4rem;padding:.55rem .6rem .55rem .55rem;border-radius:18px;
  background:linear-gradient(180deg,rgba(255,255,255,.055),rgba(255,255,255,.025));border:1px solid rgba(255,255,255,.09);
  box-shadow:0 10px 24px rgba(0,0,0,.3);color:#fff;font-family:'Inter',system-ui,sans-serif;animation:tb-in .25s ease-out}
.tb-bar.is-ready{border-color:rgba(255,255,255,.5)}
@keyframes tb-in{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:none}}
body.game-active .tb-bar{display:none}
.tb-main{display:flex;align-items:center;gap:.75rem;flex:1;min-width:0;color:inherit;text-decoration:none}
.tb-icon{flex:none;display:grid;place-items:center;width:42px;height:42px;border-radius:13px;font-size:22px;line-height:1;
  background:linear-gradient(135deg,var(--tb-a),var(--tb-b));box-shadow:inset 0 1px 0 rgba(255,255,255,.25)}
.tb-text{display:grid;gap:.1rem;min-width:0}
.tb-text b{font-size:.95rem;font-weight:900;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tb-text small{color:#a3a3a3;font-size:.78rem;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tb-text small em{font-style:normal;color:#e5e5e5}
.tb-live{display:inline-block;width:7px;height:7px;margin-right:.35rem;border-radius:50%;background:#22c55e;vertical-align:1px}
.tb-btn{flex:none;display:inline-flex;align-items:center;justify-content:center;gap:.4rem;min-height:38px;padding:0 1rem;border-radius:12px;
  border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.05);color:#fff;font:inherit;font-size:.85rem;font-weight:800;
  text-decoration:none;cursor:pointer;white-space:nowrap}
.tb-btn:hover{background:rgba(255,255,255,.09);border-color:rgba(255,255,255,.2)}
.tb-btn.is-primary{border:0;background:linear-gradient(135deg,#f97316,#dc2626)}
.tb-btn.is-primary:hover{filter:brightness(1.06)}
.tb-btn svg{width:15px;height:15px}
.tb-more{flex:none;color:#a3a3a3;font-size:.78rem;font-weight:800;text-decoration:none;padding:0 .3rem}
.tb-more:hover{color:#fff}
.tb-close{flex:none;display:grid;place-items:center;width:30px;height:30px;border:0;border-radius:9px;background:transparent;color:#737373;
  font:inherit;font-size:1.1rem;font-weight:800;cursor:pointer}
.tb-close:hover{color:#fff;background:rgba(255,255,255,.06)}
.tb-toast{position:fixed;left:50%;bottom:calc(16px + env(safe-area-inset-bottom,0px));z-index:2147481000;display:flex;align-items:center;gap:.7rem;
  width:min(440px,calc(100vw - 24px));padding:.6rem .6rem .6rem .6rem;border-radius:18px;background:#171717;border:1px solid rgba(255,255,255,.14);
  box-shadow:0 16px 40px rgba(0,0,0,.55);color:#fff;font-family:'Inter',system-ui,sans-serif;transform:translateX(-50%);animation:tb-up .3s ease-out}
@keyframes tb-up{from{opacity:0;transform:translate(-50%,10px)}to{opacity:1;transform:translateX(-50%)}}
.tb-rank{display:grid;gap:.85rem}
.tb-rank-head{display:flex;align-items:center;gap:.8rem}
.tb-rank-head .tb-text b{font-size:1.15rem}
.tb-rank-list{display:grid;gap:.35rem;list-style:none;margin:0;padding:0}
.tb-rank-list li{display:grid;grid-template-columns:2.2rem minmax(0,1fr) auto;align-items:center;gap:.6rem;min-height:40px;padding:0 .8rem;
  border:1px solid rgba(255,255,255,.05);border-radius:12px;background:rgba(255,255,255,.025);font-weight:700}
.tb-rank-list li.is-me{border-color:rgba(255,255,255,.5);background:rgba(255,255,255,.07)}
.tb-rank-list li.is-gap{min-height:0;padding:0;border:0;background:none;color:#737373;text-align:center;display:block;font-size:.8rem}
.tb-rank-list .tb-pos{color:#a3a3a3;font-weight:900;text-align:center;font-variant-numeric:tabular-nums}
.tb-rank-list .tb-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tb-rank-list b{font-variant-numeric:tabular-nums}
.tb-duels{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:.5rem}
.tb-duel{display:grid;border:1px solid rgba(255,255,255,.09);border-radius:12px;overflow:hidden;background:rgba(255,255,255,.03)}
.tb-duel.is-mine{border-color:rgba(255,255,255,.5)}
.tb-duel span{display:flex;justify-content:space-between;gap:.5rem;padding:.45rem .7rem;font-size:.84rem;font-weight:800}
.tb-duel span+span{border-top:1px solid rgba(255,255,255,.05)}
.tb-duel span.is-lost{color:#737373}
.tb-duel span i{font-style:normal;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tb-muted{color:#a3a3a3;font-size:.88rem;font-weight:600}
@media (max-width:640px){
  .tb-bar{gap:.5rem;margin:-.4rem 0 1.1rem}
  .tb-icon{width:36px;height:36px;font-size:19px;border-radius:11px}
  .tb-btn{padding:0 .8rem}
  .tb-btn .tb-btn-label{display:none}
  .tb-more{display:none}
}
@media (prefers-reduced-motion:reduce){.tb-bar,.tb-toast{animation:none}}
`;

    const state = { token: "", list: [], at: 0, timer: 0, tick: 0, connected: false, board: null, boardTimer: 0, watching: "" };

    const nf = new Intl.NumberFormat("fr-FR");
    const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    const fmt = (n) => nf.format(Math.round(Number(n) || 0));
    const accent = (key) => {
        const [a, b] = ACCENTS[key] || ACCENTS.gold;
        return `--tb-a:${a};--tb-b:${b}`;
    };
    const pageUrl = (t) => `${PAGE}?${t.visibility === "private" && t.code ? `code=${encodeURIComponent(t.code)}` : `id=${encodeURIComponent(t.id)}`}`;
    const gameUrl = (t, roomId) => `../game/game.html?room=${encodeURIComponent(roomId)}&tournament=1&tid=${encodeURIComponent(t.id)}`;
    const icons = () => window.lucide?.createIcons?.();

    function store(kind) {
        try {
            return window[kind];
        } catch {
            return null;
        }
    }

    function remembered(key) {
        try {
            return store("sessionStorage")?.getItem(key) === "1";
        } catch {
            return false;
        }
    }

    function remember(key) {
        try {
            store("sessionStorage")?.setItem(key, "1");
        } catch { }
    }

    function left(iso) {
        const ms = Date.parse(iso) - Date.now();
        if (!(ms > 0)) return "quelques secondes";
        const d = Math.floor(ms / 86_400_000);
        const h = Math.floor((ms % 86_400_000) / 3_600_000);
        const m = Math.ceil((ms % 3_600_000) / 60_000);
        if (d > 0) return `${d} j ${h} h`;
        if (h > 0) return `${h} h ${String(m % 60).padStart(2, "0")}`;
        return `${m} min`;
    }

    function injectStyle() {
        if (document.getElementById("tb-style")) return;
        const style = document.createElement("style");
        style.id = "tb-style";
        style.textContent = STYLE;
        document.head.appendChild(style);
    }

    async function get(path) {
        const res = await apiFetch(`${API}${path}`, { headers: { Authorization: `Bearer ${state.token}` } });
        const payload = await res.json().catch(() => null);
        return res.ok && payload?.success ? payload : null;
    }

    function readyOf(t) {
        return t.myMatch?.status === "ready" && t.myMatch.roomId ? t.myMatch : null;
    }

    function pick() {
        const list = state.list;
        return list.find(readyOf) || list.find((t) => t.visibility === "public") || list.find((t) => t.joined) || null;
    }

    function dismissKey(t) {
        return `tb:${t.id}:${t.status}:${readyOf(t)?.roomId || ""}`;
    }

    function line(t) {
        const ready = readyOf(t);
        if (ready) {
            const score = t.bestOf > 1 ? ` · ${ready.myScore} – ${ready.foeScore}` : "";
            return `Ton match est prêt contre <em>${esc(ready.opponent || "?")}</em>${score}${ready.deadline ? ` · ${left(ready.deadline)}` : ""}`;
        }
        if (t.status === "upcoming") {
            const extra = t.joined ? " · Inscrit" : t.format === "bracket" ? " · Inscriptions ouvertes" : "";
            return `Commence dans ${left(t.startsAt)}${extra}`;
        }
        const live = `<span class="tb-live"></span>`;
        if (t.format === "points") {
            const end = t.endsAt ? `Fin dans ${left(t.endsAt)}` : "En cours";
            const mine = t.joined && t.points > 0 ? ` · <em>${t.rank ? `#${t.rank} · ` : ""}${fmt(t.points)} pts</em>` : " · Joue pour marquer des points";
            return `${live}${end}${mine}`;
        }
        if (t.joined && t.eliminated) return `${live}En cours · Éliminé`;
        if (t.myMatch?.status === "pending") return `${live}En cours · En attente de ton prochain adversaire`;
        return `${live}En cours`;
    }

    function cta(t) {
        const ready = readyOf(t);
        if (ready) return `<a class="tb-btn is-primary" href="${gameUrl(t, ready.roomId)}"><i data-lucide="swords"></i><span class="tb-btn-label">Jouer</span></a>`;
        if (t.status === "upcoming" && !t.joined && t.format === "bracket") return `<a class="tb-btn is-primary" href="${pageUrl(t)}"><i data-lucide="log-in"></i><span class="tb-btn-label">S'inscrire</span></a>`;
        return `<a class="tb-btn" href="${pageUrl(t)}"><i data-lucide="trophy"></i><span class="tb-btn-label">Voir</span></a>`;
    }

    function renderBanner() {
        let bar = document.getElementById("tb-bar");
        const t = pick();
        if (!t || remembered(dismissKey(t))) {
            bar?.remove();
            return;
        }
        if (!bar) {
            const anchor = document.querySelector(".container > .navbar");
            if (!anchor) return;
            bar = document.createElement("div");
            bar.id = "tb-bar";
            anchor.after(bar);
        }
        const others = state.list.length - 1;
        bar.className = `tb-bar${readyOf(t) ? " is-ready" : ""}`;
        bar.setAttribute("style", accent(t.accent));
        bar.dataset.key = dismissKey(t);
        bar.innerHTML = `
            <a class="tb-main" href="${pageUrl(t)}">
                <span class="tb-icon">${esc(t.icon)}</span>
                <span class="tb-text"><b>${esc(t.name)}</b><small>${line(t)}</small></span>
            </a>
            ${others > 0 ? `<a class="tb-more" href="${PAGE}">+${others} tournoi${others > 1 ? "s" : ""}</a>` : ""}
            ${cta(t)}
            <button class="tb-close" type="button" aria-label="Masquer">×</button>`;
        bar.querySelector(".tb-close").addEventListener("click", () => {
            remember(bar.dataset.key);
            bar.remove();
        });
        icons();
    }

    function notice(key, t, text, href, label, primary) {
        if (document.body.classList.contains("game-active") || remembered(key)) return;
        remember(key);
        document.getElementById("tb-toast")?.remove();
        const el = document.createElement("div");
        el.id = "tb-toast";
        el.className = "tb-toast";
        el.setAttribute("style", accent(t.accent));
        el.setAttribute("role", "status");
        el.innerHTML = `
            <span class="tb-icon">${esc(t.icon || "🏆")}</span>
            <span class="tb-text"><b>${esc(t.name)}</b><small>${text}</small></span>
            <a class="tb-btn${primary ? " is-primary" : ""}" href="${href}">${label}</a>
            <button class="tb-close" type="button" aria-label="Fermer">×</button>`;
        el.querySelector(".tb-close").addEventListener("click", () => el.remove());
        document.body.appendChild(el);
        setTimeout(() => el.remove(), 15_000);
    }

    function toast(t, ready) {
        notice(`tb-toast:${ready.roomId}`, t, `Ton match est prêt contre <em>${esc(ready.opponent || "?")}</em>`, gameUrl(t, ready.roomId), "Jouer", true);
    }

    function boardRows(t) {
        const rows = (t.leaderboard || []).slice(0, 10);
        if (!rows.length) return `<p class="tb-muted">Personne n'a encore marqué de points.</p>`;
        const medal = (rank) => (rank <= 3 ? ["🥇", "🥈", "🥉"][rank - 1] : rank);
        const item = (r) => `<li class="${r.me ? "is-me" : ""}"><span class="tb-pos">${medal(r.rank)}</span><span class="tb-name">${esc(r.pseudo)}</span><b>${fmt(r.points)} pts</b></li>`;
        let html = rows.map(item).join("");
        if (t.me?.joined && t.me.rank && t.me.rank > 10 && !rows.some((r) => r.me)) {
            html += `<li class="is-gap">···</li><li class="is-me"><span class="tb-pos">${t.me.rank}</span><span class="tb-name">Toi</span><b>${fmt(t.me.points)} pts</b></li>`;
        }
        return `<ol class="tb-rank-list">${html}</ol>`;
    }

    function duelRows(t) {
        const rounds = t.bracket?.rounds || [];
        const round = rounds.find((r) => r.matches.some((m) => m.status !== "done")) || rounds[rounds.length - 1];
        if (!round) return `<p class="tb-muted">Le tableau sera tiré au début du tournoi.</p>`;
        const side = (p, m, key) => {
            const lost = m.winner && m.winner !== key;
            const score = m.scoreA || m.scoreB ? (key === "a" ? m.scoreA : m.scoreB) : "";
            return `<span class="${lost ? "is-lost" : ""}"><i>${esc(p?.pseudo || "À déterminer")}</i><b>${score}</b></span>`;
        };
        const matches = round.matches.slice(0, 8);
        return `<p class="tb-muted">${esc(round.label)}${round.matches.length > 8 ? ` · ${round.matches.length} matchs` : ""}</p>
            <div class="tb-duels">${matches.map((m) => `<div class="tb-duel${m.mine ? " is-mine" : ""}">${side(m.a, m, "a")}${side(m.b, m, "b")}</div>`).join("")}</div>`;
    }

    function renderBoard() {
        const host = document.querySelector(".ranking-content");
        let card = document.getElementById("tb-rank");
        const t = state.board;
        if (!host || !t) {
            card?.remove();
            return;
        }
        if (!card) {
            card = document.createElement("section");
            card.id = "tb-rank";
            card.className = "ranking-card tb-rank";
            host.prepend(card);
        }
        card.setAttribute("style", accent(t.accent));
        const sub = t.status === "upcoming" ? `Commence dans ${left(t.startsAt)}` : t.format === "points" ? (t.endsAt ? `Fin dans ${left(t.endsAt)}` : "En cours") : "Élimination directe";
        const body = t.status === "upcoming"
            ? `<p class="tb-muted">${fmt(t.participants)} inscrit${t.participants > 1 ? "s" : ""}.</p>`
            : t.format === "points" ? boardRows(t) : duelRows(t);
        card.innerHTML = `
            <div class="tb-rank-head">
                <span class="tb-icon">${esc(t.icon)}</span>
                <span class="tb-text" style="flex:1"><b>${esc(t.name)}</b><small>${t.status === "running" ? `<span class="tb-live"></span>` : ""}${sub} · ${fmt(t.participants)} joueur${t.participants > 1 ? "s" : ""}</small></span>
                <a class="tb-btn" href="${pageUrl(t)}"><i data-lucide="trophy"></i><span class="tb-btn-label">Tout le classement</span></a>
            </div>
            ${body}`;
        icons();
    }

    async function loadBoard() {
        const pub = state.list.find((t) => t.visibility === "public");
        if (!pub) {
            state.board = null;
            watch("");
            renderBoard();
            return;
        }
        const payload = await get(`/tournaments/${encodeURIComponent(pub.id)}`).catch(() => null);
        state.board = payload?.tournament || null;
        watch(state.board ? state.board.id : "");
        renderBoard();
    }

    function watch(id) {
        if (state.watching === id) return;
        state.watching = id;
        window.BrainrotRealtime?.socket?.()?.emit("tn:watch", { id });
    }

    function render() {
        if (MODE === "banner") renderBanner();
        if (MODE === "toast") {
            const t = state.list.find(readyOf);
            if (t) toast(t, readyOf(t));
        }
    }

    async function refresh() {
        state.timer = 0;
        const payload = await get("/tournaments/current").catch(() => null);
        if (!payload) return;
        state.at = Date.now();
        state.list = payload.tournaments?.tournaments || [];
        render();
        if (document.querySelector(".ranking-content")) loadBoard();
        clearInterval(state.tick);
        state.tick = state.list.length && MODE === "banner" ? setInterval(() => {
            if (document.visibilityState === "visible") {
                renderBanner();
                if (state.board) renderBoard();
            }
        }, 30_000) : 0;
    }

    function schedule(delay) {
        if (state.timer) return;
        state.timer = setTimeout(refresh, delay);
    }

    function onEvent(event) {
        if (event?.type === "match") {
            clearTimeout(state.timer);
            state.timer = 0;
            refresh().then(() => {
                const t = state.list.find((x) => x.id === event.id);
                const ready = t && readyOf(t);
                if (ready && MODE === "banner" && !document.getElementById("tb-bar")) toast(t, ready);
            });
            return;
        }
        if (event?.type === "finished" && event.id) {
            const t = state.list.find((x) => x.id === event.id) || { id: event.id, name: event.name, visibility: "public" };
            const text = event.rank ? `Terminé : tu finis <em>#${fmt(event.rank)}</em>` : "Le tournoi est terminé";
            notice(`tb-end:${event.id}`, t, text, pageUrl(t), "Voir", false);
            schedule(200 + Math.random() * 3000);
            return;
        }
        if (event?.type === "points") {
            if (state.board && event.id === state.board.id && document.visibilityState === "visible" && !state.boardTimer) {
                state.boardTimer = setTimeout(() => {
                    state.boardTimer = 0;
                    loadBoard();
                }, 500 + Math.random() * 2500);
            }
            return;
        }
        schedule(200 + Math.random() * 3000);
    }

    async function start() {
        if (params.get("tournament") || params.get("spectate")) return;
        try {
            state.token = await window.BrainrotAuth?.waitUntilReady?.();
        } catch {
            return;
        }
        if (!state.token || !API || typeof window.apiFetch !== "function") return;
        injectStyle();
        window.BrainrotRealtime?.on?.("tournament", onEvent);
        window.BrainrotRealtime?.on?.("connect", () => {
            if (state.connected) {
                if (state.watching) window.BrainrotRealtime?.socket?.()?.emit("tn:watch", { id: state.watching });
                schedule(500 + Math.random() * 3000);
            }
            state.connected = true;
        });
        document.addEventListener("visibilitychange", () => {
            if (document.visibilityState === "visible" && Date.now() - state.at > 60_000) schedule(0);
        });
        await refresh();
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
    else start();
})();
