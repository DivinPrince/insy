import type {
  Framework,
  ElementInfo,
  FrameworkContext,
  ReactContext,
  VueContext,
  HtmlContext,
  BoundingBox,
} from '@pixelcode/shared';

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

export function captureReactContext(element: HTMLElement): ReactContext | null {
  const fiberKey = Object.keys(element).find(
    (key) =>
      key.startsWith('__reactFiber') ||
      key.startsWith('__reactInternalInstance')
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

  return {
    componentName: getComponentName(fiber),
    props: fiber.memoizedProps,
    state: fiber.memoizedState,
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

  return {
    componentName: instance.type?.name || instance.type?.__name,
    props: instance.props,
    data: instance.data,
    computed: instance.computed,
    setupState: instance.setupState,
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

export function captureFrameworkContext(
  element: HTMLElement,
  framework: Framework
): FrameworkContext | undefined {
  if (framework.type === 'react' || framework.type === 'nextjs') {
    return captureReactContext(element) || undefined;
  }

  if (framework.type === 'vue') {
    return captureVueContext(element) || undefined;
  }

  return captureHtmlContext(element);
}
