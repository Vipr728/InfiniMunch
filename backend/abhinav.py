from ai import ai_resolver
import asyncio

class WordWinnerResolver:
    def __init__(self):
        # Use a tuple of sorted words as the key to avoid duplicates and enable O(1) lookup
        self.cache = {
            tuple(sorted(["word1", "word2"])): ("word1", "word2"),  
        }

    async def determine_winner(self, word1, word2):
        """
        Check if combination of two words is present in the cache, and return the winner based on the cache.
        If not present, use AI and add the result to the cache.
        """
        key = tuple(sorted([word1, word2]))
        if key in self.cache:
            return self.cache[key]
        result = await ai_resolver.determine_winner(word1, word2)
        self.cache[key] = result
        print(self.cache)
        return result

if __name__ == "__main__":
    resolver = WordWinnerResolver()
    print(asyncio.run(resolver.determine_winner('word1', 'word2')))  # Should print ('word1', 'word2')
    print(asyncio.run(resolver.determine_winner('word2', 'word1')))  # Should print ('word1', 'word2')
    print(asyncio.run(resolver.determine_winner('abhi', 'joseph')))
    print(asyncio.run(resolver.determine_winner('joseph', 'abhi')))
    print(asyncio.run(resolver.determine_winner('joseph', 'abhi')))
    print(asyncio.run(resolver.determine_winner('abhi', 'joseph')))
    print(resolver.cache)
