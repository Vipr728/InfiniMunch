class AgarioGame {
    constructor() {
        this.socket = null;
        this.canvas = null;
        this.ctx = null;
        this.minimapCanvas = null;
        this.minimapCtx = null;
        this.players = new Map();
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
        
        this.init();
    }
    
    init() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        
        // Set initial canvas size
        this.handleResize();
        
        // Create minimap
        this.createMinimap();
        
        this.setupEventListeners();
        this.connectToServer();
        
        // Start render loop
        this.startRenderLoop();
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
            pointer-events: none; /* Make minimap transparent to mouse events */
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
        if (myPlayer) {
            // Calculate zoom based on player size (bigger player = see more of world)
            const baseSize = 20; // Initial player size
            const sizeRatio = myPlayer.size / baseSize;
            // Bigger players see MORE (higher zoom factor = bigger view area)
            this.zoom = Math.max(1, Math.min(3, 1 + (sizeRatio - 1) * 0.5)); // Zoom range: 1x to 3x
            
            // Update view dimensions - bigger zoom = bigger view area
            this.viewWidth = this.baseViewWidth * this.zoom;
            this.viewHeight = this.baseViewHeight * this.zoom;
            
            // Center camera on the direct server position
            this.cameraX = myPlayer.x - this.viewWidth / 2;
            this.cameraY = myPlayer.y - this.viewHeight / 2;
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
                e.preventDefault(); // Prevent form submission if this were in a form
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

            // Calculate direction vector from player (screen center) to mouse
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
        this.socket = io('http://localhost:5000');
        // this.socket = io('https://qk5cj5-ip-167-220-57-55.tunnelmole.net');
        
        this.socket.on('connect', () => {
            console.log('Connected to server');
            document.getElementById('connectionStatus').textContent = 'Connected! Enter your name to play.';
            document.getElementById('joinButton').disabled = false;
        });
        
        this.socket.on('disconnect', () => {
            console.log('Disconnected from server');
            document.getElementById('connectionStatus').textContent = 'Disconnected from server';
            this.showMenu();
        });
        
        this.socket.on('game_state', (data) => {
            console.log('Received game state:', data);
            this.worldWidth = data.world.width;
            this.worldHeight = data.world.height;
            
            this.players.clear();
            // No more interpolation, just use server data directly
            data.players.forEach(player => {
                this.players.set(player.id, player);
                if (player.id === this.myPlayerId) {
                    console.log('Found my player:', player);
                }
            });
        });
        
        this.socket.on('player_joined', (player) => {
            this.players.set(player.id, player);
            console.log(`${player.name} joined the game`);
        });
        
        this.socket.on('player_left', (data) => {
            const player = this.players.get(data.player_id);
            if (player) {
                console.log(`${player.name} left the game`);
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
                }
            });
            this.updateUI();
        });
        
        this.socket.on('collision', (data) => {
            console.log('Collision!', data);
            this.showCollisionEffect(data.winner.x, data.winner.y);
        });
        
        this.socket.on('player_died', (data) => {
            console.log('Player died:', data);
            if (data.player_id === this.myPlayerId) {
                this.showNameChangeModal(data.current_name);
            }
        });
        
        this.socket.on('player_name_changed', (data) => {
            console.log('Player name changed:', data);
            const player = this.players.get(data.player_id);
            if (player) {
                player.name = data.new_name;
                if (data.player_id === this.myPlayerId) {
                    document.getElementById('playerName2').textContent = data.new_name;
                }
            }
        });
        
        this.socket.on('connect_error', () => {
            document.getElementById('connectionStatus').textContent = 'Failed to connect to server';
        });
    }
    
    joinGame() {
        const nameInput = document.getElementById('playerName');
        const name = nameInput.value.trim();
        
        if (!name) {
            alert('Please enter your name');
            return;
        }
        
        if (!this.socket || !this.socket.connected) {
            alert('Not connected to server');
            return;
        }
        
        console.log('Socket ID:', this.socket.id);
        this.myPlayerId = this.socket.id;
        document.getElementById('playerName2').textContent = name;
        
        this.socket.emit('join_game', { name });
        this.showGame();
    }
    
    showMenu() {
        document.getElementById('menu').classList.remove('hidden');
        document.getElementById('game').classList.add('hidden');
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
        
        // Apply the camera zoom
        const zoomScale = this.baseViewWidth / this.viewWidth;
        this.ctx.scale(zoomScale, zoomScale);

        // Apply the camera translation
        this.ctx.translate(-this.cameraX, -this.cameraY);

        // Now draw everything. The coordinate system is correctly set up.
        this.drawGrid();
        this.drawWorldBounds();
        this.players.forEach(player => {
            this.drawPlayer(player);
        });

        // Restore to the original state before any transformations
        this.ctx.restore();
    }
    
    drawStars() {
        // Stars should be drawn in world space, but with their own slower-moving "camera"
        this.ctx.save();
        
        // Parallax layers - each layer has its own virtual camera that moves slower
        const layers = [
            { count: 200, parallax: 0.1, size: 1, opacity: 0.3 },  // Far background - moves 10% as fast as real camera
            { count: 300, parallax: 0.2, size: 1, opacity: 0.6 },  // Mid background - moves 20% as fast
            { count: 100, parallax: 0.4, size: 2, opacity: 0.9 }   // Near background - moves 40% as fast
        ];
        
        layers.forEach((layer, layerIndex) => {
            // Calculate this layer's virtual camera position (moves slower than real camera)
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
        this.ctx.strokeStyle = 'rgba(100, 181, 246, 0.15)'; // Subtle blue grid lines
        this.ctx.lineWidth = 1;
        
        const gridSize = 100; // Increased from 50 to make grid more sparse
        
        // Calculate visible grid range, but clamp to world boundaries
        const startX = Math.max(0, Math.floor(this.cameraX / gridSize) * gridSize);
        const endX = Math.min(this.worldWidth, Math.ceil((this.cameraX + this.viewWidth) / gridSize) * gridSize);
        const startY = Math.max(0, Math.floor(this.cameraY / gridSize) * gridSize);
        const endY = Math.min(this.worldHeight, Math.ceil((this.cameraY + this.viewHeight) / gridSize) * gridSize);
        
        // Vertical lines - clamp to world boundaries
        for (let x = startX; x <= endX; x += gridSize) {
            if (x >= 0 && x <= this.worldWidth) {
                this.ctx.beginPath();
                this.ctx.moveTo(x, Math.max(0, this.cameraY));
                this.ctx.lineTo(x, Math.min(this.worldHeight, this.cameraY + this.viewHeight));
                this.ctx.stroke();
            }
        }
        
        // Horizontal lines - clamp to world boundaries
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
        this.ctx.strokeStyle = 'rgba(100, 181, 246, 0.5)'; // More visible cosmic blue boundary
        this.ctx.lineWidth = 4;
        this.ctx.strokeRect(0, 0, this.worldWidth, this.worldHeight);
    }
    
    drawPlayer(player) {
        const isMe = player.id === this.myPlayerId;
        
        // Draw blob at its direct server position
        this.ctx.fillStyle = player.color;
        this.ctx.beginPath();
        this.ctx.arc(player.x, player.y, player.size / 2, 0, Math.PI * 2);
        this.ctx.fill();
        
        // Draw outline
        this.ctx.strokeStyle = isMe ? '#ffffff' : '#333333';
        this.ctx.lineWidth = isMe ? 3 : 1;
        this.ctx.stroke();
        
        // Draw name
        this.ctx.fillStyle = '#000000';
        this.ctx.font = '12px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText(player.name, player.x, player.y + 4);
        
        // Draw size for current player
        if (isMe) {
            this.ctx.fillStyle = '#666666';
            this.ctx.font = '10px Arial';
            this.ctx.fillText(`${Math.round(player.size)}`, player.x, player.y - player.size/2 - 5);
        }
    }
    
    renderMinimap() {
        if (!this.minimapCtx) return;
        
        // Clear minimap
        this.minimapCtx.fillStyle = '#333333';
        this.minimapCtx.fillRect(0, 0, 150, 112);
        
        // Draw world bounds
        this.minimapCtx.strokeStyle = '#666666';
        this.minimapCtx.lineWidth = 1;
        this.minimapCtx.strokeRect(0, 0, 150, 112);
        
        // Scale factors
        const scaleX = 150 / this.worldWidth;
        const scaleY = 112 / this.worldHeight;
        
        // Draw players on minimap using their true server position
        this.players.forEach(player => {
            const x = player.x * scaleX;
            const y = player.y * scaleY;
            const size = Math.max(2, player.size * scaleX * 0.5);
            
            this.minimapCtx.fillStyle = player.id === this.myPlayerId ? '#ffffff' : player.color;
            this.minimapCtx.beginPath();
            this.minimapCtx.arc(x, y, size, 0, Math.PI * 2);
            this.minimapCtx.fill();
        });
        
        // Draw viewport indicator
        const viewX = this.cameraX * scaleX;
        const viewY = this.cameraY * scaleY;
        const viewW = this.viewWidth * scaleX;
        const viewH = this.viewHeight * scaleY;
        
        this.minimapCtx.strokeStyle = '#ffffff';
        this.minimapCtx.lineWidth = 1;
        this.minimapCtx.strokeRect(viewX, viewY, viewW, viewH);
    }
    
    updateUI() {
        const myPlayer = this.players.get(this.myPlayerId);
        if (myPlayer) {
            document.getElementById('playerSize').textContent = `Size: ${Math.round(myPlayer.size)}`;
        }
        this.updateLeaderboard();
    }
    
    updateLeaderboard() {
        const leaderboardList = document.getElementById('leaderboardList');
        
        // Convert players Map to array and sort by size (descending)
        const sortedPlayers = Array.from(this.players.values())
            .sort((a, b) => b.size - a.size)
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
                <span class="leaderboard-size">${Math.round(player.size)}</span>
            `;
            
            leaderboardList.appendChild(entry);
        });
        
        // Show message if no players
        if (sortedPlayers.length === 0) {
            leaderboardList.innerHTML = '<div style="text-align: center; color: rgba(255,255,255,0.5); font-size: 12px; padding: 10px;">No players yet</div>';
        }
    }
    
    showCollisionEffect(x, y) {
        const effect = document.createElement('div');
        effect.className = 'collision-effect';
        
        // Convert world coordinates to screen coordinates accounting for zoom
        const scale = this.baseViewWidth / this.viewWidth;
        const screenX = (x - this.cameraX) * scale;
        const screenY = (y - this.cameraY) * scale;
        
        effect.style.left = (screenX - 10) + 'px';
        effect.style.top = (screenY - 10) + 'px';
        
        document.getElementById('game').appendChild(effect);
        
        setTimeout(() => {
            effect.remove();
        }, 500);
    }
    
    showNameChangeModal(currentName) {
        const nameInput = document.getElementById('newPlayerName');
        nameInput.value = currentName;
        nameInput.select();
        nameInput.focus();
        
        document.getElementById('nameChangeModal').classList.remove('hidden');
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
            this.socket.emit('change_name', { name: newName });
        }
        
        this.hideNameChangeModal();
    }
}

// Start the game when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new AgarioGame();
}); 
