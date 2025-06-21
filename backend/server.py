import socketio
import aiohttp.web
import uuid
import asyncio
import random
import math
import time

# Create a Socket.IO server
sio = socketio.AsyncServer(cors_allowed_origins="*")
app = aiohttp.web.Application()
sio.attach(app)

# Game state
players = {}
WORLD_WIDTH = 800
WORLD_HEIGHT = 600
INITIAL_SIZE = 20
MOVE_SPEED = 2

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
            
            # Keep within bounds
            self.x = max(self.size, min(WORLD_WIDTH - self.size, self.x))
            self.y = max(self.size, min(WORLD_HEIGHT - self.size, self.y))

def check_collision(player1, player2):
    """Check if two players are colliding"""
    dx = player1.x - player2.x
    dy = player1.y - player2.y
    distance = math.sqrt(dx**2 + dy**2)
    return distance < (player1.size + player2.size) / 2

def handle_collision(player1, player2):
    """Handle collision between two players - random winner"""
    winner = random.choice([player1, player2])
    loser = player2 if winner == player1 else player1
    
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

@sio.event
async def disconnect(sid):
    print(f'Client {sid} disconnected')
    if sid in players:
        del players[sid]
        await sio.emit('player_left', {'player_id': sid})

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
    player.target_x = max(player.size, min(WORLD_WIDTH - player.size, data['x']))
    player.target_y = max(player.size, min(WORLD_HEIGHT - player.size, data['y']))
    print(f"Player {sid} moving to ({player.target_x}, {player.target_y})")

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
                    player1 = player_list[i]
                    player2 = player_list[j]
                    
                    if check_collision(player1, player2):
                        winner, loser = handle_collision(player1, player2)
                        await sio.emit('collision', {
                            'winner': winner.to_dict(),
                            'loser': loser.to_dict(),
                        })
            
            # Send updated game state
            await sio.emit('update_players', [p.to_dict() for p in players.values()])
        
        await asyncio.sleep(1/60)  # 60 FPS

if __name__ == '__main__':
    # Run the server
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    
    # Start the game loop
    loop.create_task(game_loop())
    
    aiohttp.web.run_app(app, host='localhost', port=5000, loop=loop) 