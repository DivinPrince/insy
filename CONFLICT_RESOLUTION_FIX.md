# Conflict Resolution Fix for Parallel AI Edits

## Problem Description

The system was experiencing data loss when multiple AI agents edited files in parallel. The core issue was:

1. **Full File Rewrites**: AI returns entire file content, not patches
2. **Race Condition**: When multiple agents edit the same file:
   - Agent 1 reads file.tsx (version V1)
   - Agent 2 reads file.tsx (version V1)
   - Agent 1 generates changes → V2 with modifications A
   - Agent 2 generates changes → V2' with modifications B
   - Agent 1's changes applied to disk
   - User accepts Agent 1's changes
   - Agent 2's changes arrive and **overwrite** Agent 1's work
   - **Result**: Agent 1's changes are LOST

## Solution: Content Hash-Based Conflict Detection

We've implemented a **content hash validation** system that detects when a file has been modified between when the AI read it and when changes are applied.

### How It Works

1. **Hash Generation** (DiffGenerator):
   - When generating a diff, calculate SHA-256 hash of the original file content
   - Include hash in `DiffResult.originalContentHash`

2. **Conflict Detection** (FileWriter):
   - Before applying changes, read current file content
   - Calculate hash of current content
   - Compare with `originalContentHash` from the diff
   - If hashes don't match → **CONFLICT DETECTED**
   - Reject the change and notify the user

3. **User Notification** (Server):
   - When conflict detected, send error with code `CONFLICT`
   - Include details: file path, expected hash, actual hash
   - Do not apply changes that would overwrite other edits

## Implementation Details

### Files Modified

#### 1. `packages/shared/src/types.ts`
Added conflict detection fields:

```typescript
export interface DiffResult {
  // ... existing fields
  originalContentHash?: string; // SHA-256 hash for conflict detection
}

export interface ErrorPayload {
  // ... existing fields
  conflict?: {
    diffId: string;
    file: string;
    expectedHash: string;
    actualHash: string;
  };
}
```

#### 2. `packages/server/src/modifier/diff.ts`
Calculate and include content hash when generating diffs:

```typescript
export class DiffGenerator {
  private calculateHash(content: string): string {
    return createHash('sha256').update(content, 'utf-8').digest('hex');
  }

  generate(filePath: string, originalCode: string, modifiedCode: string): DiffResult {
    // ... generate diff
    const originalContentHash = this.calculateHash(originalCode);

    return {
      // ... other fields
      originalContentHash,
    };
  }
}
```

#### 3. `packages/server/src/filesystem/writer.ts`
Validate content before applying:

```typescript
export class FileWriter {
  private calculateHash(content: string): string {
    return createHash('sha256').update(content, 'utf-8').digest('hex');
  }

  async applyDiff(diff: DiffResult): Promise<{
    success: boolean;
    conflict?: { expectedHash: string; actualHash: string };
  }> {
    const currentContent = await readFile(diff.file, 'utf-8');

    // CONFLICT DETECTION
    if (diff.originalContentHash) {
      const currentHash = this.calculateHash(currentContent);

      if (currentHash !== diff.originalContentHash) {
        console.warn(`[FileWriter] CONFLICT DETECTED for ${diff.file}`);
        return {
          success: false,
          error: 'File has been modified since diff was generated',
          conflict: {
            expectedHash: diff.originalContentHash,
            actualHash: currentHash,
          },
        };
      }
    }

    // Proceed with applying changes...
  }
}
```

#### 4. `packages/server/src/server.ts`
Handle conflicts and notify clients:

```typescript
// Auto-apply diffs with conflict detection
for (const diff of multiDiff.results) {
  const applyResult = await fileWriter.applyDiff(diff);

  // Handle conflicts
  if (!applyResult.success && applyResult.conflict) {
    this.wsServer.send(clientId, 'error', {
      code: 'CONFLICT',
      message: `Cannot apply changes to ${diff.file}: file was modified by another edit`,
      conflict: {
        diffId: diff.id,
        file: diff.file,
        expectedHash: applyResult.conflict.expectedHash,
        actualHash: applyResult.conflict.actualHash,
      },
    });
    continue; // Skip this diff
  }

  // ... add to payload if successful
}
```

## Behavior

### Before Fix
- Multiple parallel edits → last one wins, others lost
- No notification to user about lost changes
- Silent data corruption

### After Fix
- Parallel edits detected via content hash mismatch
- Conflicting edit is **rejected** before overwriting
- User receives error notification with conflict details
- Original edits are **protected** from being overwritten

## Example Scenario

### Timeline:
1. **T0**: file.tsx contains "Version 1" (hash: abc123)
2. **T1**: Agent 1 reads file.tsx → generates diff with `originalContentHash: abc123`
3. **T2**: Agent 2 reads file.tsx → generates diff with `originalContentHash: abc123`
4. **T3**: Agent 1 applies changes → file.tsx now "Version 2" (hash: def456)
5. **T4**: Agent 2 tries to apply changes:
   - Reads current file.tsx (Version 2, hash: def456)
   - Compares: `def456` ≠ `abc123` → **CONFLICT!**
   - Changes **rejected**, user notified
   - Version 2 remains intact

## Benefits

1. **Data Protection**: Prevents silent overwrites of concurrent edits
2. **User Awareness**: Clear error messages about conflicts
3. **Zero Config**: Works automatically with existing workflow
4. **Performance**: SHA-256 hashing is fast, minimal overhead
5. **Backwards Compatible**: Hash is optional, older diffs still work

## Future Enhancements

Potential improvements for the future:

1. **Smart Merge**: Attempt to merge non-overlapping changes automatically
2. **Line-Level Conflict Detection**: Identify exactly which lines conflict
3. **Conflict Resolution UI**: Allow user to choose which changes to keep
4. **Change Queuing**: Queue conflicting changes for sequential application
5. **Git-Style 3-Way Merge**: Use common ancestor to resolve conflicts

## Testing

To test the conflict detection:

1. Start multiple AI agents editing the same file
2. Accept one agent's changes
3. Try to apply the other agent's changes
4. Verify conflict error is shown and changes are not applied

## Rollback

If issues arise, the fix can be rolled back by:
1. Removing `originalContentHash` field from DiffResult
2. Removing hash validation from FileWriter.applyDiff
3. No database migrations needed (purely in-memory)
