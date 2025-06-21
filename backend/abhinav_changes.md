# Changes to `backend/abhinav.py`

This document summarizes all changes made to `backend/abhinav.py` for easier merge conflict resolution and team awareness.

## 1. Switched to O(1) Cache Lookup
- The cache is now a dictionary with keys as tuples of sorted word pairs, e.g. `('word1', 'word2')`.
- This avoids redundant duplicate entries for word pairs in different orders.
- Example:
  ```python
  cache = {
      tuple(sorted(["word1", "word2"])): ("word1", "word2"),
  }
  ```

## 2. Async Handling
- The `determine_winner` function is async.
- All test calls to `determine_winner` are wrapped with `asyncio.run()` to properly await the coroutine.

## 3. Cache Update After AI Call
- If a word pair is not found in the cache, the result is fetched from the AI and then added to the cache for future O(1) lookups.
- This ensures the AI is only called once per unique word pair.

## 4. Test Cases and Debugging
- Added test cases for various word pairs, including repeated lookups to demonstrate cache effectiveness.
- At the end of the script, the cache is printed to show its contents after test runs.

## 5. Example of Current Test Block
```python
if __name__ == "__main__":
    print(asyncio.run(determine_winner('word1', 'word2')))  # Should print ('word1', 'word2')
    print(asyncio.run(determine_winner('word2', 'word1')))  # Should print ('word1', 'word2')
    print(asyncio.run(determine_winner('abhi', 'joseph')))
    print(asyncio.run(determine_winner('joseph', 'abhi')))
    print(asyncio.run(determine_winner('joseph', 'abhi')))
    print(asyncio.run(determine_winner('abhi', 'joseph')))
    print(cache)
```

---

**Summary:**
- O(1) cache lookup with deduplication
- Async/await usage
- Cache is updated after AI call
- Expanded test coverage and cache printout 