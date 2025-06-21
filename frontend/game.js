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
        if (myPlayer) {
            // Calculate zoom based on minion count (more minions = see more of world)
            const baseCount = 20; // Initial minion count
            const countRatio = myPlayer.minion_count / baseCount;
            // More minions = bigger view area
            this.zoom = Math.max(1, Math.min(2.5, 1 + (countRatio - 1) * 0.3)); // Zoom range: 1x to 2.5x
            
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

            // Calculate direction vector from fleet center (screen center) to mouse
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
        
        this.socket.on('connect', () => {
            console.log('Connected to server');
            document.getElementById('connectionStatus').textContent = 'Connected!';
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
            this.minions.clear();
            
            // Update players
            data.players.forEach(player => {
                this.players.set(player.id, player);
            });
            
            // Update minions
            data.all_minions.forEach(minion => {
                this.minions.set(minion.id, minion);
            });
            
            this.updateUI();
        });
        
        this.socket.on('player_joined', (player) => {
            console.log('Player joined:', player);
            this.players.set(player.id, player);
            this.updateUI();
        });
        
        this.socket.on('player_left', (data) => {
            console.log('Player left:', data);
            this.players.delete(data.player_id);
            
            // Remove minions owned by this player
            for (let [minionId, minion] of this.minions) {
                if (minion.owner_id === data.player_id) {
                    this.minions.delete(minionId);
                }
            }
            
            this.updateUI();
        });
        
        this.socket.on('update_game_state', (data) => {
            // Update all players
            data.players.forEach(player => {
                this.players.set(player.id, player);
            });
            
            // Update all minions
            this.minions.clear();
            data.all_minions.forEach(minion => {
                this.minions.set(minion.id, minion);
            });
            
            this.updateUI();
        });
        
        this.socket.on('minion_infection', (data) => {
            console.log('Minion infection:', data);
            // Update the affected minions
            this.minions.set(data.winner.id, data.winner);
            this.minions.set(data.loser.id, data.loser);
            
            // Show infection effect
            this.showInfectionEffect(data.loser.x, data.loser.y);
        });
        
        this.socket.on('player_eliminated', (data) => {
            console.log('Player eliminated:', data);
            if (data.player_id === this.myPlayerId) {
                // Current player was eliminated
                this.showNameChangeModal(this.players.get(this.myPlayerId)?.name || '');
            }
        });
        
        this.socket.on('player_name_changed', (data) => {
            console.log('Player name changed:', data);
            const player = this.players.get(data.player_id);
            if (player) {
                player.name = data.new_name;
                this.updateUI();
            }
        });
        
        this.socket.on('join_failed', (data) => {
            alert(data.message);
            document.getElementById('joinButton').disabled = false;
        });
        
        this.socket.on('name_change_failed', (data) => {
            alert(data.message);
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
        this.showGame();
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
        
        // Draw minion blob
        this.ctx.fillStyle = minion.color;
        this.ctx.beginPath();
        this.ctx.arc(minion.x, minion.y, minion.size / 2, 0, Math.PI * 2);
        this.ctx.fill();
        
        // Draw outline
        this.ctx.strokeStyle = isMyMinion ? '#ffffff' : '#333333';
        this.ctx.lineWidth = isMyMinion ? 2 : 1;
        this.ctx.stroke();
        
        // Draw original name (smaller font for minions)
        this.ctx.fillStyle = '#000000';
        this.ctx.font = '10px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText(minion.original_name, minion.x, minion.y + 3);
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
        
        // Draw minions on minimap
        this.minions.forEach(minion => {
            const x = minion.x * scaleX;
            const y = minion.y * scaleY;
            const size = Math.max(1, minion.size * scaleX * 0.3);
            
            const isMyMinion = this.players.get(this.myPlayerId)?.id === minion.owner_id;
            this.minimapCtx.fillStyle = isMyMinion ? '#ffffff' : minion.color;
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
            document.getElementById('playerSize').textContent = `Minions: ${myPlayer.minion_count}`;
            document.getElementById('playerName2').textContent = myPlayer.name;
        }
        this.updateLeaderboard();
    }
    
    updateLeaderboard() {
        const leaderboardList = document.getElementById('leaderboardList');
        
        // Convert players Map to array and sort by minion count (descending)
        const sortedPlayers = Array.from(this.players.values())
            .sort((a, b) => b.minion_count - a.minion_count)
            .slice(0, 10);
        
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
            // First change the name if it's different
            const currentPlayer = this.players.get(this.myPlayerId);
            if (currentPlayer && currentPlayer.name !== newName) {
                this.socket.emit('change_name', { name: newName });
            }
            
            // Then respawn
            this.socket.emit('respawn_player', {});
        }
        
        this.hideNameChangeModal();
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
}); 
