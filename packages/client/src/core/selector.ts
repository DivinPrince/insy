import type { ElementInfo } from '@pixelcode/shared';

interface SelectionRect {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

export class ElementSelector {
  private overlay: HTMLDivElement | null = null;
  private label: HTMLDivElement | null = null;
  private selectionBox: HTMLDivElement | null = null;
  private selectedOverlays: HTMLDivElement[] = [];
  private isActive = false;
  private currentElement: HTMLElement | null = null;
  private onSelectCallback?: (element: HTMLElement, info: ElementInfo) => void;
  private onMultiSelectCallback?: (elements: Array<{ element: HTMLElement; info: ElementInfo }>) => void;
  private multiSelectMode = false;

  // Drag selection state
  private isDragging = false;
  private dragStartX = 0;
  private dragStartY = 0;
  private dragThreshold = 5; // Minimum pixels to trigger drag mode
  private selectedElements: Set<HTMLElement> = new Set();

  private handleMouseMove = (e: MouseEvent): void => {
    if (this.isDragging) {
      // Update selection box during drag
      this.updateSelectionBox(e.clientX, e.clientY);
      this.highlightElementsInSelection();
    } else {
      // Normal hover behavior
      const target = e.target as HTMLElement;
      if (target && target !== this.overlay && target !== this.label && target !== this.selectionBox) {
        this.showOverlay(target);
      }
    }
  };

  private handleMouseDown = (e: MouseEvent): void => {
    // Start potential drag operation
    this.dragStartX = e.clientX;
    this.dragStartY = e.clientY;
    
    // Clear previous selections
    this.clearSelectedOverlays();
    this.selectedElements.clear();
    
    e.preventDefault();
  };

  private handleMouseUp = (e: MouseEvent): void => {
    const dragDistance = Math.sqrt(
      Math.pow(e.clientX - this.dragStartX, 2) + 
      Math.pow(e.clientY - this.dragStartY, 2)
    );

    if (this.isDragging && dragDistance >= this.dragThreshold) {
      // Drag selection completed
      this.handleDragSelection();
    } else {
      // Single click selection
      const target = e.target as HTMLElement;
      if (target && target !== this.overlay && target !== this.label && target !== this.selectionBox) {
        this.handleSingleSelection(target);
      }
    }

    // Clean up drag state
    this.isDragging = false;
    this.hideSelectionBox();
  };

  private handleGlobalMouseMove = (e: MouseEvent): void => {
    if (!this.isDragging) {
      const dragDistance = Math.sqrt(
        Math.pow(e.clientX - this.dragStartX, 2) + 
        Math.pow(e.clientY - this.dragStartY, 2)
      );

      // Start drag mode if moved beyond threshold
      if (dragDistance >= this.dragThreshold && e.buttons === 1) {
        this.isDragging = true;
        this.hideOverlay(); // Hide hover overlay during drag
        this.showSelectionBox(this.dragStartX, this.dragStartY);
      }
    }

    if (this.isDragging) {
      this.updateSelectionBox(e.clientX, e.clientY);
      this.highlightElementsInSelection();
    }
  };

  private handleClick = (e: MouseEvent): void => {
    e.preventDefault();
    e.stopPropagation();
  };

  private handleKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      this.deactivate();
    }
  };

  activate(
    onSelect: (element: HTMLElement, info: ElementInfo) => void,
    options?: {
      multiSelect?: boolean;
      onMultiSelect?: (elements: Array<{ element: HTMLElement; info: ElementInfo }>) => void;
    }
  ): void {
    if (this.isActive) return;

    this.isActive = true;
    this.onSelectCallback = onSelect;
    this.onMultiSelectCallback = options?.onMultiSelect;
    this.multiSelectMode = options?.multiSelect ?? false;

    document.addEventListener('mousemove', this.handleMouseMove, true);
    document.addEventListener('mousedown', this.handleMouseDown, true);
    document.addEventListener('mouseup', this.handleMouseUp, true);
    document.addEventListener('mousemove', this.handleGlobalMouseMove, true);
    document.addEventListener('click', this.handleClick, true);
    document.addEventListener('keydown', this.handleKeyDown, true);

    document.body.style.cursor = 'crosshair';
  }

  deactivate(): void {
    if (!this.isActive) return;

    this.isActive = false;
    this.isDragging = false;
    this.selectedElements.clear();

    document.removeEventListener('mousemove', this.handleMouseMove, true);
    document.removeEventListener('mousedown', this.handleMouseDown, true);
    document.removeEventListener('mouseup', this.handleMouseUp, true);
    document.removeEventListener('mousemove', this.handleGlobalMouseMove, true);
    document.removeEventListener('click', this.handleClick, true);
    document.removeEventListener('keydown', this.handleKeyDown, true);

    this.hideOverlay();
    this.hideSelectionBox();
    this.clearSelectedOverlays();
    
    document.body.style.cursor = '';

    this.onSelectCallback = undefined;
    this.onMultiSelectCallback = undefined;
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

  private updateLabel(element: HTMLElement, rect: DOMRect): void {
    const tagName = element.tagName.toLowerCase();
    const className = element.className ? `.${element.className.split(' ').join('.')}` : '';
    const text = `${tagName}${className}`;

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

  private showSelectionBox(x: number, y: number): void {
    if (!this.selectionBox) {
      this.selectionBox = document.createElement('div');
      this.selectionBox.style.cssText = `
        position: fixed;
        pointer-events: none;
        border: 2px dashed #3b82f6;
        background-color: rgba(59, 130, 246, 0.1);
        z-index: 999997;
      `;
      document.body.appendChild(this.selectionBox);
    }

    this.selectionBox.style.left = `${x}px`;
    this.selectionBox.style.top = `${y}px`;
    this.selectionBox.style.width = '0px';
    this.selectionBox.style.height = '0px';
  }

  private updateSelectionBox(x: number, y: number): void {
    if (!this.selectionBox) return;

    const rect = this.getSelectionRect(x, y);
    
    this.selectionBox.style.left = `${rect.startX}px`;
    this.selectionBox.style.top = `${rect.startY}px`;
    this.selectionBox.style.width = `${rect.endX - rect.startX}px`;
    this.selectionBox.style.height = `${rect.endY - rect.startY}px`;
  }

  private hideSelectionBox(): void {
    if (this.selectionBox) {
      this.selectionBox.remove();
      this.selectionBox = null;
    }
  }

  private getSelectionRect(currentX: number, currentY: number): SelectionRect {
    return {
      startX: Math.min(this.dragStartX, currentX),
      startY: Math.min(this.dragStartY, currentY),
      endX: Math.max(this.dragStartX, currentX),
      endY: Math.max(this.dragStartY, currentY),
    };
  }

  private highlightElementsInSelection(): void {
    const rect = this.getSelectionRect(
      parseFloat(this.selectionBox?.style.left || '0') + parseFloat(this.selectionBox?.style.width || '0'),
      parseFloat(this.selectionBox?.style.top || '0') + parseFloat(this.selectionBox?.style.height || '0')
    );

    // Get all elements in the selection area
    const elements = this.getElementsInRect(rect);

    // Clear old overlays
    this.clearSelectedOverlays();
    this.selectedElements.clear();

    // Create overlays for selected elements
    elements.forEach((element) => {
      this.selectedElements.add(element);
      const overlay = this.createSelectedOverlay(element);
      this.selectedOverlays.push(overlay);
    });
  }

  private getElementsInRect(rect: SelectionRect): HTMLElement[] {
    const elements: HTMLElement[] = [];
    const allElements = document.querySelectorAll('body *');

    allElements.forEach((el) => {
      const htmlEl = el as HTMLElement;
      
      // Skip our own UI elements
      if (
        htmlEl === this.overlay ||
        htmlEl === this.label ||
        htmlEl === this.selectionBox ||
        this.selectedOverlays.some(overlay => overlay === htmlEl)
      ) {
        return;
      }

      const elRect = htmlEl.getBoundingClientRect();
      
      // Check if element overlaps with selection rectangle
      if (this.rectsOverlap(rect, elRect)) {
        elements.push(htmlEl);
      }
    });

    // Filter out containers that have children in the selection
    // Only include a container if the selection fully contains it
    return this.filterContainers(elements, rect);
  }

  private filterContainers(elements: HTMLElement[], selectionRect: SelectionRect): HTMLElement[] {
    const elementSet = new Set(elements);
    
    return elements.filter((element) => {
      // Check if any of the element's children are also in the selection
      const hasSelectedChildren = elements.some(
        (other) => other !== element && element.contains(other)
      );

      if (!hasSelectedChildren) {
        // No children selected, keep this element
        return true;
      }

      // This element has children that are also selected
      // Only include it if the selection fully contains this element
      const elRect = element.getBoundingClientRect();
      const isFullyContained = this.isRectFullyContained(elRect, selectionRect);
      
      return isFullyContained;
    });
  }

  private isRectFullyContained(elementRect: DOMRect, selectionRect: SelectionRect): boolean {
    return (
      elementRect.left >= selectionRect.startX &&
      elementRect.right <= selectionRect.endX &&
      elementRect.top >= selectionRect.startY &&
      elementRect.bottom <= selectionRect.endY
    );
  }

  private rectsOverlap(rect1: SelectionRect, rect2: DOMRect): boolean {
    return !(
      rect1.endX < rect2.left ||
      rect1.startX > rect2.right ||
      rect1.endY < rect2.top ||
      rect1.startY > rect2.bottom
    );
  }

  private createSelectedOverlay(element: HTMLElement): HTMLDivElement {
    const rect = element.getBoundingClientRect();
    const overlay = document.createElement('div');
    
    overlay.style.cssText = `
      position: fixed;
      pointer-events: none;
      border: 2px solid #10b981;
      background-color: rgba(16, 185, 129, 0.15);
      z-index: 999996;
      top: ${rect.top}px;
      left: ${rect.left}px;
      width: ${rect.width}px;
      height: ${rect.height}px;
    `;
    
    document.body.appendChild(overlay);
    return overlay;
  }

  private clearSelectedOverlays(): void {
    this.selectedOverlays.forEach((overlay) => overlay.remove());
    this.selectedOverlays = [];
  }

  private async handleSingleSelection(element: HTMLElement): Promise<void> {
    const { captureElement } = await import('./capture.js');
    const info = captureElement(element);
    
    this.onSelectCallback?.(element, info);
    this.deactivate();
  }

  private async handleDragSelection(): Promise<void> {
    if (this.selectedElements.size === 0) {
      this.deactivate();
      return;
    }

    const { captureElement } = await import('./capture.js');
    const elementsWithInfo = Array.from(this.selectedElements).map((element) => ({
      element,
      info: captureElement(element),
    }));

    if (this.selectedElements.size === 1) {
      // Single element selected via drag - treat as single selection
      const first = elementsWithInfo[0];
      this.onSelectCallback?.(first.element, first.info);
    } else if (this.onMultiSelectCallback) {
      // Multiple elements selected
      this.onMultiSelectCallback(elementsWithInfo);
    } else if (this.onSelectCallback) {
      // Fallback: use first element if no multi-select callback
      const first = elementsWithInfo[0];
      this.onSelectCallback(first.element, first.info);
    }

    this.deactivate();
  }

  destroy(): void {
    this.deactivate();
  }
}
