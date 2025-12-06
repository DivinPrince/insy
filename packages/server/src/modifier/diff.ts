import { createPatch, diffLines } from 'diff';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import type { DiffResult, DiffHunk, DiffChange, CodeChange } from '@insy/shared';

export interface MultiDiffResult {
  results: DiffResult[];
  summary?: string;
}

export class DiffGenerator {
  constructor(private projectRoot?: string) {}

  generate(
    filePath: string,
    originalCode: string,
    modifiedCode: string
  ): DiffResult {
    const id = crypto.randomUUID();

    // Generate unified diff
    const unifiedDiff = createPatch(
      filePath,
      originalCode,
      modifiedCode,
      'Original',
      'Modified'
    );

    // Parse into structured hunks
    const hunks = this.parseHunks(unifiedDiff);

    return {
      id,
      file: filePath,
      originalCode,
      modifiedCode,
      unifiedDiff,
      hunks,
    };
  }

  /**
   * Generate diffs for multiple file changes
   */
  async generateMultiple(changes: CodeChange[], summary?: string): Promise<MultiDiffResult> {
    const results: DiffResult[] = [];

    for (const change of changes) {
      let originalCode = '';
      let modifiedCode = change.content;

      switch (change.action) {
        case 'create':
          // New file - original is empty
          originalCode = '';
          break;

        case 'modify':
          // Existing file - read current content
          try {
            const fullPath = this.resolvePath(change.filePath);
            console.log(`[DiffGenerator] Checking file: ${fullPath}`);
            if (existsSync(fullPath)) {
              originalCode = await readFile(fullPath, 'utf-8');
              console.log(`[DiffGenerator] Read ${originalCode.length} bytes from ${fullPath}`);
            } else {
              console.warn(`[DiffGenerator] File not found for modify: ${fullPath} (original path: ${change.filePath})`);
              originalCode = '';
            }
          } catch (error) {
            console.error(`[DiffGenerator] Error reading file ${change.filePath}:`, error);
            originalCode = '';
          }
          break;

        case 'delete':
          // Delete file - modified is empty
          try {
            const fullPath = this.resolvePath(change.filePath);
            if (existsSync(fullPath)) {
              originalCode = await readFile(fullPath, 'utf-8');
            }
          } catch (error) {
            console.error(`[DiffGenerator] Error reading file ${change.filePath}:`, error);
          }
          modifiedCode = '';
          break;
      }

      const result = this.generate(change.filePath, originalCode, modifiedCode);
      results.push(result);
    }

    return { results, summary };
  }

  private resolvePath(filePath: string): string {
    // Check for absolute paths (Windows with backslash, Windows with forward slash, or Unix)
    if (filePath.startsWith('/') || filePath.match(/^[a-zA-Z]:[\\/]/)) {
      return filePath;
    }
    if (this.projectRoot) {
      return `${this.projectRoot}/${filePath}`;
    }
    return filePath;
  }

  private parseHunks(unifiedDiff: string): DiffHunk[] {
    const hunks: DiffHunk[] = [];
    const lines = unifiedDiff.split('\n');

    let currentHunk: DiffHunk | null = null;
    let oldLineNum = 0;
    let newLineNum = 0;

    for (const line of lines) {
      // Hunk header
      if (line.startsWith('@@')) {
        const match = line.match(/@@ -(\d+),?(\d+)? \+(\d+),?(\d+)? @@/);
        if (match) {
          if (currentHunk) hunks.push(currentHunk);

          currentHunk = {
            oldStart: parseInt(match[1]),
            oldLines: parseInt(match[2] || '1'),
            newStart: parseInt(match[3]),
            newLines: parseInt(match[4] || '1'),
            changes: [],
          };

          oldLineNum = currentHunk.oldStart;
          newLineNum = currentHunk.newStart;
        }
        continue;
      }

      if (!currentHunk) continue;

      if (line.startsWith('+')) {
        currentHunk.changes.push({
          type: 'add',
          line: line.substring(1),
          lineNumber: newLineNum++,
        });
      } else if (line.startsWith('-')) {
        currentHunk.changes.push({
          type: 'remove',
          line: line.substring(1),
          lineNumber: oldLineNum++,
        });
      } else if (line.startsWith(' ')) {
        currentHunk.changes.push({
          type: 'context',
          line: line.substring(1),
          lineNumber: newLineNum++,
        });
        oldLineNum++;
      }
    }

    if (currentHunk) hunks.push(currentHunk);

    return hunks;
  }
}
