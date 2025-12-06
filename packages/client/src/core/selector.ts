import type { ElementInfo } from '@insy/shared';

export class ElementSelector {
  private overlay: HTMLDivElement | null = null;
  private label: HTMLDivElement | null = null;
  private isActive = false;
  private currentElement: HTMLElement | null = null;
  private onSelectCallback?: (element: HTMLElement, info: ElementInfo) => void;

  private handleMouseMove = (e: MouseEvent): void => {
    const target = e.target as HTMLElement;
    if (target && target !== this.overlay && target !== this.label) {
      this.showOverlay(target);
    }
  };

  private handleClick = async (e: MouseEvent): Promise<void> => {
    e.preventDefault();
    e.stopPropagation();
    
    const target = e.target as HTMLElement;
    if (target && target !== this.overlay && target !== this.label) {
      await this.handleSelection(target);
    }
  };

  private handleKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      this.deactivate();
    }
  };

  activate(onSelect: (element: HTMLElement, info: ElementInfo) => void): void {
    if (this.isActive) return;

    this.isActive = true;
    this.onSelectCallback = onSelect;

    document.addEventListener('mousemove', this.handleMouseMove, true);
    document.addEventListener('click', this.handleClick, true);
    document.addEventListener('keydown', this.handleKeyDown, true);

    document.body.style.cursor = 'crosshair';
  }

  deactivate(): void {
    if (!this.isActive) return;

    this.isActive = false;

    document.removeEventListener('mousemove', this.handleMouseMove, true);
    document.removeEventListener('click', this.handleClick, true);
    document.removeEventListener('keydown', this.handleKeyDown, true);

    this.hideOverlay();
    
    document.body.style.cursor = '';

    this.onSelectCallback = undefined;
  }

  private showOverlay(element: HTMLElement): void {
    if (this.currentElement === element) return;
    
    this.currentElement = element;
    const rect = element.getBoundingClientRect();

    if (!this.overlay) {
      this.overlay = document.createElement('div');
      this.overlay.style.cssText = `
        position: fixed;
        pointer-events: none;
        border: 2px solid #3b82f6;
        background-color: rgba(59, 130, 246, 0.1);
        z-index: 999998;
      `;
      document.body.appendChild(this.overlay);
    }

    this.overlay.style.top = `${rect.top}px`;
    this.overlay.style.left = `${rect.left}px`;
    this.overlay.style.width = `${rect.width}px`;
    this.overlay.style.height = `${rect.height}px`;

    this.updateLabel(element, rect);
  }

  private async updateLabel(element: HTMLElement, rect: DOMRect): Promise<void> {
    const tagName = element.tagName.toLowerCase();
    const className = element.className ? `.${element.className.split(' ').slice(0, 2).join('.')}` : '';
    let text = `${tagName}${className}`;

    // Try to get React component name for richer labels (react-grab style)
    try {
      const { extractReactContext } = await import('./capture.js');
      const context = await extractReactContext(element);
      if (context?.componentName) {
        text = `<${tagName}> in ${context.componentName}`;
      }
    } catch {
      // Fallback to basic label
    }

    if (!this.label) {
      this.label = document.createElement('div');
      this.label.style.cssText = `
        position: fixed;
        pointer-events: none;
        background-color: #3b82f6;
        color: white;
        padding: 2px 6px;
        font-size: 12px;
        font-family: monospace;
        border-radius: 2px;
        z-index: 999999;
        white-space: nowrap;
      `;
      document.body.appendChild(this.label);
    }

    this.label.textContent = text;
    
    const labelTop = rect.top > 20 ? rect.top - 20 : rect.bottom + 2;
    this.label.style.top = `${labelTop}px`;
    this.label.style.left = `${rect.left}px`;
  }

  private hideOverlay(): void {
    if (this.overlay) {
      this.overlay.remove();
      this.overlay = null;
    }
    if (this.label) {
      this.label.remove();
      this.label = null;
    }
    this.currentElement = null;
  }

  private async handleSelection(element: HTMLElement): Promise<void> {
    const { captureElement, extractReactContext } = await import('./capture.js');
    const info = captureElement(element);
    
    // Enrich with React context if available
    const reactContext = await extractReactContext(element);
    if (reactContext) {
      (info as any).reactContext = reactContext;
    }
    
    this.onSelectCallback?.(element, info);
    this.deactivate();
  }

  destroy(): void {
    this.deactivate();
  }
}
