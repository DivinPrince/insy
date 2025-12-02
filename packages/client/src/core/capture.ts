import type { ElementInfo, BoundingBox, SourceHints } from '@pixelcode/shared';

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
  const dataSource = element.getAttribute('data-source');
  if (dataSource) {
    const [filename, lineNumber] = dataSource.split(':');
    return {
      dataSource,
      filename,
      lineNumber: lineNumber ? parseInt(lineNumber, 10) : undefined,
    };
  }

  return undefined;
}
