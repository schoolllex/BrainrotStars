/**
 * Beta Tester Modal System
 * Affiche une popup de remerciement aux bêta testeurs une seule fois après la connexion
 */

const BETA_TESTER_SHOWN_KEY = "brainrot_beta_tester_modal_shown";

function showBetaTesterModal() {
    // Vérifier si le modal a déjà été affiché
    if (localStorage.getItem(BETA_TESTER_SHOWN_KEY)) {
        return;
    }

    // Créer le modal
    const overlay = document.createElement("div");
    overlay.className = "beta-tester-modal-overlay";
    overlay.id = "beta-tester-modal";

    const card = document.createElement("div");
    card.className = "beta-tester-modal-card";

    card.innerHTML = `
        <span class="beta-tester-modal-icon">🎉</span>
        <h2 class="beta-tester-modal-title">Bienvenue!</h2>
        <p class="beta-tester-modal-subtitle">Merci d'avoir participé à la bêta</p>
        <p class="beta-tester-modal-message">
            Votre soutien nous a beaucoup aidé à améliorer Brainrot Star. 
            Vous faites partie de l'aventure depuis le début!
        </p>
        <div class="beta-tester-modal-gift">
            <div class="beta-tester-modal-gift-title">🎁 Cadeau de remerciement</div>
            <div class="beta-tester-modal-gift-text">
                Un cadeau spécial t'attend dans ton inventaire au bas de la page du shop!
            </div>
        </div>
        <button class="beta-tester-modal-button">Continuer vers le shop</button>
    `;

    overlay.appendChild(card);
    document.body.appendChild(overlay);

    // Ajouter l'événement du bouton
    const button = card.querySelector(".beta-tester-modal-button");
    button.addEventListener("click", () => {
        // Marquer comme affiché
        localStorage.setItem(BETA_TESTER_SHOWN_KEY, "true");
        
        // Fermer le modal
        overlay.remove();
        
        // Scroller vers le shop (section inventory)
        setTimeout(() => {
            const inventorySection = document.getElementById("inventory-section");
            if (inventorySection) {
                inventorySection.scrollIntoView({ behavior: "smooth", block: "start" });
            }
        }, 100);
    });

    // Fermer au clic sur l'overlay
    overlay.addEventListener("click", (e) => {
        if (e.target === overlay) {
            localStorage.setItem(BETA_TESTER_SHOWN_KEY, "true");
            overlay.remove();
        }
    });

    // Fermer à la touche Escape
    const escapeHandler = (e) => {
        if (e.key === "Escape") {
            localStorage.setItem(BETA_TESTER_SHOWN_KEY, "true");
            document.removeEventListener("keydown", escapeHandler);
            overlay.remove();
        }
    };
    document.addEventListener("keydown", escapeHandler);
}

/**
 * Appeler cette fonction après la connexion réussie
 */
function initBetaTesterModal() {
    // Attendre que le DOM soit chargé
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", showBetaTesterModal);
    } else {
        showBetaTesterModal();
    }
}

// Export pour utilisation dans d'autres fichiers
window.BetaTesterModal = {
    show: showBetaTesterModal,
    init: initBetaTesterModal,
    isShown: () => !!localStorage.getItem(BETA_TESTER_SHOWN_KEY),
    reset: () => localStorage.removeItem(BETA_TESTER_SHOWN_KEY)
};
