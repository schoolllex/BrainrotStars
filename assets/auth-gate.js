(() => {
    const API_BASE_URL = window.API_BASE_URL;
    const USER_ROUTE_BASE = "/user";
    const PRIMARY_TOKEN_KEY = "brainrot_token";
    const TOKEN_STORAGE_KEYS = ["brainrot_token", "token", "auth_token", "jwt_token", "jwt"];

    function getStoredToken() {
        for (const key of TOKEN_STORAGE_KEYS) {
            const token = localStorage.getItem(key);
            if (token) return token;
        }
        return "";
    }

    function saveToken(token) {
        localStorage.setItem(PRIMARY_TOKEN_KEY, token);
    }

    function clearStoredTokens() {
        for (const key of TOKEN_STORAGE_KEYS) {
            localStorage.removeItem(key);
        }
    }

    function getUrlToken() {
        const token = new URLSearchParams(window.location.search).get("token");
        return token ? token.trim() : "";
    }

    function redirectToPlayWeb() {
        window.location.replace("https://llextv.github.io/PlayWeb.front/index/index.html");
    }

    async function login(token) {
        const response = await apiFetch(`${API_BASE_URL}${USER_ROUTE_BASE}/login`, {
            method: "POST",
            headers: {
                Authorization: "Bearer " + token
            }
        });

        if (!response.ok) {
            const failure = await response.json().catch(() => null);
            return response.status === 403 && failure?.banned === true ? { banned: true } : null;
        }

        const payload = await response.json();
        return payload?.success === true ? payload : null;
    }

    const BANNED_STYLE = `
.pb-overlay{position:fixed;inset:0;z-index:2147483001;display:flex;align-items:center;justify-content:center;
  padding:16px;background:rgba(0,0,0,.78);font-family:'Inter',system-ui,-apple-system,"Segoe UI",sans-serif;color:#fff;
  touch-action:manipulation;animation:pb-in .25s ease-out}
@keyframes pb-in{from{opacity:0}to{opacity:1}}
.pb-card{width:min(420px,100%);background:#171717;border:1px solid rgba(255,255,255,.12);border-radius:22px;
  padding:22px 20px 20px;box-shadow:0 18px 48px rgba(0,0,0,.55);text-align:center}
.pb-card.pb-shake{animation:pb-shake .35s ease}
@keyframes pb-shake{0%,100%{transform:translateX(0)}25%{transform:translateX(-8px)}75%{transform:translateX(8px)}}
.pb-kicker{font-size:.72rem;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#ef4444}
.pb-title{margin:.35rem 0 .2rem;font-size:1.25rem;font-weight:800}
.pb-text{color:#a3a3a3;font-size:.92rem;line-height:1.45}
.pb-old{display:inline-block;margin-top:.7rem;padding:.35rem .8rem;border-radius:999px;max-width:100%;
  background:rgba(239,68,68,.12);border:1px solid rgba(239,68,68,.4);color:#fca5a5;font-weight:700;
  text-decoration:line-through;overflow-wrap:anywhere}
.pb-form{display:grid;gap:10px;margin-top:18px}
.pb-input{width:100%;padding:.75rem .9rem;border-radius:14px;border:1px solid rgba(255,255,255,.14);background:#0f0f0f;
  color:#fff;font:inherit;font-size:16px;font-weight:600;text-align:center;outline:none}
.pb-input:focus{border-color:rgba(249,115,22,.55);box-shadow:0 0 0 3px rgba(249,115,22,.15)}
.pb-hint{color:#737373;font-size:.78rem}
.pb-msg{min-height:1.3em;font-size:.85rem;font-weight:600;color:#fca5a5}
.pb-msg:empty{display:none}
.pb-btn{position:relative;display:flex;align-items:center;justify-content:center;gap:.6rem;min-height:64px;padding:1rem;
  border:none;border-bottom:4px solid #991b1b;border-radius:20px;background:linear-gradient(135deg,#f97316,#dc2626);color:#fff;
  font:inherit;font-size:1.15rem;font-weight:900;cursor:pointer;overflow:hidden;touch-action:manipulation;
  -webkit-tap-highlight-color:transparent;transition:transform .1s ease,filter .15s ease}
.pb-btn svg{flex:none;width:24px;height:24px}
.pb-btn:hover{filter:brightness(1.06)}
.pb-btn:active{transform:translateY(2px);border-bottom:0}
.pb-btn:disabled{filter:grayscale(.35) brightness(.8);cursor:default;transform:none;border-bottom:4px solid #991b1b}
.pb-btn:focus-visible{outline:2px solid rgba(249,115,22,.55);outline-offset:3px}
.pb-btn.is-done{filter:none}
.pb-shine{position:absolute;top:0;left:0;width:50%;height:100%;background:rgba(255,255,255,.2);
  transform:translateX(-200%) skewX(-25deg);pointer-events:none}
.pb-btn:hover .pb-shine,.pb-btn:focus-visible .pb-shine,.pb-btn.is-done .pb-shine{animation:pb-sweep .8s forwards}
@keyframes pb-sweep{to{transform:translateX(250%) skewX(-25deg)}}
html.pb-open,html.pb-open body{overflow:hidden}
`;

    function injectBannedStyle() {
        if (document.getElementById("pb-style")) return;
        const style = document.createElement("style");
        style.id = "pb-style";
        style.textContent = BANNED_STYLE;
        document.head.appendChild(style);
    }

    const BAN_REDIRECT_SECONDS = 8;

    function showBannedAccount() {
        clearStoredTokens();
        if (document.querySelector(".pb-account")) return;
        document.querySelector(".pb-overlay")?.remove();
        injectBannedStyle();

        const root = document.createElement("div");
        root.className = "pb-overlay pb-account";
        root.setAttribute("role", "alertdialog");
        root.setAttribute("aria-modal", "true");
        root.setAttribute("aria-labelledby", "pb-title");
        root.innerHTML = `
            <div class="pb-card">
                <div class="pb-kicker">Modération</div>
                <h2 class="pb-title" id="pb-title">Ton compte a été banni</h2>
                <p class="pb-text">Ton compte BrainrotStar a été supprimé par la modération. Pour rejouer, crée un nouveau compte sur PlayWeb.</p>
                <div class="pb-form">
                    <button class="pb-btn" type="button">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
                        <span class="pb-label">Aller sur PlayWeb</span>
                        <span class="pb-shine" aria-hidden="true"></span>
                    </button>
                    <div class="pb-hint" aria-live="polite"></div>
                </div>
            </div>`;

        const button = root.querySelector(".pb-btn");
        const hint = root.querySelector(".pb-hint");
        let left = BAN_REDIRECT_SECONDS;
        const tick = () => {
            if (left <= 0) {
                redirectToPlayWeb();
                return;
            }
            hint.textContent = `Redirection automatique dans ${left} s`;
            left -= 1;
        };
        button.addEventListener("click", redirectToPlayWeb);
        tick();
        setInterval(tick, 1000);

        document.documentElement.classList.add("pb-open");
        (document.body || document.documentElement).appendChild(root);
        button.focus();
    }

    function showBannedPseudo(oldPseudo, token) {
        if (document.querySelector(".pb-overlay")) return;

        injectBannedStyle();

        const root = document.createElement("div");
        root.className = "pb-overlay";
        root.setAttribute("role", "dialog");
        root.setAttribute("aria-modal", "true");
        root.setAttribute("aria-labelledby", "pb-title");
        root.innerHTML = `
            <div class="pb-card">
                <div class="pb-kicker">Modération</div>
                <h2 class="pb-title" id="pb-title">Ton pseudo a été banni</h2>
                <p class="pb-text">Ton ancien pseudo n'est plus autorisé. Choisis-en un nouveau pour continuer à jouer.</p>
                <div class="pb-old"></div>
                <form class="pb-form" novalidate>
                    <input class="pb-input" name="pseudo" type="text" minlength="3" maxlength="24" placeholder="Nouveau pseudo"
                        autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" aria-label="Nouveau pseudo" required>
                    <div class="pb-hint">Entre 3 et 24 caractères.</div>
                    <div class="pb-msg" aria-live="polite"></div>
                    <button class="pb-btn" type="submit">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>
                        <span class="pb-label">Valider mon pseudo</span>
                        <span class="pb-shine" aria-hidden="true"></span>
                    </button>
                </form>
            </div>`;

        const card = root.querySelector(".pb-card");
        const form = root.querySelector(".pb-form");
        const input = form.elements.pseudo;
        const message = root.querySelector(".pb-msg");
        const submit = root.querySelector(".pb-btn");
        root.querySelector(".pb-old").textContent = oldPseudo || "Pseudo banni";

        const fail = (text) => {
            message.textContent = text;
            card.classList.remove("pb-shake");
            void card.offsetWidth;
            card.classList.add("pb-shake");
        };

        card.addEventListener("animationend", () => card.classList.remove("pb-shake"));

        form.addEventListener("submit", async (event) => {
            event.preventDefault();
            const pseudo = input.value.trim();
            if (pseudo.length < 3 || pseudo.length > 24) {
                fail("Ton pseudo doit faire entre 3 et 24 caractères.");
                return;
            }

            submit.disabled = true;
            message.textContent = "";
            try {
                const response = await apiFetch(`${API_BASE_URL}${USER_ROUTE_BASE}/pseudo/rename`, {
                    method: "POST",
                    headers: {
                        Authorization: "Bearer " + token,
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({ pseudo })
                });
                const payload = await response.json().catch(() => null);
                if (!response.ok || !payload?.success) {
                    fail(payload?.message || "Impossible de changer ton pseudo pour le moment.");
                    submit.disabled = false;
                    return;
                }
                submit.querySelector(".pb-label").textContent = "Pseudo changé !";
                submit.classList.add("is-done");
                setTimeout(() => window.location.reload(), 700);
            } catch {
                fail("Serveur injoignable. Réessaie dans un instant.");
                submit.disabled = false;
            }
        });

        document.documentElement.classList.add("pb-open");
        document.body.appendChild(root);
        input.focus();
    }

    let authReadyToken = "";
    let authReadyPromise = null;

    function resolveAuth(token) {
        authReadyToken = token || "";
        document.dispatchEvent(new CustomEvent("brainrot:auth-ready", {
            detail: { token: authReadyToken }
        }));
    }

    async function ensureAuthReady() {
        const urlToken = getUrlToken();
        const token = urlToken || getStoredToken();

        if (!token) {
            redirectToPlayWeb();
            resolveAuth("");
            return "";
        }

        if (urlToken) {
            saveToken(urlToken);
        }

        const session = await login(token);
        if (session?.banned) {
            if (urlToken) {
                window.history.replaceState({}, document.title, window.location.pathname);
            }
            showBannedAccount();
            resolveAuth("");
            return "";
        }

        if (session) {
            if (urlToken) {
                window.history.replaceState({}, document.title, window.location.pathname);
            }
            window.BrainrotRealtime?.on?.("banned", showBannedAccount);
            resolveAuth(token);
            if (session.pseudoBanned) showBannedPseudo(session.user?.pseudo || "", token);
            return token;
        }

        if (token) {
            clearStoredTokens();
        }

        redirectToPlayWeb();
        resolveAuth("");
        return "";
    }

    window.BrainrotAuth = {
        getToken() {
            return authReadyToken || getStoredToken();
        },

        waitUntilReady() {
            if (authReadyPromise) return authReadyPromise;

            authReadyPromise = ensureAuthReady().catch((error) => {
                console.error("Initialisation automatique de l'authentification impossible :", error);
                resolveAuth("");
                return "";
            });

            return authReadyPromise;
        }
    };

    document.addEventListener("DOMContentLoaded", () => {
        window.BrainrotAuth.waitUntilReady();
    });
})();
