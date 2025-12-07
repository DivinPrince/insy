// CLI Tool Adapter Interface
// This allows Insy to work with different CLI tools (OpenCode, Claude Code, etc.)

// Local type for adapter module (not exported from shared anymore)
export interface ModelInfo {
  id: string;
  name: string;
  provider?: string;
}

// File attachment for images
export interface FileAttachment {
  type: 'image';
  mime: string; // e.g., 'image/png', 'image/jpeg', 'image/gif', 'image/webp'
  filename?: string;
  url: string; // base64 data URL
}

export interface CLIToolAdapter {
  name: string;

  // Check if CLI tool is available on the system
  isAvailable(): Promise<boolean>;

  // Execute the tool with a prompt
  run(prompt: string, options?: RunOptions): Promise<string>;

  // Optional: Get tool version
  getVersion?(): Promise<string>;

  // Optional: Get available models for this tool
  getAvailableModels?(): Promise<ModelInfo[]>;
}

export interface RunOptions {
  session?: string; // Session ID for maintaining context
  model?: string; // Specific AI model to use
  format?: string; // Output format (json, text, etc.)
  file?: string[]; // Files to attach to the request
  cwd?: string; // Working directory
  continueSession?: boolean; // Continue from last message in session
  attachments?: FileAttachment[]; // Image attachments
}

export interface CLIToolConfig {
  // Tool-specific configuration
  [key: string]: unknown;
}
