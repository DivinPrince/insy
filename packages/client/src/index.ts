import { render } from 'preact';
import { WebSocketClient } from './websocket/client.js';
import { ElementSelector } from './core/selector.js';
import { detectFramework, captureFrameworkContext } from './frameworks/detector.js';
import { captureElement, extractSourceHints } from './core/capture.js';
import { PromptInput } from './ui/prompt.js';
import { DiffViewer } from './ui/diff-viewer.js';
import { Loading } from './ui/loading.js';
import { Toast } from './ui/toast.js';
import { WidgetButton } from './ui/widget-button.js';
import { WidgetPanel } from './ui/widget-panel.js';
import { PreferencesStore } from './storage/preferences.js';
import type {
  Message,
  ElementContext,
  ElementInfo,
  DiffResult,
  StatusUpdatePayload,
  DiffGeneratedPayload,
  ErrorPayload,
  createMessage,
  RecentEdit,
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
  private widgetContainer: HTMLDivElement;
  private widgetExpanded = false;
  private widgetPosition = { x: 20, y: 20 };
  private recentEdits: RecentEdit[] = [];

  constructor() {
    // Load preferences
    const prefs = PreferencesStore.getWidgetPreferences();
    this.widgetPosition = prefs.position;
    this.widgetExpanded = prefs.expanded;
    this.recentEdits = PreferencesStore.getRecentEdits();

    // Create UI container
    this.uiContainer = document.createElement('div');
    this.uiContainer.setAttribute('data-pixelcode', 'true');
    this.uiContainer.id = 'pixelcode-ui';
    document.body.appendChild(this.uiContainer);

    // Create widget container (separate for better layering)
    this.widgetContainer = document.createElement('div');
    this.widgetContainer.setAttribute('data-pixelcode', 'true');
    this.widgetContainer.id = 'pixelcode-widget';
    document.body.appendChild(this.widgetContainer);

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

  private activate(): void {
    this.isActive = true;
    this.widgetExpanded = false; // Close panel when activating
    this.selector.activate((element, info) => {
      this.handleElementSelect(element, info);
    });
    this.renderWidget();
    this.showToast('Select an element to modify', 'info');
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

    // Show prompt input
    this.showPromptInput(element);

    // Deactivate selector
    this.selector.deactivate();
  }

  private showPromptInput(element: HTMLElement): void {
    const rect = element.getBoundingClientRect();
    const position = {
      x: rect.left,
      y: rect.bottom + 10,
    };

    render(
      <PromptInput
        position={position}
        onSubmit={(prompt) => this.handlePromptSubmit(prompt)}
        onCancel={() => this.clearUI()}
      />,
      this.uiContainer
    );
  }

  private handlePromptSubmit(prompt: string): void {
    if (!this.currentElementId) return;

    this.ws.send(
      this.createMessage('prompt:submit', {
        elementId: this.currentElementId,
        prompt,
        mode: 'preview',
      })
    );

    this.clearUI();
  }

  private handleStatusUpdate(payload: StatusUpdatePayload): void {
    render(
      <Loading stage={payload.stage} message={payload.message} progress={payload.progress} />,
      this.uiContainer
    );
  }

  private handleDiffGenerated(payload: DiffGeneratedPayload): void {
    const diff: DiffResult = {
      id: payload.diffId,
      file: payload.file,
      originalCode: payload.preview.before,
      modifiedCode: payload.preview.after,
      unifiedDiff: payload.diff,
      hunks: [], // Will be parsed from unifiedDiff
    };

    render(
      <DiffViewer
        diff={diff}
        onApply={() => this.handleDiffApprove(payload.diffId)}
        onReject={() => this.handleDiffReject(payload.diffId)}
      />,
      this.uiContainer
    );
  }

  private handleDiffApprove(diffId: string): void {
    this.ws.send(
      this.createMessage('diff:approve', {
        diffId,
        action: 'apply',
      })
    );

    this.showLoading('Applying changes', 'Writing to disk...');
  }

  private handleDiffReject(diffId: string): void {
    this.ws.send(
      this.createMessage('diff:approve', {
        diffId,
        action: 'reject',
      })
    );

    this.clearUI();
    this.showToast('Changes rejected', 'info');
  }

  private handleDiffApplied(): void {
    this.clearUI();
    this.showToast('Changes applied successfully!', 'success');
    
    // Add to recent edits (we'll need to track the file from the diff)
    if (this.currentElementId) {
      const edit: RecentEdit = {
        id: generateId(),
        file: 'component.tsx', // TODO: Track actual file from context
        timestamp: Date.now(),
        description: 'Updated component',
      };
      this.recentEdits.unshift(edit);
      if (this.recentEdits.length > 10) this.recentEdits.pop();
      PreferencesStore.addRecentEdit(edit);
      this.renderWidget();
    }
    
    this.currentElementId = null;
  }

  private handleError(payload: ErrorPayload): void {
    this.clearUI();
    this.showToast(payload.message, 'error');
  }

  private showLoading(stage: string, message: string): void {
    render(<Loading stage={stage} message={message} />, this.uiContainer);
  }

  private showToast(message: string, variant: 'info' | 'success' | 'error' | 'warning'): void {
    const container = document.createElement('div');
    container.setAttribute('data-pixelcode', 'true');
    document.body.appendChild(container);

    render(
      <Toast
        message={message}
        variant={variant}
        onClose={() => {
          container.remove();
        }}
      />,
      container
    );

    setTimeout(() => {
      container.remove();
    }, 5000);
  }

  private clearUI(): void {
    render(null, this.uiContainer);
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

    // Always render button (in a second container element for layering)
    const buttonContainer = document.getElementById('pixelcode-button-container') || (() => {
      const div = document.createElement('div');
      div.id = 'pixelcode-button-container';
      div.setAttribute('data-pixelcode', 'true');
      document.body.appendChild(div);
      return div;
    })();

    render(
      <WidgetButton
        connected={this.isConnected}
        active={this.isActive}
        onClick={() => this.handleWidgetButtonClick()}
        position={this.widgetPosition}
        onPositionChange={(pos) => this.handleWidgetPositionChange(pos)}
      />,
      buttonContainer
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
