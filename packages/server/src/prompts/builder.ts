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
1. Return ONLY the complete modified code in a code block
2. Preserve the existing code structure and formatting style
3. Only change what's necessary to fulfill the request
4. Keep all imports, exports, and other components unchanged
5. Maintain the same indentation style

Return your response as:
\`\`\`${language}
// modified code here
\`\`\``;
}

export function parseOpenCodeResponse(response: string): {
  code: string;
  language: string;
} {
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
