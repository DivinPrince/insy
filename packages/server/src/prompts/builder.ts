import type { ElementContext, ConversationMessage } from '@insy/shared';

/**
 * Build a prompt for the AI that includes the full element context
 * The AI will find and edit the correct file(s) based on the component tree
 */
export function buildContextOnlyPrompt(
  context: ElementContext,
  conversationHistory?: ConversationMessage[],
  projectPath?: string
): string {
  const componentName = getComponentName(context);
  const reactContext = context.frameworkContext as any;

  // Get the component tree path (most specific components first)
  const componentTree = reactContext?.fiberPath || [];

  // Filter to get the most relevant components (skip providers, wrappers, etc.)
  const relevantComponents = componentTree.filter((name: string) => {
    const lower = name.toLowerCase();
    return (
      !lower.includes('provider') &&
      !lower.includes('context') &&
      !lower.includes('boundary') &&
      !lower.includes('wrapper') &&
      !lower.includes('fragment') &&
      !lower.includes('outlet') &&
      !lower.includes('match') &&
      !lower.includes('router') &&
      name !== 'div' &&
      name !== 've'
    );
  });

  // Build conversation history section if available
  let conversationSection = '';
  if (conversationHistory && conversationHistory.length > 1) {
    conversationSection = `Previous conversation:
${conversationHistory
  .map((msg) => {
    const elementContext = msg.taggedElement
      ? ` [${msg.taggedElement.componentName || `<${msg.taggedElement.tagName}>`}${msg.taggedElement.sourceFile ? ` in ${msg.taggedElement.sourceFile.split('/').pop()}` : ''}]`
      : '';
    return `${msg.role === 'user' ? 'User' : 'Assistant'}${elementContext}: ${msg.content}`;
  })
  .join('\n')}

`;
  }

  // Build project path section
  const projectSection = projectPath
    ? `Project: ${projectPath}

`
    : '';

  return `${projectSection}${conversationSection}# User Request
"${context.prompt}"

# Context

Element: <${context.element.tagName}>${context.element.id ? ` id="${context.element.id}"` : ''}${context.element.className ? ` class="${context.element.className}"` : ''}
${context.element.textContent ? `Text: "${truncate(context.element.textContent, 150)}"` : ''}

${componentName ? `Component: ${componentName}` : ''}
${relevantComponents.length > 0 ? `Tree: ${relevantComponents.slice(0, 10).join(' → ')}` : ''}
${reactContext?.source?.fileName ? `File: ${reactContext.source.fileName}${reactContext.source.lineNumber ? `:${reactContext.source.lineNumber}` : ''}` : ''}

HTML:
\`\`\`html
${truncate(context.element.html, 500)}
\`\`\`

CSS:
${Object.entries(context.element.css || {})
  .slice(0, 10)
  .map(([k, v]) => `${k}: ${v}`)
  .join('\n')}
`;
}

function getComponentName(context: ElementContext): string | undefined {
  if (!context.frameworkContext) return undefined;

  const fw = context.frameworkContext as any;
  return fw.componentName;
}

function getLanguageFromPath(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase();

  switch (ext) {
    case 'ts':
      return 'typescript';
    case 'tsx':
      return 'tsx';
    case 'jsx':
      return 'jsx';
    case 'js':
      return 'javascript';
    case 'vue':
      return 'vue';
    case 'svelte':
      return 'svelte';
    case 'html':
      return 'html';
    case 'css':
      return 'css';
    default:
      return 'javascript';
  }
}

function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.substring(0, maxLength) + '...';
}
