try:
    import google.generativeai as genai  # type: ignore
    GENAI_AVAILABLE = True
except ImportError:
    print("Warning: google-generativeai not installed. AI functionality will be disabled.")
    GENAI_AVAILABLE = False
    genai = None  # type: ignore

import asyncio
import os
import json
from typing import Tuple, Optional
from dotenv import load_dotenv

load_dotenv()

class AICollisionResolver:
    def __init__(self, api_key: Optional[str] = None):
        """Initialize the AI collision resolver with Gemini API"""
        self.api_key = api_key or os.getenv('GEMINI_API_KEY')
        if not GENAI_AVAILABLE:
            print("Warning: google-generativeai not available. Using random fallback.")
            self.model = None
        elif not self.api_key:
            print("Warning: No Gemini API key found. Set GEMINI_API_KEY environment variable or pass api_key parameter.")
            self.model = None
        else:
            genai.configure(api_key=self.api_key)  # type: ignore
            self.model = genai.GenerativeModel('gemini-1.5-flash')  # type: ignore
    
    async def determine_winner(self, player1_name: str, player2_name: str) -> Tuple[str, str]:
        """
        Use AI to determine which player's name is more powerful and wins the collision.
        Returns (winner_name, loser_name)
        """
        if not self.model:
            # Fallback to random if no API key
            import random
            winner_name = random.choice([player1_name, player2_name])
            loser_name = player2_name if winner_name == player1_name else player1_name
            return winner_name, loser_name
        
        prompt = f"""
        Which is stronger, "{player1_name}" or "{player2_name}"?

        Make the result interesting!

        Respond with ONLY the winner, nothing else. No explanations, no quotes, just the winner.

        Winner: """

        try:
            # Run the AI call in a thread to avoid blocking
            loop = asyncio.get_event_loop()
            response = await loop.run_in_executor(None, self._call_gemini, prompt)
            
            # Clean up the response
            winner_name = response.strip().strip('"').strip("'")
            
            # Validate the response
            if winner_name == player1_name:
                return player1_name, player2_name
            elif winner_name == player2_name:
                return player2_name, player1_name
            else:
                # If AI response doesn't match either name, fallback to random
                import random
                winner_name = random.choice([player1_name, player2_name])
                loser_name = player2_name if winner_name == player1_name else player1_name
                return winner_name, loser_name
                
        except Exception as e:
            print(f"AI call failed: {e}")
            # Fallback to random
            import random
            winner_name = random.choice([player1_name, player2_name])
            loser_name = player2_name if winner_name == player1_name else player1_name
            return winner_name, loser_name
    
    def _call_gemini(self, prompt: str) -> str:
        """Synchronous wrapper for Gemini API call"""
        response = self.model.generate_content(prompt)  # type: ignore
        return response.text

# Global AI resolver instance
ai_resolver = AICollisionResolver()


# --- Persistent Caching Logic ---

CACHE_FILE = os.path.join(os.path.dirname(__file__), 'cache.json')

def _tuple_key(word1: str, word2: str) -> str:
    """Creates a consistent, sorted key for the cache."""
    return str(tuple(sorted([word1, word2])))

def _load_cache() -> dict:
    """Loads the cache from cache.json if it exists."""
    if os.path.exists(CACHE_FILE):
        with open(CACHE_FILE, 'r') as f:
            try:
                data = json.load(f)
                # Convert list values from JSON back to tuples
                return {k: tuple(v) for k, v in data.items()}
            except json.JSONDecodeError:
                return {}  # Return empty if file is corrupt or empty
    return {}

def _save_cache(cache: dict):
    """Saves the cache to cache.json."""
    with open(CACHE_FILE, 'w') as f:
        # Convert tuple values to lists for JSON compatibility
        json.dump({k: list(v) for k, v in cache.items()}, f, indent=4)

# Global cache, loaded on startup
_cache = _load_cache()

async def determine_winner_with_cache(player1_name: str, player2_name: str) -> Tuple[str, str]:
    """
    Determines a winner using a persistent cache.
    If the pair is not in the cache, it calls the AI and saves the result.
    """
    key = _tuple_key(player1_name, player2_name)
    
    if key in _cache:
        print(f"Cache hit for: ({player1_name}, {player2_name})")
        return _cache[key]
    
    print(f"Cache miss for: ({player1_name}, {player2_name}). Calling AI.")
    winner, loser = await ai_resolver.determine_winner(player1_name, player2_name)
    
    # Add to cache and save to file
    _cache[key] = (winner, loser)
    _save_cache(_cache)
    
    return winner, loser

async def check_name_appropriateness(player_name: str) -> bool:
    """
    Use AI to determine if a player name is appropriate for the game.
    Returns True if appropriate, False if inappropriate.
    """
    if not ai_resolver.model:
        # Fallback: assume appropriate if no AI available
        print(f"Warning: No AI available for name check, allowing '{player_name}'")
        return True
    
    prompt = f"""
    Is the name "{player_name}" appropriate for a family-friendly multiplayer game?

    Only treat a name as INAPPROPRIATE if it contains:
    - Explicit sexual content or innuendo
    - Profanity, vulgar language, or slurs
    - Harassing or hate-speech (e.g. "femboy" used as an insult, "molestor", etc.)

    If it does *not* contain any of those, it's family-friendly.

    Respond with **ONLY** one word:  
    - "APPROPRIATE"  
    - "INAPPROPRIATE"

    Response: """

    try:
        # Run the AI call in a thread to avoid blocking
        loop = asyncio.get_event_loop()
        response = await loop.run_in_executor(None, ai_resolver._call_gemini, prompt)
        
        # Clean up the response
        result = response.strip().upper()
        
        # Validate the response
        if result == "APPROPRIATE":
            return True
        elif result == "INAPPROPRIATE":
            return False
        else:
            # If AI response doesn't match expected format, be conservative
            print(f"Unexpected AI response for name '{player_name}': {result}")
            return False
            
    except Exception as e:
        print(f"AI name check failed for '{player_name}': {e}")
        # Fallback: be conservative on AI failure
        return False
