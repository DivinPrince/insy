import { readFile, writeFile, mkdir } from 'fs/promises';
import path from 'path';
import type { DiffResult } from '@pixelcode/shared';

interface ChangeRecord {
  diffId: string;
  file: string;
  backupPath: string;
  timestamp: number;
}

export class FileWriter {
  private backupDir: string;

  constructor(private projectRoot: string) {
    this.backupDir = path.join(projectRoot, '.pixelcode', 'backups');
  }

  async applyDiff(diff: DiffResult): Promise<{ success: boolean; backupPath?: string; error?: string }> {
    try {
      // Read current content
      const currentContent = await readFile(diff.file, 'utf-8');

      // Create backup
      const backupPath = await this.createBackup(diff.file, currentContent);

      // Write modified code
      await writeFile(diff.file, diff.modifiedCode, 'utf-8');

      // Record change
      await this.recordChange({
        diffId: diff.id,
        file: diff.file,
        backupPath,
        timestamp: Date.now(),
      });

      console.log(`[FileWriter] Applied changes to ${diff.file}`);
      return { success: true, backupPath };
    } catch (error) {
      console.error('[FileWriter] Error applying diff:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
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
}
