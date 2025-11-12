# Date Extraction Logic Assessment & Improvement Plan

## Current Implementation Analysis

### ✅ What Works Well
1. **Week-based queries**: "this week", "current week", "last week" - properly handled
2. **Explicit date ranges**: Multiple formats supported (numeric, month names, ISO)
3. **Comparison queries**: "and then" pattern for two date ranges
4. **Multiple format support**: M/D/YYYY, month names, ISO format

### ❌ Current Limitations

#### 1. **Missing Common Natural Language Patterns**
- ❌ "today" / "yesterday"
- ❌ "this month" / "last month" / "current month"
- ❌ "last 7 days" / "last 30 days" / "last 90 days" / "last N days"
- ❌ "last 3 months" / "last 6 months" / "last N months"
- ❌ "past week" (synonym for "last week")
- ❌ "YTD" (year to date)
- ❌ "MTD" (month to date)
- ❌ Quarters: "Q1 2025", "Q2 2025", etc.
- ❌ Month-only: "January 2025", "Jan 2025"
- ❌ Year-only: "2025"
- ❌ Relative dates: "2 weeks ago", "3 days ago", "a month ago"
- ❌ "since [date]" / "until [date]"
- ❌ "between [date] and [date]" (alternative phrasing)
- ❌ "week of [date]"

#### 2. **Code Quality Issues**
- 🔴 **Code duplication**: Month map defined 3+ times
- 🔴 **No date validation**: Could extract invalid dates (e.g., Feb 30)
- 🔴 **No word boundaries**: "lastweek" would match "last week"
- 🔴 **Inconsistent return**: Some paths return early, others continue
- 🔴 **No error handling**: Invalid dates could crash
- 🔴 **No timezone handling**: Assumes server timezone

#### 3. **Edge Cases Not Handled**
- ❌ Ambiguous dates: "12/1/2025" (could be M/D or D/M)
- ❌ Missing year (assumes current year)
- ❌ Invalid date ranges (start > end)
- ❌ Dates in the future (should validate)
- ❌ Single date queries: "show me data for January 15"

## Recommended Improvements

### Priority 1: High-Impact Natural Language Support
1. **Relative time periods**: "last 7 days", "last 30 days", "last 3 months"
2. **Month-based queries**: "this month", "last month", "January 2025"
3. **Today/Yesterday**: Common single-day queries
4. **YTD/MTD**: Business intelligence common patterns

### Priority 2: Code Quality & Maintainability
1. **Extract month map to constant**: Single source of truth
2. **Add date validation**: Ensure dates are valid before returning
3. **Use word boundaries**: More precise pattern matching
4. **Consolidate logic**: Reduce duplication

### Priority 3: Advanced Patterns
1. **Quarters**: "Q1 2025", "Q2 2025"
2. **Relative dates**: "2 weeks ago", "3 days ago"
3. **Since/Until**: "since January 1", "until yesterday"
4. **Year-only**: "2025" (entire year)

## Implementation Strategy

### Phase 1: Create Shared Utilities
- Extract month map to shared constant
- Create date validation helper
- Create date calculation helpers

### Phase 2: Add High-Priority Patterns
- Relative periods ("last N days/months")
- Month-based queries
- Today/Yesterday
- YTD/MTD

### Phase 3: Refactor & Optimize
- Consolidate pattern matching
- Add word boundaries
- Improve error handling
- Add comprehensive logging

### Phase 4: Advanced Features
- Quarters
- Relative dates
- Since/Until patterns

