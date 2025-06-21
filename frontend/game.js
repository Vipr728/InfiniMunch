class AgarioGame {
    constructor() {
        this.socket = null;
        this.canvas = null;
        this.ctx = null;
        this.players = new Map();
        this.myPlayerId = null;
        this.mouseX = 0;
        this.mouseY = 0;
        this.worldWidth = 800;
        this.worldHeight = 600;
        
        this.init();
    }
    
    init() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        
        this.setupEventListeners();
        this.connectToServer();
    }
    
    setupEventListeners() {
        // Menu events
        document.getElementById('joinButton').addEventListener('click', () => {
            this.joinGame();
        });
        
        document.getElementById('playerName').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.joinGame();
            }
        });
        
        // Game events
        this.canvas.addEventListener('mousemove', (e) => {
            const rect = this.canvas.getBoundingClientRect();
            this.mouseX = e.clientX - rect.left;
            this.mouseY = e.clientY - rect.top;
            
            if (this.socket && this.socket.connected && this.myPlayerId) {
                console.log('Sending move:', this.mouseX, this.mouseY, 'Player ID:', this.myPlayerId);
                this.socket.emit('move_player', {
                    x: this.mouseX,
                    y: this.mouseY,
                });
            }
        });
    }
    
    connectToServer() {
        this.socket = io('http://localhost:8080');
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
            this.canvas.width = this.worldWidth;
            this.canvas.height = this.worldHeight;
            
            this.players.clear();
            data.players.forEach(player => {
                this.players.set(player.id, player);
                if (player.id === this.myPlayerId) {
                    console.log('Found my player:', player);
                }
            });
            
            this.render();
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
                this.players.set(playerData.id, playerData);
            });
            this.render();
            this.updateUI();
        });
        
        this.socket.on('collision', (data) => {
            console.log('Collision!', data);
            this.showCollisionEffect(data.winner.x, data.winner.y);
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
        // Clear canvas
        this.ctx.fillStyle = '#f0f0f0';
        this.ctx.fillRect(0, 0, this.worldWidth, this.worldHeight);
        
        // Draw grid
        this.drawGrid();
        
        // Draw all players
        this.players.forEach(player => {
            this.drawPlayer(player);
        });
    }
    
    drawGrid() {
        this.ctx.strokeStyle = '#e0e0e0';
        this.ctx.lineWidth = 1;
        
        // Vertical lines
        for (let x = 0; x < this.worldWidth; x += 50) {
            this.ctx.beginPath();
            this.ctx.moveTo(x, 0);
            this.ctx.lineTo(x, this.worldHeight);
            this.ctx.stroke();
        }
        
        // Horizontal lines
        for (let y = 0; y < this.worldHeight; y += 50) {
            this.ctx.beginPath();
            this.ctx.moveTo(0, y);
            this.ctx.lineTo(this.worldWidth, y);
            this.ctx.stroke();
        }
    }
    
    drawPlayer(player) {
        const isMe = player.id === this.myPlayerId;
        
        // Draw blob
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
    
    updateUI() {
        const myPlayer = this.players.get(this.myPlayerId);
        if (myPlayer) {
            document.getElementById('playerSize').textContent = `Size: ${Math.round(myPlayer.size)}`;
        }
    }
    
    showCollisionEffect(x, y) {
        const effect = document.createElement('div');
        effect.className = 'collision-effect';
        effect.style.left = (x - 10) + 'px';
        effect.style.top = (y - 10) + 'px';
        
        document.getElementById('game').appendChild(effect);
        
        setTimeout(() => {
            effect.remove();
        }, 500);
    }
}

// Start the game when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new AgarioGame();
}); 