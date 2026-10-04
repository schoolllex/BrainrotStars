/**
 * Verification anti-macro de la boutique.
 * ---------------------------------------------------------------------------
 * Toutes les 8 a 12 minutes passees sur la boutique, le serveur demande au
 * joueur de cliquer sur un symbole parmi plusieurs, places au hasard : un
 * autoclicker qui tape toujours au meme endroit echoue. Tant que ce n'est pas
 * fait, ouvrir ou acheter des caisses est refuse cote serveur (reponse 428).
 *
 * Charge uniquement par la boutique. Ce script :
 *   - affiche la verification poussee par la socket (evenement "ac") ;
 *   - enveloppe apiFetch : une requete refusee en 428 affiche la
 *     verification puis repart toute seule une fois celle-ci reussie, les
 *     pages n'ont rien a gerer.
 *
 * A charger apres realtime.js et auth-gate.js.
 */
(() => {
    "use strict";

    if (window.BrainrotAntiCheat || typeof window.apiFetch !== "function") return;

    const API = String(window.API_BASE_URL || "").replace(/\/+$/, "");
    const CELLS = 9;
    const baseFetch = window.apiFetch;

    let current = null;
    let busy = false;
    let misses = 0;
    let lockTimer = null;
    let root = null;
    let ui = null;
    const waiters = [];

    function token() {
        try {
            const t = window.BrainrotAuth?.getToken?.();
            if (t) return t;
        } catch { /* auth-gate absent */ }
        try {
            return localStorage.getItem("brainrot_token") || localStorage.getItem("token") || "";
        } catch {
            return "";
        }
    }

    // --- Fenetre -------------------------------------------------------------

    const STYLE = `
.ac-overlay{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;
  padding:16px;background:rgba(0,0,0,.78);font-family:system-ui,-apple-system,"Segoe UI",sans-serif;color:#fff;
  -webkit-user-select:none;user-select:none;touch-action:manipulation}
.ac-overlay[hidden]{display:none}
.ac-card{width:min(420px,100%);background:#171717;border:1px solid rgba(255,255,255,.12);border-radius:22px;
  padding:22px 20px 18px;box-shadow:0 18px 48px rgba(0,0,0,.55);text-align:center}
.ac-card.ac-shake{animation:ac-shake .35s ease}
@keyframes ac-shake{0%,100%{transform:translateX(0)}25%{transform:translateX(-8px)}75%{transform:translateX(8px)}}
.ac-kicker{font-size:.72rem;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#f97316}
.ac-title{margin:.35rem 0 .2rem;font-size:1.25rem;font-weight:800}
.ac-text{color:#a3a3a3;font-size:.92rem;line-height:1.4}
.ac-target{display:inline-flex;align-items:center;gap:.4rem;margin-top:.7rem;padding:.35rem .8rem;border-radius:999px;
  background:rgba(249,115,22,.14);border:1px solid rgba(249,115,22,.35);font-weight:700}
.ac-target b{font-size:1.5rem;line-height:1}
.ac-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:18px auto 6px;max-width:300px}
.ac-cell{aspect-ratio:1;border-radius:16px;background:rgba(255,255,255,.03)}
.ac-btn{aspect-ratio:1;border-radius:16px;border:1px solid rgba(255,255,255,.14);background:linear-gradient(180deg,#262626,#1c1c1c);
  font-size:2.2rem;line-height:1;cursor:pointer;color:#fff;transition:transform .12s ease}
.ac-btn:active{transform:scale(.94)}
.ac-btn:disabled{opacity:.4;cursor:default}
.ac-msg{min-height:1.3em;margin-top:8px;font-size:.85rem;font-weight:600;color:#fca5a5}
html.ac-open,html.ac-open body{overflow:hidden}
`;

    function ensureDom() {
        if (root) return;
        const style = document.createElement("style");
        style.textContent = STYLE;
        document.head.appendChild(style);

        root = document.createElement("div");
        root.className = "ac-overlay";
        root.hidden = true;
        root.setAttribute("role", "dialog");
        root.setAttribute("aria-modal", "true");
        root.setAttribute("aria-labelledby", "ac-title");
        root.innerHTML = `
            <div class="ac-card">
                <div class="ac-kicker">Anti-macro</div>
                <h2 class="ac-title" id="ac-title">Es-tu bien là ?</h2>
                <p class="ac-text">Clique sur le bon symbole pour continuer à jouer.</p>
                <div class="ac-target">Clique sur <b></b> <span></span></div>
                <div class="ac-grid"></div>
                <div class="ac-msg" aria-live="polite"></div>
            </div>`;
        ui = {
            card: root.querySelector(".ac-card"),
            targetEmoji: root.querySelector(".ac-target b"),
            targetLabel: root.querySelector(".ac-target span"),
            grid: root.querySelector(".ac-grid"),
            msg: root.querySelector(".ac-msg")
        };

        // Clic a cote des boutons : un autoclicker mal place se repere vite.
        root.addEventListener("pointerdown", (event) => {
            if (!event.target.closest?.(".ac-btn")) misses++;
        });
        ui.grid.addEventListener("click", (event) => {
            const btn = event.target.closest?.(".ac-btn");
            if (!btn || btn.disabled) return;
            answer(Number(btn.dataset.i), event.isTrusted);
        });
        ui.card.addEventListener("animationend", () => ui.card.classList.remove("ac-shake"));
        document.body.appendChild(root);
    }

    function shuffledCells(count) {
        const cells = Array.from({ length: CELLS }, (_, i) => i);
        for (let i = cells.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [cells[i], cells[j]] = [cells[j], cells[i]];
        }
        return cells.slice(0, count);
    }

    function render(message) {
        ensureDom();
        ui.targetEmoji.textContent = current.target;
        ui.targetLabel.textContent = `(${current.label})`;

        // Chaque option sur une case tiree au hasard : jamais deux fois au meme endroit.
        const slots = shuffledCells(current.options.length);
        const layout = new Array(CELLS).fill(null);
        slots.forEach((cell, i) => { layout[cell] = i; });
        ui.grid.textContent = "";
        for (const option of layout) {
            if (option === null) {
                const empty = document.createElement("div");
                empty.className = "ac-cell";
                ui.grid.appendChild(empty);
                continue;
            }
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "ac-btn";
            btn.dataset.i = String(option);
            btn.textContent = current.options[option];
            btn.setAttribute("aria-label", current.options[option]);
            ui.grid.appendChild(btn);
        }

        ui.msg.textContent = message || "";
        root.hidden = false;
        document.documentElement.classList.add("ac-open");
        applyLock();
    }

    function setButtonsDisabled(disabled) {
        if (!ui) return;
        ui.grid.querySelectorAll(".ac-btn").forEach((btn) => { btn.disabled = disabled; });
    }

    /** Blocage apres plusieurs erreurs : compte a rebours, boutons inactifs. */
    function applyLock() {
        clearInterval(lockTimer);
        lockTimer = null;
        const until = Date.now() + (current?.lockedForMs || 0);
        const tick = () => {
            const left = Math.ceil((until - Date.now()) / 1000);
            if (left > 0 && current) {
                setButtonsDisabled(true);
                ui.msg.textContent = `Trop d'erreurs : réessaie dans ${left} s.`;
                return;
            }
            clearInterval(lockTimer);
            lockTimer = null;
            if (current && !busy) {
                setButtonsDisabled(false);
                if (ui.msg.textContent.startsWith("Trop d'erreurs")) ui.msg.textContent = "";
            }
        };
        if (until > Date.now()) {
            tick();
            lockTimer = setInterval(tick, 1000);
        } else {
            setButtonsDisabled(busy);
        }
    }

    function show(challenge, message) {
        if (!challenge || typeof challenge.id !== "string" || !Array.isArray(challenge.options)) return;
        if (current && current.id === challenge.id && root && !root.hidden) return;
        current = challenge;
        misses = 0;
        render(message);
    }

    function hide() {
        current = null;
        clearInterval(lockTimer);
        lockTimer = null;
        if (root) root.hidden = true;
        document.documentElement.classList.remove("ac-open");
        while (waiters.length) waiters.shift()();
    }

    /** Se resout quand plus aucune verification n'attend. */
    function whenClear() {
        if (!current) return Promise.resolve();
        return new Promise((resolve) => waiters.push(resolve));
    }

    async function answer(pick, trusted) {
        if (busy || !current) return;
        busy = true;
        setButtonsDisabled(true);
        const challenge = current;
        try {
            const res = await baseFetch(`${API}/user/human-check`, {
                method: "POST",
                headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
                body: JSON.stringify({ id: challenge.id, pick, miss: misses, t: trusted ? 1 : 0 })
            });
            const payload = await res.json().catch(() => null);
            busy = false;
            if (payload?.success) {
                hide();
                return;
            }
            if (payload?.humanCheck) {
                const next = payload.humanCheck;
                const message = payload.message || "Raté, réessaie.";
                if (current && current.id === next.id && !root.hidden) {
                    // Deja affichee par la socket, plus rapide que la reponse.
                    current = next;
                    ui.msg.textContent = message;
                    applyLock();
                } else {
                    current = null;
                    show(next, message);
                }
                if (next.id !== challenge.id) ui.card.classList.add("ac-shake");
                return;
            }
            ui.msg.textContent = "Impossible de vérifier, réessaie.";
            setButtonsDisabled(false);
        } catch {
            busy = false;
            if (current) {
                ui.msg.textContent = "Connexion perdue, réessaie.";
                setButtonsDisabled(false);
            }
        }
    }

    // --- Requetes refusees en 428 ---------------------------------------------

    async function guardedFetch(input, init) {
        const res = await baseFetch(input, init);
        if (res.status !== 428) return res;
        let payload = null;
        try {
            payload = await res.clone().json();
        } catch { /* pas du JSON : on rend la reponse telle quelle */ }
        if (!payload?.humanCheck) return res;

        show(payload.humanCheck);
        await whenClear();
        // Refusee avant execution : la renvoyer ne peut rien doubler.
        return baseFetch(input, init);
    }

    window.apiFetch = guardedFetch;

    // --- Verifications poussees par le serveur ----------------------------------

    async function subscribe() {
        try {
            await window.BrainrotAuth?.waitUntilReady?.();
        } catch { /* la page gere deja l'echec d'authentification */ }
        const realtime = window.BrainrotRealtime;
        const socket = realtime?.on("ac", (challenge) => show(challenge));
        if (!socket) return;
        realtime.on("ac:ok", (payload) => {
            if (current && (!payload || payload.id === current.id)) hide();
        });
        // Une verification emise avant que l'ecouteur existe serait perdue.
        const sync = () => socket.emit("ac:sync", null, (challenge) => { if (challenge) show(challenge); });
        socket.on("connect", sync);
        if (socket.connected) sync();
    }

    window.BrainrotAntiCheat = { show, whenClear };

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", subscribe);
    } else {
        subscribe();
    }
})();
