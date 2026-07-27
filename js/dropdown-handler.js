/**
 * Enhanced Dropdown Handler
 * Handles hover functionality and proper closing behavior for header dropdowns
 */

$(document).ready(function () {
    initDropdownHandler();
});

function initDropdownHandler() {
    let dropdownTimeout;

    // Handle hover events for dropdown menus
    $('.nav-item.dropdown').each(function () {
        const $dropdown = $(this);
        const $dropdownMenu = $dropdown.find('.dropdown-menu');
        const $dropdownToggle = $dropdown.find('.dropdown-toggle');

        // Mouse enter on dropdown item
        $dropdown.on('mouseenter', function () {
            clearTimeout(dropdownTimeout);

            // Hide all other dropdowns first
            $('.nav-item.dropdown').not($dropdown).find('.dropdown-menu').removeClass('show');
            $('.nav-item.dropdown').not($dropdown).find('.dropdown-toggle').attr('aria-expanded', 'false');

            // Show current dropdown
            $dropdownMenu.addClass('show');
            $dropdownToggle.attr('aria-expanded', 'true');
        });

        // Mouse leave on dropdown item
        $dropdown.on('mouseleave', function () {
            dropdownTimeout = setTimeout(function () {
                $dropdownMenu.removeClass('show');
                $dropdownToggle.attr('aria-expanded', 'false');
            }, 150); // Small delay to prevent flickering
        });

        // Prevent dropdown from closing when hovering over the menu
        $dropdownMenu.on('mouseenter', function () {
            clearTimeout(dropdownTimeout);
        });

        $dropdownMenu.on('mouseleave', function () {
            dropdownTimeout = setTimeout(function () {
                $dropdownMenu.removeClass('show');
                $dropdownToggle.attr('aria-expanded', 'false');
            }, 150);
        });

        // Handle click events (for mobile/touch devices)
        $dropdownToggle.on('click', function (e) {
            const isCurrentlyOpen = $dropdownMenu.hasClass('show');
            const href = $(this).attr('href');

            if (isCurrentlyOpen && href && href !== '#') {
                return;
            }

            e.preventDefault();

            if (isCurrentlyOpen) {
                $dropdownMenu.removeClass('show');
                $dropdownToggle.attr('aria-expanded', 'false');
            } else {
                $('.nav-item.dropdown .dropdown-menu').removeClass('show');
                $('.nav-item.dropdown .dropdown-toggle').attr('aria-expanded', 'false');

                $dropdownMenu.addClass('show');
                $dropdownToggle.attr('aria-expanded', 'true');
            }
        });
    });

    // Close dropdowns when clicking outside
    $(document).on('click', function (e) {
        if (!$(e.target).closest('.nav-item.dropdown').length) {
            $('.nav-item.dropdown .dropdown-menu').removeClass('show');
            $('.nav-item.dropdown .dropdown-toggle').attr('aria-expanded', 'false');
        }
    });

    // Close dropdowns when pressing Escape key
    $(document).on('keydown', function (e) {
        if (e.key === 'Escape') {
            $('.nav-item.dropdown .dropdown-menu').removeClass('show');
            $('.nav-item.dropdown .dropdown-toggle').attr('aria-expanded', 'false');
        }
    });

    // Handle dropdown item clicks
    $('.dropdown-item').on('click', function () {
        // Close all dropdowns when an item is clicked
        $('.nav-item.dropdown .dropdown-menu').removeClass('show');
        $('.nav-item.dropdown .dropdown-toggle').attr('aria-expanded', 'false');
    });

    // Handle product link clicks (for new product dropdown structure)
    $('.product-link, .column-title, .explore-btn .link-content').on('click', function () {
        // Close all dropdowns when a product link is clicked
        $('.nav-item.dropdown .dropdown-menu').removeClass('show');
        $('.nav-item.dropdown .dropdown-toggle').attr('aria-expanded', 'false');
    });
}

// Reinitialize dropdown handler when header is loaded dynamically
function reinitDropdownHandler() {
    initDropdownHandler();
}

// Export function for use in other scripts
window.reinitDropdownHandler = reinitDropdownHandler;