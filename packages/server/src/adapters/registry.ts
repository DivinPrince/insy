import type { CLIToolAdapter } from './interface.js';

export class AdapterRegistry {
  private adapters = new Map<string, CLIToolAdapter>();

  register(adapter: CLIToolAdapter): void {
    this.adapters.set(adapter.name.toLowerCase(), adapter);
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

  get(name: string): CLIToolAdapter | undefined {
    return this.adapters.get(name.toLowerCase());
  }

  getAll(): CLIToolAdapter[] {
    return Array.from(this.adapters.values());
  }

  async getFirst(): Promise<CLIToolAdapter | undefined> {
    const available = await this.detectAvailable();
    return available[0];
  }
}
