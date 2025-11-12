Reviewing the key files to map the end-to-end flow and explain what each file covers:


[5 tools called]


Reviewing the main route handler to understand the complete flow:


[2 tools called]


End-to-end process and data flow:

## End-to-end process flow

### Request lifecycle

```
1. HTTP Request → route.ts (POST handler)
   ↓
2. Extract Date Ranges (route.ts: extractDateRanges)
   ↓
3. Detect Query Intents (intent-detector.ts: detectIntents)
   ↓
4. Build Modular Prompt (prompt-fragments.ts: buildSystemPrompt)
   ↓
5. Resolve AI Provider (ai-provider.ts: resolveProvider)
   ↓
6. Execute AI Request (route.ts: executeProviderRequest)
   ↓
7. Parse AI Response (ai-response.ts: parseAiResponse)
   ↓
8. Execute Google Ads API Query (route.ts: makeGoogleAdsRequest)
   ↓
9. Process & Return Results (route.ts: processGoogleAdsResults)
```

## Detailed data flow

### Phase 1: Input processing

```
User Query: "Compare RSA performance from Sept 8-14 to Sept 15-21"
         ↓
[route.ts: POST handler]
- Validates request body
- Extracts: query, accounts, period_type
         ↓
[route.ts: extractDateRanges]
Input: "Compare RSA performance from Sept 8-14 to Sept 15-21"
Output: [
  { start: "2025-09-08", end: "2025-09-14" },
  { start: "2025-09-15", end: "2025-09-21" }
]
```

### Phase 2: Intent detection

```
[intent-detector.ts: detectIntents]
Input: 
  - userInput: "Compare RSA performance from Sept 8-14 to Sept 15-21"
  - dateRanges: [2 ranges detected]

Process:
  1. Scans for keywords: "compare" → comparison intent
  2. Scans for keywords: "rsa" → rsa intent
  3. Detects 2 date ranges → comparison context populated

Output:
{
  intents: ["comparison", "rsa"],
  promptContext: {
    comparison: {
      comparison: { start: "2025-09-08", end: "2025-09-14" },
      main: { start: "2025-09-15", end: "2025-09-21" }
    }
  }
}
```

### Phase 3: Prompt construction

```
[prompt-fragments.ts: buildSystemPrompt]
Input:
  - intents: ["comparison", "rsa"]
  - promptContext: { comparison: {...} }

Process:
  1. Start with BASE_PROMPT (always included)
  2. Add comparisonFragment(context) → comparison-specific rules
  3. Add rsaFragment() → RSA-specific rules
  4. Join all sections with \n\n

Output:
"You are a Google Ads Query Language (GAQL) expert...
[Base rules - 200+ lines]
...
## COMPARISON QUERIES
[Comparison-specific guidance]
...
**RSA AD GROUP ANALYSIS:**
[RSA-specific guidance]
..."
```

### Phase 4: AI provider resolution

```
[ai-provider.ts: resolveProvider]
Process:
  1. Try Grok (xai) → getApiKey('xai', 'grok-3-fast-latest')
  2. If fails → Try Claude (anthropic)
  3. If fails → Try OpenAI (openai)
  4. If all fail → Throw error

Output:
{
  provider: "xai",
  model: "grok-3-fast-latest",
  apiKey: "sk-..."
}
```

### Phase 5: AI request execution

```
[route.ts: generateGAQLWithAI]
Input:
  - systemPrompt: [Modular prompt from Phase 3]
  - userInput: "Compare RSA performance..."
  - provider: { provider, model, apiKey }

Process:
  1. Append response format instructions to systemPrompt
  2. Call executeProviderRequest(provider, {
      systemPrompt: fullSystemPrompt,
      messages: [{ role: "user", content: userInput }],
      temperature: 0.0
    })

Output:
{
  content: '{"gaql_query": "SELECT ...", "comparison_query": "SELECT ...", ...}'
}
```

### Phase 6: Response parsing

```
[ai-response.ts: parseAiResponse]
Input: AI response object

Process:
  1. extractAiContent() → Extract string from response
  2. parseJsonResponse() → Parse JSON (with fallback extraction)
  3. extractGaqlQuery() → Get gaql_query field (handle arrays)
  4. cleanGaqlQuery() → Remove code blocks, GROUP BY
  5. validateGaqlQuery() → Check for OR, invalid chars

Output:
{
  gaqlQuery: "SELECT campaign.id... WHERE segments.date BETWEEN...",
  comparisonQuery: "SELECT campaign.id... WHERE segments.date BETWEEN...",
  isComparison: true,
  startDate: "2025-09-15",
  endDate: "2025-09-21",
  comparisonStartDate: "2025-09-08",
  comparisonEndDate: "2025-09-14"
}
```

### Phase 7: Google Ads API execution

```
[route.ts: makeGoogleAdsRequest]
Input:
  - accountId: "5197514377"
  - gaqlQuery: "SELECT campaign.id..."

Process:
  1. Get OAuth token (refresh_token flow)
  2. Call Google Ads API: POST /customers/{id}/googleAds:search
  3. Return raw API response

Output: { results: [...] }
```

### Phase 8: Result processing

```
[route.ts: processGoogleAdsResults]
Input: Google Ads API response

Process:
  1. Map each result to Campaign object
  2. Calculate metrics (CTR, ROAS, conversion_rate)
  3. Aggregate account totals
  4. Return structured data

Output:
{
  campaigns: [...],
  accountTotals: { clicks, impressions, cost, ... },
  result: [...]
}
```

## File-by-file responsibilities

### 1. `route.ts` — Main orchestrator
- HTTP request handling (POST endpoint)
- Date range extraction (`extractDateRanges`)
- Orchestrates the flow
- Google Ads API calls (`makeGoogleAdsRequest`)
- Result processing (`processGoogleAdsResults`)
- Response formatting

### 2. `intent-detector.ts` — Intent classification
- Keyword-based intent detection
- Comparison detection (date ranges + keywords)
- Intent mapping (RSA, extensions, search terms, etc.)
- Builds `PromptContext` with comparison dates

### 3. `prompt-fragments.ts` — Modular prompt system
- Base prompt (always included)
- Intent-specific fragments (comparison, RSA, extensions, etc.)
- Prompt builder (`buildSystemPrompt`)
- Fragment registry (`FRAGMENT_MAP`)

### 4. `ai-provider.ts` — Provider management
- Provider fallback (Grok → Claude → OpenAI)
- API key resolution
- Provider selection logic

### 5. `ai-response.ts` — Response parsing
- Content extraction from AI response
- JSON parsing with fallbacks
- GAQL query extraction (handles arrays)
- Query cleaning (remove code blocks, GROUP BY)
- Query validation (OR operators, invalid syntax)

## Benefits

1. Modularity: Each file has a single responsibility
2. Maintainability: Add new intents by adding fragments
3. Scalability: Easy to add new GAQL categories
4. Testability: Each module can be tested independently
5. Efficiency: Only relevant prompt fragments are included
6. Reliability: Provider fallback ensures availability

## Example: Adding a new intent

To add a new intent (e.g., "audience performance"):

1. Add keyword detection in `intent-detector.ts`
2. Create fragment function in `prompt-fragments.ts`
3. Register in `FRAGMENT_MAP`
4. Done — no changes needed in `route.ts`

This architecture supports future GAQL categories without touching core logic.