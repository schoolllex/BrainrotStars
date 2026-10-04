/**
 * Connexion temps reel unique du joueur.
 * ---------------------------------------------------------------------------
 * Chaque page ouvre UNE socket (socket.io) des l'entree dans le jeu, et tout
 * passe dedans : appels d'API, notifications, matchmaking, combat. Seule la
 * poignee de main traverse le proxy comme une requete ; ensuite ce ne sont
 * plus que des trames sur une connexion deja ouverte.
 *
 *   apiFetch(url, init)           meme usage et meme retour (Response) que
 *                                 fetch. Les URL de l'API partent par la
 *                                 socket, les autres par fetch.
 *   BrainrotRealtime.on(evt, fn)  evenement pousse par le serveur.
 *   BrainrotRealtime.socket()     la socket elle-meme (combat).
 *
 * La socket annonce aussi la page ouverte et, a chaque changement, si le
 * joueur est la (onglet visible, une interaction depuis moins de 2 min) :
 * le serveur en tire le temps de jeu et les pages vues du panneau admin.
 *
 * Si la socket reste injoignable quelques secondes, les requetes repartent en
 * HTTP classique : le jeu continue de fonctionner, simplement plus cher.
 */
(() => {
    "use strict";

    const API = String(window.API_BASE_URL || "").replace(/\/+$/, "");
    const WS_URL = window.WS_URL || API;
    /** Attente maximale d'une connexion avant de repasser en HTTP. */
    const CONNECT_WAIT_MS = 8000;
    const REQUEST_TIMEOUT_MS = 25000;
    const TOKEN_KEYS = ["brainrot_token", "token", "auth_token", "jwt_token", "jwt"];
    const NULL_BODY_STATUS = new Set([204, 205, 304]);
    /** Sans interaction pendant ce delai, le joueur ne compte plus comme actif. */
    const IDLE_AFTER_MS = 120000;
    const PRESENCE_CHECK_MS = 15000;

    /** Page du jeu : "shop" pour .../shop/shop.html. */
    const PAGE = (() => {
        const file = location.pathname.split("/").filter(Boolean).pop() || "index";
        return file.replace(/\.html?$/i, "").toLowerCase().replace(/[^a-z]/g, "").slice(0, 16) || "index";
    })();

    const nativeFetch = window.fetch.bind(window);

    let socket = null;
    /** Debut de la coupure en cours (null : connecte). */
    let downSince = Date.now();
    const waiters = new Set();

    let connectedOnce = false;
    let lastActivityAt = Date.now();
    /** Etat d'activite deja annonce au serveur (null : rien d'annonce). */
    let reportedActive = null;
    let handshakeActive = true;

    function currentToken() {
        try {
            const token = window.BrainrotAuth?.getToken?.();
            if (token) return token;
        } catch { /* auth-gate pas encore charge */ }
        try {
            const urlToken = new URLSearchParams(location.search).get("token");
            if (urlToken) return urlToken.trim();
            for (const key of TOKEN_KEYS) {
                const value = localStorage.getItem(key);
                if (value) return value;
            }
        } catch { /* stockage indisponible */ }
        return "";
    }

    function ensureSocket() {
        if (socket) return socket;
        if (typeof window.io !== "function" || !API || !currentToken()) return null;

        downSince = Date.now();
        socket = window.io(WS_URL, {
            path: "/socket.io",
            // Relu a chaque reconnexion : le jeton a pu etre remplace. Une
            // reconnexion ne compte pas une nouvelle vue de la page.
            auth: (cb) => {
                handshakeActive = isActive();
                cb({ token: currentToken(), page: PAGE, fresh: connectedOnce ? 0 : 1, a: handshakeActive ? 1 : 0 });
            },
            transports: ["websocket", "polling"],
            // WebSocket d'abord ; le polling (une requete par message) n'est
            // qu'un repli pour les reseaux qui coupent les WebSockets.
            tryAllTransports: true,
            reconnection: true,
            reconnectionAttempts: Infinity,
            reconnectionDelay: 500,
            reconnectionDelayMax: 5000,
            timeout: 10000
        });

        socket.on("connect", () => {
            downSince = null;
            connectedOnce = true;
            reportedActive = handshakeActive;
            reportPresence();
            for (const done of waiters) done(true);
            waiters.clear();
        });
        socket.on("disconnect", () => {
            if (downSince === null) downSince = Date.now();
        });
        socket.on("connect_error", (err) => {
            console.warn("[realtime] connexion impossible :", err?.message || err);
        });
        return socket;
    }

    // --- Presence (temps de jeu) -----------------------------------------------

    function isActive() {
        return document.visibilityState !== "hidden" && Date.now() - lastActivityAt < IDLE_AFTER_MS;
    }

    /** N'emet qu'aux changements d'etat : quelques trames par session. */
    function reportPresence() {
        if (!socket || !socket.connected) return;
        const active = isActive();
        if (active === reportedActive) return;
        reportedActive = active;
        socket.emit("pr", { a: active ? 1 : 0 });
    }

    function markActivity() {
        lastActivityAt = Date.now();
        if (reportedActive === false) reportPresence();
    }

    ["pointerdown", "keydown", "wheel", "touchstart"].forEach((type) => {
        document.addEventListener(type, markActivity, { passive: true, capture: true });
    });
    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState !== "hidden") lastActivityAt = Date.now();
        reportPresence();
    });
    // Seul moyen de voir le joueur devenir inactif sans interaction : un test
    // toutes les 15 s (aucune trame tant que l'etat ne change pas).
    setInterval(reportPresence, PRESENCE_CHECK_MS);

    // Page quittee : le navigateur peut garder la socket ouverte encore un
    // moment (cache precedent/suivant, delai du ping). On previent le serveur
    // tout de suite, sans fermer la socket : le combat y envoie son 'leave'.
    function onPageHide() {
        reportedActive = false;
        if (socket && socket.connected) socket.emit("pr", { a: 0, g: 1 });
    }
    // Page restauree depuis le cache : elle compte de nouveau.
    window.addEventListener("pageshow", (event) => {
        if (!event.persisted || !socket || !socket.connected) return;
        lastActivityAt = Date.now();
        reportedActive = isActive();
        socket.emit("pr", { a: reportedActive ? 1 : 0, g: 0 });
    });
    // Inscrit apres les scripts de la page, pour passer apres leurs propres
    // envois de fin de page (abandon de combat, sortie de file).
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", () => window.addEventListener("pagehide", onPageHide));
    } else {
        window.addEventListener("pagehide", onPageHide);
    }

    /** true des que la socket est connectee, false si la coupure dure trop. */
    function waitConnected(s) {
        if (s.connected) return Promise.resolve(true);
        const left = (downSince ?? Date.now()) + CONNECT_WAIT_MS - Date.now();
        if (left <= 0) return Promise.resolve(false);
        return new Promise((resolve) => {
            const done = (ok) => {
                clearTimeout(timer);
                waiters.delete(done);
                resolve(ok);
            };
            const timer = setTimeout(() => done(false), left);
            waiters.add(done);
        });
    }

    function abortError() {
        return new DOMException("The operation was aborted.", "AbortError");
    }

    function toResponse(res) {
        const status = Number(res?.s);
        if (!Number.isInteger(status) || status < 200 || status > 599) {
            return new Response(JSON.stringify({ success: false, message: "Reponse invalide" }), {
                status: 502,
                headers: { "content-type": "application/json" }
            });
        }
        return new Response(NULL_BODY_STATUS.has(status) ? null : String(res.b ?? ""), {
            status,
            headers: res.t ? { "content-type": res.t } : {}
        });
    }

    /** fetch, mais par la socket pour les URL de l'API. */
    async function apiFetch(input, init = {}) {
        const url = typeof input === "string" ? input : input instanceof URL ? input.href : "";
        const body = init.body;
        if (!url || !url.startsWith(API + "/") || (body != null && typeof body !== "string")) {
            return nativeFetch(input, init);
        }

        const signal = init.signal;
        if (signal?.aborted) throw abortError();

        const s = ensureSocket();
        if (!s || !(await waitConnected(s))) return nativeFetch(input, init);
        if (signal?.aborted) throw abortError();

        const headers = new Headers(init.headers || {});
        const h = {};
        if (headers.has("authorization")) h.authorization = headers.get("authorization");
        if (headers.has("content-type")) h["content-type"] = headers.get("content-type");

        const request = {
            m: String(init.method || "GET").toUpperCase(),
            p: url.slice(API.length),
            b: body == null ? undefined : body,
            h
        };

        return new Promise((resolve, reject) => {
            let settled = false;
            const onAbort = () => {
                if (settled) return;
                settled = true;
                reject(abortError());
            };
            signal?.addEventListener("abort", onAbort, { once: true });

            // Une requete partie n'est jamais rejouee en HTTP : un achat ou
            // une attaque pourrait etre execute deux fois.
            s.timeout(REQUEST_TIMEOUT_MS).emit("rq", request, (err, res) => {
                signal?.removeEventListener("abort", onAbort);
                if (settled) return;
                settled = true;
                if (err) reject(new TypeError("Failed to fetch"));
                else resolve(toResponse(res));
            });
        });
    }

    window.apiFetch = apiFetch;
    window.BrainrotRealtime = {
        fetch: apiFetch,
        socket: ensureSocket,
        on(event, handler) {
            const s = ensureSocket();
            if (s) s.on(event, handler);
            return s;
        },
        off(event, handler) {
            socket?.off(event, handler);
        }
    };
})();
