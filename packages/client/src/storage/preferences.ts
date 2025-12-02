import type { WidgetPreferences, RecentEdit } from '@pixelcode/shared';

const STORAGE_PREFIX = 'pixelcode_';

export class PreferencesStore {
  private static get<T>(key: string, defaultValue: T): T {
    try {
      const item = localStorage.getItem(STORAGE_PREFIX + key);
      return item ? JSON.parse(item) : defaultValue;
    } catch {
      return defaultValue;
    }
  }

  private static set<T>(key: string, value: T): void {
    try {
      localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(value));
    } catch (error) {
      console.warn('[PreferencesStore] Failed to save to localStorage:', error);
    }
  }

  // Widget preferences
  static getWidgetPreferences(): WidgetPreferences {
    return this.get<WidgetPreferences>('widget', {
      position: { x: 20, y: 20 }, // 20px from bottom-right
      expanded: false,
      visible: true,
    });
  }

  static setWidgetPreferences(prefs: Partial<WidgetPreferences>): void {
    const current = this.getWidgetPreferences();
    this.set('widget', { ...current, ...prefs });
  }

  // Recent edits
  static getRecentEdits(): RecentEdit[] {
    return this.get<RecentEdit[]>('recent_edits', []);
  }

  static addRecentEdit(edit: RecentEdit): void {
    const edits = this.getRecentEdits();
    edits.unshift(edit);
    // Keep only last 10
    if (edits.length > 10) {
      edits.pop();
    }
    this.set('recent_edits', edits);
  }

  static clearRecentEdits(): void {
    this.set('recent_edits', []);
  }
}
