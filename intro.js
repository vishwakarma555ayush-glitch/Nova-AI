
(() => {
    // Intro sirf successful login ke baad chalega.
    if (sessionStorage.getItem("novaShowIntro") !== "true") {
        return;
    }

    sessionStorage.removeItem("novaShowIntro");

    const intro = document.createElement("div");
    intro.id = "nova-intro";

    intro.innerHTML = `
        <div class="intro-background"></div>

        <div class="intro-content">

            <div class="intro-orb">
                <div class="intro-ring intro-ring-one"></div>
                <div class="intro-ring intro-ring-two"></div>
                <div class="intro-ring intro-ring-three"></div>
                <div class="intro-scan"></div>
                <div class="intro-core"></div>
            </div>

            <div class="intro-brand">NOVA <span>AI</span></div>

            <div class="intro-welcome">WELCOME TO YOUR AI WORLD</div>

            <div class="intro-creator">CREATED BY AYUSH</div>

            <div class="intro-loader">
                <span></span>
            </div>

            <div class="intro-loading-text">INITIALIZING NOVA SYSTEM...</div>

        </div>

        <button id="nova-intro-skip" type="button">SKIP INTRO →</button>
    `;

    document.body.appendChild(intro);

    // Floating particles
    for (let i = 0; i < 38; i++) {
        const particle = document.createElement("span");
        particle.className = "intro-particle";

        const angle = Math.random() * Math.PI * 2;
        const distance = 90 + Math.random() * 180;

        particle.style.left = "50%";
        particle.style.top = "50%";
        particle.style.setProperty("--move-x", `${Math.cos(angle) * distance}px`);
        particle.style.setProperty("--move-y", `${Math.sin(angle) * distance}px`);
        particle.style.animationDelay = `${Math.random() * 2}s`;
        particle.style.animationDuration = `${2 + Math.random() * 2}s`;

        intro.appendChild(particle);
    }

    let finished = false;

    function finishIntro() {
        if (finished) return;

        finished = true;
        intro.classList.add("intro-exit");

        setTimeout(() => {
            intro.remove();

            // Smooth reveal of the home page
            document.body.classList.add("nova-home-revealed");
        }, 900);
    }

    document.getElementById("nova-intro-skip").addEventListener(
        "click",
        finishIntro
    );

    const duration = window.matchMedia(
        "(prefers-reduced-motion: reduce)"
    ).matches ? 1200 : 5400;

    setTimeout(finishIntro, duration);

})();
