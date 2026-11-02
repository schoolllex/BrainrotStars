(() => {
    "use strict";

    const SCRIPT = document.currentScript;
    const PREVIEW_ONLY = !!SCRIPT && SCRIPT.hasAttribute("data-preview-only");
    const API = String(window.API_BASE_URL || "").replace(/\/+$/, "");

    const THEMES = {
        flame: { name: "Brasier", a: "#f97316", b: "#dc2626", edge: "#991b1b", tint: "#fdba74", glow: "249,115,22", ink: "#ffffff" },
        gold: { name: "Or", a: "#fde047", b: "#f59e0b", edge: "#b45309", tint: "#fde68a", glow: "250,204,21", ink: "#1c1917" },
        violet: { name: "Mystique", a: "#a855f7", b: "#6366f1", edge: "#4338ca", tint: "#d8b4fe", glow: "168,85,247", ink: "#ffffff" },
        ocean: { name: "Océan", a: "#38bdf8", b: "#2563eb", edge: "#1e40af", tint: "#bae6fd", glow: "56,189,248", ink: "#ffffff" },
        toxic: { name: "Toxique", a: "#bef264", b: "#22c55e", edge: "#15803d", tint: "#d9f99d", glow: "163,230,53", ink: "#052e16" },
        pink: { name: "Bonbon", a: "#f472b6", b: "#db2777", edge: "#9d174d", tint: "#fbcfe8", glow: "244,114,182", ink: "#ffffff" }
    };

    const LINKS = {
        index: ["Accueil", "index/index.html"],
        shop: ["Boutique", "shop/shop.html"],
        village: ["Villaggio", "village/village.html"],
        ranking: ["Classement", "ranking/ranking.html"],
        battlepass: ["Passe de combat", "battlepass/battlepass.html"],
        ah: ["Marché", "ah/ah.html"],
        collection: ["Collection", "collection/collection.html"],
        achievements: ["Succès", "achievements/achievements.html"]
    };

    const STYLE = `
.an-overlay{position:fixed;inset:0;z-index:2147482000;display:flex;align-items:center;justify-content:center;padding:16px;
  background:rgba(0,0,0,.74);font-family:'Inter',system-ui,-apple-system,"Segoe UI",sans-serif;color:#fff;
  -webkit-tap-highlight-color:transparent;animation:an-fade .2s ease-out}
.an-overlay.an-out{animation:an-fade-out .18s ease-in forwards}
@keyframes an-fade{from{opacity:0}to{opacity:1}}
@keyframes an-fade-out{to{opacity:0}}
.an-card{position:relative;width:min(440px,100%);max-height:calc(100vh - 32px);max-height:calc(100dvh - 32px);overflow:auto;
  overscroll-behavior:contain;border-radius:26px;background:linear-gradient(180deg,#1b1b1b 0%,#101010 100%);
  border:1px solid rgba(var(--an-glow),.42);box-shadow:0 24px 64px rgba(0,0,0,.6),0 0 40px rgba(var(--an-glow),.12);
  text-align:center;color:#fff;font-family:'Inter',system-ui,-apple-system,"Segoe UI",sans-serif;scrollbar-width:thin}
.an-overlay .an-card{animation:an-pop .42s cubic-bezier(.175,.885,.32,1.275)}
.an-card:focus{outline:none}
@keyframes an-pop{from{transform:translateY(18px) scale(.9);opacity:0}to{transform:none;opacity:1}}
.an-hero{position:relative;height:104px;border-radius:25px 25px 0 0;overflow:hidden;
  background:radial-gradient(120% 140% at 12% 0%,rgba(255,255,255,.32),transparent 55%),linear-gradient(135deg,var(--an-a),var(--an-b))}
.an-hero::after{content:"";position:absolute;inset:0;background:repeating-linear-gradient(-45deg,rgba(255,255,255,.08) 0 10px,transparent 10px 24px)}
.an-badge{position:relative;z-index:1;display:grid;place-items:center;width:84px;height:84px;margin:-48px auto 0;border-radius:24px;
  font-size:2.6rem;line-height:1;background:linear-gradient(180deg,#262626,#151515);border:2px solid rgba(var(--an-glow),.7);
  box-shadow:0 10px 24px rgba(0,0,0,.5),0 0 24px rgba(var(--an-glow),.28);transform:rotate(-4deg)}
.an-overlay .an-badge{animation:an-badge .6s .12s cubic-bezier(.34,1.56,.64,1) backwards}
@keyframes an-badge{from{transform:scale(0) rotate(-25deg)}to{transform:scale(1) rotate(-4deg)}}
.an-close{position:absolute;top:12px;right:12px;z-index:2;display:grid;place-items:center;width:38px;height:38px;border:0;
  border-radius:12px;background:rgba(0,0,0,.3);color:#fff;font:inherit;font-size:1.05rem;font-weight:800;cursor:pointer}
.an-close:hover{background:rgba(0,0,0,.45)}
.an-body{padding:14px 22px 22px}
.an-kicker{font-size:.72rem;font-weight:800;letter-spacing:.09em;text-transform:uppercase;color:var(--an-tint)}
.an-title{margin:.32rem 0 0;font-size:1.42rem;line-height:1.2;font-weight:900;overflow-wrap:anywhere}
.an-text{margin:.65rem 0 0;color:#d4d4d4;font-size:.96rem;line-height:1.55;white-space:pre-wrap;overflow-wrap:anywhere}
.an-text.an-long{text-align:left}
.an-poll{margin-top:16px;padding:14px;border-radius:18px;background:rgba(255,255,255,.035);border:1px solid rgba(255,255,255,.08);text-align:left}
.an-q{margin-bottom:10px;font-size:.98rem;font-weight:800;line-height:1.35;overflow-wrap:anywhere}
.an-opts{display:grid;gap:8px}
.an-opt{position:relative;display:flex;align-items:center;gap:10px;width:100%;min-height:48px;padding:10px 14px;overflow:hidden;
  border-radius:14px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.04);color:#fff;font:inherit;
  font-size:.93rem;font-weight:700;text-align:left;cursor:pointer;touch-action:manipulation;
  transition:border-color .15s ease,background .15s ease,transform .1s ease}
.an-opt:hover:not(:disabled){border-color:rgba(var(--an-glow),.75);background:rgba(var(--an-glow),.09)}
.an-opt:active:not(:disabled){transform:scale(.985)}
.an-opt:disabled{cursor:default}
.an-dot{position:relative;z-index:1;flex:none;width:20px;height:20px;border-radius:50%;border:2px solid rgba(255,255,255,.32)}
.an-opt-label{position:relative;z-index:1;flex:1;min-width:0;overflow-wrap:anywhere}
.an-fill{position:absolute;inset:0 auto 0 0;width:0;background:linear-gradient(90deg,rgba(var(--an-glow),.34),rgba(var(--an-glow),.12));
  transition:width .7s cubic-bezier(.22,1,.36,1)}
.an-pct{position:relative;z-index:1;flex:none;color:var(--an-tint);font-weight:900;font-variant-numeric:tabular-nums}
.an-opt.is-mine{border-color:rgba(var(--an-glow),.95)}
.an-opt.is-mine .an-dot{border-color:var(--an-a);background:radial-gradient(circle,var(--an-a) 0 42%,transparent 46%)}
.an-voted{margin-top:10px;color:#a3a3a3;font-size:.82rem;font-weight:600;text-align:center}
.an-voted:empty{display:none}
.an-voted.is-won{color:#86efac;font-size:.92rem;font-weight:800}
.an-voted.is-lost{color:#fca5a5;font-size:.88rem;font-weight:700}
.an-prize{position:relative;display:flex;align-items:center;gap:10px;margin:0 0 12px;padding:9px 12px;border-radius:14px;
  background:linear-gradient(90deg,rgba(var(--an-glow),.2),rgba(var(--an-glow),.06));border:1px solid rgba(var(--an-glow),.4);
  color:var(--an-tint);font-size:.84rem;font-weight:800;line-height:1.3}
.an-prize-icon{flex:none;font-size:1.3rem;line-height:1}
.an-prize b{color:#fff;overflow-wrap:anywhere}
.an-prize.is-won{border-color:#22c55e;background:linear-gradient(90deg,rgba(34,197,94,.24),rgba(34,197,94,.08));color:#bbf7d0;
  animation:an-won .6s cubic-bezier(.34,1.56,.64,1)}
@keyframes an-won{40%{transform:scale(1.05)}100%{transform:scale(1)}}
.an-opt.is-correct{border-color:#22c55e;background:rgba(34,197,94,.12)}
.an-opt.is-correct .an-dot{border-color:#22c55e;background:radial-gradient(circle,#22c55e 0 42%,transparent 46%)}
.an-opt.is-wrong{border-color:#ef4444;background:rgba(239,68,68,.1)}
.an-opt.is-wrong .an-dot{border-color:#ef4444;background:radial-gradient(circle,#ef4444 0 42%,transparent 46%)}
.an-opt.is-correct .an-fill{background:linear-gradient(90deg,rgba(34,197,94,.34),rgba(34,197,94,.12))}
.an-mark{position:relative;z-index:1;flex:none;font-weight:900}
.an-opt.is-correct .an-mark{color:#4ade80}
.an-opt.is-wrong .an-mark{color:#f87171}
.an-spark{position:absolute;left:50%;top:50%;width:7px;height:7px;border-radius:2px;pointer-events:none;
  animation:an-spark .9s cubic-bezier(.22,1,.36,1) forwards}
@keyframes an-spark{from{transform:translate(-50%,-50%) rotate(0) scale(1);opacity:1}
  to{transform:translate(calc(-50% + var(--dx)),calc(-50% + var(--dy))) rotate(220deg) scale(.4);opacity:0}}
.an-btn{position:relative;display:flex;align-items:center;justify-content:center;gap:.55rem;width:100%;min-height:58px;margin-top:18px;
  padding:.9rem 1rem;overflow:hidden;border:0;border-bottom:4px solid var(--an-edge);border-radius:18px;
  background:linear-gradient(135deg,var(--an-a),var(--an-b));color:var(--an-ink);font:inherit;font-size:1.08rem;font-weight:900;
  cursor:pointer;touch-action:manipulation;transition:transform .1s ease,filter .15s ease}
.an-btn:hover{filter:brightness(1.06)}
.an-btn:active{transform:translateY(2px);border-bottom-width:0}
.an-btn:disabled{filter:grayscale(.3) brightness(.8);cursor:default}
.an-shine{position:absolute;top:0;left:0;width:50%;height:100%;background:rgba(255,255,255,.22);transform:translateX(-200%) skewX(-25deg);pointer-events:none}
.an-btn:hover .an-shine,.an-btn:focus-visible .an-shine{animation:an-sweep .8s forwards}
@keyframes an-sweep{to{transform:translateX(250%) skewX(-25deg)}}
.an-btn:focus-visible,.an-opt:focus-visible,.an-close:focus-visible{outline:2px solid var(--an-tint);outline-offset:3px}
.an-more{margin-top:10px;color:#737373;font-size:.76rem;font-weight:700}
.an-more:empty{display:none}
.an-preview .an-btn,.an-preview .an-opt,.an-preview .an-close{pointer-events:none}
html.an-open,html.an-open body{overflow:hidden}
@media (max-width:480px){.an-hero{height:88px}.an-badge{width:76px;height:76px;font-size:2.3rem}.an-title{font-size:1.24rem}.an-body{padding:12px 16px 18px}}
@media (prefers-reduced-motion:reduce){.an-overlay,.an-overlay .an-card,.an-overlay .an-badge,.an-prize.is-won{animation:none}.an-fill{transition:none}.an-spark{display:none}}
`;

    function injectStyle() {
        if (document.getElementById("an-style")) return;
        const style = document.createElement("style");
        style.id = "an-style";
        style.textContent = STYLE;
        document.head.appendChild(style);
    }

    function el(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text != null) node.textContent = text;
        return node;
    }

    function applyTheme(node, key) {
        const theme = THEMES[key] || THEMES.flame;
        node.style.setProperty("--an-a", theme.a);
        node.style.setProperty("--an-b", theme.b);
        node.style.setProperty("--an-edge", theme.edge);
        node.style.setProperty("--an-tint", theme.tint);
        node.style.setProperty("--an-glow", theme.glow);
        node.style.setProperty("--an-ink", theme.ink);
    }

    function kicker(a) {
        const kind = a.poll?.quiz ? "Quiz" : "Sondage";
        if (a.poll && a.body) return `Message de l'équipe · ${kind}`;
        if (a.poll) return kind;
        return "Message de l'équipe";
    }

    function prizeText(prize) {
        return prize.maxWinners ? `${prize.maxWinners} premier${prize.maxWinners > 1 ? "s" : ""} à trouver` : "pour chaque bonne réponse";
    }

    function buttonLabel(a) {
        if (a.buttonLabel) return a.buttonLabel;
        if (a.link && LINKS[a.link]) return `Aller : ${LINKS[a.link][0]}`;
        return a.poll ? "Fermer" : "Compris !";
    }

    function buildCard(a, options = {}) {
        const card = el("div", "an-card" + (options.preview ? " an-preview" : ""));
        if (!options.preview) card.tabIndex = -1;
        applyTheme(card, a.theme);
        const titleId = `an-title-${Math.random().toString(36).slice(2, 8)}`;

        const close = el("button", "an-close", "✕");
        close.type = "button";
        close.setAttribute("aria-label", "Fermer");
        card.append(el("div", "an-hero"), close);

        const badge = el("div", "an-badge", a.icon || "📢");
        badge.setAttribute("aria-hidden", "true");
        card.appendChild(badge);

        const body = el("div", "an-body");
        body.appendChild(el("div", "an-kicker", kicker(a)));
        const title = el("h2", "an-title", a.title || "Titre du message");
        title.id = titleId;
        body.appendChild(title);
        if (a.body) {
            const text = el("p", "an-text" + (a.body.length > 180 ? " an-long" : ""), a.body);
            body.appendChild(text);
        }

        const parts = { card, close, title, titleId, options: [], voted: null, button: null, more: null, fills: [], pcts: [], marks: [], prize: null };
        if (a.poll) {
            const poll = el("div", "an-poll");
            poll.appendChild(el("div", "an-q", a.poll.question));
            if (a.poll.prize) {
                const prize = el("div", "an-prize");
                const label = el("span");
                label.append("À gagner : ", el("b", null, a.poll.prize.label), ` · ${prizeText(a.poll.prize)}`);
                const icon = el("span", "an-prize-icon", "🎁");
                icon.setAttribute("aria-hidden", "true");
                prize.append(icon, label);
                poll.appendChild(prize);
                parts.prize = prize;
            }
            const list = el("div", "an-opts");
            a.poll.options.forEach((label, index) => {
                const option = el("button", "an-opt");
                option.type = "button";
                option.dataset.index = String(index);
                const fill = el("span", "an-fill");
                const pct = el("span", "an-pct");
                pct.hidden = true;
                const mark = el("span", "an-mark");
                mark.hidden = true;
                mark.setAttribute("aria-hidden", "true");
                option.append(fill, el("span", "an-dot"), el("span", "an-opt-label", label), pct, mark);
                list.appendChild(option);
                parts.options.push(option);
                parts.fills.push(fill);
                parts.pcts.push(pct);
                parts.marks.push(mark);
            });
            poll.appendChild(list);
            parts.voted = el("div", "an-voted");
            parts.voted.setAttribute("aria-live", "polite");
            poll.appendChild(parts.voted);
            body.appendChild(poll);
        }

        const button = el("button", "an-btn");
        button.type = "button";
        button.append(el("span", "an-label", buttonLabel(a)), el("span", "an-shine"));
        button.querySelector(".an-shine").setAttribute("aria-hidden", "true");
        body.appendChild(button);
        parts.button = button;
        parts.more = el("div", "an-more", options.more ? `Encore ${options.more} message${options.more > 1 ? "s" : ""} après celui-ci` : "");
        body.appendChild(parts.more);

        card.appendChild(body);
        return parts;
    }

    function burst(target) {
        const colors = ["#22c55e", "#facc15", "#f97316", "#38bdf8", "#f472b6", "#ffffff"];
        for (let i = 0; i < 18; i++) {
            const spark = el("span", "an-spark");
            const angle = (Math.PI * 2 * i) / 18 + Math.random() * 0.4;
            const distance = 50 + Math.random() * 70;
            spark.style.setProperty("--dx", `${Math.round(Math.cos(angle) * distance)}px`);
            spark.style.setProperty("--dy", `${Math.round(Math.sin(angle) * distance * 0.6)}px`);
            spark.style.background = colors[i % colors.length];
            target.appendChild(spark);
            setTimeout(() => spark.remove(), 950);
        }
    }

    function quizMessage(a, quiz) {
        const right = a.poll.options[quiz.correctIndex] || "";
        if (quiz.status === "won") return [`Bonne réponse ! Tu gagnes ${a.poll.prize?.label || "la récompense"} 🎉`, "is-won"];
        if (quiz.status === "sold_out") return ["Bonne réponse ! Mais toutes les récompenses ont déjà été gagnées.", "is-won"];
        if (quiz.status === "correct") return ["Bonne réponse ! Bien joué 🎉", "is-won"];
        return [`Raté ! La bonne réponse était « ${right} ».`, "is-lost"];
    }

    function showResults(a, parts, mine, counts, quiz) {
        parts.options.forEach((option, index) => {
            option.disabled = true;
            option.classList.toggle("is-mine", !quiz && index === mine);
            option.setAttribute("aria-pressed", String(index === mine));
            if (!quiz) return;
            const isRight = index === quiz.correctIndex;
            const isWrong = index === mine && !isRight;
            option.classList.toggle("is-correct", isRight);
            option.classList.toggle("is-wrong", isWrong);
            if (isRight || isWrong) {
                parts.marks[index].textContent = isRight ? "✓" : "✕";
                parts.marks[index].hidden = false;
            }
        });

        let total = 0;
        if (counts) {
            total = counts.reduce((sum, n) => sum + n, 0);
            void parts.fills[0]?.offsetWidth;
            counts.forEach((n, index) => {
                const pct = Math.round((n / (total || 1)) * 100);
                parts.fills[index].style.width = `${pct}%`;
                parts.pcts[index].textContent = `${pct} %`;
                parts.pcts[index].hidden = false;
            });
        }
        const votes = counts ? ` ${total} vote${total > 1 ? "s" : ""} pour l'instant.` : "";

        if (!quiz) {
            parts.voted.textContent = `Merci pour ton vote !${votes}`;
            return;
        }
        const [text, tone] = quizMessage(a, quiz);
        parts.voted.textContent = text;
        parts.voted.classList.add(tone);
        if (quiz.status === "won" && parts.prize) {
            parts.prize.classList.add("is-won");
            burst(parts.prize);
        }
    }

    function normalize(data) {
        const prize = data.poll?.prize && data.poll.prize.label ? {
            label: String(data.poll.prize.label),
            maxWinners: Number(data.poll.prize.maxWinners) > 0 ? Number(data.poll.prize.maxWinners) : null
        } : null;
        const poll = data.poll && data.poll.question ? {
            question: String(data.poll.question),
            options: (data.poll.options || []).map(String).filter(Boolean),
            showResults: data.poll.showResults !== false,
            quiz: !!data.poll.quiz,
            prize: data.poll.quiz ? prize : null
        } : null;
        return {
            id: data.id || "preview",
            title: String(data.title || ""),
            body: data.body ? String(data.body) : "",
            icon: data.icon ? String(data.icon) : "",
            theme: THEMES[data.theme] ? data.theme : "flame",
            buttonLabel: data.buttonLabel ? String(data.buttonLabel) : "",
            link: data.link && LINKS[data.link] ? data.link : null,
            poll: poll && poll.options.length ? poll : null
        };
    }

    window.BrainrotAnnounce = {
        themes: Object.entries(THEMES).map(([key, t]) => ({ key, name: t.name, a: t.a, b: t.b })),
        links: Object.entries(LINKS).map(([key, [name]]) => ({ key, name })),
        preview(container, data) {
            injectStyle();
            container.replaceChildren(buildCard(normalize(data), { preview: true }).card);
        }
    };

    if (PREVIEW_ONLY) return;

    const queue = [];
    const handled = new Set();
    let current = null;
    let waitTimer = null;

    const authHeaders = (json) => {
        const headers = { Authorization: "Bearer " + (window.BrainrotAuth?.getToken?.() || "") };
        if (json) headers["Content-Type"] = "application/json";
        return headers;
    };

    async function post(path, body) {
        const response = await apiFetch(`${API}/announcements/${path}`, {
            method: "POST",
            headers: authHeaders(true),
            body: JSON.stringify(body || {})
        });
        const payload = await response.json().catch(() => null);
        return { ok: response.ok && !!payload?.success, payload };
    }

    function busy() {
        return !!document.querySelector(".tuto-root, .ac-overlay, .pb-overlay, #v-battle:not(.hidden), #global-loader:not(.hidden), .gb-busy, #gb-result:not(.hidden), #ach-celebrate:not(.hidden), #streak-pop:not(.hidden)");
    }

    function pump() {
        if (current || !queue.length) return;
        if (busy()) {
            clearTimeout(waitTimer);
            waitTimer = setTimeout(pump, 2500);
            return;
        }
        show(queue.shift());
    }

    function enqueue(raw) {
        if (!raw || typeof raw !== "object" || !raw.id) return;
        const a = normalize(raw);
        if (handled.has(a.id) || current?.a.id === a.id || queue.some((q) => q.id === a.id)) return;
        queue.push(a);
        pump();
    }

    function removeOverlay(overlay) {
        overlay.classList.add("an-out");
        setTimeout(() => {
            overlay.remove();
            if (!document.querySelector(".an-overlay")) document.documentElement.classList.remove("an-open");
        }, 180);
    }

    function closeCurrent(after) {
        if (!current) return;
        const { overlay, a } = current;
        document.removeEventListener("keydown", current.onKey);
        current = null;
        handled.add(a.id);
        removeOverlay(overlay);
        if (after) after();
        setTimeout(pump, 260);
    }

    async function finish() {
        if (!current || current.leaving) return;
        current.leaving = true;
        const a = current.a;
        const target = a.link && LINKS[a.link] ? LINKS[a.link][1] : null;
        const here = target && location.pathname.endsWith("/" + target);
        const dismissed = post(`${encodeURIComponent(a.id)}/dismiss`).catch(() => null);
        if (target && !here) {
            current.parts.button.disabled = true;
            await dismissed;
            const root = location.pathname.replace(/\/[^/]*\/[^/]*$/, "");
            location.href = `${location.origin}${root}/${target}`;
            return;
        }
        closeCurrent();
    }

    async function vote(index) {
        if (!current || current.voting || current.hasVoted) return;
        const { a, parts } = current;
        current.voting = true;
        parts.options.forEach((option) => { option.disabled = true; });
        try {
            const { ok, payload } = await post(`${encodeURIComponent(a.id)}/vote`, { option: index });
            if (!current || current.a.id !== a.id) return;
            if (!ok) {
                parts.voted.textContent = payload?.message || "Ton vote n'a pas pu être enregistré.";
                if (payload?.message) return;
                parts.options.forEach((option) => { option.disabled = false; });
                return;
            }
            current.hasVoted = true;
            showResults(a, parts, Number(payload.vote), Array.isArray(payload.counts) ? payload.counts : null, payload.quiz || null);
            if (!a.buttonLabel && !a.link) parts.button.querySelector(".an-label").textContent = "Fermer";
        } catch {
            if (current) {
                parts.voted.textContent = "Serveur injoignable, réessaie.";
                parts.options.forEach((option) => { option.disabled = false; });
            }
        } finally {
            if (current) current.voting = false;
        }
    }

    function show(a) {
        injectStyle();
        const parts = buildCard(a, { more: queue.length });
        const overlay = el("div", "an-overlay");
        overlay.setAttribute("role", "dialog");
        overlay.setAttribute("aria-modal", "true");
        overlay.setAttribute("aria-labelledby", parts.titleId);
        overlay.appendChild(parts.card);

        const onKey = (event) => {
            if (event.key === "Escape") finish();
        };
        current = { a, overlay, parts, onKey };
        parts.close.addEventListener("click", finish);
        parts.button.addEventListener("click", finish);
        parts.options.forEach((option) => option.addEventListener("click", () => vote(Number(option.dataset.index))));
        document.addEventListener("keydown", onKey);

        document.documentElement.classList.add("an-open");
        document.body.appendChild(overlay);
        parts.card.focus({ preventScroll: true });
    }

    function drop(id) {
        if (!id) return;
        handled.add(id);
        const index = queue.findIndex((q) => q.id === id);
        if (index >= 0) queue.splice(index, 1);
        if (current?.a.id === id && !current.hasVoted) closeCurrent();
    }

    async function start() {
        let token = "";
        try {
            token = await window.BrainrotAuth?.waitUntilReady?.();
        } catch {
            return;
        }
        if (!token || !API) return;
        window.BrainrotRealtime?.on?.("announce", enqueue);
        window.BrainrotRealtime?.on?.("announce:close", (payload) => drop(payload?.id));
        try {
            const response = await apiFetch(`${API}/announcements/pending`, { headers: authHeaders(false) });
            const payload = await response.json().catch(() => null);
            if (response.ok && payload?.success && Array.isArray(payload.announcements)) payload.announcements.forEach(enqueue);
        } catch { }
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
    else start();
})();
