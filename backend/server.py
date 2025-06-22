import socketio
import aiohttp.web
import uuid
import asyncio
import random
import math
import time
import os

# Try to import AI module, but don't fail if it's not available
try:
    from ai import determine_winner_with_cache, check_name_appropriateness
    AI_AVAILABLE = True
except ImportError as e:
    print(f"Warning: AI module not available: {e}")
    AI_AVAILABLE = False
    
    # Fallback functions
    async def determine_winner_with_cache(player1_name, player2_name):
        winner_name = random.choice([player1_name, player2_name])
        loser_name = player2_name if winner_name == player1_name else player1_name
        return winner_name, loser_name
    
    async def check_name_appropriateness(player_name):
        # Fallback: assume appropriate if AI module not available
        print(f"Warning: No AI module available for name check, allowing '{player_name}'")
        return True

# Create a Socket.IO server
sio = socketio.AsyncServer(
    cors_allowed_origins="*",  # Changed from ["*"] to "*" - string format works better
    cors_credentials=False,
    logger=False,  # Disable logging to reduce CORS error spam
    engineio_logger=False,
    async_mode='aiohttp',
    ping_timeout=60,
    ping_interval=25,
    max_http_buffer_size=1e6
)
app = aiohttp.web.Application()
sio.attach(app)

# Add CORS middleware
@aiohttp.web.middleware
async def cors_middleware(request, handler):
    if request.method == 'OPTIONS':
        response = aiohttp.web.Response()
    else:
        response = await handler(request)
    
    response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization'
    return response

app.middlewares.append(cors_middleware)

# Add static file serving
async def health_check(request):
    """Health check endpoint for OnRender"""
    return aiohttp.web.Response(text='OK', content_type='text/plain')

async def test_endpoint(request):
    """Test endpoint to verify server is working"""
    status = {
        'status': 'running',
        'ai_available': AI_AVAILABLE,
        'players_count': len(players),
        'minions_count': len(minions),
        'timestamp': time.time()
    }
    return aiohttp.web.json_response(status)

async def index_handler(request):
    """Serve the main HTML file"""
    try:
        # Use different paths based on environment
        frontend_path = 'frontend/index.html' if os.path.exists('frontend/index.html') else '../frontend/index.html'
        with open(frontend_path, 'r', encoding='utf-8') as f:
            content = f.read()
        return aiohttp.web.Response(text=content, content_type='text/html')
    except FileNotFoundError:
        return aiohttp.web.Response(text='Frontend not found', status=404)

async def static_handler(request):
    """Serve static files (CSS, JS, images)"""
    try:
        file_path = request.match_info['path']
        # Use different paths based on environment
        full_path = f'frontend/{file_path}' if os.path.exists('frontend') else f'../frontend/{file_path}'
        
        if not os.path.exists(full_path):
            return aiohttp.web.Response(text='File not found', status=404)
        
        # Determine content type based on file extension
        if file_path.endswith('.css'):
            content_type = 'text/css'
            mode = 'r'
            encoding = 'utf-8'
        elif file_path.endswith('.js'):
            content_type = 'application/javascript'
            mode = 'r'
            encoding = 'utf-8'
        elif file_path.endswith('.png'):
            content_type = 'image/png'
            mode = 'rb'
            encoding = None
        elif file_path.endswith('.jpg') or file_path.endswith('.jpeg'):
            content_type = 'image/jpeg'
            mode = 'rb'
            encoding = None
        elif file_path.endswith('.gif'):
            content_type = 'image/gif'
            mode = 'rb'
            encoding = None
        elif file_path.endswith('.ico'):
            content_type = 'image/x-icon'
            mode = 'rb'
            encoding = None
        else:
            content_type = 'text/plain'
            mode = 'r'
            encoding = 'utf-8'
        
        # Read file with appropriate mode
        with open(full_path, mode, encoding=encoding) as f:
            content = f.read()
        
        return aiohttp.web.Response(body=content, content_type=content_type)
    except Exception as e:
        return aiohttp.web.Response(text=f'Error: {str(e)}', status=500)

# Add routes
app.router.add_get('/health', health_check)
app.router.add_get('/test', test_endpoint)
app.router.add_get('/', index_handler)
app.router.add_get('/{path:.*}', static_handler)

# Game state
players = {}
minions = {}  # All minions in the game, indexed by unique ID
WORLD_WIDTH = 4000  # Increased from 2000 to accommodate 50 players
WORLD_HEIGHT = 3000  # Increased from 1500 to accommodate 50 players
MINION_SIZE = 45
FLEET_SIZE = 5  # Spawn with 5 minions
MAX_FLEET_SIZE = 50  # Maximum 50 minions per player
INITIAL_SIZE = 50  # Initial size for respawned players
# --- Constants for a professional, time-based physics model ---
# Speeds are now in pixels per SECOND, not pixels per tick.
BASE_MAX_SPEED = 1200.0   # Base speed for minions (reduced from 2400.0 - was too fast)
MIN_SPEED = 750.0         # Minimum speed (reduced from 1500.0 - was too fast)

# Original Matplotlib Pastel1 color palette for beautiful blob colors
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

class Minion:
    def __init__(self, minion_id, original_name, owner_id, x, y, color):
        self.id = minion_id
        self.original_name = original_name  # The minion's original name (never changes)
        self.owner_id = owner_id  # Which player currently owns this minion
        self.x = x
        self.y = y
        self.size = MINION_SIZE
        self.color = color
        self.direction_dx = 0
        self.direction_dy = 0
        self.last_infection_time = 0  # Timestamp of last infection for invulnerability
        self.can_infect_after = 0  # Time after which this minion can infect others (prevents chain reactions)
        
        # Respawn and invulnerability state
        self.is_dead = False
        self.invulnerable_until = 0
        self.respawn_time = 0
        
    def to_dict(self):
        current_time = time.time()
        is_invulnerable = current_time - self.last_infection_time < 2.0
        
        return {
            'id': self.id,
            'original_name': self.original_name,
            'owner_id': self.owner_id,
            'x': self.x,
            'y': self.y,
            'size': self.size,
            'color': self.color,
            'is_invulnerable': is_invulnerable,
            'can_infect': current_time >= self.can_infect_after,
        }

class Player:
    def __init__(self, player_id, name):
        self.id = player_id
        self.name = name
        self.color = random.choice(PASTEL_COLORS)
        self.direction_dx = 0
        self.direction_dy = 0
        
        # Create fleet of minions
        self.create_fleet()
        
    def create_fleet(self):
        """Create 5 minions for this player in a cluster formation"""
        # Find a good spawn location
        center_x = random.randint(100, WORLD_WIDTH - 100)
        center_y = random.randint(100, WORLD_HEIGHT - 100)
        
        for i in range(FLEET_SIZE):
            # Arrange minions in a circular formation
            angle = (i / FLEET_SIZE) * 2 * math.pi
            offset_x = math.cos(angle) * 50  # 50 pixel radius
            offset_y = math.sin(angle) * 50
            
            minion_id = f"{self.id}_minion_{i}_{int(time.time() * 1000000)}"
            minion = Minion(
                minion_id=minion_id,
                original_name=self.name,
                owner_id=self.id,
                x=center_x + offset_x,
                y=center_y + offset_y,
                color=self.color
            )
            # New minions can infect immediately (only newly infected ones have delay)
            minion.can_infect_after = 0
            minions[minion_id] = minion
    
    def get_owned_minions(self):
        """Get all minions currently owned by this player"""
        return [m for m in minions.values() if m.owner_id == self.id]
    
    def get_fleet_center(self):
        """Calculate the center point of all owned minions"""
        owned_minions = self.get_owned_minions()
        if not owned_minions:
            return 0, 0
            
        avg_x = sum(m.x for m in owned_minions) / len(owned_minions)
        avg_y = sum(m.y for m in owned_minions) / len(owned_minions)
        return avg_x, avg_y
    
    def to_dict(self):
        owned_minions = self.get_owned_minions()
        center_x, center_y = self.get_fleet_center()
        
        return {
            'id': self.id,
            'name': self.name,
            'color': self.color,
            'minion_count': len(owned_minions),
            'fleet_center_x': center_x,
            'fleet_center_y': center_y,
            'minions': [m.to_dict() for m in owned_minions],
        }

def check_minion_collision(minion1, minion2):
    """Check if two minions are colliding"""
    dx = minion1.x - minion2.x
    dy = minion1.y - minion2.y
    distance = math.sqrt(dx**2 + dy**2)
    return distance < (minion1.size + minion2.size) / 2

async def handle_minion_collision(minion1, minion2):
    """Handle collision between two minions - winner infects loser"""
    # Don't handle collision if minions have same owner
    if minion1.owner_id == minion2.owner_id:
        return

    # Check if either minion is invulnerable
    current_time = time.time()
    if (current_time - minion1.last_infection_time < 2.0 or 
        current_time - minion2.last_infection_time < 2.0):
        return
    
    # Check if either minion cannot infect yet (prevents chain reactions)
    if (current_time < minion1.can_infect_after or 
        current_time < minion2.can_infect_after):
        return

    # Use AI to determine winner based on original names
    winner_name, original_loser_name = await determine_winner_with_cache(minion1.original_name, minion2.original_name)
    
    # Find the actual minion objects
    winner = minion1 if winner_name == minion1.original_name else minion2
    loser = minion2 if winner == minion1 else minion1

    # Check if winner's fleet is already at maximum size
    winner_owner = players.get(winner.owner_id)
    winner_at_max = False
    if winner_owner:
        winner_fleet_size = len(winner_owner.get_owned_minions())
        winner_at_max = winner_fleet_size >= MAX_FLEET_SIZE

    print(f"AI determined '{winner.original_name}' wins over '{original_loser_name}' - infecting!")
    
    # Preserve the loser's data before it's changed
    loser_dict = loser.to_dict()
    loser_dict['original_name'] = original_loser_name

    # Store the old owner ID for elimination check
    old_owner_id = loser.owner_id

    if winner_at_max:
        # Winner is at max fleet size - loser dies but winner doesn't gain the minion
        print(f"Winner '{winner.original_name}' is at max fleet size - loser dies without takeover")
        
        # Remove the losing minion completely
        del minions[loser.id]
        
        # Emit a special event for max fleet size kill
        await sio.emit('infection_happened', {
            'winner': winner.to_dict(),
            'loser': loser_dict,
            'max_fleet_kill': True
        })
    else:
        # Normal infection - winner gains the minion
        # Winner infects loser - loser changes owner, color, and takes on winner's name
        loser.owner_id = winner.owner_id
        loser.color = winner.color
        loser.original_name = winner.original_name  # Infected minion takes on winner's name
        loser.last_infection_time = current_time  # Set invulnerability period
        loser.can_infect_after = current_time + 1.5  # Prevent newly infected minion from infecting for 1.5 seconds
        
        # Emit infection event with correct original names
        await sio.emit('infection_happened', {
            'winner': winner.to_dict(),
            'loser': loser_dict,
            'max_fleet_kill': False
        })

    # Check if any player has lost all their minions (regardless of takeover or kill)
    old_owner = players.get(old_owner_id)
    if old_owner and len(old_owner.get_owned_minions()) == 0:
        # Player has lost all minions - they're eliminated
        winner_owner = players.get(winner.owner_id)
        eliminator_name = winner_owner.name if winner_owner else "Unknown"
        
        print(f'Player {old_owner.name} is being eliminated by {eliminator_name} - comprehensive cleanup')
        
        # Comprehensive cleanup: Remove ALL minions associated with this eliminated player
        # 1. Remove minions still owned by this player
        minions_to_remove = [m_id for m_id, m in minions.items() if m.owner_id == old_owner_id]
        for m_id in minions_to_remove:
            del minions[m_id]
            print(f'Removed owned minion: {m_id}')
        
        # 2. Remove minions with the eliminated player's name as original_name (infected minions)
        minions_to_remove_by_name = [m_id for m_id, m in minions.items() if m.original_name == old_owner.name]
        for m_id in minions_to_remove_by_name:
            del minions[m_id]
            print(f'Removed infected minion with original name: {m_id}')
        
        # Send updated game state to ALL players to ensure ghost minions are removed
        game_state_data = {
            'players': [p.to_dict() for p in players.values()],
            'world': {'width': WORLD_WIDTH, 'height': WORLD_HEIGHT},
            'all_minions': [m.to_dict() for m in minions.values()],
        }
        
        # Emit elimination event first with eliminator info
        await sio.emit('player_eliminated', {
            'player_id': old_owner_id,
            'player_name': old_owner.name,
            'eliminated_by': eliminator_name
        })
        
        # Then send updated game state to all players
        await sio.emit('update_game_state', {
            'players': game_state_data['players'],
            'all_minions': game_state_data['all_minions']
        })
        
        print(f'Player {old_owner.name} has been eliminated by {eliminator_name}! Removed all associated minions.')

@sio.event
async def connect(sid, environ):
    print(f'Client {sid} connected')
    print(f'Connection details: {environ.get("HTTP_USER_AGENT", "Unknown")}')
    print(f'Remote address: {environ.get("REMOTE_ADDR", "Unknown")}')
    print(f'HTTP headers: {dict(environ)}')

@sio.event
async def disconnect(sid):
    print(f'Client {sid} disconnected')
    if sid in players:
        player_name = players[sid].name
        print(f'Player {player_name} disconnected - comprehensive cleanup')
        
        # Comprehensive cleanup: Remove ALL minions associated with this player
        # 1. Remove minions owned by this player
        minions_to_remove = [m_id for m_id, m in minions.items() if m.owner_id == sid]
        for m_id in minions_to_remove:
            del minions[m_id]
            print(f'Removed owned minion: {m_id}')
        
        # 2. Remove minions with the disconnected player's name as original_name (infected minions)
        minions_to_remove_by_name = [m_id for m_id, m in minions.items() if m.original_name == player_name]
        for m_id in minions_to_remove_by_name:
            del minions[m_id]
            print(f'Removed infected minion with original name: {m_id}')
        
        del players[sid]
        
        # Send updated game state to all remaining players
        game_state_data = {
            'players': [p.to_dict() for p in players.values()],
            'world': {'width': WORLD_WIDTH, 'height': WORLD_HEIGHT},
            'all_minions': [m.to_dict() for m in minions.values()],
        }
        
        await sio.emit('player_left', {'player_id': sid})
        await sio.emit('update_game_state', {
            'players': game_state_data['players'],
            'all_minions': game_state_data['all_minions']
        })
        
        print(f'Player {player_name} removed from game - all associated minions cleaned up')
    else:
        print(f'Client {sid} disconnected without joining game')

@sio.event
async def join_game(sid, data):
    player_name = data.get('name', '').strip()
    
    if not player_name:
        await sio.emit('join_failed', {'message': 'Please enter a name.'}, room=sid)
        return

    # Check if name is appropriate
    is_appropriate = await check_name_appropriateness(player_name)
    if not is_appropriate:
        await sio.emit('join_failed', {'message': 'Please be civil and PG in your naming. Spread love, not hate. The world is a nasty place. As creators, our goal is to make it a better one. Got it? Good luck and have fun!'}, room=sid)
        return

    # Check if name is already in use
    existing_names = {p.name for p in players.values()}
    if player_name in existing_names:
        await sio.emit('join_failed', {'message': f'The name "{player_name}" is already taken.'}, room=sid)
        return
    
    player = Player(sid, player_name)
    players[sid] = player
    
    # Send current game state to new player
    game_state_data = {
        'players': [p.to_dict() for p in players.values()],
        'world': {'width': WORLD_WIDTH, 'height': WORLD_HEIGHT},
        'all_minions': [m.to_dict() for m in minions.values()],
    }
    await sio.emit('game_state', game_state_data, room=sid)
    
    # Send updated game state to ALL other players so they can see the new player and their minions
    await sio.emit('update_game_state', {
        'players': game_state_data['players'],
        'all_minions': game_state_data['all_minions']
    }, skip_sid=sid)
    
    # Also send the join message for chat
    await sio.emit('player_joined', player.to_dict(), skip_sid=sid)
    
    print(f'Player {player_name} joined the game with {FLEET_SIZE} minions')

@sio.event
async def move_player(sid, data):
    if sid not in players:
        return
        
    player = players[sid]
    # Client sends a direction vector {dx, dy}
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

    # Check if this is from adjective collection (bypass content moderation for system-generated names)
    is_adjective_collection = data.get('from_adjective_collection', False)
    
    if not is_adjective_collection:
        # Check if name is appropriate (only for user-entered names)
        is_appropriate = await check_name_appropriateness(new_name)
        if not is_appropriate:
            await sio.emit('name_change_failed', {'message': 'Please be civil and PG in your naming. Spread love, not hate. The world is a nasty place. As creators, our goal is to make it a better one. Got it? Good luck and have fun!'}, room=sid)
            return

    # Check if the name is already taken by another player
    existing_names = {p.name for p in players.values() if p.id != sid}
    if new_name in existing_names:
        await sio.emit('name_change_failed', {'message': f'The name "{new_name}" is already taken.'}, room=sid)
        return
    
    old_name = player.name
    player.name = new_name
    
    # Check if player is eliminated (has no minions) - if so, respawn them
    owned_minions = player.get_owned_minions()
    same_name = new_name == old_name
    if len(owned_minions) == 0:
        print(f'Respawning eliminated player {old_name} as {new_name}')
        
        # Comprehensive cleanup: Remove ALL minions associated with this player
        # 1. Remove minions owned by this player
        minions_to_remove = [m_id for m_id, m in minions.items() if m.owner_id == sid]
        for m_id in minions_to_remove:
            del minions[m_id]
        
        # 2. Remove minions with the player's old name as original_name
        minions_to_remove_by_name = [m_id for m_id, m in minions.items() if m.original_name == old_name]
        for m_id in minions_to_remove_by_name:
            del minions[m_id]
        
        # 3. Remove any orphaned minions that were infected by this player
        minions_to_remove_orphaned = [m_id for m_id, m in minions.items() 
                                     if m.original_name == old_name and m.owner_id != sid]
        for m_id in minions_to_remove_orphaned:
            del minions[m_id]
        
        # Create new fleet for respawned player
        player.color = random.choice(PASTEL_COLORS)  # Get new color
        player.create_fleet()
        
        # Emit respawn event to trigger frontend cleanup
        await sio.emit('player_respawned', {
            'player_id': sid,
            'player_name': new_name
        })
        
        # Send updated game state to ALL players to ensure synchronization
        game_state_data = {
            'players': [p.to_dict() for p in players.values()],
            'world': {'width': WORLD_WIDTH, 'height': WORLD_HEIGHT},
            'all_minions': [m.to_dict() for m in minions.values()],
        }
        
        # Send to the respawned player first
        await sio.emit('game_state', game_state_data, room=sid)
        
        # Send to all other players as well to keep everyone in sync
        await sio.emit('update_game_state', {
            'players': game_state_data['players'],
            'all_minions': game_state_data['all_minions']
        }, skip_sid=sid)
        
        print(f'Player {new_name} respawned with {FLEET_SIZE} new minions')
    elif not same_name:
        # Update all minions that were originally owned by this player
        for minion in minions.values():
            if minion.original_name == old_name:
                minion.original_name = new_name
        
        # Send updated game state to ALL players to ensure synchronization
        game_state_data = {
            'players': [p.to_dict() for p in players.values()],
            'world': {'width': WORLD_WIDTH, 'height': WORLD_HEIGHT},
            'all_minions': [m.to_dict() for m in minions.values()],
        }
        
        # Send to all players to keep everyone in sync
        await sio.emit('update_game_state', {
            'players': game_state_data['players'],
            'all_minions': game_state_data['all_minions']
        })
        
        # Also send the name change notification for chat
        await sio.emit('player_name_changed', {
            'player_id': sid,
            'old_name': old_name,
            'new_name': new_name
        })
        
        print(f'Player {old_name} changed name to {new_name}')

def is_within_rounded_bounds(x, y, size):
    """Check if a position is within the rounded world bounds"""
    # For now, just check rectangular bounds since we don't have rounded corners implemented
    return size/2 <= x <= WORLD_WIDTH - size/2 and size/2 <= y <= WORLD_HEIGHT - size/2

def clamp_to_rounded_bounds(x, y, size):
    """Clamp a position to be within the rounded world bounds"""
    # For now, just clamp to rectangular bounds
    clamped_x = max(size/2, min(WORLD_WIDTH - size/2, x))
    clamped_y = max(size/2, min(WORLD_HEIGHT - size/2, y))
    return clamped_x, clamped_y

@sio.event
async def respawn_player(sid, data):
    """Handle player respawn request"""
    if sid not in players:
        return
        
    player = players[sid]
    current_time = time.time()
    
    # Comprehensive cleanup: Remove ALL minions associated with this player
    # 1. Remove minions owned by this player
    minions_to_remove = [m_id for m_id, m in minions.items() if m.owner_id == sid]
    for m_id in minions_to_remove:
        del minions[m_id]
    
    # 2. Remove minions with the player's name as original_name
    minions_to_remove_by_name = [m_id for m_id, m in minions.items() if m.original_name == player.name]
    for m_id in minions_to_remove_by_name:
        del minions[m_id]
    
    # 3. Remove any orphaned minions that were infected by this player
    minions_to_remove_orphaned = [m_id for m_id, m in minions.items() 
                                 if m.original_name == player.name and m.owner_id != sid]
    for m_id in minions_to_remove_orphaned:
        del minions[m_id]
    
    # Respawn the player
    player.is_dead = False
    player.color = random.choice(PASTEL_COLORS)
    
    # Create new fleet for respawned player
    player.create_fleet()
    
    # Give 3 seconds of invulnerability
    player.invulnerable_until = current_time + 3.0
    
    # Emit respawn event to trigger frontend cleanup
    await sio.emit('player_respawned', {
        'player_id': sid,
        'player_name': player.name
    })
    
    # Send updated game state to ALL players to ensure synchronization
    game_state_data = {
        'players': [p.to_dict() for p in players.values()],
        'world': {'width': WORLD_WIDTH, 'height': WORLD_HEIGHT},
        'all_minions': [m.to_dict() for m in minions.values()],
    }
    
    # Send to the respawned player first
    await sio.emit('game_state', game_state_data, room=sid)
    
    # Send to all other players as well to keep everyone in sync
    await sio.emit('update_game_state', {
        'players': game_state_data['players'],
        'all_minions': game_state_data['all_minions']
    }, skip_sid=sid)
    
    print(f'Player {player.name} respawned with {FLEET_SIZE} new minions')

@sio.event
async def connect_error(sid, data):
    print(f'Connection error for {sid}: {data}')

@sio.event
async def error(sid, data):
    print(f'Error for {sid}: {data}')

async def game_loop():
    """Main game loop - fleet-based movement and minion collision detection"""
    last_time = time.time()
    
    while True:
        # --- Delta Time Calculation ---
        current_time = time.time()
        delta_time = current_time - last_time
        last_time = current_time
        # Clamp delta_time to prevent huge jumps if server has a major lag spike
        delta_time = min(delta_time, 0.1)

        # --- Minion Movement ---
        if len(players) >= 1:
            for player in players.values():
                owned_minions = player.get_owned_minions()
                
                if not owned_minions:
                    continue  # Player has no minions left
                
                # Calculate fleet center for cohesion force
                fleet_center_x, fleet_center_y = player.get_fleet_center()
                
                # Calculate movement for all owned minions
                direction_magnitude = math.sqrt(player.direction_dx**2 + player.direction_dy**2)
                
                if direction_magnitude > 1:  # If the cursor is not on the player
                    # Calculate fleet size speed multiplier
                    # Highest speed: 1.0x (baseline)
                    # Worst case: 0.95x (95% of highest speed) - much less severe debuff
                    minion_count = len(owned_minions)
                    if minion_count <= 3:
                        # Small fleets are very agile (1.0x speed)
                        speed_multiplier = 1.0
                    elif minion_count <= 8:
                        # Medium fleets have very slight speed reduction
                        speed_multiplier = 1.0 - (minion_count - 3) * 0.005  # 1.0x -> 0.975x
                    else:
                        # Large fleets are only slightly slower, capped at 0.95x minimum
                        speed_multiplier = max(0.95, 0.975 - (minion_count - 8) * 0.002)
                    
                    # Calculate displacement based on speed, time, and fleet size
                    displacement = BASE_MAX_SPEED * delta_time * speed_multiplier
                    
                    # Debug output (can be removed later)
                    if minion_count != getattr(player, '_last_logged_count', -1):
                        print(f'Player {player.name}: {minion_count} minions, speed multiplier: {speed_multiplier:.2f}x')
                        player._last_logged_count = minion_count
                    
                    # Move each minion towards the target with some spread
                    for i, minion in enumerate(owned_minions):
                        # Add some variation to prevent all minions from stacking
                        spread_angle = (i / len(owned_minions)) * 2 * math.pi
                        spread_radius = 20
                        spread_x = math.cos(spread_angle) * spread_radius
                        spread_y = math.sin(spread_angle) * spread_radius
                        
                        # Calculate direction with spread
                        target_dx = player.direction_dx + spread_x
                        target_dy = player.direction_dy + spread_y
                        target_magnitude = math.sqrt(target_dx**2 + target_dy**2)
                        
                        # Add cohesion force toward fleet center (natural blob gravity)
                        cohesion_dx = fleet_center_x - minion.x
                        cohesion_dy = fleet_center_y - minion.y
                        cohesion_distance = math.sqrt(cohesion_dx**2 + cohesion_dy**2)
                        
                        # Apply cohesion force - natural blob attraction
                        if cohesion_distance > 0:
                            # Stronger attraction for closer blobs (like surface tension)
                            if cohesion_distance < 80:
                                # Close to center - strong natural attraction
                                cohesion_strength = min(cohesion_distance / 120, 0.6)  # Strong but not excessive
                            else:
                                # Farther away - moderate attraction to stay together
                                cohesion_strength = min(cohesion_distance / 100, 0.7)  # Moderate pull
                            
                            cohesion_dx = (cohesion_dx / cohesion_distance) * cohesion_strength * displacement
                            cohesion_dy = (cohesion_dy / cohesion_distance) * cohesion_strength * displacement
                        else:
                            cohesion_dx = cohesion_dy = 0
                        
                        # Add separation force from other minions in the same fleet - FLUID BLOB behavior
                        separation_dx = 0
                        separation_dy = 0
                        
                        # Smaller separation radius for more natural clustering (like fluid blobs)
                        separation_radius = minion.size * 1.3  # Much closer together for blob-like feel
                        
                        for other_minion in owned_minions:
                            if other_minion.id != minion.id:
                                dx = minion.x - other_minion.x
                                dy = minion.y - other_minion.y
                                distance = math.sqrt(dx**2 + dy**2)
                                
                                # Only separate when actually overlapping (like squishy blobs)
                                if distance < separation_radius and distance > 0:
                                    # Gentle, elastic separation (like bouncing fluid blobs)
                                    separation_strength = (separation_radius - distance) / separation_radius
                                    
                                    # Soft bounce effect - stronger when very close but not harsh
                                    if distance < minion.size * 0.8:
                                        # Very close - gentle elastic bounce
                                        separation_strength = separation_strength * 0.4  # Gentle bounce
                                    else:
                                        # Slight overlap - very gentle nudge
                                        separation_strength = separation_strength * 0.2  # Very gentle
                                    
                                    separation_dx += (dx / distance) * separation_strength * displacement
                                    separation_dy += (dy / distance) * separation_strength * displacement
                        
                        if target_magnitude > 0:
                            # Natural fluid blob behavior - prioritize cohesion with gentle separation
                            target_factor = 0.7    # Direct movement is primary
                            cohesion_factor = 0.4   # Strong natural attraction (like surface tension)
                            separation_factor = 0.15 # Gentle bounce when overlapping
                            
                            # Large fleets still want to cluster but with gentle spacing
                            if minion_count > 20:
                                cohesion_factor = 0.45  # Even stronger attraction for large groups
                                separation_factor = 0.2  # Slightly more gentle bouncing
                            
                            move_x = (target_dx / target_magnitude) * displacement * target_factor + cohesion_dx * cohesion_factor + separation_dx * separation_factor
                            move_y = (target_dy / target_magnitude) * displacement * target_factor + cohesion_dy * cohesion_factor + separation_dy * separation_factor
                            
                            minion.x += move_x
                            minion.y += move_y
                        else:
                            # When not moving, maintain natural blob clustering with gentle spacing
                            cohesion_idle_factor = 0.5   # Natural attraction when idle
                            separation_idle_factor = 0.3  # Gentle bouncing to prevent hard overlap
                            
                            minion.x += cohesion_dx * cohesion_idle_factor + separation_dx * separation_idle_factor
                            minion.y += cohesion_dy * cohesion_idle_factor + separation_dy * separation_idle_factor
                        
                        # Keep within bounds with soft bouncing to fix edge glitches
                        margin = minion.size / 2
                        
                        # Soft boundary constraints to prevent edge glitches
                        if minion.x < margin:
                            minion.x = margin + (margin - minion.x) * 0.1  # Soft bounce from left edge
                        elif minion.x > WORLD_WIDTH - margin:
                            minion.x = WORLD_WIDTH - margin - (minion.x - (WORLD_WIDTH - margin)) * 0.1  # Soft bounce from right edge
                            
                        if minion.y < margin:
                            minion.y = margin + (margin - minion.y) * 0.1  # Soft bounce from top edge
                        elif minion.y > WORLD_HEIGHT - margin:
                            minion.y = WORLD_HEIGHT - margin - (minion.y - (WORLD_HEIGHT - margin)) * 0.1  # Soft bounce from bottom edge

            # --- Minion Collision Detection ---
            minion_list = list(minions.values())
            for i in range(len(minion_list)):
                for j in range(i + 1, len(minion_list)):
                    try:
                        minion1 = minion_list[i]
                        minion2 = minion_list[j]
                        
                        # Skip if either minion no longer exists or same owner
                        if (minion1.id not in minions or minion2.id not in minions or 
                            minion1.owner_id == minion2.owner_id):
                            continue
                        
                        # Check collision cooldown
                        collision_key = f"{minion1.id}-{minion2.id}"
                        current_time = time.time()
                        
                        if collision_key in collision_cooldowns:
                            if current_time - collision_cooldowns[collision_key] < 1.0:  # 1 second cooldown
                                continue
                        
                        if check_minion_collision(minion1, minion2):
                            # Check invulnerability periods (2 second invulnerability after infection)
                            minion1_vulnerable = current_time - minion1.last_infection_time > 2.0
                            minion2_vulnerable = current_time - minion2.last_infection_time > 2.0
                            
                            # Only allow infection if both minions are vulnerable
                            if minion1_vulnerable and minion2_vulnerable:
                                # Set cooldown
                                collision_cooldowns[collision_key] = current_time
                                
                                await handle_minion_collision(minion1, minion2)
                    except Exception as e:
                        print(f"Error in minion collision detection: {e}")
                        continue
            
            # Send updated game state to all clients
            await sio.emit('update_game_state', {
                'players': [p.to_dict() for p in players.values()],
                'all_minions': [m.to_dict() for m in minions.values()],
            })
        
        # Yield control to the event loop
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
    import os
    port = int(os.environ.get('PORT', 5000))
    print(f"Starting InfiniMunch server on port {port}")
    print(f"AI module available: {AI_AVAILABLE}")
    print(f"Server will be accessible at: http://0.0.0.0:{port}")
    aiohttp.web.run_app(app, host='0.0.0.0', port=port)
