import type {
  Framework,
  ElementInfo,
  FrameworkContext,
  ReactContext,
  VueContext,
  HtmlContext,
  BoundingBox,
} from '@insy/shared';

// Import bippy for React fiber instrumentation
import {
  getDisplayName,
  getFiberFromHostInstance,
  getLatestFiber,
  isFiber,
  isHostFiber,
  traverseFiber,
  isInstrumentationActive,
} from 'bippy';

import {
  getSource,
  isSourceFile,
  normalizeFileName,
  getSourcesFromStack,
  getOwnerStack,
  type FiberSource,
} from 'bippy/source';

/**
 * Safely clone an object for JSON serialization, handling circular references,
 * React elements, functions, and other non-serializable values.
 */
function safeSerialize(obj: unknown, maxDepth = 3, seen = new WeakSet()): unknown {
  // Handle primitives and null
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'string' || typeof obj === 'number' || typeof obj === 'boolean') {
    return obj;
  }

  // Skip functions
  if (typeof obj === 'function') {
    return '[Function]';
  }

  // Skip symbols
  if (typeof obj === 'symbol') {
    return obj.toString();
  }

  // Handle arrays
  if (Array.isArray(obj)) {
    if (maxDepth <= 0) return '[Array]';
    return obj.slice(0, 10).map((item) => safeSerialize(item, maxDepth - 1, seen));
  }

  // Handle objects
  if (typeof obj === 'object') {
    // Check for circular reference
    if (seen.has(obj)) {
      return '[Circular]';
    }

    // Skip React elements (they have $$typeof)
    if ((obj as any).$$typeof) {
      return '[ReactElement]';
    }

    // Skip DOM nodes
    if (obj instanceof Node) {
      return '[DOMNode]';
    }

    // Skip certain problematic objects by constructor name
    const constructorName = obj.constructor?.name;
    if (
      constructorName &&
      ['Provider', 'Consumer', 'Context', 'Ref', 'FiberNode'].includes(constructorName)
    ) {
      return `[${constructorName}]`;
    }

    if (maxDepth <= 0) return '[Object]';

    seen.add(obj);

    const result: Record<string, unknown> = {};
    const keys = Object.keys(obj).slice(0, 20); // Limit number of keys

    for (const key of keys) {
      // Skip internal React properties
      if (key.startsWith('__') || key.startsWith('_') || key === 'children') {
        continue;
      }
      try {
        result[key] = safeSerialize((obj as any)[key], maxDepth - 1, seen);
      } catch {
        result[key] = '[Error]';
      }
    }

    return result;
  }

  return String(obj);
}

export function detectFramework(): Framework {
  // React
  if (
    (window as any).__REACT_DEVTOOLS_GLOBAL_HOOK__ ||
    document.querySelector('[data-reactroot]') ||
    document.querySelector('[data-reactid]')
  ) {
    return {
      type: 'react',
      version: detectReactVersion(),
      devtools: !!(window as any).__REACT_DEVTOOLS_GLOBAL_HOOK__,
    };
  }

  // Next.js (built on React)
  if ((window as any).next || document.getElementById('__next')) {
    return {
      type: 'nextjs',
      version: (window as any).next?.version,
      baseFramework: 'react',
    };
  }

  // Vue
  if ((window as any).__VUE__ || (window as any).__VUE_DEVTOOLS_GLOBAL_HOOK__) {
    return {
      type: 'vue',
      version: (window as any).__VUE__?.version || detectVueVersion(),
      devtools: !!(window as any).__VUE_DEVTOOLS_GLOBAL_HOOK__,
    };
  }

  // Svelte
  if (document.querySelector('[data-svelte-h]')) {
    return { type: 'svelte', version: detectSvelteVersion() };
  }

  // Fallback
  return { type: 'html' };
}

function detectReactVersion(): string | undefined {
  try {
    const reactRoot = document.querySelector('[data-reactroot]');
    if (reactRoot) return 'unknown';
    return undefined;
  } catch {
    return undefined;
  }
}

function detectVueVersion(): string | undefined {
  try {
    return (window as any).__VUE__?.version;
  } catch {
    return undefined;
  }
}

function detectSvelteVersion(): string | undefined {
  return undefined;
}

export function getComponentName(fiber: any): string | undefined {
  if (!fiber) return undefined;

  if (fiber.type) {
    if (typeof fiber.type === 'string') {
      return fiber.type;
    }
    if (fiber.type.displayName) {
      return fiber.type.displayName;
    }
    if (fiber.type.name) {
      return fiber.type.name;
    }
  }

  return undefined;
}

// Internal Next.js component names to skip
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

function isInternalComponentName(name: string): boolean {
  if (name.startsWith('_')) return true;
  if (INTERNAL_COMPONENT_NAMES.has(name)) return true;
  return false;
}

function isSourceComponentName(name: string): boolean {
  if (isInternalComponentName(name)) return false;
  if (!/^[A-Z]/.test(name)) return false; // Must start with uppercase
  if (name.startsWith('Primitive.')) return false;
  if (name.includes('Provider') && name.includes('Context')) return false;
  return true;
}

interface StackFrame {
  name: string;
  source: FiberSource | null;
}

interface UnresolvedStackFrame {
  name: string;
  sourcePromise: Promise<FiberSource | null>;
}

/**
 * Get the component stack using bippy for reliable source extraction
 */
export async function getReactStack(element: Element): Promise<StackFrame[]> {
  if (!isInstrumentationActive()) return [];

  try {
    const maybeFiber = getFiberFromHostInstance(element);
    if (!maybeFiber || !isFiber(maybeFiber)) return [];

    const ownerStack = getOwnerStack(maybeFiber);
    const sources = await getSourcesFromStack(ownerStack);

    if (sources && sources.length > 0) {
      const stack: StackFrame[] = [];
      for (const source of sources) {
        if (source.functionName && !isInternalComponentName(source.functionName)) {
          stack.push({
            name: source.functionName,
            source: source.fileName
              ? {
                  fileName: source.fileName,
                  lineNumber: source.lineNumber,
                  columnNumber: source.columnNumber,
                }
              : null,
          });
        }
      }
      if (stack.length > 0) {
        return stack;
      }
    }

    // Fallback: traverse fiber tree manually
    const fiber = getLatestFiber(maybeFiber);
    const unresolvedStack: UnresolvedStackFrame[] = [];

    traverseFiber(
      fiber,
      (currentFiber) => {
        const displayName = isHostFiber(currentFiber)
          ? typeof currentFiber.type === 'string'
            ? currentFiber.type
            : null
          : getDisplayName(currentFiber);

        if (displayName && !isInternalComponentName(displayName)) {
          unresolvedStack.push({
            name: displayName,
            sourcePromise: getSource(currentFiber),
          });
        }
      },
      true
    );

    const resolvedStack = await Promise.all(
      unresolvedStack.map(async (frame) => ({
        name: frame.name,
        source: await frame.sourcePromise,
      }))
    );

    return resolvedStack.filter((frame) => frame.source !== null);
  } catch (error) {
    console.error('[Insy] Error getting React stack:', error);
    return [];
  }
}

/**
 * Capture React context using bippy for reliable source file detection
 */
export async function captureReactContextAsync(element: HTMLElement): Promise<ReactContext | null> {
  try {
    const stack = await getReactStack(element);

    // Find the first user component (not internal)
    let componentName: string | undefined;
    let source: { fileName: string; lineNumber: number; columnNumber?: number } | undefined;
    const fiberPath: string[] = [];

    for (const frame of stack) {
      fiberPath.push(frame.name);

      if (isSourceComponentName(frame.name)) {
        if (!componentName) {
          componentName = frame.name;
        }
        if (!source && frame.source && isSourceFile(frame.source.fileName)) {
          source = {
            fileName: normalizeFileName(frame.source.fileName),
            lineNumber: frame.source.lineNumber ?? 1,
            columnNumber: frame.source.columnNumber ?? undefined,
          };
        }
      }
    }

    // Also get props/state from fiber (fallback to old method)
    const fiberKey = Object.keys(element).find(
      (key) => key.startsWith('__reactFiber') || key.startsWith('__reactInternalInstance')
    );

    let props: Record<string, unknown> | undefined;
    let state: Record<string, unknown> | undefined;

    if (fiberKey) {
      const fiber = (element as any)[fiberKey];
      props = safeSerialize(fiber.memoizedProps) as Record<string, unknown> | undefined;
      state = safeSerialize(fiber.memoizedState) as Record<string, unknown> | undefined;
    }

    if (!componentName && !source && fiberPath.length === 0) {
      return null;
    }

    return {
      componentName,
      props,
      state,
      fiberPath,
      source,
    };
  } catch (error) {
    console.error('[Insy] Error capturing React context:', error);
    return null;
  }
}

/**
 * Synchronous fallback for captureReactContext (legacy support)
 */
export function captureReactContext(element: HTMLElement): ReactContext | null {
  const fiberKey = Object.keys(element).find(
    (key) => key.startsWith('__reactFiber') || key.startsWith('__reactInternalInstance')
  );

  if (!fiberKey) return null;

  const fiber = (element as any)[fiberKey];

  const path: string[] = [];
  let current = fiber;
  while (current) {
    const name = getComponentName(current);
    if (name) path.unshift(name);
    current = current.return;
  }

  // Safely serialize props and state to avoid circular reference errors
  // React fiber contains circular references (e.g., Context Providers)
  const safeProps = safeSerialize(fiber.memoizedProps) as Record<string, unknown> | undefined;
  const safeState = safeSerialize(fiber.memoizedState) as Record<string, unknown> | undefined;

  return {
    componentName: getComponentName(fiber),
    props: safeProps,
    state: safeState,
    fiberPath: path,
    source: fiber._debugSource,
  };
}

export function captureVueContext(element: HTMLElement): VueContext | null {
  const vueKey = Object.keys(element).find(
    (key) => key.startsWith('__vue__') || key.startsWith('__vnode')
  );

  if (!vueKey) return null;

  const instance = (element as any)[vueKey];

  // Safely serialize Vue internal data to avoid circular reference errors
  return {
    componentName: instance.type?.name || instance.type?.__name,
    props: safeSerialize(instance.props) as Record<string, unknown> | undefined,
    data: safeSerialize(instance.data) as Record<string, unknown> | undefined,
    computed: safeSerialize(instance.computed) as Record<string, unknown> | undefined,
    setupState: safeSerialize(instance.setupState) as Record<string, unknown> | undefined,
    source: instance.type?.__file,
  };
}

export function captureHtmlContext(element: HTMLElement): HtmlContext {
  const attributes: Record<string, string> = {};
  const dataAttributes: Record<string, string> = {};

  Array.from(element.attributes).forEach((attr) => {
    attributes[attr.name] = attr.value;
    if (attr.name.startsWith('data-')) {
      dataAttributes[attr.name] = attr.value;
    }
  });

  return {
    attributes,
    dataAttributes,
  };
}

export async function captureFrameworkContext(
  element: HTMLElement,
  framework: Framework
): Promise<FrameworkContext | undefined> {
  if (framework.type === 'react' || framework.type === 'nextjs') {
    // Use async version with bippy for proper source file detection
    return (await captureReactContextAsync(element)) || undefined;
  }

  if (framework.type === 'vue') {
    return captureVueContext(element) || undefined;
  }

  return captureHtmlContext(element);
}
