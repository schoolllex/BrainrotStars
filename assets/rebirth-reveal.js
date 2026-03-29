(function () {
    "use strict";

    const FLAG_KEY = "has_animation";

    if (localStorage.getItem(FLAG_KEY)) return;

    const style = document.createElement("style");
    style.textContent = `
        #brainrot-reveal-overlay {
            position: fixed;
            inset: 0;
            z-index: 99999;
            background: #000;
            display: flex;
            align-items: center;
            justify-content: center;
            font-family: 'Inter', sans-serif;
            opacity: 0;
            visibility: hidden;
            transition: opacity 0.5s ease;
            overflow: hidden;
        }

        #brainrot-reveal-overlay.active {
            opacity: 1;
            visibility: visible;
        }

        #brainrot-reveal-overlay .br-sunburst {
            position: absolute;
            width: 300vmax;
            height: 300vmax;
            background: repeating-conic-gradient(
                from 0deg,
                transparent 0deg 10deg,
                rgba(168, 85, 247, 0.08) 10deg 20deg
            );
            animation: brRotateSun 30s linear infinite;
            pointer-events: none;
        }

        #brainrot-reveal-overlay .br-flare {
            position: absolute;
            width: 100%;
            height: 200px;
            background: linear-gradient(90deg, transparent, rgba(168, 85, 247, 0.6), transparent);
            transform: rotate(-45deg) translateY(-500px);
            filter: blur(50px);
            opacity: 0.5;
            pointer-events: none;
        }

        #brainrot-reveal-overlay.active .br-flare {
            animation: brFlareMove 2s cubic-bezier(0.2, 0.8, 0.2, 1) infinite;
        }

        #brainrot-reveal-overlay canvas {
            position: absolute;
            inset: 0;
            pointer-events: none;
        }

        #brainrot-reveal-overlay .br-content {
            position: relative;
            z-index: 10;
            text-align: center;
            perspective: 1000px;
            padding: 1rem;
            width: 100%;
            max-width: 540px;
            box-sizing: border-box;
        }

        #brainrot-reveal-overlay .br-tag {
            background: #a855f7;
            color: white;
            padding: 4px 16px;
            border-radius: 99px;
            font-weight: 900;
            font-size: 0.9rem;
            text-transform: uppercase;
            letter-spacing: 2px;
            display: inline-block;
            margin-bottom: 1rem;
            transform: scale(0);
        }

        #brainrot-reveal-overlay.active .br-tag {
            animation: brPopIn 0.4s 0.2s forwards cubic-bezier(0.175, 0.885, 0.32, 1.275);
        }

        #brainrot-reveal-overlay .br-title {
            font-size: clamp(2.5rem, 10vw, 6rem);
            color: white;
            font-weight: 900;
            text-transform: uppercase;
            line-height: 0.85;
            font-style: italic;
            margin-bottom: 2rem;
            transform: scale(3) rotateX(90deg);
            filter: blur(20px);
            opacity: 0;
        }

        #brainrot-reveal-overlay.active .br-title {
            animation: brTitleLand 0.6s 0.4s forwards cubic-bezier(0, 0, 0.2, 1);
        }

        #brainrot-reveal-overlay .br-grid {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 0.75rem;
            justify-content: center;
            margin-top: 1rem;
            width: 100%;
            max-width: 480px;
        }

        #brainrot-reveal-overlay .br-card {
            background: rgba(255, 255, 255, 0.05);
            border: 1px solid rgba(168, 85, 247, 0.3);
            backdrop-filter: blur(15px);
            padding: 1rem;
            border-radius: 16px;
            opacity: 0;
            transform: translateY(50px);
            box-shadow: 0 10px 30px rgba(0,0,0,0.5);
        }

        #brainrot-reveal-overlay.active .br-card:nth-child(1) { animation: brSlideIn 0.5s 1.0s forwards ease-out; }
        #brainrot-reveal-overlay.active .br-card:nth-child(2) { animation: brSlideIn 0.5s 1.2s forwards ease-out; }
        #brainrot-reveal-overlay.active .br-card:nth-child(3) { animation: brSlideIn 0.5s 1.4s forwards ease-out; }
        #brainrot-reveal-overlay.active .br-card:nth-child(4) { animation: brSlideIn 0.5s 1.6s forwards ease-out; }

        #brainrot-reveal-overlay .br-card-emoji {
            font-size: 1.5rem;
            margin-bottom: 0.4rem;
            display: block;
        }

        #brainrot-reveal-overlay .br-card h3 {
            font-size: 0.85rem;
            margin-bottom: 0.3rem;
            color: #a855f7;
            font-weight: 900;
        }

        #brainrot-reveal-overlay .br-card p {
            font-size: 0.75rem;
            color: #a3a3a3;
            line-height: 1.4;
        }

        #brainrot-reveal-overlay .br-btn-row {
            display: flex;
            gap: 0.75rem;
            justify-content: center;
            flex-wrap: wrap;
            margin-top: 1.5rem;
        }

        #brainrot-reveal-overlay .br-btn-ready,
        #brainrot-reveal-overlay .br-btn-link {
            width: 100%;
            max-width: 280px;
            justify-content: center;
        }

        #brainrot-reveal-overlay .br-btn-ready {
            background: white;
            color: black;
            border: none;
            padding: 1rem 3rem;
            font-size: 1.1rem;
            font-weight: 900;
            border-radius: 14px;
            cursor: pointer;
            text-transform: uppercase;
            transform: translateY(100px);
            opacity: 0;
            transition: transform 0.2s, background 0.2s;
            font-family: 'Inter', sans-serif;
        }

        #brainrot-reveal-overlay.active .br-btn-ready {
            animation: brSlideIn 0.5s 2.0s forwards ease-out;
        }

        #brainrot-reveal-overlay .br-btn-ready:hover {
            transform: scale(1.05);
            background: #facc15;
        }

        #brainrot-reveal-overlay .br-btn-link {
            background: transparent;
            color: #a855f7;
            border: 2px solid rgba(168, 85, 247, 0.5);
            padding: 1rem 2rem;
            font-size: 1rem;
            font-weight: 700;
            border-radius: 14px;
            cursor: pointer;
            text-transform: uppercase;
            transform: translateY(100px);
            opacity: 0;
            transition: background 0.2s, border-color 0.2s;
            font-family: 'Inter', sans-serif;
            text-decoration: none;
            display: inline-flex;
            align-items: center;
            gap: 0.5rem;
        }

        #brainrot-reveal-overlay.active .br-btn-link {
            animation: brSlideIn 0.5s 2.1s forwards ease-out;
        }

        #brainrot-reveal-overlay .br-btn-link:hover {
            background: rgba(168, 85, 247, 0.15);
            border-color: #a855f7;
        }

        #brainrot-reveal-overlay .br-shake {
            animation: brScreenShake 0.4s 0.4s ease-in-out;
        }

        @keyframes brRotateSun {
            from { transform: rotate(0deg); }
            to   { transform: rotate(360deg); }
        }
        @keyframes brPopIn {
            to { transform: scale(1); }
        }
        @keyframes brTitleLand {
            0%   { transform: scale(3) rotateX(90deg); filter: blur(20px); opacity: 0; }
            100% { transform: scale(1) rotateX(0deg);  filter: blur(0);    opacity: 1; }
        }
        @keyframes brSlideIn {
            to { opacity: 1; transform: translateY(0); }
        }
        @keyframes brFlareMove {
            0%   { transform: rotate(-45deg) translateY(-800px); opacity: 0; }
            50%  { opacity: 0.5; }
            100% { transform: rotate(-45deg) translateY(800px);  opacity: 0; }
        }
        @keyframes brScreenShake {
            0%,  100% { transform: translate(0, 0); }
            10%, 30%, 50%, 70%, 90% { transform: translate(-4px, -4px); }
            20%, 40%, 60%, 80%      { transform: translate( 4px,  4px); }
        }

        @media (max-width: 480px) {
            #brainrot-reveal-overlay .br-grid {
                grid-template-columns: 1fr 1fr;
                max-width: 100%;
            }

            #brainrot-reveal-overlay .br-card {
                padding: 0.75rem;
                border-radius: 12px;
            }

            #brainrot-reveal-overlay .br-title {
                font-size: clamp(1.8rem, 8vw, 3rem);
                margin-bottom: 1rem;
            }

            #brainrot-reveal-overlay .br-tag {
                font-size: 0.75rem;
                padding: 3px 12px;
            }

            #brainrot-reveal-overlay .br-btn-ready {
                padding: 0.85rem 2rem;
                font-size: 0.95rem;
            }

            #brainrot-reveal-overlay .br-btn-link {
                padding: 0.85rem 1.5rem;
                font-size: 0.85rem;
            }
        }
    `;
    document.head.appendChild(style);

    const overlay = document.createElement("div");
    overlay.id = "brainrot-reveal-overlay";
    overlay.innerHTML = `
        <div class="br-sunburst"></div>
        <div class="br-flare"></div>
        <canvas id="br-particles"></canvas>

        <div class="br-content" id="br-content">
            <span class="br-tag">Mise à jour v1.1.0</span>
            <h1 class="br-title">SYSTÈME DE<br><span style="color:#a855f7">REBIRTH</span></h1>

            <div class="br-grid">
                <div class="br-card">
                    <span class="br-card-emoji">🌀</span>
                    <h3>Le Sacrifice</h3>
                    <p>Réinitialise ton Gold et tes Upgrades pour monter en grade.</p>
                </div>
                <div class="br-card">
                    <span class="br-card-emoji">⚡</span>
                    <h3>Puissance +10%</h3>
                    <p>Chaque Rebirth t'offre un bonus de multiplicateur permanent.</p>
                </div>
                <div class="br-card">
                    <span class="br-card-emoji">💰</span>
                    <h3>Gold au Retour</h3>
                    <p>À chaque Rebirth, tu récupères un capital de départ selon ton rang — plus tu montes, plus tu repartes riche.</p>
                </div>
                <div class="br-card">
                    <span class="br-card-emoji">📦</span>
                    <h3>Caisses Offertes</h3>
                    <p>Chaque Rebirth te récompense avec des caisses Épiques et Mythiques selon ton niveau de rebirth.</p>
                </div>
            </div>

            <div class="br-btn-row">
                <button class="br-btn-ready" id="br-close-btn">C'EST COMPRIS !</button>
                <a
                    class="br-btn-link"
                    href="https://schoolllex.github.io/BrainrotStars/rebirth/rebirth.html"
                    target="_blank"
                    rel="noopener"
                >
                    🔗 Voir la mise à jour
                </a>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
    const canvas = document.getElementById("br-particles");
    const ctx = canvas.getContext("2d");
    let particles = [];

    function resizeCanvas() {
        canvas.width  = window.innerWidth;
        canvas.height = window.innerHeight;
    }
    window.addEventListener("resize", resizeCanvas);
    resizeCanvas();

    class Particle {
        constructor() { this.reset(); }
        reset() {
            this.x     = Math.random() * canvas.width;
            this.y     = Math.random() * canvas.height;
            this.size  = Math.random() * 3 + 1;
            this.speed = Math.random() * 2 + 0.5;
            this.alpha = Math.random();
        }
        update() { this.y -= this.speed; if (this.y < 0) this.reset(); }
        draw() {
            ctx.fillStyle = `rgba(168, 85, 247, ${this.alpha})`;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    for (let i = 0; i < 60; i++) particles.push(new Particle());

    function animateParticles() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        particles.forEach(p => { p.update(); p.draw(); });
        requestAnimationFrame(animateParticles);
    }
    animateParticles();
    function startReveal() {
        const content = document.getElementById("br-content");
        overlay.classList.remove("active");
        content.classList.remove("br-shake");

        setTimeout(() => {
            overlay.classList.add("active");
            setTimeout(() => content.classList.add("br-shake"), 400);
        }, 100);
    }

    function closeReveal() {
        overlay.style.opacity = "0";
        setTimeout(() => {
            overlay.classList.remove("active");
            overlay.style.opacity = "";
            overlay.style.display = "none";
            localStorage.setItem(FLAG_KEY, "1");
        }, 500);
    }

    document.getElementById("br-close-btn").addEventListener("click", closeReveal);
    overlay.addEventListener("click", function (e) {
        if (e.target === overlay) closeReveal();
    });

    setTimeout(startReveal, 500);
})();