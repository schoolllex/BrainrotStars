const API_BASE_URL = "https://darkgoldenrod-frog-258465.hostingersite.com";
const USER_ROUTE_BASE = "/user";

const ui = {
    rebirthBtn: document.querySelector(".rebirth-cta"),
    subtitle: document.querySelector(".rebirth-subtitle")
};

function getAuthToken() {
    return window.BrainrotAuth?.getToken() || localStorage.getItem("brainrot_token") || "";
}

async function checkRebirthStatus() {
    const token = getAuthToken();
    if (!token) {
        console.error("Pas de token d'authentification");
        return false;
    }

    try {
        const response = await fetch(`${API_BASE_URL}${USER_ROUTE_BASE}/rebirth`, {
            method: "GET",
            headers: {
                "Authorization": `Bearer ${token}`
            }
        });

        if (!response.ok) {
            console.error("Erreur lors de la vérification du statut rebirth");
            return false;
        }

        const payload = await response.json();
        if (payload?.success && payload?.result?.result === true) {
            return true;
        }
        return false;
    } catch (error) {
        console.error("Erreur lors de la vérification du statut rebirth:", error);
        return false;
    }
}

async function registerForRebirth() {
    const token = getAuthToken();
    if (!token) {
        alert("Erreur d'authentification");
        return;
    }

    try {
        const response = await fetch(`${API_BASE_URL}${USER_ROUTE_BASE}/rebirth`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${token}`
            }
        });

        if (!response.ok) {
            alert("Erreur lors de l'inscription");
            return;
        }

        const payload = await response.json();
        if (payload?.success) {
            setRegisteredState();
        } else {
            alert("Erreur lors de l'inscription");
        }
    } catch (error) {
        console.error("Erreur lors de l'inscription rebirth:", error);
        alert("Erreur de connexion au serveur");
    }
}

function setRegisteredState() {
    if (ui.rebirthBtn) {
        ui.rebirthBtn.textContent = "✅ Déjà inscrit";
        ui.rebirthBtn.disabled = true;
        ui.rebirthBtn.style.opacity = "0.6";
        ui.rebirthBtn.style.cursor = "not-allowed";
    }
    if (ui.subtitle) {
        ui.subtitle.textContent = "Vous êtes déjà inscrit ! Vous recevrez votre récompense exclusive lors de la sortie du mode Rebirth.";
    }
}

async function initRebirthPage() {
    GlobalLoader.show();
    
    try {
        const token = await window.BrainrotAuth?.waitUntilReady();
        if (!token) {
            console.error("Pas de token");
            return;
        }

        const isRegistered = await checkRebirthStatus();
        
        if (isRegistered) {
            setRegisteredState();
        } else {
            // Activer le bouton pour l'inscription
            if (ui.rebirthBtn) {
                ui.rebirthBtn.addEventListener("click", registerForRebirth);
            }
        }
    } catch (error) {
        console.error("Erreur initialisation page rebirth:", error);
    } finally {
        GlobalLoader.hide(true);
    }
}

document.addEventListener("DOMContentLoaded", () => {
    lucide.createIcons();
    initRebirthPage();
});
