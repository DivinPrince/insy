import type { ElementContext, ConversationMessage } from '@pixelcode/shared';

/**
 * Build a prompt for the AI that includes the full element context
 * The AI will find and edit the correct file(s) based on the component tree
 */
export function buildContextOnlyPrompt(
  context: ElementContext,
  conversationHistory?: ConversationMessage[]
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

  return `# PixelCode Edit Request

You are helping edit a web application. The user visually selected an element in their browser and wants to modify it.

## Selected Element
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
1. First, use your tools to find the correct source file based on the component context above
2. Look for files containing the component name (e.g., ${componentName || relevantComponents[0] || 'the component'})
3. Read the file to understand the current implementation
4. Make the requested changes

## Important Guidelines
- Search for the component by name, not by HTML structure
- The component tree shows the path from root to the selected element
- Focus on the innermost/most specific components (${relevantComponents.slice(0, 3).join(', ') || 'shown first'})
- Preserve existing code structure and formatting
- Only change what's necessary to fulfill the request

## Design Guidelines
When making visual/styling changes:
- Keep designs clean, minimal, and elegant
- Avoid complex gradients or excessive shadows
- Prioritize simplicity and readability
- Use subtle colors and consistent spacing`;
}

export function buildOpenCodePrompt(
  context: ElementContext,
  sourceCode: string,
  sourceFilePath: string,
  conversationHistory?: ConversationMessage[]
): string {
  const componentName = getComponentName(context);
  const language = getLanguageFromPath(sourceFilePath);

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

  return `# PixelCode Edit Request

You are helping edit a web application. The user visually selected an element in their browser and wants to modify it.

## Element Information
- Component: ${componentName || 'Unknown'}
- File: ${sourceFilePath}
- Tag: <${context.element.tagName}>
${context.element.id ? `- ID: #${context.element.id}` : ''}
${context.element.className ? `- Classes: ${context.element.className}` : ''}
${context.element.textContent ? `- Text Content: "${truncate(context.element.textContent, 100)}"` : ''}

## Current Source Code
\`\`\`${language}
${sourceCode}
\`\`\`
${conversationSection}
## User's Current Request
"${context.prompt}"

## Your Task
Please modify the code to implement the user's request. Important guidelines:
1. Preserve the existing code structure and formatting style
2. Only change what's necessary to fulfill the request
3. Keep all imports, exports, and other components unchanged
4. Maintain the same indentation style
5. Consider the conversation history - the user may be asking for follow-up changes or refinements

## Design Guidelines
When making visual/styling changes, keep in mind:
- Users prefer clean, minimal, and elegant designs
- Avoid complex gradients, excessive shadows, or overly decorative elements
- Prioritize simplicity, readability, and whitespace
- Use subtle colors and consistent spacing
- Less is more - aim for a refined, professional look

## Response Format
You MUST return your response in the following XML format. This is critical for the system to parse your changes correctly.

<file_changes>
  <summary>Brief description of what changes were made</summary>
  <file path="${sourceFilePath}" action="modify" language="${language}">
    <description>What was changed in this file</description>
    <content><![CDATA[
// Your complete modified code here
// Include the ENTIRE file content, not just the changed parts
]]></content>
  </file>
</file_changes>

### Format Rules:
1. Always wrap file content in <![CDATA[...]]> to handle special characters
2. The "action" attribute must be one of: "create", "modify", "delete"
3. For "modify" actions, include the complete file content
4. For "delete" actions, leave <content> empty
5. You can include multiple <file> elements if changes span multiple files
6. Always include the full file path in the "path" attribute

Example for multiple files:
<file_changes>
  <summary>Added a new component and updated the main file</summary>
  <file path="/src/components/Button.tsx" action="create" language="tsx">
    <description>New Button component</description>
    <content><![CDATA[
export function Button() { return <button>Click</button>; }
]]></content>
  </file>
  <file path="/src/App.tsx" action="modify" language="tsx">
    <description>Import and use the new Button component</description>
    <content><![CDATA[
import { Button } from './components/Button';
// ... rest of file
]]></content>
  </file>
</file_changes>`;
}

export function parseOpenCodeResponse(response: string): {
  code: string;
  language: string;
} {
  // This is the legacy parser - kept for backward compatibility
  // Use parseStructuredResponse from ./parser.ts for the new XML format
  
  // Extract code block from response (with or without language specifier)
  const codeBlockRegex = /```(\w+)?\s*\n([\s\S]+?)```/;
  const match = response.match(codeBlockRegex);

  if (match) {
    const language = match[1] || 'javascript';
    const code = match[2].trim();
    return { code, language };
  }

  // Try to find code block without newline after backticks
  const altCodeBlockRegex = /```(\w+)?([\s\S]+?)```/;
  const altMatch = response.match(altCodeBlockRegex);

  if (altMatch) {
    const language = altMatch[1] || 'javascript';
    const code = altMatch[2].trim();
    return { code, language };
  }

  // No code block found - return empty
  console.warn('[Parser] No code block found in response');
  return { code: '', language: 'javascript' };
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
