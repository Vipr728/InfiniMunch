import socketio
import aiohttp.web
import uuid
import asyncio
import random
import math
import time
import os
from ai import ai_resolver

# Create a Socket.IO server
sio = socketio.AsyncServer(
    cors_allowed_origins="*",
    cors_credentials=False,
    logger=True,
    engineio_logger=True
)
app = aiohttp.web.Application()
sio.attach(app)

# Add static file serving
async def index_handler(request):
    """Serve the main HTML file"""
    try:
        with open('../frontend/index.html', 'r', encoding='utf-8') as f:
            content = f.read()
        return aiohttp.web.Response(text=content, content_type='text/html')
    except FileNotFoundError:
        return aiohttp.web.Response(text='Frontend not found', status=404)

async def static_handler(request):
    """Serve static files (CSS, JS)"""
    try:
        file_path = request.match_info['path']
        full_path = f'../frontend/{file_path}'
        
        if not os.path.exists(full_path):
            return aiohttp.web.Response(text='File not found', status=404)
        
        with open(full_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # Determine content type
        if file_path.endswith('.css'):
            content_type = 'text/css'
        elif file_path.endswith('.js'):
            content_type = 'application/javascript'
        else:
            content_type = 'text/plain'
        
        return aiohttp.web.Response(text=content, content_type=content_type)
    except Exception as e:
        return aiohttp.web.Response(text=f'Error: {str(e)}', status=500)

# Add routes
app.router.add_get('/', index_handler)
app.router.add_get('/{path:.*}', static_handler)

# Game state
players = {}
WORLD_WIDTH = 800
WORLD_HEIGHT = 600
INITIAL_SIZE = 20
MOVE_SPEED = 2
collision_cooldowns = {}  # Track collision cooldowns

class Player:
    def __init__(self, player_id, name):
        self.id = player_id
        self.name = name
        self.x = random.randint(INITIAL_SIZE, WORLD_WIDTH - INITIAL_SIZE)
        self.y = random.randint(INITIAL_SIZE, WORLD_HEIGHT - INITIAL_SIZE)
        self.size = INITIAL_SIZE
        self.color = f"#{random.randint(0, 0xFFFFFF):06x}"
        self.target_x = self.x
        self.target_y = self.y
        
    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'x': self.x,
            'y': self.y,
            'size': self.size,
            'color': self.color,
        }
    
    def move_towards_target(self):
        dx = self.target_x - self.x
        dy = self.target_y - self.y
        distance = math.sqrt(dx**2 + dy**2)
        
        if distance > 1:
            # Normalize and apply speed
            self.x += (dx / distance) * MOVE_SPEED
            self.y += (dy / distance) * MOVE_SPEED
            
            # Keep within bounds - more aggressive boundary checking
            self.x = max(self.size, min(WORLD_WIDTH - self.size, self.x))
            self.y = max(self.size, min(WORLD_HEIGHT - self.size, self.y))
            
            # If we're still outside bounds, force reset to valid position
            if self.x < self.size or self.x > WORLD_WIDTH - self.size:
                self.x = max(self.size, min(WORLD_WIDTH - self.size, self.x))
            if self.y < self.size or self.y > WORLD_HEIGHT - self.size:
                self.y = max(self.size, min(WORLD_HEIGHT - self.size, self.y))

def check_collision(player1, player2):
    """Check if two players are colliding"""
    dx = player1.x - player2.x
    dy = player1.y - player2.y
    distance = math.sqrt(dx**2 + dy**2)
    return distance < (player1.size + player2.size) / 2

async def handle_collision(player1, player2):
    """Handle collision between two players - AI determines winner based on name power"""
    # Use AI to determine winner based on name power
    winner_name, loser_name = await ai_resolver.determine_winner(player1.name, player2.name)
    
    # Find the actual player objects
    winner = player1 if winner_name == player1.name else player2
    loser = player2 if winner == player1 else player1
    
    print(f"AI determined '{winner.name}' wins over '{loser.name}' based on name power!")
    
    # Winner grows, loser shrinks or dies
    size_transfer = loser.size * 0.3
    winner.size += size_transfer
    loser.size -= size_transfer
    
    if loser.size < 10:
        # Respawn the loser
        loser.x = random.randint(INITIAL_SIZE, WORLD_WIDTH - INITIAL_SIZE)
        loser.y = random.randint(INITIAL_SIZE, WORLD_HEIGHT - INITIAL_SIZE)
        loser.size = INITIAL_SIZE
        loser.color = f"#{random.randint(0, 0xFFFFFF):06x}"
    
    return winner, loser

@sio.event
async def connect(sid, environ):
    print(f'Client {sid} connected')
    print(f'Connection details: {environ.get("HTTP_USER_AGENT", "Unknown")}')

@sio.event
async def disconnect(sid):
    print(f'Client {sid} disconnected')
    if sid in players:
        player_name = players[sid].name
        del players[sid]
        await sio.emit('player_left', {'player_id': sid})
        print(f'Player {player_name} removed from game')
    else:
        print(f'Client {sid} disconnected without joining game')

@sio.event
async def join_game(sid, data):
    player_name = data.get('name', f'Player{len(players) + 1}')
    player = Player(sid, player_name)
    players[sid] = player
    
    # Send current game state to new player
    await sio.emit('game_state', {
        'players': [p.to_dict() for p in players.values()],
        'world': {'width': WORLD_WIDTH, 'height': WORLD_HEIGHT},
    }, room=sid)
    
    # Notify others about new player
    await sio.emit('player_joined', player.to_dict(), skip_sid=sid)
    
    print(f'Player {player_name} joined the game')

@sio.event
async def move_player(sid, data):
    if sid not in players:
        print(f"Player {sid} not found in players dict")
        return
        
    player = players[sid]
    
    # Get the target coordinates from the frontend
    target_x = data.get('x', player.x)
    target_y = data.get('y', player.y)
    
    # Ensure coordinates are within the world bounds
    target_x = max(player.size, min(WORLD_WIDTH - player.size, target_x))
    target_y = max(player.size, min(WORLD_HEIGHT - player.size, target_y))
    
    # Update player's target position
    player.target_x = target_x
    player.target_y = target_y
    
    # Debug logging (only for significant movements)
    if abs(target_x - player.x) > 20 or abs(target_y - player.y) > 20:
        print(f"Player {player.name} moving to ({target_x:.0f}, {target_y:.0f})")

@sio.event
async def connect_error(sid, data):
    print(f'Connection error for {sid}: {data}')

@sio.event
async def error(sid, data):
    print(f'Error for {sid}: {data}')

async def game_loop():
    """Main game loop"""
    while True:
        if len(players) > 1:
            # Move all players
            for player in players.values():
                player.move_towards_target()
            
            # Check collisions
            player_list = list(players.values())
            for i in range(len(player_list)):
                for j in range(i + 1, len(player_list)):
                    try:
                        player1 = player_list[i]
                        player2 = player_list[j]
                        
                        # Skip if either player no longer exists
                        if player1.id not in players or player2.id not in players:
                            continue
                        
                        # Check collision cooldown
                        collision_key = f"{player1.id}-{player2.id}"
                        current_time = time.time()
                        
                        if collision_key in collision_cooldowns:
                            if current_time - collision_cooldowns[collision_key] < 2.0:  # 2 second cooldown
                                continue
                        
                        if check_collision(player1, player2):
                            # Set cooldown
                            collision_cooldowns[collision_key] = current_time
                            
                            winner, loser = await handle_collision(player1, player2)
                            await sio.emit('collision', {
                                'winner': winner.to_dict(),
                                'loser': loser.to_dict(),
                            })
                    except Exception as e:
                        print(f"Error in collision detection: {e}")
                        continue
            
            # Send updated game state
            await sio.emit('update_players', [p.to_dict() for p in players.values()])
        
        await asyncio.sleep(1/60)  # 60 FPS

if __name__ == '__main__':
    # Run the server
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    
    # Start the game loop
    loop.create_task(game_loop())
    
    aiohttp.web.run_app(app, host='localhost', port=8080, loop=loop) 