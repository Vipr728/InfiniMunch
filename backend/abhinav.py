cache = {
        "word1": 'word1',
        "word2": 'word2',
        "winner": 'word1'  # or 'word2'
}






def determine_winner(word1, word2):
    """
    Check if combination of two words are present in the cache, and return the winnr based on the cache.
    If not present, call another function called get_winner_from_api to get the winner from an external API.
    cache = {
    "word1": 'word1',
    "word2": 'word2',
    "winner": 'word1'  # or 'word2'
    }
    """
    key = f"{word1}_{word2}"
    if key in cache:
        return cache[key]['winner']
    winner = get_winner_from_api(word1, word2)
    cache[key] = {
        'word1': word1,
        'word2': word2,
        'winner': winner
    }
    return winner



print(determine_winner('word1', 'word2'))  # Should print 'word1' based on the cache
