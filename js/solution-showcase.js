// "Why Choose Us" interactive solution showcase (homepage only).
// Hovering a left-column item expands it and smoothly cross-fades the right-column image.
// Uses a two-phase fade: old image fades out → src swapped → new image fades in,
// all timed to match the CSS transition duration for a buttery-smooth experience.
(function () {
    document.addEventListener("DOMContentLoaded", function () {
        var items = document.querySelectorAll(".solution-showcase-item");
        var image = document.getElementById("chooseusActiveImage");
        if (!items.length || !image) return;

        var swapTimer = null;

        function activate(item) {
            if (item.classList.contains("active")) return;

            // Collapse all, then expand the hovered item
            items.forEach(function (i) {
                i.classList.remove("active");
            });
            item.classList.add("active");

            var src = item.getAttribute("data-img");
            var alt = item.getAttribute("data-alt") || "";
            if (!src) return;

            // Avoid re-swapping if image is already the target
            if (image.getAttribute("src") === src || image.src.indexOf(src.split('/').pop()) !== -1) return;

            clearTimeout(swapTimer);
            image.classList.add("is-swapping");

            swapTimer = setTimeout(function () {
                // Swap src while invisible
                image.setAttribute("src", src);
                image.setAttribute("alt", alt);

                // Fade in new image on next frame
                requestAnimationFrame(function () {
                    image.classList.remove("is-swapping");
                });
            }, 300); // must match CSS transition duration (0.3s)
        }

        items.forEach(function (item) {
            item.addEventListener("mouseenter", function () {
                activate(item);
            });
            item.addEventListener("focusin", function () {
                activate(item);
            });
        });
    });
})();
