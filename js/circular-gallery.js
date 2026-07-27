// Circular Gallery Implementation
class CircularGallery {
    constructor(container, options = {}) {
        this.container = container;
        this.options = {
            bend: options.bend || 3,
            textColor: options.textColor || '#ffffff',
            borderRadius: options.borderRadius || 0.05,
            scrollEase: options.scrollEase || 0.02,
            scrollSpeed: options.scrollSpeed || 2,
            items: options.items || this.getDefaultItems()
        };

        this.canvas = null;
        this.ctx = null;
        this.images = [];
        this.loadedImages = 0;
        this.scroll = { current: 0, target: 0, ease: this.options.scrollEase };
        this.isDown = false;
        this.startX = 0;
        this.scrollPosition = 0;
        this.animationId = null;
        this.itemWidth = 300;
        this.itemHeight = 284; // Increased by ~42% to accommodate 50% image increase and 30% content increase
        this.padding = 50;

        // Performance optimization flags
        this.needsRender = true;
        this.isAnimating = false;
        this.lastFrameTime = 0;
        this.targetFPS = 60;
        this.frameInterval = 1000 / this.targetFPS;

        // Throttling for events
        this.lastMoveTime = 0;
        this.moveThrottle = 16; // ~60fps

        this.init();
    }

    getDefaultItems() {
        return [
            { image: './image/home/gateway_01.webp', text: 'Edge Devices', link: './products/gateway.html' },
            { image: './image/home/repeater_01.webp', text: 'Core Communication', link: './products/repeater.html' },
            { image: './image/home/staingauge_01.webp', text: 'Wired Sensors', link: './products/vibrating-wire-rcr.html' }
        ];
    }

    init() {
        this.createCanvas();
        this.loadImages();
        this.addEventListeners();
        this.resize();
    }

    createCanvas() {
        this.canvas = document.createElement('canvas');
        this.ctx = this.canvas.getContext('2d');
        this.container.appendChild(this.canvas);

        // Set canvas style
        this.canvas.style.width = '100%';
        this.canvas.style.height = '100%';
        this.canvas.style.display = 'block';
    }

    loadImages() {
        this.options.items.forEach((item, index) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => {
                this.loadedImages++;
                if (this.loadedImages === this.options.items.length) {
                    this.startAnimation();
                }
            };
            img.onerror = () => {
                console.warn(`Failed to load image: ${item.image}`);
                this.loadedImages++;
                if (this.loadedImages === this.options.items.length) {
                    this.startAnimation();
                }
            };
            img.src = item.image;
            this.images.push({ img, text: item.text });
        });
    }

    startAnimation() {
        // Force initial render
        this.needsRender = true;
        this.isAnimating = true;
        this.animate();

        // Also render immediately to show content
        this.render();
    }

    animate(currentTime = 0) {
        // Frame rate limiting
        if (currentTime - this.lastFrameTime < this.frameInterval) {
            this.animationId = requestAnimationFrame((time) => this.animate(time));
            return;
        }
        this.lastFrameTime = currentTime;

        const hasUpdated = this.update();

        // Always render if needed or if something changed
        if (hasUpdated || this.needsRender) {
            this.render();
            this.needsRender = false;
        }

        // Continue animation if still moving or if user is interacting
        const isMoving = Math.abs(this.scroll.target - this.scroll.current) > 0.1;
        const isInteracting = this.isDown;

        if (this.isAnimating || isMoving || isInteracting) {
            this.animationId = requestAnimationFrame((time) => this.animate(time));
        } else {
            this.isAnimating = false;
            this.animationId = null;
        }
    }

    update() {
        const oldCurrent = this.scroll.current;

        // Smooth scrolling with easing
        this.scroll.current += (this.scroll.target - this.scroll.current) * this.scroll.ease;

        // Check if position changed significantly
        const hasChanged = Math.abs(this.scroll.current - oldCurrent) > 0.01;

        if (hasChanged) {
            this.isAnimating = true;
        }

        return hasChanged;
    }

    render() {
        const { width, height } = this.canvas;

        // Use efficient clearing method
        this.ctx.clearRect(0, 0, width, height);

        const centerY = height / 2;
        const totalWidth = (this.itemWidth + this.padding) * this.images.length;

        // Viewport culling - only render items that are potentially visible
        const cullMargin = this.itemWidth * 2; // Extra margin for smooth scrolling
        const visibleItems = [];

        this.images.forEach((item, index) => {
            const x = (this.itemWidth + this.padding) * index - this.scroll.current;
            const wrappedX = this.wrapPosition(x, totalWidth, width);

            // More aggressive culling for better performance
            if (wrappedX > -cullMargin && wrappedX < width + cullMargin) {
                visibleItems.push({ item, x: wrappedX, index });
            }
        });

        // Batch render visible items
        visibleItems.forEach(({ item, x, index }) => {
            this.renderItem(item, x, centerY, index);
        });
    }

    wrapPosition(x, totalWidth, canvasWidth) {
        const halfTotal = totalWidth / 2;
        const halfCanvas = canvasWidth / 2;

        // Wrap around logic
        if (x < -halfCanvas - this.itemWidth) {
            return x + totalWidth;
        } else if (x > halfCanvas + totalWidth) {
            return x - totalWidth;
        }
        return x;
    }

    renderItem(item, x, centerY, index) {
        const { img, text, link } = item;

        // Calculate bend effect
        const bendY = this.calculateBend(x);
        const rotation = this.calculateRotation(x);

        this.ctx.save();

        // Apply transformations
        this.ctx.translate(x + this.itemWidth / 2, centerY + bendY);
        this.ctx.rotate(rotation);

        // Draw card background (white with shadow effect)
        this.drawCardBackground(-this.itemWidth / 2, -this.itemHeight / 2, this.itemWidth, this.itemHeight);

        // Draw image with rounded corners (top portion of card) - increased by 50%
        const imageHeight = 180; // Fixed height: 120px * 1.5 = 180px
        this.drawRoundedImage(img, -this.itemWidth / 2, -this.itemHeight / 2, this.itemWidth, imageHeight);

        // Draw content area background (dark) - increased by 30%
        const contentHeight = 104; // Fixed height: 80px * 1.3 = 104px
        this.drawContentBackground(-this.itemWidth / 2, -this.itemHeight / 2 + imageHeight, this.itemWidth, contentHeight);

        // Draw text (title) - positioned in larger content area
        this.drawCardText(text, 0, -this.itemHeight / 2 + imageHeight + 30);

        // Draw "View Details" button - positioned in larger content area
        this.drawViewDetailsButton(0, -this.itemHeight / 2 + imageHeight + 70);

        this.ctx.restore();
    }

    drawCardBackground(x, y, width, height) {
        const radius = 25; // 50px border radius scaled down

        this.ctx.save();
        this.ctx.shadowColor = 'rgba(0, 0, 0, 0.1)';
        this.ctx.shadowBlur = 10;
        this.ctx.shadowOffsetX = 0;
        this.ctx.shadowOffsetY = 5;

        this.ctx.fillStyle = 'white';
        this.ctx.beginPath();
        this.ctx.roundRect(x, y, width, height, radius);
        this.ctx.fill();

        this.ctx.restore();
    }

    drawContentBackground(x, y, width, height) {
        const radius = 0; // No border radius for bottom part

        this.ctx.save();
        this.ctx.fillStyle = '#2d2e2f'; // Dark background
        this.ctx.beginPath();
        this.ctx.roundRect(x, y, width, height, [0, 0, radius, radius]);
        this.ctx.fill();

        this.ctx.restore();
    }

    drawCardText(text, x, y) {
        this.ctx.save();
        this.ctx.fillStyle = 'white';
        this.ctx.font = 'bold 18px Arial, sans-serif'; // Increased from 16px to 18px for larger cards
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';

        // Add text shadow for better readability
        this.ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
        this.ctx.shadowBlur = 2;
        this.ctx.shadowOffsetX = 1;
        this.ctx.shadowOffsetY = 1;

        this.ctx.fillText(text, x, y);

        this.ctx.restore();
    }

    drawViewDetailsButton(x, y) {
        const buttonWidth = 110; // Increased from 100px for larger cards
        const buttonHeight = 35; // Increased from 30px for larger cards
        const radius = 17; // Increased radius proportionally

        this.ctx.save();

        // Button background
        this.ctx.fillStyle = '#2b6cee'; // Blue accent color
        this.ctx.beginPath();
        this.ctx.roundRect(x - buttonWidth / 2, y - buttonHeight / 2, buttonWidth, buttonHeight, radius);
        this.ctx.fill();

        // Button text
        this.ctx.fillStyle = 'white';
        this.ctx.font = 'bold 14px Arial, sans-serif'; // Increased from 12px for larger button
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText('View Details', x, y);

        // Arrow icon (simple triangle) - adjusted for larger button
        this.ctx.fillStyle = 'white';
        this.ctx.beginPath();
        this.ctx.moveTo(x + 40, y - 4); // Moved right and made slightly taller
        this.ctx.lineTo(x + 46, y);
        this.ctx.lineTo(x + 40, y + 4);
        this.ctx.closePath();
        this.ctx.fill();

        this.ctx.restore();
    }

    calculateBend(x) {
        if (this.options.bend === 0) return 0;

        const canvasCenter = this.canvas.width / 2;
        const distance = x + this.itemWidth / 2 - canvasCenter;
        const maxDistance = this.canvas.width / 2;
        const normalizedDistance = Math.min(Math.abs(distance) / maxDistance, 1);

        return Math.sign(this.options.bend) * normalizedDistance * normalizedDistance * Math.abs(this.options.bend) * 50;
    }

    calculateRotation(x) {
        if (this.options.bend === 0) return 0;

        const canvasCenter = this.canvas.width / 2;
        const distance = x + this.itemWidth / 2 - canvasCenter;
        const maxDistance = this.canvas.width / 2;
        const normalizedDistance = Math.min(Math.abs(distance) / maxDistance, 1);

        return Math.sign(distance) * normalizedDistance * 0.3;
    }

    drawRoundedImage(img, x, y, width, height) {
        if (!img.complete) return;

        const radius = this.options.borderRadius * Math.min(width, height);

        this.ctx.save();
        this.ctx.beginPath();
        this.ctx.roundRect(x, y, width, height, radius);
        this.ctx.clip();

        // Calculate aspect ratio for proper image scaling
        const imgAspect = img.naturalWidth / img.naturalHeight;
        const boxAspect = width / height;

        let drawWidth, drawHeight, drawX, drawY;

        if (imgAspect > boxAspect) {
            drawHeight = height;
            drawWidth = height * imgAspect;
            drawX = x - (drawWidth - width) / 2;
            drawY = y;
        } else {
            drawWidth = width;
            drawHeight = width / imgAspect;
            drawX = x;
            drawY = y - (drawHeight - height) / 2;
        }

        this.ctx.drawImage(img, drawX, drawY, drawWidth, drawHeight);
        this.ctx.restore();
    }

    drawText(text, x, y) {
        this.ctx.save();
        this.ctx.fillStyle = this.options.textColor;
        this.ctx.font = 'bold 16px Arial, sans-serif';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'top';

        // Optimize text rendering - reduce shadow for better performance
        const isHighPerformanceMode = this.canvas.width > 1920 || window.devicePixelRatio > 2;

        if (!isHighPerformanceMode) {
            // Add text shadow for better readability (only on lower resolution displays)
            this.ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
            this.ctx.shadowBlur = 2;
            this.ctx.shadowOffsetX = 1;
            this.ctx.shadowOffsetY = 1;
        }

        // Wrap text if too long
        const maxWidth = this.itemWidth - 20;
        const words = text.split(' ');
        let line = '';
        let lineY = y;

        for (let i = 0; i < words.length; i++) {
            const testLine = line + words[i] + ' ';
            const metrics = this.ctx.measureText(testLine);
            const testWidth = metrics.width;

            if (testWidth > maxWidth && i > 0) {
                this.ctx.fillText(line, x, lineY);
                line = words[i] + ' ';
                lineY += 20;
            } else {
                line = testLine;
            }
        }
        this.ctx.fillText(line, x, lineY);

        this.ctx.restore();
    }

    addEventListeners() {
        // Bind methods to preserve context
        this.boundOnPointerDown = (e) => this.onPointerDown(e);
        this.boundOnPointerMove = (e) => this.onPointerMove(e);
        this.boundOnPointerUp = () => this.onPointerUp();
        this.boundOnWheel = (e) => this.onWheel(e);
        this.boundOnResize = this.debounce(() => this.resize(), 250);
        this.boundOnClick = (e) => this.onClick(e);

        // Mouse events
        this.canvas.addEventListener('mousedown', this.boundOnPointerDown, { passive: false });
        this.canvas.addEventListener('mousemove', this.boundOnPointerMove, { passive: false });
        this.canvas.addEventListener('mouseup', this.boundOnPointerUp, { passive: true });
        this.canvas.addEventListener('mouseleave', this.boundOnPointerUp, { passive: true });
        this.canvas.addEventListener('click', this.boundOnClick, { passive: true });

        // Touch events
        this.canvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            this.onPointerDown(e.touches[0]);
        }, { passive: false });

        this.canvas.addEventListener('touchmove', (e) => {
            e.preventDefault();
            this.onPointerMove(e.touches[0]);
        }, { passive: false });

        this.canvas.addEventListener('touchend', this.boundOnPointerUp, { passive: true });

        // Wheel event
        this.canvas.addEventListener('wheel', this.boundOnWheel, { passive: false });

        // Resize event
        window.addEventListener('resize', this.boundOnResize, { passive: true });
    }

    // Throttle function for performance
    throttle(func, limit) {
        let inThrottle;
        return function (...args) {
            if (!inThrottle) {
                func.apply(this, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    }

    // Debounce function for resize events
    debounce(func, wait) {
        let timeout;
        return function (...args) {
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(this, args), wait);
        };
    }

    onPointerDown(e) {
        this.isDown = true;
        this.startX = e.clientX;
        this.scrollPosition = this.scroll.target;
        this.canvas.style.cursor = 'grabbing';

        // Ensure animation starts
        this.isAnimating = true;
        if (!this.animationId) {
            this.animate();
        }
    }

    onPointerMove(e) {
        if (!this.isDown) return;

        // Direct update for immediate response
        const deltaX = (this.startX - e.clientX) * this.options.scrollSpeed;
        this.scroll.target = this.scrollPosition + deltaX;
        this.needsRender = true;
        this.isAnimating = true;

        // Restart animation if stopped
        if (!this.animationId) {
            this.animate();
        }
    }

    onPointerUp() {
        this.isDown = false;
        this.canvas.style.cursor = 'grab';
        this.snapToNearestItem();
    }

    onClick(e) {
        const rect = this.canvas.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const clickY = e.clientY - rect.top;

        const centerY = this.canvas.height / 2;
        const totalWidth = (this.itemWidth + this.padding) * this.images.length;

        // Check each visible item to see if the click was within its bounds
        for (let index = 0; index < this.images.length; index++) {
            const item = this.images[index];
            const x = (this.itemWidth + this.padding) * index - this.scroll.current;
            const wrappedX = this.wrapPosition(x, totalWidth, this.canvas.width);

            // Calculate bend effect for this item
            const bendY = this.calculateBend(wrappedX);
            const rotation = this.calculateRotation(wrappedX);

            // Transform click coordinates to item coordinate system
            const itemCenterX = wrappedX + this.itemWidth / 2;
            const itemCenterY = centerY + bendY;

            // Reverse the rotation transformation
            const dx = clickX - itemCenterX;
            const dy = clickY - itemCenterY;

            const cosRot = Math.cos(-rotation);
            const sinRot = Math.sin(-rotation);

            const localX = dx * cosRot - dy * sinRot;
            const localY = dx * sinRot + dy * cosRot;

            // Check if click is within item bounds
            const halfWidth = this.itemWidth / 2;
            const halfHeight = this.itemHeight / 2;

            if (localX >= -halfWidth && localX <= halfWidth &&
                localY >= -halfHeight && localY <= halfHeight) {

                // Check if click is on the button area (bottom part of card)
                const buttonY = -halfHeight + 180 + 70; // imageHeight (180) + button offset (70)
                const buttonHalfHeight = 17.5; // button height / 2 (35px / 2 = 17.5px)

                if (localY >= buttonY - buttonHalfHeight && localY <= buttonY + buttonHalfHeight &&
                    localX >= -55 && localX <= 55) { // button width / 2 (110px / 2 = 55px)

                    // Navigate to the link
                    if (item.link) {
                        window.location.href = item.link;
                    }
                    return;
                }
            }
        }
    }

    onWheel(e) {
        e.preventDefault();

        // Direct update for immediate response
        const delta = e.deltaY > 0 ? this.options.scrollSpeed * 20 : -this.options.scrollSpeed * 20;
        this.scroll.target += delta;
        this.needsRender = true;
        this.isAnimating = true;

        // Restart animation if stopped
        if (!this.animationId) {
            this.animate();
        }

        // Debounce snap to nearest item
        clearTimeout(this.snapTimeout);
        this.snapTimeout = setTimeout(() => {
            this.snapToNearestItem();
        }, 150);
    }

    snapToNearestItem() {
        const itemSpacing = this.itemWidth + this.padding;
        const targetIndex = Math.round(this.scroll.target / itemSpacing);
        this.scroll.target = targetIndex * itemSpacing;
    }

    resize() {
        const rect = this.container.getBoundingClientRect();

        // Optimize DPR for performance - cap at 2 for high-DPI displays
        let dpr = window.devicePixelRatio || 1;
        if (dpr > 2) dpr = 2;

        // Only resize if dimensions actually changed
        const newWidth = rect.width * dpr;
        const newHeight = rect.height * dpr;

        if (this.canvas.width !== newWidth || this.canvas.height !== newHeight) {
            this.canvas.width = newWidth;
            this.canvas.height = newHeight;

            // Reset context after resize
            this.ctx.scale(dpr, dpr);

            // Enable image smoothing for better quality
            this.ctx.imageSmoothingEnabled = true;
            this.ctx.imageSmoothingQuality = 'high';

            this.needsRender = true;
        }

        // Adjust item size based on container size for better mobile performance
        if (rect.width < 480) {
            this.itemWidth = 150;
            this.itemHeight = 120;
            this.padding = 20;
        } else if (rect.width < 768) {
            this.itemWidth = 200;
            this.itemHeight = 150;
            this.padding = 30;
        } else {
            this.itemWidth = 300;
            this.itemHeight = 400;
            this.padding = 50;
        }
    }

    destroy() {
        // Cancel animation frame
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }

        // Remove all event listeners
        if (this.canvas) {
            this.canvas.removeEventListener('mousedown', this.boundOnPointerDown);
            this.canvas.removeEventListener('mousemove', this.boundOnPointerMove);
            this.canvas.removeEventListener('mouseup', this.boundOnPointerUp);
            this.canvas.removeEventListener('mouseleave', this.boundOnPointerUp);
            this.canvas.removeEventListener('touchstart', this.boundOnPointerDown);
            this.canvas.removeEventListener('touchmove', this.boundOnPointerMove);
            this.canvas.removeEventListener('touchend', this.boundOnPointerUp);
            this.canvas.removeEventListener('wheel', this.boundOnWheel);
        }

        if (this.boundOnResize) {
            window.removeEventListener('resize', this.boundOnResize);
        }

        // Clear timeouts
        if (this.snapTimeout) {
            clearTimeout(this.snapTimeout);
        }

        // Clear canvas context
        if (this.ctx) {
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        }

        // Remove canvas from DOM
        if (this.canvas && this.canvas.parentNode) {
            this.canvas.parentNode.removeChild(this.canvas);
        }

        // Clear references for garbage collection
        this.canvas = null;
        this.ctx = null;
        this.images = [];
    }
}

// Initialize circular gallery when DOM is loaded
document.addEventListener('DOMContentLoaded', function () {
    const galleryContainer = document.getElementById('sentraCircularGallery');

    if (galleryContainer) {
        const options = {
            bend: parseFloat(galleryContainer.dataset.bend) || 3,
            textColor: galleryContainer.dataset.textColor || '#ffffff',
            borderRadius: parseFloat(galleryContainer.dataset.borderRadius) || 0.05,
            scrollEase: parseFloat(galleryContainer.dataset.scrollEase) || 0.02
        };

        new CircularGallery(galleryContainer, options);
    }
});

// Polyfill for roundRect if not supported
if (!CanvasRenderingContext2D.prototype.roundRect) {
    CanvasRenderingContext2D.prototype.roundRect = function (x, y, width, height, radius) {
        if (typeof radius === 'number') {
            radius = { tl: radius, tr: radius, br: radius, bl: radius };
        } else {
            radius = { tl: 0, tr: 0, br: 0, bl: 0, ...radius };
        }

        this.beginPath();
        this.moveTo(x + radius.tl, y);
        this.lineTo(x + width - radius.tr, y);
        this.quadraticCurveTo(x + width, y, x + width, y + radius.tr);
        this.lineTo(x + width, y + height - radius.br);
        this.quadraticCurveTo(x + width, y + height, x + width - radius.br, y + height);
        this.lineTo(x + radius.bl, y + height);
        this.quadraticCurveTo(x, y + height, x, y + height - radius.bl);
        this.lineTo(x, y + radius.tl);
        this.quadraticCurveTo(x, y, x + radius.tl, y);
        this.closePath();
    };
}