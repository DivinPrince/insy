import type { ElementContext } from '@pixelcode/shared';

export function buildOpenCodePrompt(
  context: ElementContext,
  sourceCode: string,
  sourceFilePath: string
): string {
  const componentName = getComponentName(context);
  const language = getLanguageFromPath(sourceFilePath);

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

## User's Request
"${context.prompt}"

## Your Task
Please modify the code to implement the user's request. Important guidelines:
1. Preserve the existing code structure and formatting style
2. Only change what's necessary to fulfill the request
3. Keep all imports, exports, and other components unchanged
4. Maintain the same indentation style

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
  
  // Extract code block from response
  const codeBlockRegex = /```(\w+)?\s*\n([\s\S]+?)```/;
  const match = response.match(codeBlockRegex);

  if (!match) {
    // If no code block found, maybe the entire response is code
    // This is a fallback
    console.warn('[Parser] No code block found in response, using entire response');
    return {
      code: response.trim(),
      language: 'javascript',
    };
  }

  const language = match[1] || 'javascript';
  const code = match[2].trim();

  return { code, language };
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
