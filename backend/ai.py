import google.generativeai as genai
import asyncio
import os
from typing import Tuple, Optional
from dotenv import load_dotenv

load_dotenv()

class AICollisionResolver:
    def __init__(self, api_key: Optional[str] = None):
        """Initialize the AI collision resolver with Gemini API"""
        self.api_key = api_key or os.getenv('GEMINI_API_KEY')
        if not self.api_key:
            print("Warning: No Gemini API key found. Set GEMINI_API_KEY environment variable or pass api_key parameter.")
            self.model = None
        else:
            genai.configure(api_key=self.api_key)
            self.model = genai.GenerativeModel('gemini-1.5-flash')
    
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
        You are an AI judge in a competitive game called "InfiniMunch". Two players have collided and you must determine who wins.

        I will give you two terms between which I want you to determine the winner in a battle to the death. Make your responses dumb and fun, this is meant for a fun io-style game. Make sure your winners still make some sense though, for example "God" should lose to "atheist" even though by power it would obviously win.
        Make the winner only the dumb one if there's some argument that could be made for it to win. In "atheist" vs. "God" an atheist should win. Against a black hole, now something like "black hole existence denier george" could win.
        Make sure to incorporate internet culture and jokes as well into you determined winner. For example, use stereotypes about different people to determine a winner, like "redditor" losing to "shower".


        Player 1: "{player1_name}"
        Player 2: "{player2_name}"

        Respond with ONLY the winner's name, nothing else. No explanations, no quotes, just the name.

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
        response = self.model.generate_content(prompt)
        return response.text

# Global AI resolver instance
ai_resolver = AICollisionResolver()
