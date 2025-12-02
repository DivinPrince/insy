import type { CLIToolAdapter } from './interface.js';
import { OpenCodeCLIAdapter } from './opencode-cli.js';

export class AdapterRegistry {
  private adapters = new Map<string, CLIToolAdapter>();
  private priorityOrder = ['opencode'];

  register(adapter: CLIToolAdapter): void {
    this.adapters.set(adapter.name.toLowerCase(), adapter);
  }

  /**
   * Register all default adapters
   */
  registerDefaultAdapters(): void {
    this.register(new OpenCodeCLIAdapter());
  }

  async detectAvailable(): Promise<CLIToolAdapter[]> {
    const available: CLIToolAdapter[] = [];

    for (const adapter of this.adapters.values()) {
      try {
        if (await adapter.isAvailable()) {
          available.push(adapter);
        }
      } catch (error) {
        console.warn(`[AdapterRegistry] Error checking ${adapter.name}:`, error);
      }
    }

    return available;
  }

  /**
   * Get available adapters sorted by priority
   * Priority order: OpenCode > Claude Code > Gemini CLI > Copilot CLI
   */
  async getAvailableWithPriority(): Promise<CLIToolAdapter[]> {
    const available = await this.detectAvailable();
    
    return available.sort((a, b) => {
      const aIndex = this.priorityOrder.indexOf(a.name.toLowerCase());
      const bIndex = this.priorityOrder.indexOf(b.name.toLowerCase());
      
      // If adapter not in priority list, put it at the end
      const aPos = aIndex === -1 ? this.priorityOrder.length : aIndex;
      const bPos = bIndex === -1 ? this.priorityOrder.length : bIndex;
      
      return aPos - bPos;
    });
  }

  get(name: string): CLIToolAdapter | undefined {
    return this.adapters.get(name.toLowerCase());
  }

  getAll(): CLIToolAdapter[] {
    return Array.from(this.adapters.values());
  }

  /**
   * Get the first available adapter (based on priority)
   */
  async getFirst(): Promise<CLIToolAdapter | undefined> {
    const available = await this.getAvailableWithPriority();
    return available[0];
  }

  /**
   * Get adapter by name or first available
   */
  async getAdapter(name?: string): Promise<CLIToolAdapter | undefined> {
    if (name) {
      const adapter = this.get(name);
      if (adapter && await adapter.isAvailable()) {
        return adapter;
      }
      console.warn(`[AdapterRegistry] Adapter '${name}' not found or not available`);
    }
    return this.getFirst();
  }
}
