# AI-Powered Collision Resolution

This game now uses Google Gemini AI to determine collision winners based on player name power analysis!

## How It Works

When two players collide, the AI analyzes their names and determines which one is more powerful, intimidating, or impressive based on factors like:
- Name length and complexity
- Intimidation factor
- Creativity and originality
- Cultural references or mythology
- Overall "power level" feeling

## Setup Instructions

### 1. Get a Gemini API Key

1. Go to [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Sign in with your Google account
3. Click "Create API Key"
4. Copy the generated API key

### 2. Set the API Key

**Option A: Environment Variable (Recommended)**
```bash
# Windows PowerShell
$env:GEMINI_API_KEY="your_api_key_here"

# Windows Command Prompt
set GEMINI_API_KEY=your_api_key_here

# Linux/Mac
export GEMINI_API_KEY=your_api_key_here
```

**Option B: Pass to AI Resolver**
```python
from ai import AICollisionResolver
ai_resolver = AICollisionResolver(api_key="your_api_key_here")
```

### 3. Test the Integration

Run the test script to verify everything works:
```bash
python test_ai.py
```

## Fallback Behavior

If no API key is provided or the AI call fails, the system automatically falls back to random winner selection, ensuring the game continues to work.

## Example AI Decisions

The AI might decide:
- "DragonSlayer" wins over "CookieMonster" (intimidation factor)
- "ThunderGod" wins over "FluffyBunny" (power level)
- "CyberNinja" wins over "TeddyBear" (coolness factor)

## Troubleshooting

1. **"No Gemini API key found"** - Set the GEMINI_API_KEY environment variable
2. **AI call fails** - Check your internet connection and API key validity
3. **Game still uses random** - Verify the API key is set correctly

## Privacy Note

Player names are sent to Google's Gemini API for analysis. No other personal data is transmitted. 