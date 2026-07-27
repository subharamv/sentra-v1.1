/**
 * Animated Theme Switch with View Transitions API
 * Inspired by Magic UI Theme Toggler
 * Smooth circular wipe animation when toggling light/dark modes
 */

(function () {
    'use strict';

    const themeSwitch = document.getElementById('themeSwitch');
    const themeIcon = document.getElementById('themeIcon');

    // Check for saved theme preference or default to 'dark'
    const currentTheme = localStorage.getItem('theme') || 'dark';

    // Apply a theme without animation (used for initial load)
    function applyThemeInstant(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('theme', theme);

        if (theme === 'dark') {
            localStorage.removeItem('lightmode');
            if (document.body) {
                document.body.classList.add('dark-mode');
                document.body.classList.remove('lightmode');
            }
        } else {
            localStorage.setItem('lightmode', 'active');
            if (document.body) {
                document.body.classList.add('lightmode');
                document.body.classList.remove('dark-mode');
            }
        }

        if (themeIcon) {
            themeIcon.textContent = theme === 'dark' ? 'light_mode' : 'dark_mode';
        }

        // Dispatch a custom event so other scripts can react to theme changes
        document.dispatchEvent(new CustomEvent('themeChanged', {
            detail: { theme: theme }
        }));
    }

    // Apply theme with animated circular wipe via View Transitions API
    function applyThemeAnimated(newTheme, originX, originY) {
        // Check for View Transition support and reduced motion preference
        if (!document.startViewTransition || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            applyThemeInstant(newTheme);
            return;
        }

        // Calculate radius to furthest viewport corner so the circle always covers the screen
        const endRadius = Math.hypot(
            Math.max(originX, window.innerWidth - originX),
            Math.max(originY, window.innerHeight - originY)
        );

        // Start the view transition - reuse applyThemeInstant for the actual DOM changes
        const transition = document.startViewTransition(() => {
            applyThemeInstant(newTheme);
        });

        // Animate the clip-path circular wipe from the toggle button
        transition.ready.then(() => {
            document.documentElement.animate(
                {
                    clipPath: [
                        `circle(0px at ${originX}px ${originY}px)`,
                        `circle(${endRadius}px at ${originX}px ${originY}px)`
                    ]
                },
                {
                    duration: 500,
                    easing: 'ease-in-out',
                    pseudoElement: '::view-transition-new(root)'
                }
            );
        });
    }

    // Initialize with current theme
    applyThemeInstant(currentTheme);

    // Theme switch on click
    if (themeSwitch) {
        themeSwitch.addEventListener('click', function (event) {
            const current = document.documentElement.getAttribute('data-theme') || 'dark';
            const newTheme = current === 'dark' ? 'light' : 'dark';

            // Get toggle button center position for the wipe origin
            const rect = themeSwitch.getBoundingClientRect();
            const originX = rect.left + rect.width / 2;
            const originY = rect.top + rect.height / 2;

            // Add rotation animation to icon
            if (themeIcon) {
                themeIcon.classList.add('rotating');
                setTimeout(function () {
                    if (themeIcon) themeIcon.classList.remove('rotating');
                }, 600);
            }

            applyThemeAnimated(newTheme, originX, originY);
        });
    }

})();
