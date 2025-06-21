import socketio
import aiohttp.web
import uuid
import asyncio
import random
import math
import time
import os
from ai import determine_winner_with_cache

# Create a Socket.IO server
sio = socketio.AsyncServer(
    cors_allowed_origins="*",
    cors_credentials=False,
    logger=False,
    engineio_logger=False
)
app = aiohttp.web.Application()
sio.attach(app)

# Create an instance of WordWinnerResolver

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
WORLD_WIDTH = 2000
WORLD_HEIGHT = 1500
INITIAL_SIZE = 20
# --- Constants for a professional, time-based physics model ---
# Speeds are now in pixels per SECOND, not pixels per tick.
BASE_MAX_SPEED = 270.0    # 4.5 pixels/tick * 60 ticks/sec
MIN_SPEED = 90.0          # 1.5 pixels/tick * 60 ticks/sec

# Matplotlib Pastel1 color palette for beautiful blob colors
PASTEL_COLORS = [
    "#fbb4ae",  # Light pink
    "#b3cde3",  # Light blue
    "#ccebc5",  # Light green
    "#decbe4",  # Light purple
    "#fed9a6",  # Light orange
    "#ffffcc",  # Light yellow
    "#e5d8bd",  # Light beige
    "#fddaec",  # Light magenta
]
collision_cooldowns = {}  # Track collision cooldowns

class Player:
    def __init__(self, player_id, name):
        self.id = player_id
        self.name = name
        self.x = random.randint(INITIAL_SIZE, WORLD_WIDTH - INITIAL_SIZE)
        self.y = random.randint(INITIAL_SIZE, WORLD_HEIGHT - INITIAL_SIZE)
        self.size = INITIAL_SIZE
        # Use pastel colors instead of random colors
        self.color = random.choice(PASTEL_COLORS)
        self.direction_dx = 0
        self.direction_dy = 0
        
    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'x': self.x,
            'y': self.y,
            'size': self.size,
            'color': self.color,
        }
    
    def get_max_speed(self):
        """Calculates max speed based on size. Larger players are slower."""
        size_for_min_speed = 400  # The size at which a player reaches MIN_SPEED
        if self.size >= size_for_min_speed:
            return MIN_SPEED
        
        if self.size <= INITIAL_SIZE:
            return BASE_MAX_SPEED

        # Linearly interpolate speed between BASE_MAX_SPEED and MIN_SPEED
        speed_range = BASE_MAX_SPEED - MIN_SPEED
        size_range = size_for_min_speed - INITIAL_SIZE
        
        # Calculate how far into the size range the player is
        size_progress = (self.size - INITIAL_SIZE) / size_range
        
        speed = BASE_MAX_SPEED - (size_progress * speed_range)
        return speed

def check_collision(player1, player2):
    """Check if two players are colliding"""
    dx = player1.x - player2.x
    dy = player1.y - player2.y
    distance = math.sqrt(dx**2 + dy**2)
    return distance < (player1.size + player2.size) / 2

async def handle_collision(player1, player2):
    """Handle collision between two players - AI determines winner based on name power"""
    # Use AI to determine winner based on name power, with caching
    winner_name, loser_name = await determine_winner_with_cache(player1.name, player2.name)
    
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
        loser.color = random.choice(PASTEL_COLORS)
        
        # Send death notification to the loser so they can change their name
        await sio.emit('player_died', {
            'player_id': loser.id,
            'current_name': loser.name
        }, room=loser.id)
    
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
        return
        
    player = players[sid]
    # Client now sends a direction vector {dx, dy}
    player.direction_dx = data.get('dx', 0)
    player.direction_dy = data.get('dy', 0)

@sio.event
async def change_name(sid, data):
    """Handle player name change request"""
    if sid not in players:
        return
        
    player = players[sid]
    new_name = data.get('name', '').strip()
    
    if not new_name:
        return
    
    old_name = player.name
    player.name = new_name
    
    # Notify all clients about the name change
    await sio.emit('player_name_changed', {
        'player_id': sid,
        'old_name': old_name,
        'new_name': new_name
    })
    
    print(f'Player {old_name} changed name to {new_name}')

@sio.event
async def connect_error(sid, data):
    print(f'Connection error for {sid}: {data}')

@sio.event
async def error(sid, data):
    print(f'Error for {sid}: {data}')

async def game_loop():
    """Main game loop - now using a delta time model for frame-rate independence."""
    last_time = time.time()
    
    while True:
        # --- Delta Time Calculation ---
        current_time = time.time()
        delta_time = current_time - last_time
        last_time = current_time
        # Clamp delta_time to prevent huge jumps if server has a major lag spike
        delta_time = min(delta_time, 0.1)

        # --- Player Movement ---
        if len(players) >= 1:
            for player in players.values():
                max_speed = player.get_max_speed() # speed in pixels per second
                
                direction_magnitude = math.sqrt(player.direction_dx**2 + player.direction_dy**2)

                if direction_magnitude > 1: # If the cursor is not on the player
                    # Calculate displacement based on speed and the exact time elapsed
                    displacement = max_speed * delta_time
                    
                    player.x += (player.direction_dx / direction_magnitude) * displacement
                    player.y += (player.direction_dy / direction_magnitude) * displacement
                
                # Keep within bounds (using size/2 for radius)
                player.x = max(player.size / 2, min(WORLD_WIDTH - player.size / 2, player.x))
                player.y = max(player.size / 2, min(WORLD_HEIGHT - player.size / 2, player.y))

            # --- Collision Detection ---
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
            
            # Send updated game state to all clients
            await sio.emit('update_players', [p.to_dict() for p in players.values()])
        
        # Yield control to the event loop. The exact sleep duration is no longer critical for physics.
        await asyncio.sleep(1/60)

# --- Aiohttp application setup for clean-up ---

async def start_background_tasks(app):
    """Starts the game loop as a background task."""
    app['game_loop'] = asyncio.create_task(game_loop())

async def cleanup_background_tasks(app):
    """Cancels the game loop task on shutdown."""
    app['game_loop'].cancel()
    try:
        await app['game_loop']
    except asyncio.CancelledError:
        pass

app.on_startup.append(start_background_tasks)
app.on_cleanup.append(cleanup_background_tasks)

if __name__ == '__main__':
    aiohttp.web.run_app(app, host='localhost', port=5000)