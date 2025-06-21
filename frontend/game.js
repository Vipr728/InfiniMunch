class AgarioGame {
    constructor() {
        this.socket = null;
        this.canvas = null;
        this.ctx = null;
        this.minimapCanvas = null;
        this.minimapCtx = null;
        this.players = new Map();
        this.minions = new Map();  // All minions in the game
        this.myPlayerId = null;
        this.mouseX = 0;
        this.mouseY = 0;
        this.worldWidth = 2000;
        this.worldHeight = 1500;
        this.baseViewWidth = window.innerWidth;
        this.baseViewHeight = window.innerHeight;
        this.viewWidth = this.baseViewWidth;
        this.viewHeight = this.baseViewHeight;
        
        // Camera system
        this.cameraX = 0;
        this.cameraY = 0;
        this.targetCameraX = 0;
        this.targetCameraY = 0;
        this.zoom = 1;
        
        // Chat message tracking for duplicates
        this.recentMessages = new Map(); // message -> { count: number, timestamp: number, element: HTMLElement }
        
        // Ad system
        this.adImages = [];
        
        this.init();
    }
    
    async init() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        
        // Set initial canvas size
        this.handleResize();
        
        // Create minimap
        this.createMinimap();
        
        // Load ad images
        await this.loadAdImages();
        
        this.setupEventListeners();
        this.connectToServer();
        
        // Start render loop
        this.startRenderLoop();
    }
    
    async loadAdImages() {
        const adFiles = ['image.png', 'Arize.png', 'Oracle.png', 'AWS.png', 'banyan.png'];
        const adPromises = adFiles.map(filename => {
            return new Promise((resolve, reject) => {
                const img = new Image();
                img.onload = () => resolve(img);
                img.onerror = () => reject(new Error(`Failed to load ad: ${filename}`));
                img.src = `ads/${filename}`;
            });
        });
        
        try {
            this.adImages = await Promise.all(adPromises);
            console.log(`Loaded ${this.adImages.length} ad images`);
        } catch (error) {
            console.error('Error loading ad images:', error);
            this.adImages = []; // Fallback to no ads
        }
    }
    
    shouldShowAds() {
        // Show ads when camera is near world boundaries
        const margin = 400; // Distance from edge to start showing ads
        return this.cameraX < margin || 
               this.cameraX + this.viewWidth > this.worldWidth - margin ||
               this.cameraY < margin || 
               this.cameraY + this.viewHeight > this.worldHeight - margin;
    }
    
    getAdPositions() {
        const adSize = 100; // Slightly smaller ad images
        const positions = [];
        
        // Fixed ad positions around the world boundaries (like soccer field ads)
        const adSpacing = adSize + 60; // Space between ads
        
        // Left edge ads (fixed positions) - outside the left boundary
        for (let y = 150; y < this.worldHeight - 150; y += adSpacing) {
            positions.push({
                x: -adSize - 20, // Outside the left boundary
                y: y,
                width: adSize,
                height: adSize,
                edge: 'left',
                adIndex: Math.floor(y / adSpacing) % this.adImages.length
            });
        }
        
        // Right edge ads (fixed positions) - outside the right boundary
        for (let y = 150; y < this.worldHeight - 150; y += adSpacing) {
            positions.push({
                x: this.worldWidth + 20, // Outside the right boundary
                y: y,
                width: adSize,
                height: adSize,
                edge: 'right',
                adIndex: (Math.floor(y / adSpacing) + 2) % this.adImages.length
            });
        }
        
        // Top edge ads (fixed positions) - outside the top boundary
        for (let x = 150; x < this.worldWidth - 150; x += adSpacing) {
            positions.push({
                x: x,
                y: -adSize - 20, // Outside the top boundary
                width: adSize,
                height: adSize,
                edge: 'top',
                adIndex: (Math.floor(x / adSpacing) + 4) % this.adImages.length
            });
        }
        
        // Bottom edge ads (fixed positions) - outside the bottom boundary
        for (let x = 150; x < this.worldWidth - 150; x += adSpacing) {
            positions.push({
                x: x,
                y: this.worldHeight + 20, // Outside the bottom boundary
                width: adSize,
                height: adSize,
                edge: 'bottom',
                adIndex: (Math.floor(x / adSpacing) + 6) % this.adImages.length
            });
        }
        
        return positions;
    }
    
    drawAds() {
        if (!this.shouldShowAds() || this.adImages.length === 0) {
            return;
        }
        
        const positions = this.getAdPositions();
        
        positions.forEach((pos, index) => {
            // Only draw ads that are visible on screen
            const screenX = (pos.x - this.cameraX) * (this.baseViewWidth / this.viewWidth);
            const screenY = (pos.y - this.cameraY) * (this.baseViewWidth / this.viewWidth);
            const screenWidth = pos.width * (this.baseViewWidth / this.viewWidth);
            const screenHeight = pos.height * (this.baseViewWidth / this.viewWidth);
            
            // Check if ad is visible on screen with some margin
            if (screenX + screenWidth > -50 && screenX < this.baseViewWidth + 50 &&
                screenY + screenHeight > -50 && screenY < this.baseViewHeight + 50) {
                
                // Try to draw ad image, fallback to colored rectangle if image fails
                const adImage = this.adImages[pos.adIndex];
                if (adImage && adImage.complete && adImage.naturalWidth > 0) {
                    this.ctx.drawImage(adImage, screenX, screenY, screenWidth, screenHeight);
                } else {
                    // Fallback: draw colored rectangle with ad index
                    const colors = ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff'];
                    this.ctx.fillStyle = colors[pos.adIndex % colors.length];
                    this.ctx.fillRect(screenX + 10, screenY + 10, screenWidth - 20, screenHeight - 20);
                    
                    // Draw text
                    this.ctx.fillStyle = '#000000';
                    this.ctx.font = '16px Arial';
                    this.ctx.textAlign = 'center';
                    this.ctx.fillText(`AD ${pos.adIndex + 1}`, screenX + screenWidth/2, screenY + screenHeight/2);
                }
                
                // Draw border (soccer field style)
                this.ctx.strokeStyle = '#000000';
                this.ctx.lineWidth = 2;
                this.ctx.strokeRect(screenX, screenY, screenWidth, screenHeight);
            }
        });
    }
    
    createMinimap() {
        // Create minimap container
        const minimapContainer = document.createElement('div');
        minimapContainer.id = 'minimap-container';
        minimapContainer.style.cssText = `
            position: absolute;
            bottom: 20px;
            right: 20px;
            width: 150px;
            height: 112px;
            border: 2px solid #333;
            background: rgba(0,0,0,0.7);
            border-radius: 5px;
            z-index: 100;
            pointer-events: none;
        `;
        
        // Create minimap canvas
        this.minimapCanvas = document.createElement('canvas');
        this.minimapCanvas.width = 150;
        this.minimapCanvas.height = 112;
        this.minimapCanvas.style.cssText = `
            width: 100%;
            height: 100%;
            border-radius: 3px;
        `;
        this.minimapCtx = this.minimapCanvas.getContext('2d');
        
        minimapContainer.appendChild(this.minimapCanvas);
        document.getElementById('game').appendChild(minimapContainer);
    }
    
    startRenderLoop() {
        const render = () => {
            this.updateCamera();
            this.render();
            this.renderMinimap();
            requestAnimationFrame(render);
        };
        requestAnimationFrame(render);
    }
    
    handleResize() {
        // Get the browser's pixel ratio
        const pixelRatio = window.devicePixelRatio || 1;

        // Update our logical canvas size
        this.baseViewWidth = window.innerWidth;
        this.baseViewHeight = window.innerHeight;

        // Set the physical, high-resolution size of the canvas's drawing buffer
        this.canvas.width = this.baseViewWidth * pixelRatio;
        this.canvas.height = this.baseViewHeight * pixelRatio;

        // Set the CSS size to scale the high-res canvas back down to fit the screen
        this.canvas.style.width = `${this.baseViewWidth}px`;
        this.canvas.style.height = `${this.baseViewHeight}px`;
    }
    
    updateCamera() {
        const myPlayer = this.players.get(this.myPlayerId);
        if (myPlayer && myPlayer.minion_count > 0) {
            // Calculate zoom based on minion count (much less dramatic zoom out)
            const baseCount = 5; // New initial minion count
            const countRatio = myPlayer.minion_count / baseCount;
            // Much less zoom out - only slight increase in view area
            this.zoom = Math.max(1, Math.min(1.5, 1 + (countRatio - 1) * 0.1)); // Zoom range: 1x to 1.5x
            
            // Update view dimensions - bigger zoom = bigger view area
            this.viewWidth = this.baseViewWidth * this.zoom;
            this.viewHeight = this.baseViewHeight * this.zoom;
            
            // Center camera on the fleet center
            this.cameraX = myPlayer.fleet_center_x - this.viewWidth / 2;
            this.cameraY = myPlayer.fleet_center_y - this.viewHeight / 2;
        }
    }
    
    setupEventListeners() {
        // Handle window resizing
        window.addEventListener('resize', () => this.handleResize());
        
        // Menu events
        document.getElementById('joinButton').addEventListener('click', () => {
            this.joinGame();
        });
        
        document.getElementById('playerName').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.joinGame();
            }
        });
        
        // Name change modal events
        document.getElementById('changeNameButton').addEventListener('click', () => {
            this.changePlayerName();
        });
        
        document.getElementById('newPlayerName').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.changePlayerName();
            }
        });
        
        document.getElementById('newPlayerName').addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.hideNameChangeModal();
            }
        });
        
        // Game events - send direction vector to server
        this.canvas.addEventListener('mousemove', (e) => {
            const rect = this.canvas.getBoundingClientRect();
            const canvasX = e.clientX - rect.left;
            const canvasY = e.clientY - rect.top;

            // Calculate direction vector f/rom fleet center (screen center) to mouse
            const dx = canvasX - (this.baseViewWidth / 2);
            const dy = canvasY - (this.baseViewHeight / 2);

            if (this.socket && this.socket.connected && this.myPlayerId) {
                // Send the raw direction vector
                this.socket.emit('move_player', {
                    dx: dx,
                    dy: dy,
                });
            }
        });
    }
    
    connectToServer() {
        console.log('Attempting to connect to server...');
        // Detect if we're running locally or on a deployed server
        const isLocal = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
        const serverUrl = isLocal ? 'http://localhost:5000' : '/';
        
        console.log(`Connecting to: ${serverUrl}`);
        this.socket = io(serverUrl, {
            transports: ['polling', 'websocket'], // Allow both for local development
            timeout: 20000,
            forceNew: true,
            upgrade: true // Enable WebSocket upgrade for better performance
        });
        
        this.socket.on('connect', () => {
            console.log('Connected to server successfully!');
            document.getElementById('connectionStatus').textContent = 'Connected!';
            document.getElementById('joinButton').disabled = false;
        });
        
        this.socket.on('connect_error', (error) => {
            console.error('Connection error:', error);
            let errorMessage = 'Connection failed: ' + error.message;
            
            // Provide more helpful error messages
            if (error.message.includes('CORS')) {
                errorMessage = 'CORS error: Server not configured properly for cross-origin requests';
            } else if (error.message.includes('404')) {
                errorMessage = 'Server not found: Check if the server is running and accessible';
            } else if (error.message.includes('timeout')) {
                errorMessage = 'Connection timeout: Server may be overloaded or unreachable';
            }
            
            document.getElementById('connectionStatus').textContent = errorMessage;
        });
        
        this.socket.on('disconnect', (reason) => {
            console.log('Disconnected from server:', reason);
            document.getElementById('connectionStatus').textContent = 'Disconnected from server';
            this.showMenu();
        });
        
        this.socket.on('game_state', (data) => {
            console.log('Received game state:', data);
            this.worldWidth = data.world.width;
            this.worldHeight = data.world.height;
            
            this.players.clear();
            this.minions.clear();
            
            // Update players
            data.players.forEach(player => {
                this.players.set(player.id, player);
            });
            
            // Update minions
            data.all_minions.forEach(minion => {
                this.minions.set(minion.id, minion);
            });
            
            // Check if this is our respawn by seeing if we have minions now
            const myPlayer = this.players.get(this.myPlayerId);
            if (myPlayer && myPlayer.minion_count > 0) {
                console.log('Successfully respawned with', myPlayer.minion_count, 'minions!');
            }
            
            // Show game screen if we successfully joined/respawned
            if (myPlayer) {
                this.showGame();
            }
            
            this.updateUI();
        });
        
        this.socket.on('player_joined', (player) => {
            console.log('Player joined:', player);
            this.players.set(player.id, player);
            this.addChatMessage(`${player.name} joined the battle!`, 'join');
            
            // If this is our own respawn, update UI
            if (player.id === this.myPlayerId) {
                console.log('Successfully respawned!');
                this.updateUI();
            }
        });
        
        this.socket.on('player_left', (data) => {
            const player = this.players.get(data.player_id);
            if (player) {
                console.log(`${player.name} left the game`);
                this.addChatMessage(`${player.name} left the battle.`, 'leave');
                this.players.delete(data.player_id);
            }
        });
        
        this.socket.on('update_players', (playersData) => {
            playersData.forEach(playerData => {
                const p = this.players.get(playerData.id);
                if (p) {
                    // Update server data directly. No more render properties.
                    p.x = playerData.x;
                    p.y = playerData.y;
                    p.size = playerData.size;
                    p.color = playerData.color; // Ensure color updates on respawn
                    p.is_dead = playerData.is_dead; // Update death state
                    p.invulnerable_until = playerData.invulnerable_until; // Update invulnerability
                    p.minion_count = playerData.minion_count;
                    p.fleet_center_x = playerData.fleet_center_x;
                    p.fleet_center_y = playerData.fleet_center_y;
                }
            });
            this.updateUI();
        });
        
        this.socket.on('update_game_state', (data) => {
            // Update players
            data.players.forEach(playerData => {
                const p = this.players.get(playerData.id);
                if (p) {
                    Object.assign(p, playerData);
                }
            });
            
            // Update minions
            data.all_minions.forEach(minionData => {
                const m = this.minions.get(minionData.id);
                if (m) {
                    Object.assign(m, minionData);
                }
            });
            
            this.updateUI();
        });
        
        this.socket.on('minion_infection', (data) => {
            console.log('Minion infection:', data);
            // Update the affected minions
            this.minions.set(data.winner.id, data.winner);
            this.minions.set(data.loser.id, data.loser);
            
            // Add chat message for the battle result
            const winnerName = data.winner.original_name;
            const loserName = data.loser.original_name;
            this.addChatMessage(`${winnerName} defeated ${loserName}!`, 'infection');
            
            // Show infection effect
            this.showInfectionEffect(data.loser.x, data.loser.y);
        });
        
        this.socket.on('player_eliminated', (data) => {
            console.log('Player eliminated:', data);
            const player = this.players.get(data.player_id);
            if (player) {
                // Immediately mark the player as dead so they disappear
                player.is_dead = true;
                this.addChatMessage(`${player.name} was eliminated!`, 'elimination');
            }
            if (data.player_id === this.myPlayerId) {
                // Current player was eliminated - show respawn modal
                this.showNameChangeModal(this.players.get(this.myPlayerId)?.name || '');
            }
        });
        
        this.socket.on('player_name_changed', (data) => {
            console.log('Player name changed:', data);
            const player = this.players.get(data.player_id);
            if (player) {
                player.name = data.new_name;
                this.addChatMessage(`${data.old_name} renamed to ${data.new_name}`, 'normal');
                this.updateUI();
            }
        });
        
        this.socket.on('join_failed', (data) => {
            alert(data.message);
            document.getElementById('joinButton').disabled = false;
            this.myPlayerId = null; // Reset player ID
            this.showMenu(); // Go back to menu to try again
        });
        
        this.socket.on('name_change_failed', (data) => {
            alert(data.message);
            // Show the modal again so user can try a different name
            const currentPlayer = this.players.get(this.myPlayerId);
            if (currentPlayer && currentPlayer.minion_count === 0) {
                // Clear the name to encourage trying a different one
                this.showNameChangeModal('');
            }
        });
    }
    
    joinGame() {
        const playerName = document.getElementById('playerName').value.trim();
        if (!playerName) {
            alert('Please enter your name');
            return;
        }
        
        document.getElementById('joinButton').disabled = true;
        this.socket.emit('join_game', { name: playerName });
        this.myPlayerId = this.socket.id;
        // Don't show game screen immediately - wait for game_state confirmation
    }
    
    showMenu() {
        document.getElementById('menu').classList.remove('hidden');
        document.getElementById('game').classList.add('hidden');
        document.getElementById('joinButton').disabled = false;
    }
    
    showGame() {
        document.getElementById('menu').classList.add('hidden');
        document.getElementById('game').classList.remove('hidden');
    }
    
    render() {
        this.ctx.save();
        const pixelRatio = window.devicePixelRatio || 1;
        
        // Scale the entire coordinate system to match the screen's pixel density.
        this.ctx.scale(pixelRatio, pixelRatio);
        
        // Create space background with gradient
        const gradient = this.ctx.createLinearGradient(0, 0, this.baseViewWidth, this.baseViewHeight);
        gradient.addColorStop(0, '#0a0a20');
        gradient.addColorStop(0.5, '#1a1a3a');
        gradient.addColorStop(1, '#0f0f2a');
        this.ctx.fillStyle = gradient;
        this.ctx.fillRect(0, 0, this.baseViewWidth, this.baseViewHeight);
        
        // Add some cosmic nebula effects
        this.ctx.save();
        this.ctx.globalAlpha = 0.3;
        
        // Purple nebula with subtle parallax movement
        const nebula1X = this.baseViewWidth * 0.3 + (this.cameraX * 0.05);
        const nebula1Y = this.baseViewHeight * 0.3 + (this.cameraY * 0.05);
        const nebula1 = this.ctx.createRadialGradient(
            nebula1X, nebula1Y, 0,
            nebula1X, nebula1Y, this.baseViewWidth * 0.4
        );
        nebula1.addColorStop(0, 'rgba(120, 50, 200, 0.4)');
        nebula1.addColorStop(1, 'transparent');
        this.ctx.fillStyle = nebula1;
        this.ctx.fillRect(0, 0, this.baseViewWidth, this.baseViewHeight);
        
        // Blue nebula with subtle parallax movement
        const nebula2X = this.baseViewWidth * 0.7 + (this.cameraX * 0.08);
        const nebula2Y = this.baseViewHeight * 0.7 + (this.cameraY * 0.08);
        const nebula2 = this.ctx.createRadialGradient(
            nebula2X, nebula2Y, 0,
            nebula2X, nebula2Y, this.baseViewWidth * 0.3
        );
        nebula2.addColorStop(0, 'rgba(50, 150, 255, 0.3)');
        nebula2.addColorStop(1, 'transparent');
        this.ctx.fillStyle = nebula2;
        this.ctx.fillRect(0, 0, this.baseViewWidth, this.baseViewHeight);
        
        this.ctx.restore();
        
        // Add random stars
        this.drawStars();
        
        // Draw ads in screen coordinates (before camera transformations)
        this.drawAds();
        
        // Apply the camera zoom
        const zoomScale = this.baseViewWidth / this.viewWidth;
        this.ctx.scale(zoomScale, zoomScale);

        // Apply the camera translation
        this.ctx.translate(-this.cameraX, -this.cameraY);

        // Now draw everything
        this.drawGrid();
        this.drawWorldBounds();
        this.drawMinions();

        // Restore to the original state before any transformations
        this.ctx.restore();
    }
    
    drawStars() {
        // Stars should be drawn in world space, but with their own slower-moving "camera"
        this.ctx.save();
        
        // Parallax layers - each layer has its own virtual camera that moves slower
        const layers = [
            { count: 200, parallax: 0.1, size: 1, opacity: 0.3 },
            { count: 300, parallax: 0.2, size: 1, opacity: 0.6 },
            { count: 100, parallax: 0.4, size: 2, opacity: 0.9 }
        ];
        
        layers.forEach((layer, layerIndex) => {
            // Calculate this layer's virtual camera position
            const starCameraX = this.cameraX * layer.parallax;
            const starCameraY = this.cameraY * layer.parallax;
            
            // Apply transformation for this star layer
            this.ctx.save();
            this.ctx.translate(-starCameraX, -starCameraY);
            
            this.ctx.fillStyle = '#ffffff';
            this.ctx.globalAlpha = layer.opacity;
            
            for (let i = 0; i < layer.count; i++) {
                // Generate star positions in a large star world space
                const seed = (i + layerIndex * 1000) * 9973;
                const starWorldX = this.pseudoRandom(seed) * this.worldWidth * 3;
                const starWorldY = this.pseudoRandom(seed + 1) * this.worldHeight * 3;
                
                // Only draw stars that would be visible given current camera view
                const screenX = starWorldX - starCameraX;
                const screenY = starWorldY - starCameraY;
                
                if (screenX >= -this.viewWidth && screenX <= this.viewWidth * 2 && 
                    screenY >= -this.viewHeight && screenY <= this.viewHeight * 2) {
                    
                    // Deterministic opacity variation
                    const opacityVariation = this.pseudoRandom(seed + 2) * 0.4 + 0.6;
                    this.ctx.globalAlpha = layer.opacity * opacityVariation;
                    
                    this.ctx.fillRect(starWorldX, starWorldY, layer.size, layer.size);
                }
            }
            
            this.ctx.restore();
        });
        
        this.ctx.restore();
    }
    
    // Simple pseudo-random function that gives consistent results for the same input
    pseudoRandom(seed) {
        const x = Math.sin(seed) * 10000;
        return x - Math.floor(x);
    }
    
    drawGrid() {
        this.ctx.strokeStyle = 'rgba(100, 181, 246, 0.15)';
        this.ctx.lineWidth = 1;
        
        const gridSize = 100;
        
        // Calculate visible grid range, but clamp to world boundaries
        const startX = Math.max(0, Math.floor(this.cameraX / gridSize) * gridSize);
        const endX = Math.min(this.worldWidth, Math.ceil((this.cameraX + this.viewWidth) / gridSize) * gridSize);
        const startY = Math.max(0, Math.floor(this.cameraY / gridSize) * gridSize);
        const endY = Math.min(this.worldHeight, Math.ceil((this.cameraY + this.viewHeight) / gridSize) * gridSize);
        
        // Vertical lines
        for (let x = startX; x <= endX; x += gridSize) {
            if (x >= 0 && x <= this.worldWidth) {
                this.ctx.beginPath();
                this.ctx.moveTo(x, Math.max(0, this.cameraY));
                this.ctx.lineTo(x, Math.min(this.worldHeight, this.cameraY + this.viewHeight));
                this.ctx.stroke();
            }
        }
        
        // Horizontal lines
        for (let y = startY; y <= endY; y += gridSize) {
            if (y >= 0 && y <= this.worldHeight) {
                this.ctx.beginPath();
                this.ctx.moveTo(Math.max(0, this.cameraX), y);
                this.ctx.lineTo(Math.min(this.worldWidth, this.cameraX + this.viewWidth), y);
                this.ctx.stroke();
            }
        }
    }
    
    drawWorldBounds() {
        this.ctx.strokeStyle = 'rgba(100, 181, 246, 0.5)';
        this.ctx.lineWidth = 4;
        
        // Draw rounded rectangle for world bounds
        const radius = 50; // Corner radius
        const width = this.worldWidth;
        const height = this.worldHeight;
        
        this.ctx.beginPath();
        this.ctx.moveTo(radius, 0);
        this.ctx.lineTo(width - radius, 0);
        this.ctx.quadraticCurveTo(width, 0, width, radius);
        this.ctx.lineTo(width, height - radius);
        this.ctx.quadraticCurveTo(width, height, width - radius, height);
        this.ctx.lineTo(radius, height);
        this.ctx.quadraticCurveTo(0, height, 0, height - radius);
        this.ctx.lineTo(0, radius);
        this.ctx.quadraticCurveTo(0, 0, radius, 0);
        this.ctx.stroke();
    }
    
    drawMinions() {
        // Draw all minions
        this.minions.forEach(minion => {
            this.drawMinion(minion);
        });
    }
    
    drawMinion(minion) {
        const isMyMinion = this.players.get(this.myPlayerId)?.id === minion.owner_id;
        const radius = minion.size / 2;
        const isInvulnerable = minion.is_invulnerable || false;
        
        // Draw very subtle glow effect for own minions
        if (isMyMinion) {
            this.ctx.save();
            this.ctx.globalAlpha = 0.1;
            this.ctx.fillStyle = '#ffffff';
            this.ctx.beginPath();
            this.ctx.arc(minion.x, minion.y, radius + 2, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.restore();
        }
        
        // Draw invulnerability shield effect
        if (isInvulnerable) {
            this.ctx.save();
            this.ctx.globalAlpha = 0.3;
            this.ctx.strokeStyle = '#ffffff';
            this.ctx.lineWidth = 2;
            this.ctx.setLineDash([4, 4]);
            this.ctx.beginPath();
            this.ctx.arc(minion.x, minion.y, radius + 3, 0, Math.PI * 2);
            this.ctx.stroke();
            this.ctx.setLineDash([]);
            this.ctx.restore();
        }
        
        // Draw disk-like blob with translucent fill
        this.ctx.save();
        this.ctx.globalAlpha = isInvulnerable ? 0.4 : 0.6; // More transparent when invulnerable
        this.ctx.fillStyle = minion.color;
        this.ctx.beginPath();
        this.ctx.arc(minion.x, minion.y, radius, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.restore();
        
        // Draw opaque border
        this.ctx.strokeStyle = minion.color;
        this.ctx.globalAlpha = isInvulnerable ? 0.7 : 0.9; // Less opaque when invulnerable
        this.ctx.lineWidth = isMyMinion ? 3 : 2.5;
        this.ctx.beginPath();
        this.ctx.arc(minion.x, minion.y, radius, 0, Math.PI * 2);
        this.ctx.stroke();
        this.ctx.globalAlpha = 1.0; // Reset alpha
        
        // Add white border for own minions
        if (isMyMinion) {
            this.ctx.strokeStyle = '#ffffff';
            this.ctx.lineWidth = 1.5;
            this.ctx.beginPath();
            this.ctx.arc(minion.x, minion.y, radius + 1, 0, Math.PI * 2);
            this.ctx.stroke();
        }
        
        // Draw name with better readability
        this.drawMinionName(minion, isMyMinion);
    }
    
    drawMinionName(minion, isMyMinion) {
        const text = minion.original_name;
        const fontSize = Math.max(10, Math.min(14, minion.size * 0.8));
        this.ctx.font = `bold ${fontSize}px Arial`;
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        
        // Draw text outline for better contrast (no background box)
        this.ctx.strokeStyle = '#000000';
        this.ctx.lineWidth = 4;
        this.ctx.strokeText(text, minion.x, minion.y);
        
        // Draw main text
        this.ctx.fillStyle = isMyMinion ? '#ffffff' : '#ffffff';
        this.ctx.fillText(text, minion.x, minion.y);
    }
    
    // Helper function to lighten a color
    lightenColor(color, percent) {
        // Convert hex to RGB
        const r = parseInt(color.slice(1, 3), 16);
        const g = parseInt(color.slice(3, 5), 16);
        const b = parseInt(color.slice(5, 7), 16);
        
        // Lighten each component
        const newR = Math.min(255, Math.floor(r + (255 - r) * percent / 100));
        const newG = Math.min(255, Math.floor(g + (255 - g) * percent / 100));
        const newB = Math.min(255, Math.floor(b + (255 - b) * percent / 100));
        
        return `rgb(${newR}, ${newG}, ${newB})`;
    }
    
    // Helper function to darken a color
    darkenColor(color, percent) {
        // Convert hex to RGB
        const r = parseInt(color.slice(1, 3), 16);
        const g = parseInt(color.slice(3, 5), 16);
        const b = parseInt(color.slice(5, 7), 16);
        
        // Darken each component
        const newR = Math.floor(r * (100 - percent) / 100);
        const newG = Math.floor(g * (100 - percent) / 100);
        const newB = Math.floor(b * (100 - percent) / 100);
        
        return `rgb(${newR}, ${newG}, ${newB})`;
    }
    
    renderMinimap() {
        if (!this.minimapCtx) return;
        
        // Clear minimap with space theme
        const minimapGradient = this.minimapCtx.createLinearGradient(0, 0, 150, 112);
        minimapGradient.addColorStop(0, '#0a0a20');
        minimapGradient.addColorStop(1, '#1a1a3a');
        this.minimapCtx.fillStyle = minimapGradient;
        this.minimapCtx.fillRect(0, 0, 150, 112);
        
        // Draw world bounds
        this.minimapCtx.strokeStyle = 'rgba(100, 181, 246, 0.6)';
        this.minimapCtx.lineWidth = 2;
        this.minimapCtx.strokeRect(1, 1, 148, 110);
        
        // Scale factors
        const scaleX = 148 / this.worldWidth;
        const scaleY = 110 / this.worldHeight;
        
        // Draw minions on minimap with enhanced visuals
        this.minions.forEach(minion => {
            const x = minion.x * scaleX + 1;
            const y = minion.y * scaleY + 1;
            const size = Math.max(2, minion.size * scaleX * 0.4);
            
            const isMyMinion = this.players.get(this.myPlayerId)?.id === minion.owner_id;
            
            // Draw glow for my minions
            if (isMyMinion) {
                this.minimapCtx.save();
                this.minimapCtx.globalAlpha = 0.4;
                this.minimapCtx.fillStyle = '#ffffff';
                this.minimapCtx.beginPath();
                this.minimapCtx.arc(x, y, size + 1, 0, Math.PI * 2);
                this.minimapCtx.fill();
                this.minimapCtx.restore();
            }
            
            // Draw minion with translucent fill
            this.minimapCtx.save();
            this.minimapCtx.globalAlpha = 0.6;
            this.minimapCtx.fillStyle = minion.color;
            this.minimapCtx.beginPath();
            this.minimapCtx.arc(x, y, size, 0, Math.PI * 2);
            this.minimapCtx.fill();
            this.minimapCtx.restore();
            
            // Draw opaque border
            this.minimapCtx.strokeStyle = minion.color;
            this.minimapCtx.globalAlpha = 0.9;
            this.minimapCtx.lineWidth = isMyMinion ? 1.5 : 1;
            this.minimapCtx.beginPath();
            this.minimapCtx.arc(x, y, size, 0, Math.PI * 2);
            this.minimapCtx.stroke();
            this.minimapCtx.globalAlpha = 1.0;
            
            // Add white border for my minions
            if (isMyMinion) {
                this.minimapCtx.strokeStyle = '#ffffff';
                this.minimapCtx.lineWidth = 1;
                this.minimapCtx.beginPath();
                this.minimapCtx.arc(x, y, size + 0.5, 0, Math.PI * 2);
                this.minimapCtx.stroke();
            }
        });
        
        // Draw viewport indicator with better styling
        const viewX = this.cameraX * scaleX + 1;
        const viewY = this.cameraY * scaleY + 1;
        const viewW = this.viewWidth * scaleX;
        const viewH = this.viewHeight * scaleY;
        
        this.minimapCtx.strokeStyle = '#ffffff';
        this.minimapCtx.lineWidth = 2;
        this.minimapCtx.setLineDash([3, 3]);
        this.minimapCtx.strokeRect(viewX, viewY, viewW, viewH);
        this.minimapCtx.setLineDash([]); // Reset line dash
    }
    
    updateUI() {
        const myPlayer = this.players.get(this.myPlayerId);
        if (myPlayer) {
            document.getElementById('playerSize').textContent = `Minions: ${myPlayer.minion_count}`;
            document.getElementById('playerName2').textContent = myPlayer.name;
        }
        this.updateLeaderboard();
    }
    
    updateLeaderboard() {
        const leaderboardList = document.getElementById('leaderboardList');
        
        // Convert players Map to array, filter out dead players, and sort by minion count (descending)
        const sortedPlayers = Array.from(this.players.values())
            .filter(player => !player.is_dead) // Exclude dead players from leaderboard
            .sort((a, b) => b.minion_count - a.minion_count)
            .slice(0, 10); // Show top 10 players
        
        // Clear current leaderboard
        leaderboardList.innerHTML = '';
        
        // Add entries
        sortedPlayers.forEach((player, index) => {
            const entry = document.createElement('div');
            entry.className = 'leaderboard-entry';
            
            // Highlight current player
            if (player.id === this.myPlayerId) {
                entry.classList.add('is-me');
            }
            
            entry.innerHTML = `
                <span class="leaderboard-rank">#${index + 1}</span>
                <span class="leaderboard-name">${player.name}</span>
                <span class="leaderboard-size">${player.minion_count}</span>
            `;
            
            leaderboardList.appendChild(entry);
        });
        
        // Show message if no players
        if (sortedPlayers.length === 0) {
            leaderboardList.innerHTML = '<div style="text-align: center; color: rgba(255,255,255,0.5); font-size: 12px; padding: 10px;">No active players</div>';
        }
    }
    
    showInfectionEffect(x, y) {
        const effect = document.createElement('div');
        effect.className = 'infection-effect';
        effect.innerHTML = '💀';
        effect.style.cssText = `
            position: absolute;
            font-size: 20px;
            pointer-events: none;
            z-index: 1000;
            animation: infectionPop 1s ease-out forwards;
        `;
        
        // Convert world coordinates to screen coordinates
        const scale = this.baseViewWidth / this.viewWidth;
        const screenX = (x - this.cameraX) * scale;
        const screenY = (y - this.cameraY) * scale;
        
        effect.style.left = (screenX - 10) + 'px';
        effect.style.top = (screenY - 10) + 'px';
        
        document.getElementById('game').appendChild(effect);
        
        setTimeout(() => {
            effect.remove();
        }, 1000);
    }
    
    showNameChangeModal(currentName) {
        const nameInput = document.getElementById('newPlayerName');
        nameInput.value = currentName;
        
        document.getElementById('nameChangeModal').classList.remove('hidden');
        
        // Use setTimeout to ensure the modal is visible before focusing
        // This helps with browser focus policies and modal animations
        setTimeout(() => {
            nameInput.focus();
            nameInput.select(); // This will select all text so user can just type or press Enter
        }, 10);
    }
    
    hideNameChangeModal() {
        document.getElementById('nameChangeModal').classList.add('hidden');
        document.getElementById('newPlayerName').value = '';
    }
    
    changePlayerName() {
        const newName = document.getElementById('newPlayerName').value.trim();
        
        if (!newName) {
            alert('Please enter a name');
            return;
        }
        
        if (this.socket && this.socket.connected) {
            console.log('Requesting respawn with name:', newName);
            this.socket.emit('change_name', { name: newName });
            
            // Then respawn
            this.socket.emit('respawn_player', {});
        }
        
        this.hideNameChangeModal();
    }
    
    addChatMessage(message, type = 'normal') {
        const chatMessages = document.getElementById('chatMessages');
        const currentTime = Date.now();
        const fiveSecondsAgo = currentTime - 5000; // 5 seconds in milliseconds
        
        // Clean up old messages from tracking
        for (const [msg, data] of this.recentMessages.entries()) {
            if (data.timestamp < fiveSecondsAgo) {
                this.recentMessages.delete(msg);
            }
        }
        
        // Check if we have this message in the recent window
        if (this.recentMessages.has(message)) {
            const messageData = this.recentMessages.get(message);
            
            // Update the count and timestamp
            messageData.count++;
            messageData.timestamp = currentTime;
            
            // Update the display
            const messageWithoutCount = message.replace(/ \(\d+ times\)$/, '');
            messageData.element.textContent = `${messageWithoutCount} (${messageData.count} times)`;
            
            // Move the message to the bottom
            chatMessages.appendChild(messageData.element);
        } else {
            // New message, create it
            const messageElement = document.createElement('div');
            messageElement.className = `chat-message ${type}`;
            messageElement.textContent = message;
            
            chatMessages.appendChild(messageElement);
            
            // Track this message
            this.recentMessages.set(message, {
                count: 1,
                timestamp: currentTime,
                element: messageElement
            });
        }
        
        // Auto-scroll to bottom
        chatMessages.scrollTop = chatMessages.scrollHeight;
        
        // Limit messages to prevent memory issues (keep last 50 messages)
        while (chatMessages.children.length > 50) {
            const removedElement = chatMessages.removeChild(chatMessages.firstChild);
            
            // Also remove from tracking if it's there
            for (const [msg, data] of this.recentMessages.entries()) {
                if (data.element === removedElement) {
                    this.recentMessages.delete(msg);
                    break;
                }
            }
        }
    }
}

// Add CSS for infection effect animation
const style = document.createElement('style');
style.textContent = `
    @keyframes infectionPop {
        0% {
            transform: scale(0.5);
            opacity: 1;
        }
        50% {
            transform: scale(1.2);
            opacity: 1;
        }
        100% {
            transform: scale(1) translateY(-30px);
            opacity: 0;
        }
    }
`;
document.head.appendChild(style);

// Start the game when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new AgarioGame();
    
    // Auto-focus the player name input for immediate typing
    setTimeout(() => {
        const playerNameInput = document.getElementById('playerName');
        if (playerNameInput) {
            playerNameInput.focus();
            playerNameInput.select(); // Select any existing text
        }
    }, 100); // Small delay to ensure everything is loaded
}); 
