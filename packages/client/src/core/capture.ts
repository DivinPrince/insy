import type { ElementInfo, BoundingBox, SourceHints, ReactContext } from '@insy/shared';

// React fiber source extraction types (similar to react-grab/bippy)
interface FiberSource {
  fileName: string;
  lineNumber?: number;
  columnNumber?: number;
}

interface StackFrame {
  name: string;
  source: FiberSource | null;
}

// Internal Next.js component names to filter out
const INTERNAL_COMPONENT_NAMES = new Set([
  'InnerLayoutRouter',
  'RedirectErrorBoundary',
  'RedirectBoundary',
  'HTTPAccessFallbackErrorBoundary',
  'HTTPAccessFallbackBoundary',
  'LoadingBoundary',
  'ErrorBoundary',
  'InnerScrollAndFocusHandler',
  'ScrollAndFocusHandler',
  'RenderFromTemplateContext',
  'OuterLayoutRouter',
  'body',
  'html',
  'DevRootHTTPAccessFallbackBoundary',
  'AppDevOverlayErrorBoundary',
  'AppDevOverlay',
  'HotReload',
  'Router',
  'ErrorBoundaryHandler',
  'AppRouter',
  'ServerRoot',
  'SegmentStateProvider',
  'RootErrorBoundary',
]);

export function captureAllElements(): ElementInfo[] {
  const allElements = document.querySelectorAll('body *');
  const capturedElements: ElementInfo[] = [];

  allElements.forEach((el) => {
    const htmlEl = el as HTMLElement;
    
    // Skip invisible or zero-size elements
    const rect = htmlEl.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    
    const style = window.getComputedStyle(htmlEl);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return;

    capturedElements.push(captureElement(htmlEl));
  });

  return capturedElements;
}

/**
 * Capture multiple elements with their relationships
 * Returns array of element info with additional relationship metadata
 */
export async function captureMultipleElements(elements: HTMLElement[]): Promise<{
  elements: ElementInfo[];
  relationships: ElementRelationship[];
  commonAncestor?: HTMLElement;
}> {
  const capturedElements: ElementInfo[] = [];
  const relationships: ElementRelationship[] = [];

  // Capture each element
  for (const element of elements) {
    const info = captureElement(element);
    const reactContext = await extractReactContext(element);
    if (reactContext) {
      (info as any).reactContext = reactContext;
    }
    capturedElements.push(info);
  }

  // Find relationships between elements
  for (let i = 0; i < elements.length; i++) {
    for (let j = i + 1; j < elements.length; j++) {
      const relationship = findRelationship(elements[i], elements[j]);
      if (relationship) {
        relationships.push({
          ...relationship,
          fromIndex: i,
          toIndex: j,
        });
      }
    }
  }

  // Find common ancestor
  const commonAncestor = findCommonAncestor(elements);

  return {
    elements: capturedElements,
    relationships,
    commonAncestor,
  };
}

interface ElementRelationship {
  fromIndex: number;
  toIndex: number;
  type: 'sibling' | 'parent-child' | 'ancestor-descendant' | 'unrelated';
  distance?: number; // DOM tree distance
}

function findRelationship(element1: HTMLElement, element2: HTMLElement): Omit<ElementRelationship, 'fromIndex' | 'toIndex'> | null {
  // Check if siblings
  if (element1.parentElement === element2.parentElement) {
    return { type: 'sibling', distance: 0 };
  }

  // Check if parent-child
  if (element1.contains(element2)) {
    return { type: 'parent-child', distance: getDepthDistance(element1, element2) };
  }
  if (element2.contains(element1)) {
    return { type: 'parent-child', distance: getDepthDistance(element2, element1) };
  }

  // Check if ancestor-descendant
  const commonAncestor = findCommonAncestor([element1, element2]);
  if (commonAncestor) {
    const distance = getDepthDistance(commonAncestor, element1) + getDepthDistance(commonAncestor, element2);
    return { type: 'ancestor-descendant', distance };
  }

  return { type: 'unrelated' };
}

function getDepthDistance(ancestor: HTMLElement, descendant: HTMLElement): number {
  let depth = 0;
  let current: HTMLElement | null = descendant;
  
  while (current && current !== ancestor) {
    depth++;
    current = current.parentElement;
  }
  
  return depth;
}

function findCommonAncestor(elements: HTMLElement[]): HTMLElement | undefined {
  if (elements.length === 0) return undefined;
  if (elements.length === 1) return elements[0].parentElement || undefined;

  // Get all ancestors of the first element
  const ancestors = new Set<HTMLElement>();
  let current: HTMLElement | null = elements[0];
  while (current) {
    ancestors.add(current);
    current = current.parentElement;
  }

  // Find the first common ancestor for all other elements
  for (const element of elements.slice(1)) {
    let curr: HTMLElement | null = element;
    while (curr) {
      if (ancestors.has(curr)) {
        // Found a common ancestor, but need to verify it's common for ALL
        const isCommonForAll = elements.every(el => curr!.contains(el) || el === curr);
        if (isCommonForAll) {
          return curr;
        }
      }
      curr = curr.parentElement;
    }
  }

  return document.body;
}

export function captureElement(element: HTMLElement): ElementInfo {
  const boundingBox = captureBoundingBox(element);
  const css = captureComputedStyles(element);
  const xpath = generateXPath(element);
  const cssSelector = generateCSSSelector(element);

  return {
    tagName: element.tagName.toLowerCase(),
    className: element.className,
    id: element.id,
    textContent: element.textContent?.trim().substring(0, 200) || '',
    boundingBox,
    html: element.outerHTML.substring(0, 1000),
    css,
    xpath,
    cssSelector,
  };
}

function captureBoundingBox(element: HTMLElement): BoundingBox {
  const rect = element.getBoundingClientRect();
  return {
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
  };
}

function captureComputedStyles(element: HTMLElement): Record<string, string> {
  const computed = window.getComputedStyle(element);
  const important = [
    'display',
    'position',
    'width',
    'height',
    'margin',
    'padding',
    'backgroundColor',
    'color',
    'fontSize',
    'fontFamily',
    'fontWeight',
    'border',
    'borderRadius',
    'boxShadow',
    'flexDirection',
    'justifyContent',
    'alignItems',
    'gridTemplateColumns',
    'gridTemplateRows',
  ];

  const styles: Record<string, string> = {};
  important.forEach((prop) => {
    const value = computed.getPropertyValue(prop);
    if (value) styles[prop] = value;
  });

  return styles;
}

function generateXPath(element: HTMLElement): string {
  if (element.id) {
    return `//*[@id="${element.id}"]`;
  }

  const parts: string[] = [];
  let current: HTMLElement | null = element;

  while (current && current.nodeType === Node.ELEMENT_NODE) {
    let index = 1;
    let sibling = current.previousSibling;

    while (sibling) {
      if (sibling.nodeType === Node.ELEMENT_NODE && sibling.nodeName === current.nodeName) {
        index++;
      }
      sibling = sibling.previousSibling;
    }

    const tagName = current.nodeName.toLowerCase();
    const part = `${tagName}[${index}]`;
    parts.unshift(part);

    current = current.parentElement;
  }

  return `/${parts.join('/')}`;
}

function generateCSSSelector(element: HTMLElement): string {
  if (element.id) {
    return `#${element.id}`;
  }

  const parts: string[] = [];
  let current: HTMLElement | null = element;

  while (current && current !== document.body) {
    let selector = current.tagName.toLowerCase();

    if (current.className) {
      const classes = current.className
        .split(' ')
        .filter((c) => c.trim())
        .map((c) => `.${c}`)
        .join('');
      selector += classes;
    }

    parts.unshift(selector);
    current = current.parentElement;
  }

  return parts.join(' > ');
}

export async function captureScreenshot(element: HTMLElement): Promise<string> {
  try {
    const html2canvas = (await import('html2canvas')).default;
    const canvas = await html2canvas(element, {
      backgroundColor: null,
      scale: 1,
      logging: false,
    });
    return canvas.toDataURL('image/png');
  } catch (error) {
    console.error('Failed to capture screenshot:', error);
    return '';
  }
}

export function extractSourceHints(element: HTMLElement): SourceHints | undefined {
  // First check for data-source attribute (explicit source annotation)
  const dataSource = element.getAttribute('data-source');
  if (dataSource) {
    const [filename, lineNumber] = dataSource.split(':');
    return {
      dataSource,
      filename,
      lineNumber: lineNumber ? parseInt(lineNumber, 10) : undefined,
    };
  }

  // Try to extract from React fiber (react-grab style)
  const fiberSource = extractReactFiberSource(element);
  if (fiberSource) {
    return {
      filename: fiberSource.fileName,
      lineNumber: fiberSource.lineNumber,
    };
  }

  return undefined;
}

/**
 * Check if instrumentation is active (React DevTools style fiber access)
 */
function isInstrumentationActive(): boolean {
  if (typeof window === 'undefined') return false;
  // Check for React DevTools hook or fiber access
  return Boolean(
    (window as any).__REACT_DEVTOOLS_GLOBAL_HOOK__ ||
    (window as any).__REACT_DEVTOOLS_ATTACH__ ||
    document.querySelector('[data-reactroot]') ||
    document.querySelector('#__next') ||
    document.querySelector('#root')
  );
}

/**
 * Check if a component name is an internal framework component
 */
function isInternalComponent(name: string): boolean {
  if (name.startsWith('_')) return true;
  if (INTERNAL_COMPONENT_NAMES.has(name)) return true;
  return false;
}

/**
 * Check if a component name is a valid source component
 */
function isSourceComponent(name: string): boolean {
  if (isInternalComponent(name)) return false;
  if (!/^[A-Z]/.test(name)) return false; // Must be capitalized
  if (name.startsWith('Primitive.')) return false;
  if (name.includes('Provider') && name.includes('Context')) return false;
  return true;
}

/**
 * Check if a file name is a valid source file (not node_modules, etc.)
 */
function isSourceFile(fileName: string): boolean {
  if (!fileName) return false;
  if (fileName.includes('node_modules')) return false;
  if (fileName.includes('react-dom')) return false;
  if (fileName.includes('react/')) return false;
  if (fileName.startsWith('webpack://')) return true;
  if (fileName.startsWith('/')) return true;
  if (fileName.includes('src/') || fileName.includes('app/') || fileName.includes('pages/') || fileName.includes('components/')) return true;
  return false;
}

/** 
 * Normalize a file name for display
 */
function normalizeFileName(fileName: string): string {
  // Remove webpack:// prefix
  let normalized = fileName.replace(/^webpack:\/\/[^/]*\//, '');
  // Remove query strings
  normalized = normalized.split('?')[0];
  // Remove leading ./ or /
  normalized = normalized.replace(/^\.\//, '').replace(/^\//, '');
  return normalized;
}

/**
 * Get React fiber from a DOM element
 */
function getFiberFromElement(element: HTMLElement): any {
  // React 16+ fiber keys
  const fiberKeys = Object.keys(element).filter(
    (key) =>
      key.startsWith('__reactFiber$') ||
      key.startsWith('__reactInternalInstance$')
  );

  if (fiberKeys.length > 0) {
    return (element as any)[fiberKeys[0]];
  }

  return null;
}

/**
 * Traverse up the fiber tree to find component information
 */
function traverseFiberForSource(fiber: any): StackFrame[] {
  const stack: StackFrame[] = [];
  let current = fiber;
  let depth = 0;
  const maxDepth = 50; // Prevent infinite loops

  while (current && depth < maxDepth) {
    depth++;
    
    // Get component name
    const type = current.type;
    let name: string | null = null;

    if (typeof type === 'string') {
      // Host component (div, span, etc.) - skip
    } else if (typeof type === 'function') {
      name = type.displayName || type.name || null;
    } else if (type && typeof type === 'object') {
      // Could be a forwardRef, memo, etc.
      name =
        type.displayName ||
        type.render?.displayName ||
        type.render?.name ||
        type.type?.displayName ||
        type.type?.name ||
        null;
    }

    if (name && !isInternalComponent(name)) {
      // Try to get source from _debugSource (React development mode)
      // This requires @babel/plugin-transform-react-jsx-source or React's automatic runtime with dev mode
      let source: FiberSource | null = null;

      if (current._debugSource) {
        source = {
          fileName: current._debugSource.fileName,
          lineNumber: current._debugSource.lineNumber,
          columnNumber: current._debugSource.columnNumber,
        };
      } else if (current._debugOwner?._debugSource) {
        source = {
          fileName: current._debugOwner._debugSource.fileName,
          lineNumber: current._debugOwner._debugSource.lineNumber,
          columnNumber: current._debugOwner._debugSource.columnNumber,
        };
      }

      // Also try to get source from element's own _source property (some builds)
      if (!source && current.elementType?._source) {
        source = {
          fileName: current.elementType._source.fileName,
          lineNumber: current.elementType._source.lineNumber,
          columnNumber: current.elementType._source.columnNumber,
        };
      }

      stack.push({ name, source });
    }

    // Move to parent fiber
    current = current.return;
  }

  return stack;
}

/**
 * Extract React fiber source information from an element (react-grab style)
 */
function extractReactFiberSource(element: HTMLElement): FiberSource | null {
  if (!isInstrumentationActive()) return null;

  try {
    const fiber = getFiberFromElement(element);
    if (!fiber) return null;

    const stack = traverseFiberForSource(fiber);

    // Find the first valid source file in the stack
    for (const frame of stack) {
      if (frame.source && isSourceFile(frame.source.fileName)) {
        return {
          fileName: normalizeFileName(frame.source.fileName),
          lineNumber: frame.source.lineNumber,
          columnNumber: frame.source.columnNumber,
        };
      }
    }

    return null;
  } catch (error) {
    console.warn('Failed to extract React fiber source:', error);
    return null;
  }
}

/**
 * Extract full React context including component stack (react-grab style)
 */
export async function extractReactContext(element: HTMLElement): Promise<ReactContext | undefined> {
  if (!isInstrumentationActive()) return undefined;

  try {
    const fiber = getFiberFromElement(element);
    if (!fiber) return undefined;

    const stack = traverseFiberForSource(fiber);
    const fiberPath: string[] = [];
    let componentName: string | undefined;
    let source: ReactContext['source'];

    for (const frame of stack) {
      if (isSourceComponent(frame.name)) {
        fiberPath.push(frame.name);
        
        if (!componentName) {
          componentName = frame.name;
        }

        if (!source && frame.source && isSourceFile(frame.source.fileName)) {
          source = {
            fileName: normalizeFileName(frame.source.fileName),
            lineNumber: frame.source.lineNumber ?? 0,
            columnNumber: frame.source.columnNumber,
          };
        }
      }
    }

    if (!componentName && fiberPath.length === 0) {
      return undefined;
    }

    // Try to extract props from the fiber
    let props: Record<string, unknown> | undefined;
    if (fiber.memoizedProps && typeof fiber.memoizedProps === 'object') {
      props = {};
      for (const [key, value] of Object.entries(fiber.memoizedProps)) {
        // Skip children and functions for cleaner output
        if (key === 'children') continue;
        if (typeof value === 'function') {
          props[key] = '[Function]';
        } else if (typeof value === 'object' && value !== null) {
          props[key] = '[Object]';
        } else {
          props[key] = value;
        }
      }
    }

    return {
      componentName,
      fiberPath,
      source,
      props,
    };
  } catch (error) {
    console.warn('Failed to extract React context:', error);
    return undefined;
  }
}

/**
 * Format element info similar to react-grab output
 * Example: `<button class="btn">Submit</button> in SubmitButton at components/form.tsx:42:5`
 */
export async function formatElementInfo(element: HTMLElement): Promise<string> {
  const tagName = element.tagName.toLowerCase();
  const classAttr = element.className ? ` class="${element.className.split(' ').slice(0, 3).join(' ')}${element.className.split(' ').length > 3 ? '...' : ''}"` : '';
  const textContent = element.textContent?.trim().substring(0, 50) || '';
  const textPreview = textContent ? textContent + (element.textContent!.length > 50 ? '...' : '') : '';
  
  let html = `<${tagName}${classAttr}>${textPreview}</${tagName}>`;
  
  const context = await extractReactContext(element);
  if (context) {
    if (context.componentName) {
      html += ` in ${context.componentName}`;
    }
    if (context.source) {
      html += ` at ${context.source.fileName}`;
      if (context.source.lineNumber) {
        html += `:${context.source.lineNumber}`;
        if (context.source.columnNumber) {
          html += `:${context.source.columnNumber}`;
        }
      }
    }
  }

  return html;
}

/**
 * Format multiple elements info similar to react-grab output
 * Returns a formatted string describing the selected elements and their relationships
 */
export async function formatMultipleElementsInfo(elements: HTMLElement[]): Promise<string> {
  if (elements.length === 0) return '';
  if (elements.length === 1) return formatElementInfo(elements[0]);

  const lines: string[] = [];
  lines.push(`Selected ${elements.length} elements:`);
  lines.push('');

  for (let i = 0; i < elements.length; i++) {
    const formatted = await formatElementInfo(elements[i]);
    lines.push(`${i + 1}. ${formatted}`);
  }

  // Add relationship info
  const commonAncestor = findCommonAncestor(elements);
  if (commonAncestor && commonAncestor !== document.body) {
    const ancestorTag = commonAncestor.tagName.toLowerCase();
    const ancestorClass = commonAncestor.className ? `.${commonAncestor.className.split(' ')[0]}` : '';
    lines.push('');
    lines.push(`Common ancestor: <${ancestorTag}${ancestorClass}>`);
  }

  return lines.join('\n');
}
