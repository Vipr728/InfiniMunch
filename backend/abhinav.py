from ai import determine_winner_with_cache, _cache
import asyncio

async def main():
    """Main function to run tests for the winner determination logic."""
    print("--- Running tests for winner determination ---")
    
    # These should hit the cache if already present, or call the AI and populate it
    print(await determine_winner_with_cache('word1', 'word2'))
    print(await determine_winner_with_cache('word2', 'word1'))
    print(await determine_winner_with_cache('abhi', 'joseph'))
    
    # These calls should be instant cache hits
    print(await determine_winner_with_cache('joseph', 'abhi'))
    print(await determine_winner_with_cache('abhi', 'joseph'))
    
    print("\n--- Current Cache State ---")
    print(_cache)
    print("--------------------------")

if __name__ == "__main__":
    asyncio.run(main())

