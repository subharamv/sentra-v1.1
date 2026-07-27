(function () {
  'use strict';

  /* ─── Overview Accordion ─── */
  function initAccordion() {
    var items = document.querySelectorAll('.sol-accordion-item');
    if (!items.length) return;
    items.forEach(function (item) {
      var trigger = item.querySelector('.sol-accordion-trigger');
      if (!trigger) return;
      /* Desktop: open on hover */
      item.addEventListener('mouseenter', function () {
        if (window.innerWidth > 900) {
          items.forEach(function (i) { i.classList.remove('active'); });
          item.classList.add('active');
        }
      });
      /* Mobile: toggle on click */
      trigger.addEventListener('click', function () {
        if (window.innerWidth <= 900) {
          var isActive = item.classList.contains('active');
          items.forEach(function (i) { i.classList.remove('active'); });
          if (!isActive) item.classList.add('active');
        }
      });
    });
  }

  /* ─── How It Works Slideshow ─── */
  function initSlideshow() {
    document.querySelectorAll('.sol-slideshow').forEach(function (show) {
      var slides    = show.querySelectorAll('.sol-slide');
      var dots      = show.querySelectorAll('.sol-slide-indicator-dot');
      var prevBtn   = show.querySelector('.sol-slide-prev');
      var nextBtn   = show.querySelector('.sol-slide-next');
      var fill      = show.querySelector('.sol-slideshow-progress-fill');
      var counterEl = show.querySelector('.sol-slide-current');
      if (!slides.length) return;

      var current    = 0;
      var total      = slides.length;
      var timer      = null;
      var wheelBlock = false;
      var INTERVAL   = 5500;
      var scrollTrack = show.closest('.sol-how-scroll-track');
      var scrollMode  = !!(scrollTrack && window.innerWidth > 900);

      function updateUI() {
        if (fill)      fill.style.width = ((current + 1) / total * 100) + '%';
        if (counterEl) counterEl.textContent = String(current + 1).padStart(2, '0');
        dots.forEach(function (d, i) { d.classList.toggle('active', i === current); });
      }

      function goTo(n, isPrev) {
        var nxt = ((n % total) + total) % total;
        if (nxt === current) return;
        slides[current].classList.remove('active');
        if (isPrev) {
          var exEl = slides[current];
          exEl.classList.add('slide-exit-prev');
          setTimeout(function () { exEl.classList.remove('slide-exit-prev'); }, 560);
        }
        current = nxt;
        slides[current].classList.add('active');
        updateUI();
      }

      function toNext() { goTo(current + 1, false); }
      function toPrev() { goTo(current - 1, true); }

      /* ══ SCROLL-DRIVEN (desktop with .sol-how-scroll-track) ══ */
      if (scrollMode) {
        var vh = window.innerHeight;
        scrollTrack.style.height = (total + 1) * vh + 'px';

        function onPageScroll() {
          var rect = scrollTrack.getBoundingClientRect();
          var idx  = Math.max(0, Math.min(total - 1, Math.floor(-rect.top / vh)));
          if (idx !== current) goTo(idx, idx < current);
        }
        window.addEventListener('scroll', onPageScroll, { passive: true });
        onPageScroll();

        window.addEventListener('resize', function () {
          vh = window.innerHeight;
          scrollTrack.style.height = (total + 1) * vh + 'px';
          onPageScroll();
        }, { passive: true });

        function scrollToSlide(n) {
          var safeN    = Math.max(0, Math.min(total - 1, n));
          var trackTop = scrollTrack.getBoundingClientRect().top + window.scrollY;
          window.scrollTo({ top: trackTop + safeN * vh, behavior: 'smooth' });
        }
        if (nextBtn) nextBtn.addEventListener('click', function () { scrollToSlide(current + 1); });
        if (prevBtn) prevBtn.addEventListener('click', function () { scrollToSlide(current - 1); });
        dots.forEach(function (dot, i) {
          dot.addEventListener('click', function () { scrollToSlide(i); });
        });

      /* ══ AUTO-ADVANCE (mobile / no scroll track) ══ */
      } else {
        function resetTimer() {
          clearInterval(timer);
          timer = setInterval(toNext, INTERVAL);
        }
        if (nextBtn) nextBtn.addEventListener('click', function () { toNext(); resetTimer(); });
        if (prevBtn) prevBtn.addEventListener('click', function () { toPrev(); resetTimer(); });
        dots.forEach(function (dot, i) {
          dot.addEventListener('click', function () { goTo(i, i < current); resetTimer(); });
        });
        show.addEventListener('wheel', function (e) {
          if (wheelBlock) return;
          wheelBlock = true;
          setTimeout(function () { wheelBlock = false; }, 900);
          e.deltaY > 0 ? toNext() : toPrev();
          resetTimer();
        }, { passive: true });
        var touchX = 0;
        show.addEventListener('touchstart', function (e) {
          touchX = e.changedTouches[0].clientX;
        }, { passive: true });
        show.addEventListener('touchend', function (e) {
          var dx = e.changedTouches[0].clientX - touchX;
          if (Math.abs(dx) > 40) { dx < 0 ? toNext() : toPrev(); resetTimer(); }
        }, { passive: true });
        show.addEventListener('mouseenter', function () { clearInterval(timer); });
        show.addEventListener('mouseleave', function () { resetTimer(); });
        resetTimer();
      }

      updateUI();
    });
  }

  /* ─── Fix Hero Top Gap: measure header height dynamically ─── */
  function applyHeaderHeight() {
    var header = document.querySelector('header');
    var hero = document.querySelector('.sol-hero');
    if (!header || !hero) return;
    var h = header.offsetHeight;
    hero.style.setProperty('--sol-header-height', h + 'px');
  }

  /* Run as soon as DOM is interactive; re-run after header content loads */
  function initHeaderHeight() {
    applyHeaderHeight();
    /* Watch the #header container for async-loaded content */
    var headerEl = document.querySelector('#header');
    if (headerEl) {
      var obs = new MutationObserver(function () {
        /* requestAnimationFrame ensures layout is committed before measuring */
        requestAnimationFrame(function () {
          applyHeaderHeight();
        });
        obs.disconnect(); /* content is loaded, stop watching */
      });
      obs.observe(headerEl, { childList: true, subtree: true });
    }
    /* Re-apply on resize */
    window.addEventListener('resize', applyHeaderHeight, { passive: true });
  }

  function initSolutions() {
    if (typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined') {
      setTimeout(initSolutions, 100);
      return;
    }

    gsap.registerPlugin(ScrollTrigger);

    // Hero content staggered entrance
    var heroContent = document.querySelector('.sol-hero-content');
    if (heroContent) {
      var children = heroContent.children;
      gsap.from(children, {
        y: 40, opacity: 0, duration: 0.9, stagger: 0.15, ease: 'power3.out', delay: 0.4
      });
    }

    // Hero image card floating animation
    var imageCard = document.querySelector('.sol-hero-image-card');
    if (imageCard) {
      gsap.to(imageCard, {
        y: -18, duration: 3.5, ease: 'sine.inOut', repeat: -1, yoyo: true
      });
    }

    // Hero video parallax
    var heroVideo = document.querySelector('.sol-hero-video');
    if (heroVideo) {
      gsap.to(heroVideo, {
        yPercent: 20,
        ease: 'none',
        scrollTrigger: { trigger: '.sol-hero', start: 'top top', end: 'bottom top', scrub: true }
      });
    }

    // Scroll reveal — use fromTo() so we explicitly animate TO opacity:1 / transform:none
    // (avoids the bug where CSS opacity:0 makes gsap.from() animate 0→0)
    gsap.utils.toArray('.sol-reveal').forEach(function (el) {
      gsap.fromTo(el,
        { opacity: 0, y: 35 },
        { opacity: 1, y: 0, duration: 0.8, ease: 'power2.out',
          scrollTrigger: { trigger: el, start: 'top 88%', toggleActions: 'play none none none' }
        }
      );
    });

    gsap.utils.toArray('.sol-reveal-left').forEach(function (el) {
      gsap.fromTo(el,
        { opacity: 0, x: -35 },
        { opacity: 1, x: 0, duration: 0.8, ease: 'power2.out',
          scrollTrigger: { trigger: el, start: 'top 88%', toggleActions: 'play none none none' }
        }
      );
    });

    // Stagger bento cells
    gsap.utils.toArray('.sol-bento-grid').forEach(function (grid) {
      var cells = grid.querySelectorAll('.sol-bento-cell');
      gsap.fromTo(cells, { opacity: 0, y: 25 }, {
        opacity: 1, y: 0, duration: 0.65, stagger: 0.08, ease: 'power2.out',
        scrollTrigger: { trigger: grid, start: 'top 82%', toggleActions: 'play none none none' }
      });
    });

    // Step items stagger
    gsap.utils.toArray('.sol-steps').forEach(function (steps) {
      var items = steps.querySelectorAll('.sol-step');
      gsap.fromTo(items, { opacity: 0, x: -25 }, {
        opacity: 1, x: 0, duration: 0.7, stagger: 0.12, ease: 'power2.out',
        scrollTrigger: { trigger: steps, start: 'top 82%', toggleActions: 'play none none none' }
      });
    });

    // How It Works step images — reveal on scroll with alternating direction
    gsap.utils.toArray('.sol-how-step-image').forEach(function (img) {
      var direction = img.getAttribute('data-reveal') === 'right' ? 40 : -40;
      gsap.fromTo(img,
        { opacity: 0, x: direction },
        { opacity: 1, x: 0, duration: 0.9, ease: 'power3.out',
          scrollTrigger: { trigger: img, start: 'top 82%', toggleActions: 'play none none none' }
        }
      );
    });

    // Industry cards stagger
    gsap.utils.toArray('.sol-industry-grid').forEach(function (grid) {
      var cards = grid.querySelectorAll('.sol-industry-card');
      gsap.fromTo(cards, { opacity: 0, scale: 0.92 }, {
        opacity: 1, scale: 1, duration: 0.6, stagger: 0.07, ease: 'back.out(1.4)',
        scrollTrigger: { trigger: grid, start: 'top 83%', toggleActions: 'play none none none' }
      });
    });

    // Hero tags stagger
    var tags = document.querySelectorAll('.sol-tag');
    if (tags.length) {
      gsap.from(tags, { opacity: 0, y: 10, duration: 0.5, stagger: 0.08, delay: 0.6, ease: 'power2.out' });
    }
  }

  function initCounters() {
    if (typeof anime === 'undefined') { setTimeout(initCounters, 100); return; }
    var counters = document.querySelectorAll('.sol-stat-number[data-target]');
    if (!counters.length) return;
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var el = entry.target;
        var target = parseFloat(el.getAttribute('data-target'));
        var suffix = el.getAttribute('data-suffix') || '';
        var decimalsAttr = el.getAttribute('data-decimals');
        var decimals = decimalsAttr ? parseInt(decimalsAttr) : 0;
        var obj = { value: 0 };
        anime({
          targets: obj, value: target, duration: 2000, easing: 'easeOutExpo',
          update: function () {
            el.textContent = (decimals ? obj.value.toFixed(decimals) : Math.round(obj.value)) + suffix;
          }
        });
        observer.unobserve(el);
      });
    }, { threshold: 0.3 });
    counters.forEach(function (el) { observer.observe(el); });
  }

  /* ─── Close header dropdowns when scrolling past hero on solution pages ─── */
  /* (z-index handled by CSS: body.solution-page .navbar { z-index: 5 }  ) */
  function fixSolutionsDropdown() {
    window.addEventListener('scroll', function () {
      if (window.scrollY <= 50) return;
      document.querySelectorAll('.navbar .dropdown-menu.show').forEach(function (dd) {
        dd.classList.remove('show');
      });
    }, { passive: true });
  }

  function initScrollProgress() {
    var bar = document.querySelector('.sol-progress-bar');
    if (!bar) return;
    window.addEventListener('scroll', function () {
      var pct = (window.scrollY / (document.body.scrollHeight - window.innerHeight)) * 100;
      bar.style.width = pct + '%';
    }, { passive: true });
  }

  /* ═══ Safety net: reveal all hidden elements if GSAP/Anime fail ═══ */
  function solFallbackReveal() {
    document.querySelectorAll('.sol-reveal, .sol-reveal-left').forEach(function (el) {
      el.classList.add('sol-revealed');
    });
  }
  /* If GSAP hasn't loaded within 5s, reveal manually */
  setTimeout(function () {
    if (typeof gsap === 'undefined') {
      solFallbackReveal();
    }
  }, 5000);

  /* Also reveal on first scroll (catches edge cases) */
  var solFallbackScroll = function () {
    solFallbackReveal();
    window.removeEventListener('scroll', solFallbackScroll);
  };
  window.addEventListener('scroll', solFallbackScroll, { once: true, passive: true });

  /* ═══ Risk Carousel (Swiper) ═══ */
  function initRiskCarousel() {
    if (typeof Swiper === 'undefined') { setTimeout(initRiskCarousel, 100); return; }
    document.querySelectorAll('.sol-risk-carousel .swiper').forEach(function (el) {
      /* If already initialized, skip */
      if (el.swiper) return;
      new Swiper(el, {
        slidesPerView: 1,
        spaceBetween: 20,
        loop: true,
        pagination: {
          el: el.closest('.sol-risk-carousel').querySelector('.swiper-pagination'),
          clickable: true
        },
        navigation: {
          nextEl: el.closest('.sol-risk-carousel').querySelector('.sol-risk-next'),
          prevEl: el.closest('.sol-risk-carousel').querySelector('.sol-risk-prev')
        },
        autoplay: {
          delay: 3000,
          disableOnInteraction: false,
          pauseOnMouseEnter: true
        },
        speed: 600,
        breakpoints: {
          640: { slidesPerView: 2 },
          1024: { slidesPerView: 3 }
        }
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      initHeaderHeight();
      initAccordion();
      initSlideshow();
      initSolutions();
      initCounters();
      initScrollProgress();
      initRiskCarousel();
      fixSolutionsDropdown();
    });
  } else {
    initHeaderHeight();
    initAccordion();
    initSlideshow();
    initSolutions();
    initCounters();
    initScrollProgress();
    initRiskCarousel();
    fixSolutionsDropdown();
  }
})();
