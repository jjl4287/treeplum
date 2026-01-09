document.addEventListener('DOMContentLoaded', () => {
    const scrollContainer = document.getElementById('scroll-container');
    const fluidBg = document.getElementById('fluid-bg');
    const ctx = fluidBg.getContext('2d');
    
    // Check if device supports touch to optimize
    const isTouch = 'ontouchstart' in window;

    let width, height;
    let scrollProgress = 0; // 0 to 1

    // Setup Canvas
    function resize() {
        width = window.innerWidth;
        height = window.innerHeight;
        fluidBg.width = width;
        fluidBg.height = height;
        // Re-center tree base if needed
        if(treeData) treeData.x = width / 2;
    }
    window.addEventListener('resize', resize);
    resize();

    // Scroll Handler
    scrollContainer.addEventListener('scroll', () => {
        const maxScroll = scrollContainer.scrollHeight - scrollContainer.clientHeight;
        scrollProgress = Math.min(Math.max(scrollContainer.scrollTop / maxScroll, 0), 1);
        // No need to requestAnimationFrame here as the main loop handles it
    });

    // Fluid Background Animation
    let time = 0;
    
    // Tree generation parameters
    const maxBranchDepth = 10;
    
    // Initialize Tree Structure (Recursive Fractal)
    function createTree() {
        const trunk = {
            x: width / 2, // Start center
            y: height,  // Start bottom
            angle: -Math.PI / 2,
            length: height * 0.15, // Relative to screen height
            depth: 0,
            width: 15,
            children: []
        };
        generateBranches(trunk);
        return trunk;
    }

    function generateBranches(parent) {
        if (parent.depth >= maxBranchDepth) return;

        const numChildren = 2 + Math.floor(Math.random() * 2); // 2 or 3 branches
        for (let i = 0; i < numChildren; i++) {
            const angleOffset = (Math.random() - 0.5) * 1.2; // Spread
            const lengthDecay = 0.75 + Math.random() * 0.15;
            const newLength = parent.length * lengthDecay;
            
            const child = {
                // x, y will be calculated during render
                angle: parent.angle + angleOffset,
                length: newLength,
                depth: parent.depth + 1,
                width: parent.width * 0.7,
                children: []
            };
            parent.children.push(child);
            generateBranches(child);
        }
    }
    
    const treeData = createTree();

    // Physics / Particle System for Plums and Fluidity
    const particles = [];
    
    function createParticles() {
        // Less particles on mobile for performance
        const maxParticles = isTouch ? 50 : 150;
        if (particles.length < maxParticles) {
            particles.push({
                x: Math.random() * width,
                y: height + 50,
                vx: (Math.random() - 0.5) * 2,
                vy: -Math.random() * 2 - 1,
                size: Math.random() * 3 + 1,
                life: 1,
                color: Math.random() > 0.5 ? '#8e44ad' : '#4a3b2a' // Plum or Earth color
            });
        }
    }

    function updateParticles() {
        createParticles();
        for (let i = particles.length - 1; i >= 0; i--) {
            let p = particles[i];
            // Flow field effect: particles swirl
            p.x += p.vx + Math.sin(time + p.y * 0.005) * 1; 
            p.y += p.vy - scrollProgress * 10; // Move up drastically when scrolling
            p.life -= 0.005;
            
            if (p.life <= 0 || p.y < -50) {
                particles.splice(i, 1);
            } else {
                ctx.fillStyle = p.color;
                ctx.globalAlpha = p.life * 0.4;
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                ctx.fill();
                ctx.globalAlpha = 1.0;
            }
        }
    }

    function drawBranch(node, startX, startY, currentDepth, growthFactor) {
        if (currentDepth > maxBranchDepth || growthFactor <= 0) return;

        // Determine local growth for this branch based on scroll
        const startThreshold = node.depth / (maxBranchDepth + 2);
        const endThreshold = (node.depth + 1) / (maxBranchDepth + 2);
        
        let localGrowth = (scrollProgress - startThreshold) / (endThreshold - startThreshold);
        localGrowth = Math.min(Math.max(localGrowth, 0), 1);
        
        // Fluid easing (smoothstep)
        localGrowth = localGrowth * localGrowth * (3 - 2 * localGrowth);

        if (localGrowth <= 0) return;

        // Dynamic Sway (Wind) - increases with depth
        const wind = Math.sin(time + node.depth * 0.5) * 0.05 * (node.depth * 0.2); 
        const currentAngle = node.angle + wind;

        // Calculate end point
        const endX = startX + Math.cos(currentAngle) * node.length * localGrowth;
        const endY = startY + Math.sin(currentAngle) * node.length * localGrowth;

        // Style: Modern Art Gradient Stroke
        const grad = ctx.createLinearGradient(startX, startY, endX, endY);
        grad.addColorStop(0, '#3e2723'); // Dark wood
        grad.addColorStop(1, '#8d6e63'); // Lighter wood
        
        ctx.strokeStyle = grad;
        // Tapering width
        ctx.lineWidth = Math.max(0.5, node.width * (1 - node.depth/(maxBranchDepth+2)) * localGrowth);
        ctx.lineCap = 'round';
        
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        
        // Bezier Curve for fluidity - bends slightly
        const midX = (startX + endX) / 2 + Math.cos(time * 2 + node.depth) * 3 * localGrowth;
        const midY = (startY + endY) / 2 + Math.sin(time * 1.5 + node.depth) * 3 * localGrowth;
        
        ctx.quadraticCurveTo(midX, midY, endX, endY);
        ctx.stroke();

        // Draw Plums
        if (node.children.length === 0 && localGrowth > 0.95) {
            drawPlum(endX, endY, localGrowth, node);
        }

        // Recursion
        for (const child of node.children) {
            drawBranch(child, endX, endY, currentDepth + 1, growthFactor);
        }
    }

    function drawPlum(x, y, age, node) {
        // Pulse effect
        const pulse = Math.sin(time * 4 + node.depth) * 2;
        
        // Sway independent of branch
        const swayX = Math.cos(time * 3 + node.depth) * 2;
        const swayY = Math.sin(time * 3 + node.depth) * 2;

        const plumSize = 6;

        ctx.fillStyle = '#8e44ad'; // Purple
        
        ctx.beginPath();
        // Draw ellipse manually
        ctx.ellipse(x + swayX, y + swayY + plumSize, plumSize + pulse*0.1, plumSize * 1.2 + pulse*0.1, Math.PI/10 * Math.sin(time), 0, Math.PI * 2);
        ctx.fill();
        
        // Highlight/Reflection
        ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.beginPath();
        ctx.ellipse(x + swayX - 2, y + swayY + 2, 2, 3, -0.5, 0, Math.PI * 2);
        ctx.fill();
    }
    
    // Color Helpers
    function hexToRgb(hex) {
        var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16)
        } : null;
    }

    function interpolateColor(color1, color2, factor) {
        if (arguments.length < 3) { 
            factor = 0.5; 
        }
        var c1 = hexToRgb(color1);
        var c2 = hexToRgb(color2);
        
        return `rgb(${Math.round(c1.r + factor * (c2.r - c1.r))}, ${Math.round(c1.g + factor * (c2.g - c1.g))}, ${Math.round(c1.b + factor * (c2.b - c1.b))})`;
    }

    // Interactive Particles on Touch
    scrollContainer.addEventListener('touchstart', (e) => {
        for (let i=0; i<e.touches.length; i++) {
             const touch = e.touches[i];
             for(let j=0; j<5; j++) {
                 particles.push({
                    x: touch.clientX,
                    y: touch.clientY,
                    vx: (Math.random() - 0.5) * 4,
                    vy: (Math.random() - 0.5) * 4,
                    size: Math.random() * 4 + 2,
                    life: 1.5,
                    color: '#ffffff'
                });
             }
        }
    }, {passive: true});

    // Main Render Loop
    function loop() {
        time += 0.02; // Time flow
        
        // Dynamic Background based on Scroll
        // 0.0 - 0.5: Night -> Dawn
        // 0.5 - 1.0: Dawn -> Day
        
        let topColor, bottomColor;
        
        if (scrollProgress < 0.5) {
            const t = scrollProgress * 2;
            topColor = interpolateColor('#0f0b15', '#2c3e50', t);
            bottomColor = interpolateColor('#2c1e30', '#8e44ad', t);
        } else {
            const t = (scrollProgress - 0.5) * 2;
            topColor = interpolateColor('#2c3e50', '#3498db', t);
            bottomColor = interpolateColor('#8e44ad', '#9b59b6', t);
        }

        const gradient = ctx.createLinearGradient(0, 0, 0, height);
        gradient.addColorStop(0, topColor);
        gradient.addColorStop(1, bottomColor);
        
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, width, height);

        // Draw Particles
        updateParticles();

        // Draw Tree (Root is at bottom center)
        const rootY = height; 
        drawBranch(treeData, width / 2, rootY, 0, scrollProgress);
        
        // Subtle text at the end
        if (scrollProgress > 0.95) {
             ctx.save();
             ctx.font = 'italic 40px serif';
             ctx.fillStyle = `rgba(255, 255, 255, ${(scrollProgress - 0.95) * 10})`;
             ctx.textAlign = 'center';
             ctx.fillText('fluidity', width/2, height/2);
             ctx.restore();
        }

        requestAnimationFrame(loop);
    };

    loop();
});
