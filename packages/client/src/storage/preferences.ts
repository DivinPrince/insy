import type { WidgetPreferences, RecentEdit, UserSelections } from '@insy/shared';

const STORAGE_PREFIX = 'insy_';

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

  // User selections (model, tool, etc.)
  static getUserSelections(): UserSelections {
    return this.get<UserSelections>('user_selections', {});
  }

  static setUserSelections(selections: Partial<UserSelections>): void {
    const current = this.getUserSelections();
    this.set('user_selections', { ...current, ...selections });
  }

  static setSelectedModel(modelId: string): void {
    this.setUserSelections({ selectedModel: modelId });
  }

  static setSelectedTool(toolIdentifier: string): void {
    this.setUserSelections({ selectedTool: toolIdentifier });
  }
}
