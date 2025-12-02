import { render } from 'preact';
import { WebSocketClient } from './websocket/client.js';
import { ElementSelector } from './core/selector.js';
import { detectFramework, captureFrameworkContext } from './frameworks/detector.js';
import { captureElement, extractSourceHints } from './core/capture.js';
import { ChatPanel, type ChatState, type ChatMessage, type DiffPreview } from './ui/chat-panel.js';
import { Toast } from './ui/toast.js';
import { WidgetButton } from './ui/widget-button.js';
import { WidgetPanel } from './ui/widget-panel.js';
import { PreferencesStore } from './storage/preferences.js';
import type {
  Message,
  ElementContext,
  ElementInfo,
  StatusUpdatePayload,
  DiffGeneratedPayload,
  ErrorPayload,
  RecentEdit,
  ToolInfo,
  ModelInfo,
  ToolsListPayload,
  ModelsListPayload,
} from '@pixelcode/shared';

// Simple ID generator (crypto.randomUUID not available in browser without polyfill)
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

class PixelCode {
  private ws: WebSocketClient;
  private selector: ElementSelector;
  private isActive = false;
  private isConnected = false;
  private currentElementId: string | null = null;
  private uiContainer: HTMLDivElement;
  private uiShadowRoot: ShadowRoot;
  private widgetContainer: HTMLDivElement;
  private widgetShadowRoot: ShadowRoot;
  private buttonContainer: HTMLDivElement | null = null;
  private buttonShadowRoot: ShadowRoot | null = null;
  private widgetExpanded = false;
  private widgetPosition = { x: 20, y: 20 };
  private recentEdits: RecentEdit[] = [];
  
  // Chat panel state
  private chatState: ChatState = 'prompt';
  private chatMessages: ChatMessage[] = [];
  private chatPosition = { x: 100, y: 100 };
  private currentDiff: DiffPreview | null = null;
  private currentDiffFile: string = '';
  private statusMessage: string = '';
  private statusProgress: number = 0;
  
  // Tool & Model state
  private availableTools: ToolInfo[] = [];
  private selectedTool: string = '';
  private availableModels: ModelInfo[] = [];
  private selectedModel: string = '';

  constructor() {
    // Load preferences
    const prefs = PreferencesStore.getWidgetPreferences();
    this.widgetPosition = prefs.position;
    this.widgetExpanded = prefs.expanded;
    this.recentEdits = PreferencesStore.getRecentEdits();

    // Create UI container with Shadow DOM for style isolation
    const uiHost = document.createElement('div');
    uiHost.setAttribute('data-pixelcode', 'true');
    uiHost.id = 'pixelcode-ui';
    document.body.appendChild(uiHost);
    this.uiShadowRoot = uiHost.attachShadow({ mode: 'open' });
    this.uiContainer = document.createElement('div');
    this.uiContainer.id = 'pixelcode-ui-root';
    this.uiShadowRoot.appendChild(this.createBaseStyles());
    this.uiShadowRoot.appendChild(this.uiContainer);

    // Create widget container with Shadow DOM for style isolation
    const widgetHost = document.createElement('div');
    widgetHost.setAttribute('data-pixelcode', 'true');
    widgetHost.id = 'pixelcode-widget';
    document.body.appendChild(widgetHost);
    this.widgetShadowRoot = widgetHost.attachShadow({ mode: 'open' });
    this.widgetContainer = document.createElement('div');
    this.widgetContainer.id = 'pixelcode-widget-root';
    this.widgetShadowRoot.appendChild(this.createBaseStyles());
    this.widgetShadowRoot.appendChild(this.widgetContainer);

    // Initialize WebSocket
    const wsUrl = this.getWebSocketUrl();
    this.ws = new WebSocketClient(wsUrl);
    
    // Initialize selector
    this.selector = new ElementSelector();

    // Setup message handlers
    this.setupMessageHandlers();

    // Setup keyboard shortcut
    this.setupKeyboardShortcut();

    // Render widget immediately
    this.renderWidget();
  }

  private getWebSocketUrl(): string {
    const host = 'localhost';
    const port = 7777;
    return `ws://${host}:${port}`;
  }

  async init(): Promise<void> {
    try {
      await this.ws.connect();
      this.isConnected = true;
      this.renderWidget(); // Update widget with connection status
      this.showToast('PixelCode connected! Click the button or press ⌘+Shift+E', 'success');
    } catch (error) {
      console.error('[PixelCode] Failed to connect:', error);
      this.isConnected = false;
      this.renderWidget();
      this.showToast('Failed to connect to PixelCode server', 'error');
    }
  }

  private setupKeyboardShortcut(): void {
    document.addEventListener('keydown', (e) => {
      // Cmd/Ctrl + Shift + E (E for Edit)
      // Using E instead of P to avoid browser command palette conflicts
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'e') {
        e.preventDefault();
        e.stopPropagation();
        this.toggle();
      }
    });
  }

  private setupMessageHandlers(): void {
    this.ws.on((message) => {
      switch (message.type) {
        case 'status:update':
          this.handleStatusUpdate(message.payload as StatusUpdatePayload);
          break;
        case 'diff:generated':
          this.handleDiffGenerated(message.payload as DiffGeneratedPayload);
          break;
        case 'diff:applied':
          this.handleDiffApplied();
          break;
        case 'error':
          this.handleError(message.payload as ErrorPayload);
          break;
        case 'tools:list:response':
          this.handleToolsList(message.payload as ToolsListPayload);
          break;
        case 'models:list:response':
          this.handleModelsList(message.payload as ModelsListPayload);
          break;
      }
    });
  }

  private toggle(): void {
    if (this.isActive) {
      this.deactivate();
    } else {
      this.activate();
    }
  }

  private activate(multiSelect: boolean = false): void {
    this.isActive = true;
    this.widgetExpanded = false; // Close panel when activating
    
    if (multiSelect) {
      this.selector.activate(
        (element, info) => {
          this.handleElementSelect(element, info);
        },
        {
          multiSelect: true,
          onMultiSelect: (elements) => {
            this.handleMultiElementSelect(elements);
          }
        }
      );
      this.renderWidget();
      this.showToast('Multi-select mode: Click elements, press Enter when done', 'info');
    } else {
      this.selector.activate((element, info) => {
        this.handleElementSelect(element, info);
      });
      this.renderWidget();
      this.showToast('Select an element to modify', 'info');
    }
  }

  private deactivate(): void {
    this.isActive = false;
    this.selector.deactivate();
    this.clearUI();
    this.renderWidget();
  }

  private handleElementSelect(element: HTMLElement, info: ElementInfo): void {
    // Detect framework
    const framework = detectFramework();
    const frameworkContext = captureFrameworkContext(element, framework);
    const sourceHints = extractSourceHints(element);

    // Create element context
    const context: ElementContext = {
      element: info,
      framework,
      frameworkContext,
      sourceHints,
    };

    // Generate unique ID for this element
    this.currentElementId = generateId();

    // Send to server
    this.ws.send(
      this.createMessage('element:select', {
        ...context,
        elementId: this.currentElementId,
      })
    );

    // Reset chat state and show chat panel
    this.chatState = 'prompt';
    this.chatMessages = [];
    this.currentDiff = null;
    
    // Position chat panel below the selected element
    const rect = element.getBoundingClientRect();
    this.chatPosition = {
      x: rect.left,
      y: rect.bottom + 10,
    };
    
    // Request available tools when opening chat panel
    this.requestTools();
    
    this.renderChatPanel();

    // Deactivate selector but stay in active mode
    this.selector.deactivate();
    this.isActive = false;
    this.renderWidget();
  }

  private handleMultiElementSelect(elements: Array<{ element: HTMLElement; info: ElementInfo }>): void {
    if (elements.length === 0) return;

    // Detect framework (assuming all elements are from the same framework)
    const framework = detectFramework();
    
    // Create context for each element
    const contexts: ElementContext[] = elements.map(({ element, info }) => {
      const frameworkContext = captureFrameworkContext(element, framework);
      const sourceHints = extractSourceHints(element);
      
      return {
        element: info,
        framework,
        frameworkContext,
        sourceHints,
      };
    });

    // Generate unique ID for this multi-select operation
    this.currentElementId = generateId();

    // Send all elements to server
    this.ws.send(
      this.createMessage('elements:select', {
        elements: contexts,
        elementId: this.currentElementId,
      })
    );

    // Reset chat state and show chat panel
    this.chatState = 'prompt';
    this.chatMessages = [];
    this.currentDiff = null;
    
    // Position chat panel based on the first selected element
    const firstElementRect = elements[0].element.getBoundingClientRect();
    this.chatPosition = {
      x: firstElementRect.left,
      y: firstElementRect.bottom + 10,
    };
    
    // Request available tools when opening chat panel
    this.requestTools();
    
    this.renderChatPanel();

    // Deactivate selector but stay in active mode
    this.selector.deactivate();
    this.isActive = false;
    this.renderWidget();
    
    this.showToast(`${elements.length} elements selected`, 'success');
  }

  private renderChatPanel(): void {
    render(
      <ChatPanel
        position={this.chatPosition}
        state={this.chatState}
        messages={this.chatMessages}
        diff={this.currentDiff || undefined}
        statusMessage={this.statusMessage}
        progress={this.statusProgress}
        tools={this.availableTools}
        selectedTool={this.selectedTool}
        models={this.availableModels}
        selectedModel={this.selectedModel}
        onToolChange={(tool) => this.handleToolChange(tool)}
        onModelChange={(model) => this.handleModelChange(model)}
        onSubmitPrompt={(prompt) => this.handlePromptSubmit(prompt)}
        onApplyDiff={() => this.handleDiffApprove(this.currentDiff?.diffId || '')}
        onRejectDiff={() => this.handleDiffReject(this.currentDiff?.diffId || '')}
        onClose={() => this.closeChatPanel()}
        onRetry={() => this.handleRetry()}
      />,
      this.uiContainer
    );
  }

  private handleRetry(): void {
    // Reset to prompt state so user can try again
    this.chatState = 'prompt';
    this.statusMessage = '';
    this.statusProgress = 0;
    this.renderChatPanel();
  }

  private closeChatPanel(): void {
    this.clearUI();
    this.currentElementId = null;
    this.chatMessages = [];
    this.currentDiff = null;
    this.chatState = 'prompt';
  }

  private handlePromptSubmit(prompt: string): void {
    if (!this.currentElementId) return;

    // Add user message to chat
    this.chatMessages.push({
      id: generateId(),
      type: 'user',
      content: prompt,
      timestamp: Date.now(),
    });

    // Update state to loading
    this.chatState = 'loading';
    this.statusMessage = 'Sending request...';
    this.statusProgress = 0;
    this.renderChatPanel();

    this.ws.send(
      this.createMessage('prompt:submit', {
        elementId: this.currentElementId,
        prompt,
        mode: 'preview',
        tool: this.selectedTool || undefined,
        model: this.selectedModel || undefined,
      })
    );
  }

  private handleToolsList(payload: ToolsListPayload): void {
    this.availableTools = payload.tools;
    
    // Select first tool if none selected
    if (!this.selectedTool && payload.tools.length > 0) {
      this.selectedTool = payload.tools[0].identifier;
      // Request models for the selected tool
      this.requestModels(this.selectedTool);
    }
    
    this.renderChatPanel();
  }

  private handleModelsList(payload: ModelsListPayload): void {
    this.availableModels = payload.models;
    
    // Select first model if none selected
    if (!this.selectedModel && payload.models.length > 0) {
      this.selectedModel = payload.models[0].id;
    }
    
    this.renderChatPanel();
  }

  private requestTools(): void {
    this.ws.send(this.createMessage('tools:list', {}));
  }

  private requestModels(toolIdentifier: string): void {
    this.ws.send(this.createMessage('models:list', { tool: toolIdentifier }));
  }

  private handleToolChange(toolIdentifier: string): void {
    this.selectedTool = toolIdentifier;
    this.selectedModel = ''; // Reset model when tool changes
    this.availableModels = []; // Clear models
    this.requestModels(toolIdentifier);
    this.renderChatPanel();
  }

  private handleModelChange(modelId: string): void {
    this.selectedModel = modelId;
    this.renderChatPanel();
  }

  private handleStatusUpdate(payload: StatusUpdatePayload): void {
    // Don't override diff state with status updates
    if (this.chatState === 'diff' || this.chatState === 'applying' || this.chatState === 'complete') {
      return;
    }
    
    this.statusMessage = payload.message;
    this.statusProgress = payload.progress || 0;
    this.chatState = 'loading';
    this.renderChatPanel();
  }

  private handleDiffGenerated(payload: DiffGeneratedPayload): void {
    // Add system message
    this.chatMessages.push({
      id: generateId(),
      type: 'system',
      content: `Changes ready for ${payload.file.split(/[/\\]/).pop() || payload.file}`,
      timestamp: Date.now(),
    });

    // Store diff for preview
    this.currentDiff = {
      file: payload.file,
      before: payload.preview.before,
      after: payload.preview.after,
      diffId: payload.diffId,
    };
    this.currentDiffFile = payload.file;

    // Update state to show diff
    this.chatState = 'diff';
    this.renderChatPanel();
  }

  private handleDiffApprove(diffId: string): void {
    if (!diffId) return;
    
    this.chatState = 'applying';
    this.renderChatPanel();

    this.ws.send(
      this.createMessage('diff:approve', {
        diffId,
        action: 'apply',
      })
    );
  }

  private handleDiffReject(diffId: string): void {
    if (!diffId) return;
    
    this.ws.send(
      this.createMessage('diff:approve', {
        diffId,
        action: 'reject',
      })
    );

    // Add message and reset to prompt state
    this.chatMessages.push({
      id: generateId(),
      type: 'system',
      content: 'Changes rejected. What else would you like to change?',
      timestamp: Date.now(),
    });
    this.currentDiff = null;
    this.chatState = 'prompt';
    this.renderChatPanel();
  }

  private handleDiffApplied(): void {
    // Add success message
    this.chatMessages.push({
      id: generateId(),
      type: 'system',
      content: '✓ Changes applied successfully!',
      timestamp: Date.now(),
    });
    
    this.chatState = 'complete';
    this.currentDiff = null;
    this.renderChatPanel();
    
    this.showToast('Changes applied successfully!', 'success');
    
    // Add to recent edits
    if (this.currentElementId && this.currentDiffFile) {
      const edit: RecentEdit = {
        id: generateId(),
        file: this.currentDiffFile,
        timestamp: Date.now(),
        description: 'Updated component',
      };
      this.recentEdits.unshift(edit);
      if (this.recentEdits.length > 10) this.recentEdits.pop();
      PreferencesStore.addRecentEdit(edit);
      this.renderWidget();
    }
    
    // Close chat panel after a short delay
    setTimeout(() => {
      this.closeChatPanel();
    }, 1500);
  }

  private handleError(payload: ErrorPayload): void {
    // Add error message to chat
    this.chatMessages.push({
      id: generateId(),
      type: 'error',
      content: payload.message,
      timestamp: Date.now(),
    });
    
    // Set state to error temporarily, then back to prompt
    this.chatState = 'error';
    this.currentDiff = null;
    this.statusMessage = payload.message;
    this.statusProgress = 0;
    this.renderChatPanel();
    
    // Show toast for visibility
    this.showToast(payload.message, 'error');
  }

  private showToast(message: string, variant: 'info' | 'success' | 'error' | 'warning'): void {
    // Create toast container with Shadow DOM
    const host = document.createElement('div');
    host.setAttribute('data-pixelcode', 'true');
    document.body.appendChild(host);
    const shadow = host.attachShadow({ mode: 'open' });
    const container = document.createElement('div');
    shadow.appendChild(this.createBaseStyles());
    shadow.appendChild(container);

    render(
      <Toast
        message={message}
        variant={variant}
        onClose={() => {
          host.remove();
        }}
      />,
      container
    );

    setTimeout(() => {
      host.remove();
    }, 5000);
  }

  private clearUI(): void {
    render(null, this.uiContainer);
  }

  /** Creates base styles for Shadow DOM to reset and isolate styles */
  private createBaseStyles(): HTMLStyleElement {
    const style = document.createElement('style');
    style.textContent = `
      /* Reset all inherited styles */
      :host {
        all: initial;
        font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 14px;
        line-height: 1.5;
        color: #fff;
        -webkit-font-smoothing: antialiased;
        -moz-osx-font-smoothing: grayscale;
      }
      
      /* Reset all elements inside */
      *, *::before, *::after {
        box-sizing: border-box;
        margin: 0;
        padding: 0;
        border: 0;
        font: inherit;
        vertical-align: baseline;
      }
      
      /* Keyframe animations */
      @keyframes spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
      }
      
      @keyframes fadeIn {
        from { opacity: 0; transform: translateY(-10px); }
        to { opacity: 1; transform: translateY(0); }
      }
      
      @keyframes slideIn {
        from { opacity: 0; transform: translateX(20px); }
        to { opacity: 1; transform: translateX(0); }
      }
      
      @keyframes slideUp {
        from { opacity: 0; transform: translateY(10px); }
        to { opacity: 1; transform: translateY(0); }
      }
      
      @keyframes pulse {
        0%, 100% { box-shadow: 0 8px 24px rgba(59, 130, 246, 0.4); }
        50% { box-shadow: 0 8px 32px rgba(59, 130, 246, 0.6); }
      }
      
      /* Base element styles */
      button {
        cursor: pointer;
        background: none;
        border: none;
        font-family: inherit;
      }
      
      input, select, textarea {
        font-family: inherit;
        font-size: inherit;
      }
      
      select {
        appearance: auto;
      }
    `;
    return style;
  }

  private createMessage<T>(type: string, payload: T): Message<T> {
    return {
      id: generateId(),
      type,
      payload,
      timestamp: Date.now(),
    };
  }

  // Widget methods
  private renderWidget(): void {
    if (this.widgetExpanded) {
      render(
        <WidgetPanel
          connected={this.isConnected}
          active={this.isActive}
          onActivate={() => this.activate()}
          onDeactivate={() => this.deactivate()}
          onClose={() => this.toggleWidgetPanel()}
          recentEdits={this.recentEdits}
          position={this.widgetPosition}
        />,
        this.widgetContainer
      );
    } else {
      render(null, this.widgetContainer);
    }

    // Always render button (in a Shadow DOM container for style isolation)
    if (!this.buttonContainer) {
      const buttonHost = document.createElement('div');
      buttonHost.id = 'pixelcode-button-host';
      buttonHost.setAttribute('data-pixelcode', 'true');
      document.body.appendChild(buttonHost);
      this.buttonShadowRoot = buttonHost.attachShadow({ mode: 'open' });
      this.buttonContainer = document.createElement('div');
      this.buttonContainer.id = 'pixelcode-button-container';
      this.buttonShadowRoot.appendChild(this.createBaseStyles());
      this.buttonShadowRoot.appendChild(this.buttonContainer);
    }

    render(
      <WidgetButton
        connected={this.isConnected}
        active={this.isActive}
        onClick={() => this.handleWidgetButtonClick()}
        position={this.widgetPosition}
        onPositionChange={(pos) => this.handleWidgetPositionChange(pos)}
      />,
      this.buttonContainer
    );
  }

  private handleWidgetButtonClick(): void {
    if (this.isActive) {
      this.deactivate();
    } else {
      this.toggleWidgetPanel();
    }
  }

  private toggleWidgetPanel(): void {
    this.widgetExpanded = !this.widgetExpanded;
    PreferencesStore.setWidgetPreferences({ expanded: this.widgetExpanded });
    this.renderWidget();
  }

  private handleWidgetPositionChange(position: { x: number; y: number }): void {
    this.widgetPosition = position;
    PreferencesStore.setWidgetPreferences({ position });
    this.renderWidget();
  }

  destroy(): void {
    this.deactivate();
    this.selector.destroy();
    this.ws.disconnect();
    this.uiContainer.remove();
  }
}

// Auto-initialize
const pixelcode = new PixelCode();
pixelcode.init().catch(console.error);

// Expose to window for manual control
(window as any).__PIXELCODE__ = pixelcode;

console.log('[PixelCode] Client loaded. Press ⌘+Shift+P (Mac) or Ctrl+Shift+P (Windows/Linux) to activate');
