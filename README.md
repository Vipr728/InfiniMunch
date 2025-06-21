# Multiplayer Agario Game

A simple online multiplayer agario-style game built with Python SocketIO backend and HTML/JavaScript frontend.

## Features

- Real-time multiplayer gameplay
- Mouse-controlled blob movement
- Random collision outcomes
- Responsive web interface
- Visual collision effects

## Setup and Running

### Backend (Python SocketIO Server)

1. Navigate to the backend directory:
   ```bash
   cd backend
   ```

2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

3. Run the server:
   ```bash
   python server.py
   ```

The server will start on `http://localhost:5000`

### Frontend

1. Navigate to the frontend directory:
   ```bash
   cd frontend
   ```

2. Open `index.html` in your web browser, or serve it with a simple HTTP server:
   ```bash
   # Using Python
   python -m http.server 8080
   
   # Using Node.js
   npx http-server
   ```

3. Open your browser and go to:
   - Direct file: Open `frontend/index.html` 
   - HTTP server: `http://localhost:8080`

## How to Play

1. Enter your name in the input field
2. Click "Join Game" to connect to the server
3. Move your mouse to control your blob
4. When two blobs collide, one randomly wins and grows larger
5. If your blob gets too small, you'll respawn with the initial size

## Game Mechanics

- **Movement**: Mouse-controlled, blob moves towards cursor
- **Collisions**: When two blobs touch, one randomly wins
- **Growth**: Winner gains 30% of loser's size
- **Respawn**: Blobs respawn when they become too small (size < 10)
- **World Bounds**: Blobs are constrained to the game area

## Architecture

- **Backend**: Python with socketio and aiohttp
- **Frontend**: HTML5 Canvas with Socket.IO client
- **Communication**: Real-time WebSocket connections
- **Game Loop**: 60 FPS server-side game loop

## Development Notes

- Server runs on port 5000
- Game world is 800x600 pixels
- Initial blob size is 20 units
- Movement speed is 2 units per frame
- Uses UUIDs for player identification 