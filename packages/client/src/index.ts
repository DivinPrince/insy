import { render, h } from 'preact';
import { WSClient } from './ws/client';
import { ElementSelector } from './core/selector';
import { detectFramework, captureFrameworkContext } from './frameworks/detector';
import { extractSourceHints } from './core/capture';
import { WidgetButton } from './ui/widget-button';
import { QuickEdit } from './ui/quick-edit';
import type { DiffPreview } from './ui/quick-edit';
import type {
  ElementInfo,
  Framework,
  FrameworkContext,
  StatusUpdatePayload,
  MultiDiffGeneratedPayload,
  DiffAppliedPayload,
  FileAttachment,
} from '@insy/shared';

// Declare globals injected by framework plugins
declare global {
  interface Window {
    __INSY_PROJECT_ROOT__?: string;
    __INSY_SERVER_PORT__?: number;
    __PIXELCODE_CONFIG__?: {
      projectPath?: string;
      host?: string;
      port?: number;
      projectName?: string;
    };
  }
  var __INSY_PROJECT_ROOT__: string | undefined;
  var __INSY_SERVER_PORT__: number | undefined;
}

// Simple ID generator
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Get project root from injected globals
 * Priority: 1. __INSY_PROJECT_ROOT__ (from framework plugins)
 *           2. __PIXELCODE_CONFIG__.projectPath (from server-injected client.js)
 */
function getProjectRoot(): string {
  // Try framework plugin global first
  if (typeof __INSY_PROJECT_ROOT__ !== 'undefined' && __INSY_PROJECT_ROOT__) {
    return __INSY_PROJECT_ROOT__;
  }

  // Try window global (for bundlers that scope differently)
  if (typeof window !== 'undefined' && window.__INSY_PROJECT_ROOT__) {
    return window.__INSY_PROJECT_ROOT__;
  }

  // Fallback to legacy config
  if (typeof window !== 'undefined' && window.__PIXELCODE_CONFIG__?.projectPath) {
    return window.__PIXELCODE_CONFIG__.projectPath;
  }

  return '';
}

/**
 * Get server port from injected globals
 */
function getServerPort(): number {
  if (typeof __INSY_SERVER_PORT__ !== 'undefined') {
    return __INSY_SERVER_PORT__;
  }
  if (typeof window !== 'undefined' && window.__INSY_SERVER_PORT__) {
    return window.__INSY_SERVER_PORT__;
  }
  if (typeof window !== 'undefined' && window.__PIXELCODE_CONFIG__?.port) {
    return window.__PIXELCODE_CONFIG__.port;
  }
  return 7777;
}

interface QuickEditInstance {
  id: string;
  targetElement: HTMLElement;
  elementInfo: ElementInfo;
  framework: Framework;
  frameworkContext?: FrameworkContext;
  sourceHints: ReturnType<typeof extractSourceHints>;
  container: HTMLElement;
  shadowRoot: ShadowRoot;
  state: 'prompt' | 'loading' | 'changes';
  diffs?: DiffPreview[];
  statusMessage?: string;
}

class InsyClient {
  private ws: WSClient;
  private selector: ElementSelector;
  private isConnected = false;
  private isSelectorActive = false;
  private quickEditInstances = new Map<string, QuickEditInstance>();
  private buttonContainer: HTMLDivElement | null = null;
  private buttonShadowRoot: ShadowRoot | null = null;
  private readonly MAX_INSTANCES = 5;
  private projectPath: string = '';

  constructor() {
    // Get server config from injected globals
    const port = getServerPort();
    const config = window.__PIXELCODE_CONFIG__ || {};
    const host = config.host || 'localhost';
    const baseUrl = `http://${host}:${port}`;

    this.ws = new WSClient(baseUrl);
    this.selector = new ElementSelector();

    // Get project path from framework plugin or legacy config
    this.projectPath = getProjectRoot();

    this.setupEventHandlers();
    this.setupKeyboardShortcut();

    console.log(`[Insy] Connecting to ${baseUrl}`);
    if (this.projectPath) {
      console.log(`[Insy] Project root: ${this.projectPath}`);
    }
  }

  async init(): Promise<void> {
    try {
      await this.ws.connect();
      this.isConnected = true;
      this.renderButton();
      console.log('✅ Insy connected');
    } catch (error) {
      console.error('❌ Failed to connect:', error);
      this.isConnected = false;
      this.renderButton();
    }
  }

  private setupKeyboardShortcut(): void {
    document.addEventListener('keydown', (e) => {
      // Use Alt+Q for element selection (less likely to conflict)
      if (e.altKey && e.key === 'q' && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
        e.preventDefault();
        this.toggleQuickEdit();
      }
    });
  }

  private setupEventHandlers(): void {
    // Status updates during AI processing
    this.ws.on<StatusUpdatePayload>('status', (payload) => {
      this.handleStatusUpdate(payload);
    });

    // Diff generated (multi-file)
    this.ws.on<MultiDiffGeneratedPayload>('diff', (payload) => {
      this.handleMultiDiffGenerated(payload);
    });

    // Diff applied
    this.ws.on<DiffAppliedPayload>('applied', (payload) => {
      this.handleDiffApplied(payload);
    });

    // Diff undone
    this.ws.on<{ diffId: string; success: boolean }>('undone', (payload) => {
      this.handleDiffUndone(payload);
    });

    // Error handling
    this.ws.on<{ code: string; message: string }>('error', (payload) => {
      console.error(`[Insy] Error: ${payload.code} - ${payload.message}`);

      // Find instances in loading state and reset them on error
      this.quickEditInstances.forEach((instance) => {
        if (instance.state === 'loading') {
          instance.state = 'prompt';
          instance.statusMessage = `Error: ${payload.message}`;
          this.renderQuickEdit(instance);
        }
      });
    });
  }

  private handleStatusUpdate(payload: StatusUpdatePayload): void {
    const { instanceId, stage, message: statusMessage } = payload;
    if (!instanceId) return;

    const instance = this.quickEditInstances.get(instanceId);
    if (!instance) return;

    instance.statusMessage = statusMessage;
    if (stage === 'ai_processing' || stage === 'generating_diff') {
      instance.state = 'loading';
    }

    this.renderQuickEdit(instance);
  }

  private handleMultiDiffGenerated(payload: MultiDiffGeneratedPayload): void {
    const { instanceId, diffs } = payload;
    if (!instanceId) return;

    const instance = this.quickEditInstances.get(instanceId);
    if (!instance) return;

    const diffPreviews: DiffPreview[] = diffs.map((d) => ({
      file: d.file,
      before: d.preview.before,
      after: d.preview.after,
      diffId: d.diffId,
      action: d.action,
    }));

    instance.state = 'changes';
    instance.diffs = diffPreviews;
    this.renderQuickEdit(instance);
  }

  private handleDiffApplied(payload: DiffAppliedPayload): void {
    const { success, file } = payload;
    if (success) {
      console.log(`✅ Applied changes to ${file}`);
    } else {
      console.error(`❌ Failed to apply changes to ${file}`);
    }
  }

  private handleDiffUndone(payload: { diffId: string; success: boolean }): void {
    if (payload.success) {
      console.log(`↩️ Undid changes for diff ${payload.diffId}`);
    } else {
      console.error(`❌ Failed to undo changes for diff ${payload.diffId}`);
    }
  }

  private toggleQuickEdit(): void {
    if (this.isSelectorActive) {
      // Deactivate selector
      this.selector.deactivate();
      this.isSelectorActive = false;
      this.renderButton();
    } else {
      // Activate selector
      this.launchQuickEdit();
    }
  }

  private launchQuickEdit(): void {
    if (this.quickEditInstances.size >= this.MAX_INSTANCES) {
      console.warn(`Maximum ${this.MAX_INSTANCES} QuickEdit instances reached`);
      return;
    }

    this.isSelectorActive = true;
    this.renderButton();

    this.selector.activate((element, info) => {
      this.isSelectorActive = false;
      this.renderButton();
      this.createQuickEditInstance(element, info);
    });
  }

  private async createQuickEditInstance(
    targetElement: HTMLElement,
    elementInfo: ElementInfo
  ): Promise<void> {
    const instanceId = generateId();

    // Get framework context (async for proper source file detection via bippy)
    const framework = detectFramework();
    const frameworkContext = await captureFrameworkContext(targetElement, framework);
    const sourceHints = extractSourceHints(targetElement);

    // Calculate position
    const rect = targetElement.getBoundingClientRect();
    let top = rect.bottom + window.scrollY + 8;
    let left = rect.left + window.scrollX;

    if (left + 300 > window.innerWidth) {
      left = window.innerWidth - 300 - 16;
    }

    // Create container with shadow DOM
    const host = document.createElement('div');
    host.id = `insy-qe-${instanceId}`;
    host.setAttribute('data-insy', 'true');
    host.style.position = 'absolute';
    host.style.top = `${top}px`;
    host.style.left = `${left}px`;
    host.style.zIndex = '999996';
    document.body.appendChild(host);

    const shadowRoot = host.attachShadow({ mode: 'open' });
    const container = document.createElement('div');
    shadowRoot.appendChild(this.createBaseStyles());
    shadowRoot.appendChild(container);

    // Create instance - store element context for prompt submission
    const instance: QuickEditInstance = {
      id: instanceId,
      targetElement,
      elementInfo,
      framework,
      frameworkContext,
      sourceHints,
      container: host,
      shadowRoot,
      state: 'prompt',
      diffs: undefined,
      statusMessage: undefined,
    };

    this.quickEditInstances.set(instanceId, instance);
    this.renderQuickEdit(instance);

    // Setup scroll tracking
    if (this.quickEditInstances.size === 1) {
      this.setupScrollTracking();
    }
  }

  private renderQuickEdit(instance: QuickEditInstance): void {
    const container = instance.shadowRoot.querySelector('div');
    if (!container) return;

    render(
      h(QuickEdit, {
        instanceId: instance.id,
        targetElement: instance.targetElement,
        elementInfo: instance.elementInfo,
        frameworkContext: instance.frameworkContext,
        state: instance.state,
        statusMessage: instance.statusMessage,
        diffs: instance.diffs,
        onSubmit: (instanceId: string, prompt: string, attachments?: FileAttachment[]) => {
          this.handlePromptSubmit(instanceId, prompt, attachments);
        },
        onClose: () => {
          this.destroyQuickEditInstance(instance.id);
        },
        onCompact: () => {
          // Handled by component
        },
        onAcceptChanges: (instanceId: string, diffIds: string[]) => {
          this.handleAcceptChanges(instanceId, diffIds);
        },
        onRejectChanges: (instanceId: string) => {
          this.handleRejectChanges(instanceId);
        },
        onTogglePreview: (instanceId: string, diffId: string) => {
          this.handleTogglePreview(instanceId, diffId);
        },
        onToggleAllPreviews: (instanceId: string, diffIds: string[]) => {
          this.handleToggleAllPreviews(instanceId, diffIds);
        },
      }),
      container
    );
  }

  private handlePromptSubmit(
    instanceId: string,
    prompt: string,
    attachments?: FileAttachment[]
  ): void {
    const instance = this.quickEditInstances.get(instanceId);
    if (!instance) return;

    instance.state = 'loading';
    instance.statusMessage = 'Sending request...';
    this.renderQuickEdit(instance);

    // Submit prompt via WebSocket
    this.ws.submitPrompt({
      instanceId,
      prompt,
      sessionId: instanceId,
      conversationHistory: [],
      projectPath: this.projectPath,
      attachments,
      // Element context
      element: instance.elementInfo,
      framework: instance.framework,
      frameworkContext: instance.frameworkContext,
      sourceHints: instance.sourceHints,
    });
  }

  private handleAcceptChanges(instanceId: string, diffIds: string[]): void {
    const instance = this.quickEditInstances.get(instanceId);
    if (!instance || !instance.diffs) return;

    // Send accept for each diff ID via WebSocket
    diffIds.forEach((diffId) => {
      this.ws.approveDiff({
        diffId: diffId,
        action: 'accept',
      });
    });

    console.log('✅ Accepted changes');
    this.destroyQuickEditInstance(instanceId);
  }

  private handleRejectChanges(instanceId: string): void {
    const instance = this.quickEditInstances.get(instanceId);
    if (!instance || !instance.diffs) return;

    // Send rejection for each diff ID via WebSocket
    instance.diffs.forEach((diff) => {
      this.ws.approveDiff({
        diffId: diff.diffId,
        action: 'reject',
      });
    });

    this.destroyQuickEditInstance(instanceId);
  }

  private handleTogglePreview(instanceId: string, diffId: string): void {
    const instance = this.quickEditInstances.get(instanceId);
    if (!instance) return;

    // Call toggle via WebSocket
    this.ws.toggleDiff(diffId);
  }

  private handleToggleAllPreviews(instanceId: string, diffIds: string[]): void {
    const instance = this.quickEditInstances.get(instanceId);
    if (!instance) return;

    // Toggle all diffs
    console.log(`[Insy] Toggling all ${diffIds.length} previews...`);
    diffIds.forEach((diffId) => {
      this.ws.toggleDiff(diffId);
    });
  }

  private destroyQuickEditInstance(instanceId: string): void {
    const instance = this.quickEditInstances.get(instanceId);
    if (!instance) return;

    instance.container.remove();
    this.quickEditInstances.delete(instanceId);

    if (this.quickEditInstances.size === 0) {
      this.removeScrollTracking();
    }
  }

  private scrollHandler: (() => void) | null = null;

  private setupScrollTracking(): void {
    if (this.scrollHandler) return;

    this.scrollHandler = () => {
      this.quickEditInstances.forEach((instance) => {
        const rect = instance.targetElement.getBoundingClientRect();
        let top = rect.bottom + window.scrollY + 8;
        let left = rect.left + window.scrollX;

        if (left + 300 > window.innerWidth) {
          left = window.innerWidth - 300 - 16;
        }

        instance.container.style.top = `${top}px`;
        instance.container.style.left = `${left}px`;
      });
    };

    window.addEventListener('scroll', this.scrollHandler, true);
    window.addEventListener('resize', this.scrollHandler);
  }

  private removeScrollTracking(): void {
    if (!this.scrollHandler) return;

    window.removeEventListener('scroll', this.scrollHandler, true);
    window.removeEventListener('resize', this.scrollHandler);
    this.scrollHandler = null;
  }

  private renderButton(): void {
    if (!this.buttonContainer) {
      const host = document.createElement('div');
      host.id = 'insy-button';
      host.setAttribute('data-insy', 'true');
      document.body.appendChild(host);

      this.buttonShadowRoot = host.attachShadow({ mode: 'open' });
      this.buttonContainer = document.createElement('div');
      this.buttonShadowRoot.appendChild(this.createBaseStyles());
      this.buttonShadowRoot.appendChild(this.buttonContainer);
    }

    render(
      h(WidgetButton, {
        connected: this.isConnected,
        active: this.isSelectorActive,
        onClick: () => {
          this.toggleQuickEdit();
        },
        position: { x: 20, y: 20 },
      }),
      this.buttonContainer
    );
  }

  private createBaseStyles(): HTMLStyleElement {
    const style = document.createElement('style');
    style.textContent = `
      * {
        box-sizing: border-box;
      }
      :host {
        all: initial;
      }
    `;
    return style;
  }
}

// Auto-initialize
if (typeof window !== 'undefined') {
  const client = new InsyClient();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      client.init();
    });
  } else {
    client.init();
  }
}

export default InsyClient;
