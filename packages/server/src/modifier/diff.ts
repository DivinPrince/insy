import { createPatch, diffLines } from 'diff';
import type { DiffResult, DiffHunk, DiffChange } from '@pixelcode/shared';

export class DiffGenerator {
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
