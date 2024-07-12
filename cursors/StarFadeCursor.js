function StarFadeCursor(options) {
    let hasWrapperEl = options && options.element;
    let element = hasWrapperEl || document.body;

    const starContainer = document.createElement('div');
    starContainer.id = 'star-container';
    starContainer.style.position = hasWrapperEl ? 'absolute' : 'fixed';
    starContainer.style.top = '0';
    starContainer.style.left = '0';
    starContainer.style.width = '100%';
    starContainer.style.height = '100%';
    starContainer.style.pointerEvents = 'none';
    if (hasWrapperEl) {
        element.appendChild(starContainer);
    } else {
        document.body.appendChild(starContainer);
    }

    const maxStars = options?.maxStars || 100;
    const starLifeTime = options?.starLifeTime || 300; // in milliseconds
    const starSize = options?.starSize || 25; // Adjust size
    const colorCycleSpeed = options?.colorCycleSpeed || 10;

    let starElements = [];

    function createStar(x, y) {
        const star = document.createElement('div');
        star.className = 'star';
        star.style.left = `${x}px`;
        star.style.top = `${y}px`;

        // Set random color
        const hue = (Math.random() * 360).toFixed(0);
        star.style.backgroundColor = `hsl(${hue}, 100%, 50%)`;

        starContainer.appendChild(star);
        starElements.push(star);

        setTimeout(() => {
            star.style.transform = 'translate(-50%, -50%) scale(2)';
            star.style.opacity = '0';
        }, 50);

        setTimeout(() => {
            if (starContainer.contains(star)) {
                starContainer.removeChild(star);
                starElements = starElements.filter(s => s !== star);
            }
        }, starLifeTime);
    }

    function onMouseMove(e) {
        const x = e.clientX;
        const y = e.clientY;
        if (starElements.length < maxStars) {
            createStar(x, y);
        }
    }

    function onTouchMove(e) {
        if (e.touches.length > 0) {
            for (let i = 0; i < e.touches.length; i++) {
                const x = e.touches[i].clientX;
                const y = e.touches[i].clientY;
                if (starElements.length < maxStars) {
                    createStar(x, y);
                }
            }
        }
    }

    function bindEvents() {
        element.addEventListener('mousemove', onMouseMove);
        element.addEventListener('touchmove', onTouchMove, { passive: true });
        element.addEventListener('touchstart', onTouchMove, { passive: true });
    }

    function destroy() {
        element.removeEventListener('mousemove', onMouseMove);
        element.removeEventListener('touchmove', onTouchMove);
        element.removeEventListener('touchstart', onTouchMove);
        starContainer.remove();
    }

    function init() {
        bindEvents();
    }

    init();

    return {
        destroy: destroy
    };
}

// Make the function globally accessible
window.StarFadeCursor = StarFadeCursor;

// Add this CSS to your document
const style = document.createElement('style');
style.innerHTML = `
#star-container .star {
    position: absolute;
    width: 25px; /* Adjust size */
    height: 25px; /* Adjust size */
    clip-path: polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%);
    opacity: 0.8;
    transition: transform 0.3s ease-out, opacity 0.3s ease-out;
}
`;
document.head.appendChild(style);
