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
    return !lower.includes('provider') && 
           !lower.includes('context') && 
           !lower.includes('boundary') &&
           !lower.includes('wrapper') &&
           !lower.includes('fragment') &&
           !lower.includes('outlet') &&
           !lower.includes('match') &&
           !lower.includes('router') &&
           name !== 'div' &&
           name !== 've';
  });

  // Build conversation history section if available
  let conversationSection = '';
  if (conversationHistory && conversationHistory.length > 1) {
    conversationSection = `
## Conversation History
This is an ongoing conversation. Here's what has been discussed so far:

${conversationHistory.map(msg => {
  const elementContext = msg.taggedElement 
    ? ` [Context: ${msg.taggedElement.componentName || `<${msg.taggedElement.tagName}>`}${msg.taggedElement.sourceFile ? ` in ${msg.taggedElement.sourceFile.split('/').pop()}` : ''}]`
    : '';
  return `**${msg.role === 'user' ? 'User' : 'Assistant'}**${elementContext}: ${msg.content}`;
}).join('\n\n')}

---
`;
  }

  // Build project path section
  const projectSection = projectPath 
    ? `## Project Root
IMPORTANT: Only edit files within this project directory:
${projectPath}

All file paths in your response MUST start with this exact path.
Do NOT edit files in other projects or directories.

`
    : '';

  return `# Insy Edit Request
You are helping edit a web application. The user visually selected an element in their browser and wants to modify it.

${projectSection}## Selected Element
- Tag: <${context.element.tagName}>
${context.element.id ? `- ID: #${context.element.id}` : ''}
${context.element.className ? `- Classes: ${context.element.className}` : ''}
${context.element.textContent ? `- Text Content: "${truncate(context.element.textContent, 150)}"` : ''}

## Component Context
${componentName ? `- Nearest Component: ${componentName}` : ''}
${relevantComponents.length > 0 ? `- Component Tree (from innermost): ${relevantComponents.slice(0, 10).join(' → ')}` : ''}
${reactContext?.source?.fileName ? `- Source File Hint: ${reactContext.source.fileName}${reactContext.source.lineNumber ? `:${reactContext.source.lineNumber}` : ''}` : ''}

## HTML Context
\`\`\`html
${truncate(context.element.html, 500)}
\`\`\`

## CSS Properties
${Object.entries(context.element.css || {}).slice(0, 10).map(([k, v]) => `- ${k}: ${v}`).join('\n')}
${conversationSection}
## User's Request
"${context.prompt}"

## Your Task
What you should do:
- Use your tools to find the correct source file based on the component context above
- Look for files containing the component name (e.g., ${componentName || relevantComponents[0] || 'the component'})
- Read the file to understand the current implementation
- Make the requested modifications mentally
- Return the COMPLETE modified file content in XML format

Code modification guidelines:
1. Preserve the existing code structure and formatting style
2. Only change what's necessary to fulfill the request
3. Keep all imports, exports, and other components unchanged
4. Maintain the same indentation style (spaces/tabs)
5. Consider the conversation history for context

## Important Guidelines
- Search for the component by name, not by HTML structure
- The component tree shows the path from root to the selected element
- Focus on the innermost/most specific components (${relevantComponents.slice(0, 3).join(', ') || 'shown first'})
- Preserve existing code structure and formatting
- Only change what's necessary to fulfill the request

## Design Guidelines
When making visual/styling changes:
- Keep designs clean, minimal, and elegant
- Avoid complex gradients, excessive shadows, or overly decorative elements
- Prioritize simplicity, readability, and whitespace
- Use subtle colors and consistent spacing
- Less is more - aim for a refined, professional look

## Response Format`;
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
