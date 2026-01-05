# Multiple Google Drive Accounts - Implementation Plan

## Executive Summary

This document outlines the changes required to support connecting multiple Google Drive accounts and selecting which account to use in workflow blocks.

## Current State Analysis

### ✅ What Already Works

1. **Database Schema**: The `account` table supports multiple accounts per user per provider
   - Unique constraint: `(userId, providerId, accountId)` allows different Google accounts
   - Location: `packages/db/schema.ts` lines 93-97

2. **Credential Fetching API**: `/api/auth/oauth/credentials` returns all accounts for a provider
   - Location: `apps/sim/app/api/auth/oauth/credentials/route.ts`
   - Already fetches multiple accounts correctly

3. **UI Components**: Credential selectors display multiple credentials
   - `CredentialSelector` component: `apps/sim/app/workspace/[workspaceId]/w/[workflowId]/components/panel/components/editor/components/sub-block/components/credential-selector/credential-selector.tsx`
   - `ToolCredentialSelector` component: Similar implementation
   - Both use `useOAuthCredentials` hook which fetches all credentials

4. **Block Configuration**: Google Drive block already uses `oauth-input` type
   - Location: `apps/sim/blocks/blocks/google_drive.ts` lines 32-43
   - Properly configured with `serviceId: 'google-drive'`

### ❌ Critical Issue Found

**Location**: `apps/sim/lib/auth/auth.ts` lines 112-167

**Problem**: The `account.create.before` hook prevents multiple accounts by checking only `(userId, providerId)` and updating existing accounts instead of creating new ones.

```typescript
// Current problematic code:
const existing = await db.query.account.findFirst({
  where: and(
    eq(schema.account.userId, account.userId),
    eq(schema.account.providerId, account.providerId)  // ❌ Only checks providerId, not accountId
  ),
})

if (existing) {
  // Updates existing account instead of creating new one
  await db.update(schema.account).set({...}).where(eq(schema.account.id, existing.id))
  return false  // Prevents account creation
}
```

**Impact**: When a user tries to connect a second Google Drive account, it overwrites the first one instead of creating a new account record.

## Required Changes

### 1. Fix Account Creation Logic (CRITICAL)

**File**: `apps/sim/lib/auth/auth.ts`

**Change**: Modify the `account.create.before` hook to check for existing accounts by `(userId, providerId, accountId)` instead of just `(userId, providerId)`.

**For Google Drive specifically**: Allow multiple accounts by checking if the `accountId` (Google's user ID/sub claim) is different.

**Implementation Strategy**:
- Check if the provider is a Google service that should support multiple accounts
- If yes, check for existing account by `(userId, providerId, accountId)` 
- Only update if the exact same account is reconnecting
- Create new account if `accountId` is different (different Google account)

**Code Changes**:
```typescript
before: async (account) => {
  // For Google services that support multiple accounts, check by accountId too
  const googleMultiAccountProviders = ['google-drive', 'google-docs', 'google-sheets', 'google-slides', 'google-calendar', 'google-email']
  const supportsMultipleAccounts = googleMultiAccountProviders.includes(account.providerId)
  
  let existing
  if (supportsMultipleAccounts) {
    // Check for existing account with same userId, providerId, AND accountId
    existing = await db.query.account.findFirst({
      where: and(
        eq(schema.account.userId, account.userId),
        eq(schema.account.providerId, account.providerId),
        eq(schema.account.accountId, account.accountId)  // ✅ Check accountId too
      ),
    })
  } else {
    // For other providers, keep existing behavior (one account per provider)
    existing = await db.query.account.findFirst({
      where: and(
        eq(schema.account.userId, account.userId),
        eq(schema.account.providerId, account.providerId)
      ),
    })
  }

  if (existing) {
    // Update existing account (same Google account reconnecting)
    // ... existing update logic ...
    return false
  }

  // Create new account (different Google account or first connection)
  return { data: account }
}
```

### 2. Verify Account ID Extraction

**File**: OAuth callback handler (handled by betterAuth)

**Check**: Ensure `account.accountId` contains the Google user ID (sub claim from ID token)

**Note**: betterAuth should automatically extract this from the OAuth response. Verify that:
- `account.accountId` is set to Google's user ID (sub claim)
- This is unique per Google account
- Different Google accounts have different `accountId` values

### 3. Improve Credential Display Names

**File**: `apps/sim/app/api/auth/oauth/credentials/route.ts` lines 160-230

**Current**: Display names are extracted from ID token email/name

**Enhancement**: Ensure display names clearly distinguish accounts
- Primary: Use email from ID token (already implemented)
- Fallback: Use accountId with provider name
- Consider: Add account index if emails are similar

**Status**: Already implemented correctly - extracts email from ID token

### 4. Verify Credential Selector UI

**Files**:
- `apps/sim/app/workspace/[workspaceId]/w/[workflowId]/components/panel/components/editor/components/sub-block/components/credential-selector/credential-selector.tsx`
- `apps/sim/app/workspace/[workspaceId]/w/[workflowId]/components/panel/components/editor/components/sub-block/components/tool-input/components/tool-credential-selector.tsx`

**Check**: 
- ✅ Already fetches all credentials via `useOAuthCredentials`
- ✅ Displays them in a dropdown
- ✅ Stores selected credential ID correctly

**Status**: No changes needed - already works with multiple accounts

### 5. Verify Auto-Selection Logic

**File**: `apps/sim/lib/workflows/credentials/credential-resolver.ts` lines 168-189

**Current Behavior**: 
- If only one credential exists, auto-selects it
- If multiple exist, requires user selection

**Status**: ✅ Correct behavior - no changes needed

### 6. Update Disconnect Logic

**File**: `apps/sim/app/api/auth/oauth/disconnect/route.ts`

**Current**: Supports disconnecting by `providerId` (disconnects all accounts) or specific account

**Status**: ✅ Already supports per-account disconnect - no changes needed

### 7. Update Connections API

**File**: `apps/sim/app/api/auth/oauth/connections/route.ts`

**Current**: Groups accounts by provider and shows all accounts in `accounts` array

**Status**: ✅ Already supports multiple accounts - no changes needed

## Implementation Steps

### Phase 1: Core Fix (Required)

1. **Modify Account Creation Hook**
   - File: `apps/sim/lib/auth/auth.ts`
   - Change: Update `account.create.before` to check `accountId` for Google services
   - Test: Connect two different Google Drive accounts, verify both exist

### Phase 2: Verification (Recommended)

2. **Test Account ID Extraction**
   - Verify `account.accountId` contains unique Google user ID
   - Test with two different Google accounts
   - Confirm different `accountId` values

3. **Test Credential Display**
   - Connect multiple Google Drive accounts
   - Verify each shows distinct email address
   - Test in credential selector dropdown

4. **Test Workflow Execution**
   - Create workflow with Google Drive block
   - Select different accounts in different blocks
   - Verify each block uses correct account

### Phase 3: Edge Cases (Optional Enhancements)

5. **Handle Reconnection**
   - Test reconnecting same Google account
   - Should update existing account (not create duplicate)

6. **Handle Account Deletion**
   - Test disconnecting one account
   - Verify other accounts remain connected

7. **UI Enhancements** (if needed)
   - Consider showing account email in credential selector
   - Add visual distinction between accounts
   - Show "Add another account" option when accounts exist

## Testing Checklist

### Basic Functionality
- [ ] Connect first Google Drive account
- [ ] Verify account appears in credential selector
- [ ] Connect second Google Drive account (different Google account)
- [ ] Verify both accounts appear in credential selector
- [ ] Verify both accounts have distinct display names (emails)

### Workflow Integration
- [ ] Create workflow with Google Drive block
- [ ] Select first account in block
- [ ] Add another Google Drive block
- [ ] Select second account in new block
- [ ] Verify workflow execution uses correct account for each block

### Edge Cases
- [ ] Reconnect same Google account (should update, not duplicate)
- [ ] Disconnect one account (other should remain)
- [ ] Disconnect all accounts (should allow reconnection)
- [ ] Test with same email but different Google accounts (if possible)

### UI/UX
- [ ] Credential selector shows all connected accounts
- [ ] Display names are clear and distinct
- [ ] Can select different accounts in different blocks
- [ ] Selected account persists in block configuration

## Files to Modify

### Critical Changes
1. `apps/sim/lib/auth/auth.ts` - **REQUIRED**
   - Modify `account.create.before` hook (lines 112-169)

### Verification (No Changes Expected)
2. `apps/sim/app/api/auth/oauth/credentials/route.ts` - Verify works correctly
3. `apps/sim/app/workspace/[workspaceId]/w/[workflowId]/components/panel/components/editor/components/sub-block/components/credential-selector/credential-selector.tsx` - Verify works correctly
4. `apps/sim/blocks/blocks/google_drive.ts` - Verify configuration correct

## Risk Assessment

### Low Risk
- Credential fetching and display already supports multiple accounts
- UI components already handle multiple credentials
- Database schema supports multiple accounts

### Medium Risk
- Account creation hook change affects all OAuth providers
- Need to ensure backward compatibility for providers that should only have one account
- Need to test that existing single-account connections still work

### Mitigation
- Use provider-specific logic (only Google services support multiple accounts)
- Keep existing behavior for non-Google providers
- Thorough testing of both single and multiple account scenarios

## Rollout Plan

1. **Development**
   - Implement account creation hook changes
   - Test locally with multiple Google accounts

2. **Staging**
   - Deploy to staging environment
   - Test full workflow with multiple accounts
   - Verify no regressions for other OAuth providers

3. **Production**
   - Deploy with feature flag (optional)
   - Monitor for errors
   - Gather user feedback

## Success Criteria

✅ Users can connect multiple Google Drive accounts
✅ Each account appears in credential selector with distinct name
✅ Users can select different accounts in different blocks
✅ Workflow execution uses correct account per block
✅ Reconnecting same account updates it (doesn't create duplicate)
✅ Disconnecting one account doesn't affect others
✅ Other OAuth providers continue to work as before

## Notes

- The database schema already supports this feature
- Most UI components already support multiple accounts
- The main blocker is the account creation hook
- This is a relatively small change with high impact
- Consider extending to other Google services (Docs, Sheets, etc.) using same pattern

