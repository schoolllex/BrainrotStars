/**
 * Tutoriel des nouveaux joueurs, montre une seule fois.
 * ---------------------------------------------------------------------------
 * Chaque page choisit son parcours : <script src="tutorial.js" data-tour="home">.
 *   home : le tour de l'accueil ;
 *   shop : le conseil de la premiere visite a la boutique.
 * Le serveur dit ce qui reste a faire (GET /user/tutorial : seuls les comptes
 * crees depuis sa mise en place ont une ligne) et le note comme fait
 * (POST /user/tutorial/done {part}), que le parcours soit termine ou passe.
 *
 * Chaque etape eclaire un element de la page (le reste est assombri) avec une
 * bulle et sa fleche. Rien n'est cliquable pendant le tour : on montre ou se
 * trouve le multijoueur et le Villaggio sans les lancer.
 */
(() => {
    "use strict";

    const TOUR = document.currentScript?.dataset.tour === "shop" ? "shop" : "home";
    let markIdle = () => {};
    window.BrainrotTutorial = { idle: new Promise((resolve) => { markIdle = resolve; }) };
    const DONE_KEY = `brainrot_tutorial_done_${TOUR}`;

    /**
     * target : selecteurs essayes dans l'ordre, le premier visible gagne.
     * final : derniere etape ; nextLabel / goTo / backLabel pour ses boutons.
     */
    const TOURS = {};
    TOURS.home = [
        {
            title: "Bienvenue sur BrainrotStar !",
            text: "Petit tour rapide pour que tu saches où tout se trouve. Ça prend 30 secondes."
        },
        {
            target: [".economy-grid"],
            title: "Ton argent",
            text: "Tes Brainrots te rapportent des pièces chaque seconde, même quand tu n'es pas connecté."
        },
        {
            target: [".navbar .nav-buttons", ".mobile-menu-btn"],
            title: "Le menu",
            text: "Boutique pour ouvrir des caisses, Collection pour voir tes Brainrots, Classement pour te comparer aux autres, et ton Profil.",
            mobileText: "Ce bouton ouvre le menu : Boutique pour ouvrir des caisses, Collection pour voir tes Brainrots, Classement et ton Profil."
        },
        {
            target: [".action-grid .btn-play"],
            title: "Le multijoueur",
            text: "Affronte d'autres joueurs en temps réel avec tes Brainrots, façon Clash Royale. On ne lance pas de partie maintenant, promis."
        },
        {
            target: ["#daily-hub"],
            title: "Ton quotidien",
            text: "Reviens chaque jour pour faire grimper ta série, et termine les 5 missions du jour pour gagner un coffre bonus. Tout se renouvelle à 10 h."
        },
        {
            target: ["#friends-card"],
            title: "Tes amis",
            text: "Ajoute tes potes pour les défier et suivre leur progression."
        },
        {
            target: ['.btn-card[href*="rebirth"]'],
            title: "Le Rebirth",
            text: "Une fois très riche, recommence de zéro en échange de bonus permanents sur tes revenus."
        },
        {
            target: ["#village-card"],
            title: "Le Villaggio",
            text: "Construis ton village, récolte de l'or et attaque celui des autres joueurs."
        },
        {
            target: ['.btn-card[href*="/ah/"]'],
            title: "Le Marché",
            text: "Achète et vends des Brainrots aux autres joueurs."
        },
        {
            target: ['.btn-card[href*="battlepass"]'],
            title: "Le Passe de combat",
            text: "Monte de niveau en jouant pour débloquer des récompenses."
        },
        {
            target: ['.btn-card[href*="achievements"]'],
            title: "Les Succès",
            text: "Remplis des objectifs pour gagner des coffres et des pièces."
        },
        {
            title: "À toi de jouer !",
            text: "Commence par ouvrir ta première caisse dans la Boutique pour obtenir tes premiers Brainrots.",
            final: true,
            nextLabel: "Ouvrir la Boutique",
            goTo: "../shop/shop.html",
            backLabel: "Terminer"
        }
    ];

    TOURS.shop = [
        {
            // Les caisses sont triees par prix : la premiere est la moins chere.
            target: ["#caisses-grid .shop-card"],
            title: "Tes premières caisses",
            text: "Achète et ouvre tes 10 premières caisses : chaque caisse te donne un Brainrot, et chaque Brainrot te rapporte des pièces par seconde, même quand tu n'es pas connecté !",
            final: true,
            nextLabel: "C'est parti !"
        }
    ];

    const STEPS = TOURS[TOUR];

    /** Marge autour de l'element eclaire et ecart entre la bulle et lui. */
    const SPOT_PAD = 8;
    const GAP = 14;
    const EDGE = 12;

    let token = "";
    let index = 0;
    let root, spot, card, arrow, els;
    let placeQueued = false;
    let scrollTimer = null;

    // --- Utilitaires ----------------------------------------------------------

    function isVisible(el) {
        if (!el) return false;
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && getComputedStyle(el).visibility !== "hidden";
    }

    function resolveTarget(step) {
        for (const selector of step.target || []) {
            const el = document.querySelector(selector);
            if (isVisible(el)) return el;
        }
        return null;
    }

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    function apiHeaders() {
        return { Authorization: `Bearer ${token}` };
    }

    // --- Construction ---------------------------------------------------------

    function build() {
        root = document.createElement("div");
        root.className = "tuto-root";
        root.setAttribute("role", "dialog");
        root.setAttribute("aria-modal", "true");
        root.setAttribute("aria-labelledby", "tuto-title");
        root.innerHTML = `
            <div class="tuto-spot is-center"></div>
            <div class="tuto-card">
                <span class="tuto-arrow" aria-hidden="true"></span>
                <div class="tuto-head">
                    <span class="tuto-count"></span>
                    <button type="button" class="tuto-skip">Passer le tuto</button>
                </div>
                <h2 id="tuto-title" class="tuto-title"></h2>
                <p class="tuto-text" aria-live="polite"></p>
                <div class="tuto-foot">
                    <div class="tuto-dots" aria-hidden="true"></div>
                    <div class="tuto-actions">
                        <button type="button" class="tuto-btn tuto-back">Retour</button>
                        <button type="button" class="tuto-btn tuto-next">Suivant</button>
                    </div>
                </div>
            </div>`;
        document.body.appendChild(root);

        spot = root.querySelector(".tuto-spot");
        card = root.querySelector(".tuto-card");
        arrow = root.querySelector(".tuto-arrow");
        els = {
            count: root.querySelector(".tuto-count"),
            title: root.querySelector(".tuto-title"),
            text: root.querySelector(".tuto-text"),
            dots: root.querySelector(".tuto-dots"),
            back: root.querySelector(".tuto-back"),
            next: root.querySelector(".tuto-next"),
            skip: root.querySelector(".tuto-skip")
        };
        els.dots.innerHTML = STEPS.map(() => "<span></span>").join("");

        els.next.addEventListener("click", next);
        els.back.addEventListener("click", back);
        els.skip.addEventListener("click", () => finish());

        // La page ne defile pas sous le tutoriel ; seul le tour la fait defiler.
        root.addEventListener("wheel", (event) => event.preventDefault(), { passive: false });
        root.addEventListener("touchmove", (event) => event.preventDefault(), { passive: false });

        window.addEventListener("resize", queuePlace);
        window.addEventListener("scroll", onScroll, { passive: true });
        document.addEventListener("keydown", onKey);
    }

    function destroy() {
        window.removeEventListener("resize", queuePlace);
        window.removeEventListener("scroll", onScroll);
        document.removeEventListener("keydown", onKey);
        root.classList.add("is-leaving");
        setTimeout(() => {
            root.remove();
            markIdle();
        }, 250);
    }

    // --- Placement ------------------------------------------------------------

    function queuePlace() {
        if (placeQueued) return;
        placeQueued = true;
        requestAnimationFrame(() => {
            placeQueued = false;
            place();
        });
    }

    /** Pendant un defilement, l'eclairage suit la page sans transition. */
    function onScroll() {
        root.classList.add("is-scrolling");
        clearTimeout(scrollTimer);
        scrollTimer = setTimeout(() => root?.classList.remove("is-scrolling"), 120);
        queuePlace();
    }

    function place() {
        if (!root) return;
        const step = STEPS[index];
        const target = resolveTarget(step);
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const cardW = card.offsetWidth;
        const cardH = card.offsetHeight;

        if (!target) {
            // Etape sans cible : tout est sombre, la bulle est au centre.
            spot.classList.add("is-center");
            spot.style.cssText = `left:${vw / 2}px;top:${vh / 2}px;width:0;height:0;border-radius:50%;`;
            card.style.left = `${(vw - cardW) / 2}px`;
            card.style.top = `${Math.max(EDGE, (vh - cardH) / 2)}px`;
            arrow.style.display = "none";
            return;
        }

        const rect = target.getBoundingClientRect();
        let left = rect.left - SPOT_PAD;
        let top = rect.top - SPOT_PAD;
        let width = rect.width + SPOT_PAD * 2;
        let height = rect.height + SPOT_PAD * 2;
        let radius;
        if (rect.width < 90 && rect.height < 90) {
            // Petit element (bouton du menu) : un rond bien centre.
            const size = Math.max(width, height);
            left -= (size - width) / 2;
            top -= (size - height) / 2;
            width = height = size;
            radius = "50%";
        } else {
            radius = `${(parseFloat(getComputedStyle(target).borderTopLeftRadius) || 12) + SPOT_PAD}px`;
        }
        spot.classList.remove("is-center");
        spot.style.cssText = `left:${left}px;top:${top}px;width:${width}px;height:${height}px;border-radius:${radius};`;

        // Bulle sous l'element s'il y a la place, sinon au-dessus.
        const below = vh - (top + height);
        const above = top;
        const placeBelow = below >= cardH + GAP + EDGE || below >= above;
        let cardTop = placeBelow ? top + height + GAP : top - GAP - cardH;
        cardTop = clamp(cardTop, EDGE, Math.max(EDGE, vh - cardH - EDGE));
        const centerX = rect.left + rect.width / 2;
        const cardLeft = clamp(centerX - cardW / 2, EDGE, Math.max(EDGE, vw - cardW - EDGE));
        card.style.left = `${cardLeft}px`;
        card.style.top = `${cardTop}px`;

        arrow.style.display = "";
        arrow.classList.toggle("is-up", placeBelow);
        arrow.classList.toggle("is-down", !placeBelow);
        arrow.style.left = `${clamp(centerX - cardLeft, 22, cardW - 22)}px`;
    }

    /** Amene l'element a l'ecran, en laissant la place a la bulle. */
    function scrollToTarget(target) {
        const rect = target.getBoundingClientRect();
        const vh = window.innerHeight;
        const room = card.offsetHeight + GAP + EDGE * 2;
        const fits = rect.top >= EDGE + SPOT_PAD && rect.bottom + SPOT_PAD + room <= vh;
        if (fits) return;
        const desired = window.scrollY + rect.top - Math.max(EDGE + SPOT_PAD, (vh - rect.height - room) / 2);
        window.scrollTo({ top: Math.max(0, desired), behavior: "smooth" });
    }

    // --- Navigation -----------------------------------------------------------

    function render() {
        const step = STEPS[index];
        const target = resolveTarget(step);
        const onMobileMenu = target?.classList.contains("mobile-menu-btn");

        const single = STEPS.length === 1;
        els.count.textContent = `${index + 1} / ${STEPS.length}`;
        els.count.classList.toggle("hidden", single);
        els.dots.classList.toggle("hidden", single);
        els.title.textContent = step.title;
        els.text.textContent = onMobileMenu && step.mobileText ? step.mobileText : step.text;
        els.back.classList.toggle("hidden", step.final ? !step.backLabel : index === 0);
        els.skip.classList.toggle("hidden", !!step.final);
        els.next.textContent = step.nextLabel || (index === 0 ? "C'est parti" : "Suivant");
        els.back.textContent = step.final ? step.backLabel || "" : "Retour";
        [...els.dots.children].forEach((dot, i) => dot.classList.toggle("active", i === index));

        if (target) scrollToTarget(target);
        place();
        els.next.focus({ preventScroll: true });
    }

    function next() {
        if (STEPS[index].final) {
            finish(STEPS[index].goTo);
            return;
        }
        index = Math.min(STEPS.length - 1, index + 1);
        render();
    }

    function back() {
        if (STEPS[index].final) {
            finish();
            return;
        }
        index = Math.max(0, index - 1);
        render();
    }

    function onKey(event) {
        if (event.key === "Escape") finish();
        else if (event.key === "ArrowRight") next();
        else if (event.key === "ArrowLeft" && index > 0 && !STEPS[index].final) back();
    }

    /** Termine ou passe : note cote serveur, puis va eventuellement sur goTo. */
    async function finish(goTo) {
        try { sessionStorage.setItem(DONE_KEY, "1"); } catch { /* stockage indisponible */ }
        destroy();
        const done = apiFetch(`${window.API_BASE_URL}/user/tutorial/done`, {
            method: "POST",
            headers: { ...apiHeaders(), "Content-Type": "application/json" },
            body: JSON.stringify({ part: TOUR })
        }).catch(() => null);
        if (goTo) {
            await done;
            window.location.href = goTo;
        }
    }

    // --- Demarrage ------------------------------------------------------------

    function whenLoaderHidden() {
        const loader = document.getElementById("global-loader");
        if (!loader || loader.classList.contains("hidden")) return Promise.resolve();
        return new Promise((resolve) => {
            const observer = new MutationObserver(() => {
                if (!loader.classList.contains("hidden")) return;
                observer.disconnect();
                resolve();
            });
            observer.observe(loader, { attributes: true, attributeFilter: ["class"] });
        });
    }

    async function maybeStart() {
        try {
            if (sessionStorage.getItem(DONE_KEY)) return false;
        } catch { /* stockage indisponible */ }

        token = await window.BrainrotAuth?.waitUntilReady?.();
        if (!token) return false;

        try {
            const response = await apiFetch(`${window.API_BASE_URL}/user/tutorial`, { headers: apiHeaders() });
            const payload = await response.json().catch(() => null);
            const pending = TOUR === "shop" ? payload?.shopPending : payload?.pending;
            if (!response.ok || !payload?.success || !pending) return false;
        } catch {
            return false;
        }

        await whenLoaderHidden();
        window.scrollTo({ top: 0 });
        build();
        render();
        return true;
    }

    document.addEventListener("DOMContentLoaded", () => {
        maybeStart().then((started) => { if (!started) markIdle(); }, () => markIdle());
    });
})();
