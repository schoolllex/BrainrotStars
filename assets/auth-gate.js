(() => {
    const API_BASE_URL = "https://darkgoldenrod-frog-258465.hostingersite.com";
    const USER_ROUTE_BASE = "/user";
    const PRIMARY_TOKEN_KEY = "brainrot_token";
    const TOKEN_STORAGE_KEYS = ["brainrot_token", "token", "auth_token", "jwt_token", "jwt"];

    function getAuthToken() {
        for (const key of TOKEN_STORAGE_KEYS) {
            const token = localStorage.getItem(key);
            if (token) return token;
        }
        return "";
    }

    function saveAuthToken(token) {
        localStorage.setItem(PRIMARY_TOKEN_KEY, token);
    }

    function clearAuthTokens() {
        for (const key of TOKEN_STORAGE_KEYS) {
            localStorage.removeItem(key);
        }
    }

    async function registerGuest() {
        const response = await fetch(`${API_BASE_URL}${USER_ROUTE_BASE}/register`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "{}"
        });
        if (!response.ok) throw new Error(`register failed (${response.status})`);
        const payload = await response.json();
        const token = payload?.token ? String(payload.token) : "";
        if (!token) throw new Error("register token missing");
        return token;
    }

    async function loginWithToken(token) {
        const response = await fetch(`${API_BASE_URL}${USER_ROUTE_BASE}/login`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${token}`
            }
        });
        if (response.status === 401) return { ok: false, unauthorized: true };
        if (!response.ok) return { ok: false, unauthorized: false };
        const payload = await response.json();
        return { ok: Boolean(payload?.success), unauthorized: false };
    }

    async function deleteCurrentUser(token) {
        const response = await fetch(`${API_BASE_URL}${USER_ROUTE_BASE}`, {
            method: "DELETE",
            headers: {
                Authorization: `Bearer ${token}`
            }
        });
        return response.ok;
    }

    function ensureStyles() {
        if (document.getElementById("auth-gate-style")) return;
        const style = document.createElement("style");
        style.id = "auth-gate-style";
        style.textContent = `
            .auth-gate-overlay {
                position: fixed;
                inset: 0;
                z-index: 12000;
                background: rgba(0, 0, 0, 0.78);
                display: grid;
                place-items: center;
                padding: 1rem;
            }
            .auth-gate-card {
                width: min(620px, 100%);
                border-radius: 22px;
                border: 1px solid rgba(249, 115, 22, 0.6);
                background: linear-gradient(180deg, rgba(31, 23, 23, 0.96), rgba(20, 17, 17, 0.96));
                box-shadow: 0 28px 56px rgba(0, 0, 0, 0.52);
                padding: 1.2rem 1.1rem 1.1rem;
            }
            .auth-gate-title {
                font-size: 1.4rem;
                font-weight: 900;
                margin-bottom: 0.35rem;
            }
            .auth-gate-subtitle {
                color: var(--text-muted);
                font-size: 0.92rem;
                margin-bottom: 0.95rem;
            }
            .auth-gate-input {
                width: 100%;
                border: 1px solid rgba(249, 115, 22, 0.42);
                background: rgba(255, 255, 255, 0.04);
                color: #fff;
                border-radius: 14px;
                min-height: 46px;
                padding: 0.75rem 0.9rem;
                font-size: 0.95rem;
                outline: none;
            }
            .auth-gate-input:focus {
                border-color: #fb923c;
                box-shadow: 0 0 0 3px rgba(249, 115, 22, 0.18);
            }
            .auth-gate-login-btn,
            .auth-gate-continue-btn {
                width: 100%;
                border: 1px solid transparent;
                border-radius: 14px;
                min-height: 46px;
                font-weight: 900;
                cursor: pointer;
                margin-top: 0.7rem;
                color: #fff;
            }
            .auth-gate-login-btn {
                background: linear-gradient(135deg, #f97316, #dc2626);
                box-shadow: 0 12px 24px rgba(249, 115, 22, 0.24);
            }
            .auth-gate-sep {
                text-align: center;
                margin: 0.95rem 0 0.8rem;
                color: #cfcfcf;
                font-weight: 700;
            }
            .auth-gate-token-wrap {
                border: 1px solid rgba(255, 255, 255, 0.14);
                border-radius: 14px;
                background: rgba(255, 255, 255, 0.03);
                padding: 0.75rem;
            }
            .auth-gate-token-head {
                font-size: 0.88rem;
                color: #e5e5e5;
                margin-bottom: 0.55rem;
                font-weight: 700;
            }
            .auth-gate-token-row {
                display: grid;
                grid-template-columns: 1fr auto;
                gap: 0.55rem;
                align-items: center;
            }
            .auth-gate-token-value {
                width: 100%;
                border: 1px solid rgba(255, 255, 255, 0.14);
                background: rgba(0, 0, 0, 0.26);
                color: #f8fafc;
                border-radius: 10px;
                padding: 0.58rem 0.65rem;
                font-size: 0.78rem;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
                font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
            }
            .auth-gate-copy-btn {
                border: 1px solid rgba(56, 189, 248, 0.62);
                background: linear-gradient(135deg, rgba(56, 189, 248, 0.24), rgba(37, 99, 235, 0.2));
                color: #e0f2fe;
                border-radius: 10px;
                min-height: 38px;
                padding: 0.4rem 0.8rem;
                font-weight: 800;
                cursor: pointer;
            }
            .auth-gate-continue-btn {
                margin-top: 0.85rem;
                border-color: rgba(34, 197, 94, 0.7);
                background: linear-gradient(135deg, rgba(34, 197, 94, 0.34), rgba(22, 163, 74, 0.25));
                color: #dcfce7;
                box-shadow: 0 12px 24px rgba(34, 197, 94, 0.2);
            }
            .auth-gate-warn {
                margin-top: 0.6rem;
                color: #fca5a5;
                font-size: 0.82rem;
                line-height: 1.4;
            }
            .auth-gate-feedback {
                margin-top: 0.6rem;
                min-height: 1.1rem;
                color: #fda4af;
                font-size: 0.86rem;
                font-weight: 700;
            }
            body.auth-gate-open {
                overflow: hidden !important;
            }
            @media (max-width: 560px) {
                .auth-gate-card {
                    padding: 1rem 0.9rem;
                    border-radius: 18px;
                }
                .auth-gate-title {
                    font-size: 1.2rem;
                }
                .auth-gate-token-row {
                    grid-template-columns: 1fr;
                }
            }
        `;
        document.head.appendChild(style);
    }

    function buildModal(tempToken) {
        const overlay = document.createElement("div");
        overlay.id = "auth-gate-overlay";
        overlay.className = "auth-gate-overlay";
        overlay.setAttribute("role", "dialog");
        overlay.setAttribute("aria-modal", "true");
        overlay.innerHTML = `
            <div class="auth-gate-card">
                <h2 class="auth-gate-title">Connexion</h2>
                <p class="auth-gate-subtitle">Entre votre identifiant de connexion pour vous connecter.</p>
                <input id="auth-gate-input" class="auth-gate-input" type="text" placeholder="Votre identifiant de connexion" autocomplete="off">
                <button id="auth-gate-login-btn" class="auth-gate-login-btn" type="button">Se connecter</button>
                <p class="auth-gate-sep">Ou</p>
                <div class="auth-gate-token-wrap">
                    <div class="auth-gate-token-head">Voici votre identifiant de connexion :</div>
                    <div class="auth-gate-token-row">
                        <div id="auth-gate-token-value" class="auth-gate-token-value">${tempToken}</div>
                        <button id="auth-gate-copy-btn" class="auth-gate-copy-btn" type="button">Copier</button>
                    </div>
                    <p class="auth-gate-warn">Merci de ne pas diffuser votre identifiant, n'importe quelle personne possedant votre identifiant peut se connecter a votre compte.</p>
                </div>
                <button id="auth-gate-continue-btn" class="auth-gate-continue-btn" type="button">Continuer</button>
                <p id="auth-gate-feedback" class="auth-gate-feedback" aria-live="polite"></p>
            </div>
        `;
        return overlay;
    }

    function setFeedback(node, text, success) {
        node.textContent = text;
        node.style.color = success ? "#86efac" : "#fda4af";
    }

    async function openAuthGate() {
        const tempToken = await registerGuest();
        ensureStyles();
        const overlay = buildModal(tempToken);
        document.body.appendChild(overlay);
        document.body.classList.add("auth-gate-open");
        const input = overlay.querySelector("#auth-gate-input");
        const loginBtn = overlay.querySelector("#auth-gate-login-btn");
        const copyBtn = overlay.querySelector("#auth-gate-copy-btn");
        const continueBtn = overlay.querySelector("#auth-gate-continue-btn");
        const feedback = overlay.querySelector("#auth-gate-feedback");
        input.focus();

        return await new Promise((resolve) => {
            async function closeWithToken(token) {
                saveAuthToken(token);
                overlay.remove();
                document.body.classList.remove("auth-gate-open");
                resolve(token);
            }

            copyBtn.addEventListener("click", async () => {
                try {
                    await navigator.clipboard.writeText(tempToken);
                    setFeedback(feedback, "Identifiant copié ✅", true);
                } catch {
                    setFeedback(feedback, "Impossible de copier automatiquement.", false);
                }
            });

            continueBtn.addEventListener("click", async () => {
                await closeWithToken(tempToken);
            });

            async function tryLogin() {
                const typedToken = String(input.value || "").trim();
                if (!typedToken) {
                    setFeedback(feedback, "Entre un identifiant valide.", false);
                    return;
                }
                loginBtn.disabled = true;
                const login = await loginWithToken(typedToken);
                loginBtn.disabled = false;
                if (!login.ok) {
                    setFeedback(feedback, "Identifiant invalide ou expiré.", false);
                    return;
                }
                const deleted = await deleteCurrentUser(tempToken);
                if (!deleted) {
                    console.warn("Suppression du compte temporaire indisponible (route backend non active).");
                }
                await closeWithToken(typedToken);
            }

            loginBtn.addEventListener("click", tryLogin);
            input.addEventListener("keydown", async (event) => {
                if (event.key === "Enter") {
                    event.preventDefault();
                    await tryLogin();
                }
            });
        });
    }

    let authReadyToken = "";
    let authReadyResolved = false;
    let authReadyPromise = null;

    function resolveAuth(token) {
        authReadyToken = token || "";
        authReadyResolved = true;
        document.dispatchEvent(new CustomEvent("brainrot:auth-ready", { detail: { token: authReadyToken } }));
    }

    async function ensureAuthReady() {
        const existing = getAuthToken();
        if (existing) {
            const login = await loginWithToken(existing);
            if (login.ok) {
                resolveAuth(existing);
                return existing;
            }
            clearAuthTokens();
        }
        const selectedToken = await openAuthGate();
        resolveAuth(selectedToken);
        return selectedToken;
    }

    window.BrainrotAuth = {
        getToken() {
            return authReadyToken || getAuthToken();
        },
        waitUntilReady() {
            if (authReadyResolved) return Promise.resolve(authReadyToken);
            if (authReadyPromise) return authReadyPromise;
            authReadyPromise = new Promise((resolve) => {
                document.addEventListener("brainrot:auth-ready", (event) => resolve(event.detail.token || ""), { once: true });
            });
            return authReadyPromise;
        }
    };

    document.addEventListener("DOMContentLoaded", () => {
        authReadyPromise = ensureAuthReady().catch((error) => {
            console.error("Auth gate error:", error);
            clearAuthTokens();
            resolveAuth("");
            return "";
        });
    });
})();
