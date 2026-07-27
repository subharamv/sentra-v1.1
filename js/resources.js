/* ==========================================================================
   Resources Hub — data + interaction logic
   Unifies Blogs, Case Studies and Articles into one filterable page.
   ========================================================================== */

(function () {
    'use strict';

    var RESOURCES = [
        // ---------- Blogs ----------
        {
            id: 'blog-digital-twins-mesh-pointcloud-splatting',
            title: 'The Future of Digital Twins: Mesh, Point Clouds, and Gaussian Splatting Compared',
            excerpt: 'Discover how Mesh, Point Clouds, and Gaussian Splatting are transforming Digital Twins, BIM, and laser scanning for the AEC industry.',
            category: 'Digital Twin',
            color: 'purple',
            type: 'blogs',
            date: '24 Jul 2026',
            image: './image/products/scanners/lixel-k2-mesh-comparison.jpg',
            link: './blogs/future-digital-twins-mesh-point-cloud-gaussian-splatting.html',
            featured: true
        },
        {
            id: 'blog-seismic-monitoring',
            title: 'Seismic Monitoring for Buildings and Critical Infrastructure',
            excerpt: 'How IoT-enabled seismic monitoring systems protect buildings, bridges, dams, and tunnels from earthquake damage through real-time structural assessment.',
            category: 'Structural Health',
            color: 'blue',
            type: 'blogs',
            date: '15 Jun 2026',
            image: './image/blogs/banners/blogs_seismic-monitoring-buildings-critical-infrastructure.webp',
            link: './blogs/seismic-monitoring-buildings-critical-infrastructure.html'
        },
        {
            id: 'blog-construction-vibrations',
            title: 'Monitoring Construction-Induced Vibrations in Urban Environments',
            excerpt: 'Best practices for monitoring construction vibrations in dense urban settings — from pile driving to demolition — using real-time IoT sensor networks.',
            category: 'Structural Monitoring',
            color: 'orange',
            type: 'blogs',
            date: '10 Jun 2026',
            image: './image/blogs/banners/blogs_monitoring-construction-induced-vibrations.webp',
            link: './blogs/monitoring-construction-induced-vibrations.html'
        },
        {
            id: 'blog-bridge-warning-signs',
            title: '10 Early Warning Signs Your Bridge Needs Continuous Monitoring',
            excerpt: 'From cracking patterns to vibration anomalies — discover the 10 critical indicators that demand real-time structural health monitoring for bridges.',
            category: 'Bridge Safety',
            color: 'rose',
            type: 'blogs',
            date: '5 Jun 2026',
            image: './image/blogs/banners/blogs_10-early-warning-signs-bridge-continuous-monitoring.webp',
            link: './blogs/10-early-warning-signs-bridge-continuous-monitoring.html',
            featured: true
        },
        {
            id: 'blog-pump',
            title: 'Intelligent Pump House Monitoring & Control',
            excerpt: 'Intelligent monitoring and control system for pump houses with 40% energy savings.',
            category: 'Smart Pumping',
            color: 'teal',
            type: 'blogs',
            date: '20 May 2026',
            image: './image/blogs/banners/blogs_intelligent-pump-house-monitoring-and-control.webp',
            link: './blogs/intelligent-pump-house-monitoring-and-control.html'
        },
        {
            id: 'blog-iot',
            title: 'Advanced IoT Solutions',
            excerpt: 'Comprehensive IoT implementation with smart sensors and real-time data analytics.',
            category: 'IoT Sensors',
            color: 'blue',
            type: 'blogs',
            date: '15 Apr 2026',
            image: './image/blogs/banners/blogs_advanced-iot-solutions.webp',
            link: './blogs/advanced-iot-solutions.html'
        },
        {
            id: 'blog-facility',
            title: 'Asset Monitoring & Facility Management',
            excerpt: 'Comprehensive IoT implementation with smart sensors for real-time monitoring and management.',
            category: 'Facility Management',
            color: 'purple',
            type: 'blogs',
            date: '1 Mar 2026',
            image: './image/blogs/banners/blogs_asset-monitoring-facility-management.webp',
            link: './blogs/asset-monitoring-facility-management.html'
        },
        {
            id: 'blog-realtime',
            title: 'Real-Time Monitoring Solutions',
            excerpt: 'Transforming infrastructure safety & performance with always-on sensor networks.',
            category: 'Monitoring',
            color: 'teal',
            type: 'blogs',
            date: '15 Jan 2026',
            image: './image/blogs/banners/blogs_real-time-monitoring-solutions-transforming-infrastructure-safety-performance.webp',
            link: './blogs/real-time-monitoring-solutions-transforming-infrastructure-safety-performance.html'
        },
        {
            id: 'blog-fatigue',
            title: 'Fatigue Life Assessment',
            excerpt: 'Extending the service life of structures with IoT-powered monitoring.',
            category: 'Fatigue Analysis',
            color: 'blue',
            type: 'blogs',
            date: '1 Dec 2025',
            image: './image/blogs/banners/blogs_fatigue-life-assessment.webp',
            link: './blogs/fatigue-life-assessment.html'
        },
        {
            id: 'blog-shm',
            title: 'Structural Health Monitoring',
            excerpt: 'Continuous SHM that protects infrastructure, cuts maintenance spend, and prolongs asset life.',
            category: 'Structural Health',
            color: 'orange',
            type: 'blogs',
            date: '15 Oct 2025',
            image: './image/blogs/banners/blogs_structural-health-monitoring.webp',
            link: './blogs/structural-health-monitoring.html'
        },
        {
            id: 'blog-bridge-damage',
            title: 'Top 5 Hidden Structural Damages Manual Bridge Inspection Misses',
            excerpt: 'Bridge inspection plays a critical role in maintaining infrastructure safety and operational continuity.',
            category: 'Bridge Safety',
            color: 'rose',
            type: 'blogs',
            date: '1 Sep 2025',
            image: './image/blogs/banners/blogs_top-5-hidden-structural-damages-bridge-inspection.webp',
            link: './blogs/top-5-hidden-structural-damages-bridge-inspection.html',
            featured: true
        },

        // ---------- Case Studies ----------
        {
            id: 'cs-highway-shm',
            title: 'Structural Health Monitoring of Highway Bridges',
            excerpt: 'Continuous SHM enabling early deterioration detection and predictive maintenance for aging highway infrastructure through real-time sensor data and engineering analytics.',
            category: 'Infrastructure',
            color: 'teal',
            type: 'case-studies',
            date: '16 Jul 2026',
            image: './image/case-studies/banners/case_studies_structural-health-monitoring-of-highway-bridges.webp',
            link: './case-studies/structural-health-monitoring-of-highway-bridges.html'
        },
        {
            id: 'cs-railway',
            title: 'IoT Bridge Monitoring & Sensor Installation on Railway Bridges',
            excerpt: '24×7 monitoring, instant alerts, and data-driven decisions for safer rail networks.',
            category: 'Railways',
            color: 'blue',
            type: 'case-studies',
            date: '1 Jun 2026',
            image: './image/case-studies/banners/case_studies_iot-bridge-monitoring-and-sensor-installation-on-railway-bridges.webp',
            link: './case-studies/iot-bridge-monitoring-and-sensor-installation-on-railway-bridges.html'
        },
        {
            id: 'cs-bridgepulse',
            title: 'BridgePulse — AI & Drone Technology for Bridge Health Monitoring',
            excerpt: 'Impact of implementation of IoT sensors and regularized monitoring devices on bridge health programs.',
            category: 'Bridge Safety',
            color: 'rose',
            type: 'case-studies',
            date: '1 Mar 2026',
            image: './image/case-studies/banners/case_studies_bridgepluse-ai-and-drone-technology-for-bridge-health-monitoring.webp',
            link: './case-studies/bridgepluse-ai-and-drone-technology-for-bridge-health-monitoring.html',
            featured: true
        },

        // ---------- Articles ----------
        {
            id: 'art-worldsensing-partnership',
            title: 'Celebrating One Year of Partnership: Clove Technologies & Worldsensing',
            excerpt: 'Clove Technologies and Worldsensing celebrate one year of partnership in India, advancing smarter, safer, and connected infrastructure monitoring through wireless IoT solutions.',
            category: 'Company News',
            color: 'orange',
            type: 'articles',
            date: '23 Jul 2026',
            image: './image/articles/worldsensing-official-reseller-india.png',
            link: './article/worldsensing-official-reseller-india.html',
            featured: true
        },
        {
            id: 'art-xgrids-reseller',
            title: 'Clove Technologies Becomes Authorized XGRIDS Reseller in India',
            excerpt: 'Clove Technologies is now an authorized reseller of XGRIDS products in India, offering Lixel K2, PortalCam, Lixel L2 Pro, and LixelKity K1 for advanced 3D reality capture, LiDAR, and Digital Twin solutions.',
            category: 'Company News',
            color: 'orange',
            type: 'articles',
            date: '23 Jul 2026',
            image: './image/articles/xgrids-authorized-reseller-india.png',
            link: './article/xgrids-authorized-reseller-india.html',
            featured: true
        },
        {
            id: 'art-pump',
            title: 'Intelligent Pump House Monitoring & Control',
            excerpt: 'Transforming water infrastructure with IoT-driven efficiency, predictive maintenance, and energy optimization.',
            category: 'Smart Pumping',
            color: 'teal',
            type: 'articles',
            date: '26 Feb 2026',
            image: './image/articles/article_Intelligent%20Pump%20House%20Monitoring%20%26%20Control.webp',
            link: './article/intelligent-pump-house-monitoring-and-control.html',
            featured: true
        },
        {
            id: 'art-smartcities',
            title: 'Building Resilient Smart Cities with Data-Driven Insights',
            excerpt: 'Learn how connected IoT systems are shaping the future of urban planning and sustainable infrastructure.',
            category: 'Smart Cities',
            color: 'purple',
            type: 'articles',
            date: '3 Nov 2025',
            image: './image/articles/article_Building%20Resilient%20Smart%20Cities%20with%20Data-Driven%20Insights.webp',
            link: './article/building-resilient-smart-cities-with-data-driven-insights.html'
        },
        {
            id: 'art-rail-monitoring',
            title: 'Track to the Future: How Remote Monitoring Helps Safeguard Rail and Civil Infrastructure',
            excerpt: 'IoT sensors, wireless monitoring, and Digital Twin technology are reshaping the safety and longevity of aging rail and civil infrastructure assets worldwide.',
            category: 'Rail Infrastructure',
            color: 'orange',
            type: 'articles',
            date: '24 Jun 2026',
            image: './image/articles/article_track-to-the-future-remote-monitoring-rail-infrastructure.webp',
            link: './article/track-to-the-future-remote-monitoring-rail-infrastructure.html',
            featured: true
        }
    ];

    var TABS = [
        { id: 'all', label: 'All Resources', icon: 'fa-solid fa-layer-group' },
        { id: 'blogs', label: 'Blogs', icon: 'fa-solid fa-blog' },
        { id: 'case-studies', label: 'Case Studies', icon: 'fa-solid fa-award' },
        { id: 'articles', label: 'Articles', icon: 'fa-solid fa-newspaper' }
    ];

    var TYPE_ICON = {
        blogs: 'fa-solid fa-blog',
        'case-studies': 'fa-solid fa-award',
        articles: 'fa-solid fa-newspaper'
    };

    var TYPE_ACTION = {
        blogs: 'Read Blog',
        'case-studies': 'Read Case Study',
        articles: 'Read Article'
    };

    var SECTION_ICON_COLOR = {
        blogs: 'rh-grad-orange',
        'case-studies': 'rh-grad-rose',
        articles: 'rh-grad-blue'
    };

    var state = {
        tab: 'all',
        search: '',
        categories: []
    };

    function parseDate(str) {
        if (!str) return 0;
        var parts = str.match(/(\d+)\s+(\w+)\s+(\d+)/);
        if (!parts) return 0;
        var months = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
        return new Date(parseInt(parts[3]), months[parts[2]] || 0, parseInt(parts[1])).getTime();
    }

    function sortByDate(arr) {
        return arr.slice().sort(function (a, b) { return parseDate(b.date) - parseDate(a.date); });
    }

    function escapeHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function allCategories() {
        var seen = {};
        var out = [];
        RESOURCES.forEach(function (r) {
            if (!seen[r.category]) {
                seen[r.category] = true;
                out.push(r.category);
            }
        });
        return out;
    }

    function byType(type) {
        return RESOURCES.filter(function (r) { return r.type === type; });
    }

    function filteredResources() {
        var q = state.search.trim().toLowerCase();
        return RESOURCES.filter(function (r) {
            var matchesTab = state.tab === 'all' || r.type === state.tab;
            var matchesSearch = !q ||
                r.title.toLowerCase().indexOf(q) !== -1 ||
                r.excerpt.toLowerCase().indexOf(q) !== -1 ||
                r.category.toLowerCase().indexOf(q) !== -1;
            var matchesCategory = state.categories.length === 0 || state.categories.indexOf(r.category) !== -1;
            return matchesTab && matchesSearch && matchesCategory;
        });
    }

    function cardMarkup(r, variant) {
        var icon = TYPE_ICON[r.type] || 'fa-solid fa-sparkles';
        var action = TYPE_ACTION[r.type] || 'View';
        var variantClass = variant === 'featured' ? ' rh-card--featured' : (variant === 'compact' ? ' rh-card--compact' : '');
        var metaBits = [];
        if (r.date) metaBits.push('<span>' + escapeHtml(r.date) + '</span>');

        var titleTag = variant === 'compact' ? 'h4' : 'h3';

        return (
            '<a href="' + r.link + '" class="rh-card' + variantClass + '" data-id="' + r.id + '">' +
            '<div class="rh-card-banner rh-grad-' + r.color + (r.image ? ' has-image' : '') + '">' +
            (r.image ? '<img class="rh-card-img" src="' + r.image + '" alt="' + escapeHtml(r.title) + '" loading="lazy">' : '') +
            '<i class="' + icon + ' rh-banner-icon"></i>' +
            '<span class="rh-card-type"><i class="' + icon + '"></i></span>' +
            (variant !== 'compact' ? '<span class="rh-card-tag">' + escapeHtml(r.category) + '</span>' : '') +
            '</div>' +
            '<div class="rh-card-body">' +
            (variant === 'compact' ? '<span class="rh-card-tag" style="position:static;display:inline-block;margin-bottom:6px;background:transparent;border:0;padding:0;color:var(--accent-color);">' + escapeHtml(r.category) + '</span>' : '') +
            '<' + titleTag + ' class="rh-card-title">' + escapeHtml(r.title) + '</' + titleTag + '>' +
            '<p class="rh-card-excerpt">' + escapeHtml(r.excerpt) + '</p>' +
            '<div class="rh-card-foot">' +
            '<span class="rh-card-meta">' + metaBits.join('') + '</span>' +
            '<span class="rh-card-action">' + action + ' <i class="fa-solid fa-arrow-right"></i></span>' +
            '</div>' +
            '</div>' +
            '</a>'
        );
    }

    function renderHero() {
        $('#rh-count-blogs').text(byType('blogs').length);
        $('#rh-count-cs').text(byType('case-studies').length);
        $('#rh-count-articles').text(byType('articles').length);
    }

    function renderCategories() {
        var $wrap = $('#rh-categories');
        $wrap.empty();
        allCategories().forEach(function (cat) {
            var active = state.categories.indexOf(cat) !== -1;
            var $chip = $('<button type="button" class="rh-chip' + (active ? ' active' : '') + '">' + escapeHtml(cat) + '</button>');
            $chip.on('click', function () {
                var idx = state.categories.indexOf(cat);
                if (idx === -1) state.categories.push(cat); else state.categories.splice(idx, 1);
                render();
            });
            $wrap.append($chip);
        });
    }

    function renderTabs() {
        var $wrap = $('#rh-tabs');
        $wrap.empty();
        TABS.forEach(function (tab) {
            var $btn = $('<button type="button" class="rh-tab' + (state.tab === tab.id ? ' active' : '') + '"><i class="' + tab.icon + '"></i><span>' + tab.label + '</span></button>');
            $btn.on('click', function () {
                state.tab = tab.id;
                render();
                var target = document.getElementById('rh-section-' + tab.id);
                if (target) {
                    setTimeout(function () {
                        window.scrollTo({ top: target.getBoundingClientRect().top + window.scrollY - 110, behavior: 'smooth' });
                    }, 80);
                }
            });
            $wrap.append($btn);
        });
    }

    function renderRecent(filtered) {
        var $section = $('#rh-recent');
        var pool = filtered.length ? filtered : RESOURCES;
        var ordered = sortByDate(pool).slice(0, 6);

        if (!ordered.length) {
            $section.hide();
            return;
        }
        $section.show();

        var featured = ordered[0];
        var rest = ordered.slice(1, 6); // max 5 slides

        var html = '<div class="rh-featured-layout">';
        html += '<div class="rh-featured-col">' + cardMarkup(featured, 'featured') + '</div>';

        html += '<div class="rh-compact-carousel">';
        html += '<div class="rh-compact-track">';
        rest.forEach(function (r) {
            html += '<div class="rh-compact-slide">' + cardMarkup(r, 'compact') + '</div>';
        });
        html += '</div>';
        if (rest.length > 1) {
            html += '<div class="rh-compact-dots">';
            rest.forEach(function (_, i) {
                html += '<button class="rh-compact-dot" data-idx="' + i + '" aria-label="Slide ' + (i + 1) + '"></button>';
            });
            html += '</div>';
        }
        html += '</div>';
        html += '</div>';

        $('#rh-recent-grid').html(html);
        $('#rh-recent-heading').text(state.search ? 'Search Results for "' + state.search + '"' : 'Recently Published');

        // Init compact carousel with GSAP
        (function () {
            var $carousel = $('#rh-recent-grid .rh-compact-carousel');
            if (!$carousel.length) return;
            var track = $carousel.find('.rh-compact-track')[0];
            var dots = $carousel.find('.rh-compact-dot').toArray();
            var total = $carousel.find('.rh-compact-slide').length;
            var current = 0;
            var timer;
            var DOT_W = 8;   // inactive dot width (px)
            var DOT_AW = 24; // active dot width (px)

            function goTo(idx) {
                current = (idx + total) % total;

                // Slide track via GSAP
                gsap.to(track, {
                    x: -(current * 100) + '%',
                    duration: 0.55,
                    ease: 'power2.inOut'
                });

                // Animate each dot
                dots.forEach(function (dot, i) {
                    if (i === current) {
                        gsap.to(dot, { width: DOT_AW, duration: 0.35, ease: 'power2.out' });
                        dot.classList.add('active');
                    } else {
                        gsap.to(dot, { width: DOT_W, duration: 0.35, ease: 'power2.out' });
                        dot.classList.remove('active');
                    }
                });
            }

            dots.forEach(function (dot) {
                dot.addEventListener('click', function () {
                    clearInterval(timer);
                    goTo(parseInt(dot.dataset.idx));
                    startAuto();
                });
            });

            function startAuto() {
                timer = setInterval(function () { goTo(current + 1); }, 3500);
            }

            // Set initial dot states instantly
            goTo(0);
            startAuto();
        }());
    }

    function renderCarousel(type, filtered) {
        var items = sortByDate(filtered.filter(function (r) { return r.type === type; }));
        var $section = $('#rh-section-' + type);
        var $track = $section.find('.rh-track');

        if (!items.length) {
            $track.empty();
            $section.hide();
            return;
        }
        $section.show();
        $section.find('.rh-section-count').text(items.length);

        $track.html(items.map(function (r) { return cardMarkup(r, 'default'); }).join(''));
        updateScrollButtons($section);
    }

    function updateScrollButtons($section) {
        var track = $section.find('.rh-track')[0];
        if (!track) return;
        var $left = $section.find('.rh-scroll-left');
        var $right = $section.find('.rh-scroll-right');
        $left.prop('disabled', track.scrollLeft <= 4);
        $right.prop('disabled', track.scrollLeft >= track.scrollWidth - track.clientWidth - 4);
    }

    function bindCarouselControls() {
        $('.rh-section').each(function () {
            var $section = $(this);
            var track = $section.find('.rh-track')[0];
            if (!track) return;

            $section.find('.rh-scroll-left').on('click', function () {
                track.scrollBy({ left: -track.clientWidth * 0.6, behavior: 'smooth' });
            });
            $section.find('.rh-scroll-right').on('click', function () {
                track.scrollBy({ left: track.clientWidth * 0.6, behavior: 'smooth' });
            });
            track.addEventListener('scroll', function () { updateScrollButtons($section); }, { passive: true });
            window.addEventListener('resize', function () { updateScrollButtons($section); });
        });
    }

    function render() {
        var filtered = filteredResources();

        renderTabs();
        renderCategories();
        $('#rh-results-count').text(filtered.length + (filtered.length === 1 ? ' RESULT' : ' RESULTS'));

        if (!filtered.length) {
            $('#rh-empty').show();
            $('#rh-recent').hide();
        } else {
            $('#rh-empty').hide();
            renderRecent(filtered);
        }

        renderCarousel('blogs', filtered);
        renderCarousel('case-studies', filtered);
        renderCarousel('articles', filtered);

        $('#rh-footer-blogs-count').text(byType('blogs').length);
        $('#rh-footer-cs-count').text(byType('case-studies').length);
        $('#rh-footer-articles-count').text(byType('articles').length);
        $('#rh-stat-total').text(RESOURCES.length);
        $('#rh-stat-current').text(filtered.length);
        $('#rh-stat-categories').text(allCategories().length);
    }

    function applyHashTab() {
        var hash = (window.location.hash || '').replace('#', '');
        var valid = TABS.some(function (t) { return t.id === hash; });
        if (valid) state.tab = hash;
    }

    $(function () {
        if (!$('.resources-hub').length) return;

        applyHashTab();
        $(window).on('hashchange', function () {
            applyHashTab();
            render();
        });
        renderHero();
        render();
        bindCarouselControls();

        $('#rh-search-input').on('input', function () {
            state.search = $(this).val();
            $('#rh-search-clear').toggle(!!state.search);
            render();
        });

        $('#rh-search-clear').on('click', function () {
            state.search = '';
            $('#rh-search-input').val('');
            $(this).hide();
            render();
        });

        $('#rh-empty-clear').on('click', function () {
            state.search = '';
            $('#rh-search-input').val('');
            $('#rh-search-clear').hide();
            render();
        });

        $('.rh-footer-tab-link').on('click', function () {
            state.tab = $(this).data('tab');
            render();
        });

        $('.rh-footer-cat-link').on('click', function () {
            var cat = $(this).data('cat');
            state.tab = 'all';
            state.categories = [cat];
            render();
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });

        $('.rh-clear-filters').on('click', function () {
            state.categories = [];
            state.search = '';
            $('#rh-search-input').val('');
            $('#rh-search-clear').hide();
            render();
        });

        $('.rh-back-top').on('click', function () {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
    });
})();
