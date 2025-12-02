import type { ElementInfo } from '@pixelcode/shared';

export class ElementSelector {
  private isActive = false;
  private overlay: HTMLDivElement | null = null;
  private label: HTMLDivElement | null = null;
  private hoveredElement: HTMLElement | null = null;
  private onSelectCallback?: (element: HTMLElement, info: ElementInfo) => void;

  constructor() {
    this.createOverlay();
    this.createLabel();
  }

  private createOverlay(): void {
    this.overlay = document.createElement('div');
    this.overlay.style.cssText = `
      position: absolute;
      background-color: rgba(59, 130, 246, 0.2);
      border: 2px solid #3b82f6;
      pointer-events: none;
      z-index: 999997;
      border-radius: 4px;
      display: none;
    `;
    document.body.appendChild(this.overlay);
  }

  private createLabel(): void {
    this.label = document.createElement('div');
    this.label.style.cssText = `
      position: absolute;
      background-color: #3b82f6;
      color: white;
      padding: 4px 8px;
      font-size: 12px;
      font-family: system-ui, -apple-system, sans-serif;
      border-radius: 4px;
      pointer-events: none;
      z-index: 999997;
      white-space: nowrap;
      display: none;
    `;
    document.body.appendChild(this.label);
  }

  activate(onSelect: (element: HTMLElement, info: ElementInfo) => void): void {
    this.isActive = true;
    this.onSelectCallback = onSelect;
    document.body.style.cursor = 'crosshair';
    
    document.addEventListener('mousemove', this.handleMouseMove);
    document.addEventListener('click', this.handleClick, true);
    document.addEventListener('keydown', this.handleKeyDown);
  }

  deactivate(): void {
    this.isActive = false;
    this.onSelectCallback = undefined;
    document.body.style.cursor = '';
    
    this.hideOverlay();
    this.hideLabel();
    
    document.removeEventListener('mousemove', this.handleMouseMove);
    document.removeEventListener('click', this.handleClick, true);
    document.removeEventListener('keydown', this.handleKeyDown);
  }

  private handleMouseMove = (e: MouseEvent): void => {
    if (!this.isActive) return;

    const element = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement;
    if (!element || this.isPixelCodeElement(element)) {
      this.hideOverlay();
      this.hideLabel();
      return;
    }

    this.hoveredElement = element;
    this.showOverlay(element);
    this.showLabel(element, e);
  };

  private handleClick = (e: MouseEvent): void => {
    if (!this.isActive || !this.hoveredElement) return;

    e.preventDefault();
    e.stopPropagation();

    const element = this.hoveredElement;
    if (this.isPixelCodeElement(element)) return;

    // Import capture function dynamically to avoid circular dependencies
    import('../core/capture.js').then(({ captureElement }) => {
      const info = captureElement(element);
      this.onSelectCallback?.(element, info);
    });
  };

  private handleKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      this.deactivate();
    }
  };

  private showOverlay(element: HTMLElement): void {
    if (!this.overlay) return;

    const rect = element.getBoundingClientRect();
    this.overlay.style.display = 'block';
    this.overlay.style.left = `${rect.left + window.scrollX}px`;
    this.overlay.style.top = `${rect.top + window.scrollY}px`;
    this.overlay.style.width = `${rect.width}px`;
    this.overlay.style.height = `${rect.height}px`;
  }

  private showLabel(element: HTMLElement, e: MouseEvent): void {
    if (!this.label) return;

    const tagName = element.tagName.toLowerCase();
    const className = element.className ? `.${element.className.split(' ')[0]}` : '';
    const id = element.id ? `#${element.id}` : '';
    
    this.label.textContent = `${tagName}${id}${className}`;
    this.label.style.display = 'block';
    this.label.style.left = `${e.clientX + 10}px`;
    this.label.style.top = `${e.clientY + 10}px`;
  }

  private hideOverlay(): void {
    if (this.overlay) {
      this.overlay.style.display = 'none';
    }
  }

  private hideLabel(): void {
    if (this.label) {
      this.label.style.display = 'none';
    }
  }

  private isPixelCodeElement(element: HTMLElement): boolean {
    return element.closest('[data-pixelcode]') !== null;
  }

  destroy(): void {
    this.deactivate();
    this.overlay?.remove();
    this.label?.remove();
  }
}
