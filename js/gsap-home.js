// Homepage-only GSAP animations. Loaded after GSAP + ScrollTrigger CDN scripts.
// Degrades silently if GSAP fails to load (e.g. offline) so the page never breaks.
(function () {
    if (typeof gsap === "undefined") return;
    gsap.registerPlugin(ScrollTrigger);

    function initHeroTimeline() {
        var headline = document.querySelector(".title-heading-banner");
        var subheading = document.querySelector(".hero-subheading");
        var pills = gsap.utils.toArray(".hero-solution-pill");
        var tagline = document.querySelector(".hero-tagline");
        var ctaButtons = gsap.utils.toArray(".hero-actions .btn-accent");
        var reviewer = document.querySelector(".banner-reviewer");
        var videoCard = document.querySelector(".hero-video-card");

        if (!headline) return;

        gsap.set([headline, subheading, tagline, reviewer], { opacity: 0, y: 24 });
        gsap.set(pills, { opacity: 0, y: 12 });
        gsap.set(ctaButtons, { opacity: 0, y: 16 });
        if (videoCard) gsap.set(videoCard, { opacity: 0, x: 24 });

        var tl = gsap.timeline({ delay: 0.2 });
        tl.to(headline, { opacity: 1, y: 0, duration: 0.8, ease: "power3.out" })
            .to(subheading, { opacity: 1, y: 0, duration: 0.6, ease: "power3.out" }, "-=0.4")
            .to(pills, { opacity: 1, y: 0, duration: 0.5, ease: "power2.out", stagger: 0.08 }, "-=0.3")
            .to(tagline, { opacity: 1, y: 0, duration: 0.5, ease: "power2.out" }, "-=0.2")
            .to(ctaButtons, { opacity: 1, y: 0, duration: 0.5, ease: "power2.out", stagger: 0.1 }, "-=0.3")
            .to(reviewer, { opacity: 1, y: 0, duration: 0.5, ease: "power2.out" }, "-=0.3");

        if (videoCard) {
            tl.to(videoCard, { opacity: 1, x: 0, duration: 0.6, ease: "power3.out" }, "-=0.9");
        }
    }

    function initSolutionCardsReveal() {
        var cards = gsap.utils.toArray(".card-solution-col");
        if (!cards.length) return;

        gsap.set(cards, { opacity: 0, y: 40 });

        ScrollTrigger.batch(cards, {
            start: "top 88%",
            onEnter: function (batch) {
                gsap.to(batch, {
                    opacity: 1,
                    y: 0,
                    duration: 0.6,
                    ease: "power3.out",
                    stagger: 0.12,
                });
            },
            once: true,
        });
    }

    function initSolutionCardTilt() {
        var cards = gsap.utils.toArray(".card-solution");
        cards.forEach(function (card) {
            var media = card.querySelector(".card-solution-media img");
            card.addEventListener("mouseenter", function () {
                gsap.to(card, { y: -6, duration: 0.3, ease: "power2.out" });
            });
            card.addEventListener("mouseleave", function () {
                gsap.to(card, { y: 0, duration: 0.3, ease: "power2.out" });
            });
        });
    }

    document.addEventListener("DOMContentLoaded", function () {
        // Header/hero markup is present immediately in index.html (not fetched),
        // so the hero timeline can run right away.
        initHeroTimeline();

        // Solution cards live further down the static markup too, but ScrollTrigger
        // needs layout to settle first.
        ScrollTrigger.refresh();
        initSolutionCardsReveal();
        initSolutionCardTilt();
    });
})();
