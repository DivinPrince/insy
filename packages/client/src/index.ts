import { render, h } from 'preact';
import { WebSocketClient } from './websocket/client';
import { ElementSelector } from './core/selector';
import { detectFramework, captureFrameworkContext } from './frameworks/detector';
import { extractSourceHints } from './core/capture';
import { WidgetButton } from './ui/widget-button';
import { QuickEdit } from './ui/quick-edit';
import type { DiffPreview } from './ui/quick-edit';
import type {
  Message,
  ElementInfo,
  ElementContext,
  FrameworkContext,
  StatusUpdatePayload,
  DiffGeneratedPayload,
  MultiDiffGeneratedPayload,
  DiffAppliedPayload,
  ToolsListPayload,
  ModelsListPayload,
  ModelInfo,
  ToolInfo
} from '@pixelcode/shared';

// Simple ID generator
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

interface QuickEditInstance {
  id: string;
  targetElement: HTMLElement;
  elementInfo: ElementInfo;
  frameworkContext?: FrameworkContext;
  container: HTMLElement;
  shadowRoot: ShadowRoot;
  state: 'prompt' | 'loading' | 'changes';
  diffs?: DiffPreview[];
  statusMessage?: string;
}

class InsyClient {
  private ws: WebSocketClient;
  private selector: ElementSelector;
  private isConnected = false;
  private isSelectorActive = false;
  private quickEditInstances = new Map<string, QuickEditInstance>();
  private buttonContainer: HTMLDivElement | null = null;
  private buttonShadowRoot: ShadowRoot | null = null;
  private readonly MAX_INSTANCES = 5;
  
  // Tool & Model state
  private availableTools: ToolInfo[] = [];
  private selectedTool: string = '';
  private availableModels: ModelInfo[] = [];
  private selectedModel: string = '';
  private projectPath: string = '';

  constructor() {
    // Get config from injected global or use defaults
    const config = (window as any).__PIXELCODE_CONFIG__ || {};
    const host = config.host || 'localhost';
    const port = config.port || 7777;
    const wsUrl = `ws://${host}:${port}`;
    
    this.ws = new WebSocketClient(wsUrl);
    this.selector = new ElementSelector();
    
    // Get project path from config
    this.projectPath = config.projectPath || '';
    
    this.setupMessageHandlers();
    this.setupKeyboardShortcut();
    
    console.log(`[Insy] Connecting to ${wsUrl}`);
  }

  async init(): Promise<void> {
    try {
      await this.ws.connect();
      this.isConnected = true;
      this.renderButton();
      this.requestTools();
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

  private setupMessageHandlers(): void {
    this.ws.on((message: Message) => {
      const { type, payload } = message;

      switch (type) {
        case 'status:update':
          this.handleStatusUpdate(payload as StatusUpdatePayload);
          break;
        case 'diff:generated':
          this.handleDiffGenerated(payload as DiffGeneratedPayload);
          break;
        case 'multi_diff:generated':
          this.handleMultiDiffGenerated(payload as MultiDiffGeneratedPayload);
          break;
        case 'diff:applied':
          this.handleDiffApplied(payload as DiffAppliedPayload);
          break;
        case 'diff:undone':
          this.handleDiffUndone(payload as { diffId: string; success: boolean });
          break;
        case 'tools:list:response':
          this.handleToolsList(payload as ToolsListPayload);
          break;
        case 'models:list:response':
          this.handleModelsList(payload as ModelsListPayload);
          break;
      }
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

  private handleDiffGenerated(payload: DiffGeneratedPayload): void {
    const { instanceId, diffId, file, preview } = payload;
    if (!instanceId) return;

    const instance = this.quickEditInstances.get(instanceId);
    if (!instance) return;

    const diffPreview: DiffPreview = {
      file,
      before: preview.before,
      after: preview.after,
      diffId
    };

    instance.state = 'changes';
    instance.diffs = [diffPreview];
    this.renderQuickEdit(instance);
  }

  private handleMultiDiffGenerated(payload: MultiDiffGeneratedPayload): void {
    const { instanceId, diffs } = payload;
    if (!instanceId) return;

    const instance = this.quickEditInstances.get(instanceId);
    if (!instance) return;

    const diffPreviews: DiffPreview[] = diffs.map(d => ({
      file: d.file,
      before: d.preview.before,
      after: d.preview.after,
      diffId: d.diffId,
      action: d.action
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

  private createQuickEditInstance(targetElement: HTMLElement, elementInfo: ElementInfo): void {
    const instanceId = generateId();
    
    // Get framework context
    const framework = detectFramework();
    const frameworkContext = captureFrameworkContext(targetElement, framework);
    const sourceHints = extractSourceHints(targetElement);

    // Send element:select message to server
    const elementContext: ElementContext = {
      element: elementInfo,
      framework,
      frameworkContext,
      sourceHints
    };

    this.ws.send(this.createMessage('element:select', {
      ...elementContext,
      elementId: instanceId,
      projectPath: this.projectPath
    }));

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

    // Create instance
    const instance: QuickEditInstance = {
      id: instanceId,
      targetElement,
      elementInfo,
      frameworkContext,
      container: host,
      shadowRoot,
      state: 'prompt',
      diffs: undefined,
      statusMessage: undefined
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
        models: this.availableModels,
        selectedModel: this.selectedModel,
        onModelChange: (modelId) => {
          this.handleModelChange(modelId);
        },
        onSubmit: (instanceId: string, prompt: string) => {
          this.handlePromptSubmit(instanceId, prompt);
        },
        onClose: () => {
          this.destroyQuickEditInstance(instance.id);
        },
        onCompact: () => {
          // Handled by component
        },
        onToggleChanges: (instanceId: string, diffIds: string[], apply: boolean) => {
          this.handleToggleChanges(instanceId, diffIds, apply);
        },
        onAcceptChanges: (instanceId: string, diffIds: string[]) => {
          this.handleAcceptChanges(instanceId, diffIds);
        },
        onRejectChanges: (instanceId: string) => {
          this.handleRejectChanges(instanceId);
        }
      }),
      container
    );
  }

  private handlePromptSubmit(instanceId: string, prompt: string): void {
    const instance = this.quickEditInstances.get(instanceId);
    if (!instance) return;

    instance.state = 'loading';
    instance.statusMessage = 'Sending request...';
    this.renderQuickEdit(instance);

    this.ws.send(this.createMessage('prompt:submit', {
      elementId: instanceId,
      prompt,
      mode: 'preview',
      tool: this.selectedTool || undefined,
      model: this.selectedModel || undefined,
      sessionId: instanceId,
      conversationHistory: [],
      projectPath: this.projectPath,
      instanceId
    }));
  }

  private handleToggleChanges(instanceId: string, diffIds: string[], apply: boolean): void {
    const instance = this.quickEditInstances.get(instanceId);
    if (!instance || !instance.diffs) return;

    if (apply) {
      // Apply changes - this creates backups automatically
      diffIds.forEach(diffId => {
        this.ws.send(this.createMessage('diff:approve', {
          diffId: diffId,
          action: 'apply'
        }));
      });
      
      console.log('👁️ Applied changes (backup created)');
    } else {
      // Undo changes - restore from backup
      diffIds.forEach(diffId => {
        this.ws.send(this.createMessage('diff:undo', {
          diffId: diffId
        }));
      });
      
      console.log('👁️ Undoing changes (restoring from backup)');
    }
  }

  private handleAcceptChanges(instanceId: string, diffIds: string[]): void {
    const instance = this.quickEditInstances.get(instanceId);
    if (!instance || !instance.diffs) return;

    // Send approval for each diff ID provided
    diffIds.forEach(diffId => {
      this.ws.send(this.createMessage('diff:approve', {
        diffId: diffId,
        action: 'apply'
      }));
    });

    // Don't destroy immediately - let page refresh handle cleanup
    // or user can continue editing
  }

  private handleRejectChanges(instanceId: string): void {
    const instance = this.quickEditInstances.get(instanceId);
    if (!instance || !instance.diffs) return;

    // Send rejection for each diff ID
    instance.diffs.forEach(diff => {
      this.ws.send(this.createMessage('diff:approve', {
        diffId: diff.diffId,
        action: 'reject'
      }));
    });

    this.destroyQuickEditInstance(instanceId);
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
      this.quickEditInstances.forEach(instance => {
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

  private createMessage(type: string, payload: any): Message {
    return {
      id: generateId(),
      type,
      payload,
      timestamp: Date.now()
    };
  }

  private requestTools(): void {
    this.ws.send(this.createMessage('tools:list', {}));
  }

  private requestModels(toolIdentifier: string): void {
    this.ws.send(this.createMessage('models:list', { tool: toolIdentifier }));
  }

  private handleToolsList(payload: ToolsListPayload): void {
    this.availableTools = payload.tools;
    
    if (!this.selectedTool && payload.tools.length > 0) {
      this.selectedTool = payload.tools[0].identifier;
      this.requestModels(this.selectedTool);
    }
  }

  private handleModelsList(payload: ModelsListPayload): void {
    this.availableModels = payload.models;
    
    if (!this.selectedModel && payload.models.length > 0) {
      this.selectedModel = payload.models[0].id;
    }
  }

  private handleModelChange(modelId: string): void {
    this.selectedModel = modelId;
    // Re-render all instances with new model
    this.quickEditInstances.forEach(instance => {
      this.renderQuickEdit(instance);
    });
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
