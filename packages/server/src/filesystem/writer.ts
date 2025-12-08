import { readFile, writeFile, mkdir, unlink } from 'fs/promises';
import path from 'path';
import { createHash } from 'crypto';
import type { DiffResult } from '@insy/shared';

interface ChangeRecord {
  diffId: string;
  file: string;
  backupPath: string;
  timestamp: number;
  isApplied: boolean; // Track if changes are currently applied
  modifiedCode: string; // Store modified code for re-applying after toggle
}

export class FileWriter {
  private backupDir: string;

  constructor(private projectRoot: string) {
    this.backupDir = path.join(projectRoot, '.insy', 'backups');
  }

  /**
   * Calculate SHA-256 hash of content for conflict detection
   */
  private calculateHash(content: string): string {
    return createHash('sha256').update(content, 'utf-8').digest('hex');
  }

  async applyDiff(
    diff: DiffResult
  ): Promise<{
    success: boolean;
    backupPath?: string;
    error?: string;
    conflict?: {
      expectedHash: string;
      actualHash: string;
    };
  }> {
    try {
      // Read current content
      const currentContent = await readFile(diff.file, 'utf-8');

      // Conflict detection: If originalContentHash is provided, verify current content matches
      if (diff.originalContentHash) {
        const currentHash = this.calculateHash(currentContent);

        if (currentHash !== diff.originalContentHash) {
          console.warn(
            `[FileWriter] CONFLICT DETECTED for ${diff.file}: ` +
            `expected hash ${diff.originalContentHash.substring(0, 8)}..., ` +
            `but current file has hash ${currentHash.substring(0, 8)}...`
          );

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

      // Create backup
      const backupPath = await this.createBackup(diff.file, currentContent);

      // Write modified code
      await writeFile(diff.file, diff.modifiedCode, 'utf-8');

      // Record change with isApplied=true and store modifiedCode
      await this.recordChange({
        diffId: diff.id,
        file: diff.file,
        backupPath,
        timestamp: Date.now(),
        isApplied: true,
        modifiedCode: diff.modifiedCode,
      });

      console.log(`[FileWriter] Applied changes to ${diff.file}`);
      return { success: true, backupPath };
    } catch (error) {
      console.error('[FileWriter] Error applying diff:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async createBackup(filePath: string, content: string): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = path.basename(filePath);
    const backupPath = path.join(this.backupDir, `${filename}.${timestamp}.bak`);

    await mkdir(path.dirname(backupPath), { recursive: true });
    await writeFile(backupPath, content, 'utf-8');

    return backupPath;
  }

  async undo(diffId: string): Promise<boolean> {
    try {
      const change = await this.getChange(diffId);
      if (!change || !change.backupPath) return false;

      const backupContent = await readFile(change.backupPath, 'utf-8');
      await writeFile(change.file, backupContent, 'utf-8');

      console.log(`[FileWriter] Undid changes for ${change.file}`);
      return true;
    } catch (error) {
      console.error('[FileWriter] Error undoing changes:', error);
      return false;
    }
  }

  /**
   * Toggle changes on/off without deleting backup.
   * Returns the new state: true = changes applied, false = original restored
   */
  async toggle(diffId: string): Promise<{ success: boolean; isApplied: boolean }> {
    try {
      const change = await this.getChange(diffId);
      if (!change) {
        return { success: false, isApplied: false };
      }

      if (change.isApplied) {
        // Currently showing changes, restore original
        const backupContent = await readFile(change.backupPath, 'utf-8');
        await writeFile(change.file, backupContent, 'utf-8');
        await this.updateChangeRecord(diffId, { isApplied: false });
        console.log(`[FileWriter] Toggled OFF - restored original for ${change.file}`);
        return { success: true, isApplied: false };
      } else {
        // Currently showing original, re-apply changes
        await writeFile(change.file, change.modifiedCode, 'utf-8');
        await this.updateChangeRecord(diffId, { isApplied: true });
        console.log(`[FileWriter] Toggled ON - re-applied changes for ${change.file}`);
        return { success: true, isApplied: true };
      }
    } catch (error) {
      console.error('[FileWriter] Error toggling changes:', error);
      return { success: false, isApplied: false };
    }
  }

  /**
   * Get current applied state for a diff
   */
  async getAppliedState(diffId: string): Promise<boolean> {
    const change = await this.getChange(diffId);
    return change?.isApplied ?? false;
  }

  /**
   * Delete backup file and remove from history.
   * Called when user accepts changes (keeps file as-is, removes backup).
   */
  async deleteBackup(diffId: string): Promise<boolean> {
    try {
      const change = await this.getChange(diffId);
      if (!change) return false;

      // Delete backup file
      try {
        await unlink(change.backupPath);
        console.log(`[FileWriter] Deleted backup: ${change.backupPath}`);
      } catch {
        // Backup file may not exist, that's ok
      }

      // Remove from history
      await this.removeChangeRecord(diffId);
      return true;
    } catch (error) {
      console.error('[FileWriter] Error deleting backup:', error);
      return false;
    }
  }

  private async recordChange(change: ChangeRecord): Promise<void> {
    const historyFile = path.join(this.backupDir, 'history.json');
    let history: ChangeRecord[] = [];

    try {
      const content = await readFile(historyFile, 'utf-8');
      history = JSON.parse(content);
    } catch {
      // File doesn't exist yet
    }

    history.push(change);
    await mkdir(path.dirname(historyFile), { recursive: true });
    await writeFile(historyFile, JSON.stringify(history, null, 2));
  }

  private async updateChangeRecord(diffId: string, updates: Partial<ChangeRecord>): Promise<void> {
    try {
      const historyFile = path.join(this.backupDir, 'history.json');
      const content = await readFile(historyFile, 'utf-8');
      let history: ChangeRecord[] = JSON.parse(content);

      history = history.map((c) => (c.diffId === diffId ? { ...c, ...updates } : c));
      await writeFile(historyFile, JSON.stringify(history, null, 2));
    } catch {
      // History file may not exist
    }
  }

  private async getChange(diffId: string): Promise<ChangeRecord | null> {
    try {
      const historyFile = path.join(this.backupDir, 'history.json');
      const content = await readFile(historyFile, 'utf-8');
      const history: ChangeRecord[] = JSON.parse(content);
      return history.find((c) => c.diffId === diffId) || null;
    } catch {
      return null;
    }
  }

  /**
   * Remove a change record from history.
   */
  private async removeChangeRecord(diffId: string): Promise<void> {
    try {
      const historyFile = path.join(this.backupDir, 'history.json');
      const content = await readFile(historyFile, 'utf-8');
      let history: ChangeRecord[] = JSON.parse(content);

      history = history.filter((c) => c.diffId !== diffId);
      await writeFile(historyFile, JSON.stringify(history, null, 2));
    } catch {
      // History file may not exist
    }
  }
}
