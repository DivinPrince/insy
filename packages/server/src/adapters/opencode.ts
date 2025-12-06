import { createOpencode, createOpencodeClient } from '@opencode-ai/sdk';
import type { CLIToolAdapter, RunOptions, ModelInfo } from './interface.js';

/**
 * Custom error class for OpenCode errors
 */
export class OpenCodeError extends Error {
  constructor(
    message: string,
    public readonly errorName: string,
    public readonly providerID?: string
  ) {
    super(message);
    this.name = 'OpenCodeError';
  }
}

export interface OpenCodeConfig {
  session?: string;
  model?: string;
}

type OpencodeClient = Awaited<ReturnType<typeof createOpencodeClient>>;
type OpencodeInstance = Awaited<ReturnType<typeof createOpencode>>;

const OPENCODE_PORT = 7878;

export class OpenCodeAdapter implements CLIToolAdapter {
  name = 'OpenCode';

  private client: OpencodeClient | null = null;
  private serverInstance: OpencodeInstance | null = null;

  constructor(private config: OpenCodeConfig = {}) {}

  /**
   * Lazily initialize the client - try connecting to existing server first,
   * then start a new one if needed
   */
  private async ensureClient(): Promise<OpencodeClient> {
    if (this.client) return this.client;

    const baseUrl = `http://localhost:${OPENCODE_PORT}`;

    try {
      // Try connecting to existing server first
      this.client = createOpencodeClient({ baseUrl });
      // Test connection by fetching config
      await this.client.config.get();
      console.log(`[OpenCode] Connected to existing server at ${baseUrl}`);
    } catch {
      // No server running, start one
      console.log('[OpenCode] No server found, starting new instance...');
      this.serverInstance = await createOpencode({
        port: OPENCODE_PORT,
      });
      this.client = this.serverInstance.client;
      console.log(`[OpenCode] Server started at ${this.serverInstance.server.url}`);
    }

    return this.client;
  }

  async isAvailable(): Promise<boolean> {
    try {
      await this.ensureClient();
      return true;
    } catch (error) {
      console.warn('[OpenCode] Not available:', error);
      return false;
    }
  }

  async getVersion(): Promise<string> {
    // SDK doesn't expose version directly
    return 'sdk';
  }

  async getAvailableModels(): Promise<ModelInfo[]> {
    try {
      const client = await this.ensureClient();
      const result = await client.config.providers();

      const models: ModelInfo[] = [];

      // Handle both response styles (fields vs data)
      const providers = (result as any).providers || (result as any).data?.providers || [];

      for (const provider of providers) {
        const providerModels = provider.models || [];
        for (const model of providerModels) {
          models.push({
            id: `${provider.id}/${model.id}`,
            name: model.name || model.id,
            provider: provider.id,
          });
        }
      }

      if (models.length === 0) {
        return [{ id: 'default', name: 'Default Model' }];
      }

      return models;
    } catch (error) {
      console.warn('[OpenCode] Failed to fetch models:', error);
      return [{ id: 'default', name: 'Default Model' }];
    }
  }

  async run(prompt: string, options?: RunOptions): Promise<string> {
    const client = await this.ensureClient();

    // Create a new session for this chat
    const sessionTitle = options?.session || this.config.session || `insy-${Date.now()}`;
    console.log(`[OpenCode] Creating session: ${sessionTitle}`);

    try {
      const sessionResult = await client.session.create({
        body: { title: sessionTitle },
      });

      // Handle both response styles
      const session = (sessionResult as any).data || sessionResult;

      if (!session?.id) {
        throw new Error('Failed to create session - no session ID returned');
      }

      // Build model config if specified
      const modelStr = options?.model || this.config.model;
      let modelConfig: { providerID: string; modelID: string } | undefined;

      if (modelStr && modelStr.includes('/')) {
        const [providerID, modelID] = modelStr.split('/');
        modelConfig = { providerID, modelID };
      }

      console.log('[OpenCode] Sending prompt...');

      // Send prompt and get response
      const response = await client.session.prompt({
        path: { id: session.id },
        body: {
          model: modelConfig,
          parts: [{ type: 'text', text: prompt }],
        },
      });

      // Handle both response styles
      const responseData = (response as any).data || response;

      // Extract text from response parts
      let fullText = '';
      const parts = responseData?.parts || [];

      for (const part of parts) {
        if (part.type === 'text' && part.text) {
          fullText += part.text;
        }
      }

      console.log(`[OpenCode] Received ${fullText.length} characters`);

      if (!fullText) {
        console.warn('[OpenCode] No text content in response:', JSON.stringify(responseData));
      }

      return fullText;
    } catch (error) {
      console.error('[OpenCode] Error during run:', error);

      // Try to extract error details
      const err = error as any;
      const errorName = err.name || 'UnknownError';
      const errorMessage = err.message || 'An unknown error occurred';
      const providerID = err.providerID;

      throw new OpenCodeError(errorMessage, errorName, providerID);
    }
  }
}
