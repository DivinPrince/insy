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

=================================================================
CRITICAL OUTPUT FORMAT REQUIREMENT
=================================================================

YOU MUST RESPOND IN XML FORMAT ONLY - NO EXCEPTIONS
- DO NOT use file editing tools (write_to_file, edit_file, etc.)
- DO NOT make direct changes to files
- ONLY return XML with <file_changes> structure
- See "Response Format" section below for exact format

Why: The user needs to review and approve changes before they are applied.
If you edit files directly, the user loses control and visibility.

=================================================================

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

CRITICAL INSTRUCTIONS - READ CAREFULLY:

1. DO NOT use any file editing tools (write_to_file, edit_file, replace_in_file, etc.)
2. DO NOT make direct changes to files on disk
3. DO NOT execute any commands or scripts
4. ONLY return the modified code in XML format below

Why: The system needs to generate a visual diff that the user can review and approve/reject. If you edit files directly, the user loses control.

What you should do:
- Use your tools to find the correct source file based on the component context above
- Look for files containing the component name (e.g., ${componentName || relevantComponents[0] || 'the component'})
- Read the file to understand the current implementation
- Make the requested modifications mentally
- Return the COMPLETE modified file content in XML format
- The system will then generate a diff and show it to the user

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

## Response Format

=================================================================
THIS IS THE MOST IMPORTANT PART - READ CAREFULLY
=================================================================

YOUR ENTIRE RESPONSE MUST BE:
1. ONLY the XML structure below
2. NO explanations before the XML
3. NO explanations after the XML
4. NO markdown formatting
5. NO code blocks with backticks
6. JUST pure XML starting with <file_changes>

YOU MUST RETURN YOUR RESPONSE IN THIS EXACT XML FORMAT:

Do not use tools to edit files. Do not edit files directly. Only return XML with the code changes.

<file_changes>
  <summary>Brief description of what changes were made</summary>
  <file path="/absolute/path/to/file.tsx" action="modify" language="tsx">
    <description>What was changed in this file</description>
    <content><![CDATA[
// Your complete modified code here
// Include the ENTIRE file content, not just the changed parts
// This is the full file after your modifications
]]></content>
  </file>
</file_changes>

### XML Format Rules:
1. MANDATORY: Wrap all code in <file_changes> XML tags as shown above
2. Always wrap file content in <![CDATA[...]]> to handle special characters
3. The "action" attribute must be one of: "create", "modify", "delete"
4. For "modify" actions, include the COMPLETE file content (entire file, not just changed lines)
5. For "delete" actions, leave <content> empty
6. You can include multiple <file> elements if changes span multiple files
7. Always include the full absolute file path in the "path" attribute

FINAL REMINDER: After using your tools to find and read the file, return ONLY the XML format above with the modified code. No explanations before or after. No file editing tools. Just pure XML with the complete modified file content inside.

=================================================================
FINAL CHECKLIST BEFORE YOU RESPOND:
=================================================================

[ ] Did I use any file editing tools? (If YES -> STOP, return XML instead)
[ ] Did I make direct changes to files? (If YES -> STOP, return XML instead)
[ ] Is my response PURE XML starting with <file_changes>? (Must be YES)
[ ] Does my XML contain the COMPLETE file content? (Must be YES)
[ ] Did I wrap code in <![CDATA[...]]>? (Must be YES)

START YOUR RESPONSE NOW WITH <file_changes> - NO OTHER TEXT:

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
// ... rest of complete file content
]]></content>
  </file>
</file_changes>`;
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

  return `# Insy Edit Request

=================================================================
CRITICAL OUTPUT FORMAT REQUIREMENT
=================================================================

YOU MUST RESPOND IN XML FORMAT ONLY - NO EXCEPTIONS
- DO NOT use file editing tools (write_to_file, edit_file, etc.)
- DO NOT make direct changes to files
- ONLY return XML with <file_changes> structure
- See "Response Format" section below for exact format

Why: The user needs to review and approve changes before they are applied.
If you edit files directly, the user loses control and visibility.

=================================================================

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

CRITICAL INSTRUCTIONS - READ CAREFULLY:

1. DO NOT use any file editing tools (write_to_file, edit_file, replace_in_file, etc.)
2. DO NOT make direct changes to files on disk
3. DO NOT execute any commands or scripts
4. ONLY return the modified code in XML format below

Why: The system needs to generate a visual diff that the user can review and approve/reject. If you edit files directly, the user loses control.

What you should do:
- Read the current code shown above
- Make the requested modifications mentally
- Return the COMPLETE modified file content in XML format
- The system will then generate a diff and show it to the user

Code modification guidelines:
1. Preserve the existing code structure and formatting style
2. Only change what's necessary to fulfill the request
3. Keep all imports, exports, and other components unchanged
4. Maintain the same indentation style (spaces/tabs)
5. Consider the conversation history for context

## Design Guidelines
When making visual/styling changes:
- Keep designs clean, minimal, and elegant
- Avoid complex gradients, excessive shadows, or overly decorative elements
- Prioritize simplicity, readability, and whitespace
- Use subtle colors and consistent spacing
- Less is more - aim for a refined, professional look

## Response Format

=================================================================
THIS IS THE MOST IMPORTANT PART - READ CAREFULLY
=================================================================

YOUR ENTIRE RESPONSE MUST BE:
1. ONLY the XML structure below
2. NO explanations before the XML
3. NO explanations after the XML
4. NO markdown formatting
5. NO code blocks with backticks
6. JUST pure XML starting with <file_changes>

YOU MUST RETURN YOUR RESPONSE IN THIS EXACT XML FORMAT:

Do not use tools. Do not edit files directly. Only return XML.

<file_changes>
  <summary>Brief description of what changes were made</summary>
  <file path="${sourceFilePath}" action="modify" language="${language}">
    <description>What was changed in this file</description>
    <content><![CDATA[
// Your complete modified code here
// Include the ENTIRE file content, not just the changed parts
// This is the full file after your modifications
]]></content>
  </file>
</file_changes>

### XML Format Rules:
1. MANDATORY: Wrap all code in <file_changes> XML tags as shown above
2. Always wrap file content in <![CDATA[...]]> to handle special characters
3. The "action" attribute must be one of: "create", "modify", "delete"
4. For "modify" actions, include the COMPLETE file content (entire file, not just changed lines)
5. For "delete" actions, leave <content> empty
6. You can include multiple <file> elements if changes span multiple files
7. Always include the full absolute file path in the "path" attribute

FINAL REMINDER: Your entire response should ONLY contain the XML format above. No explanations before or after. No tool usage. No file edits. Just pure XML with the modified code inside.

=================================================================
FINAL CHECKLIST BEFORE YOU RESPOND:
=================================================================

[ ] Did I use any file editing tools? (If YES -> STOP, return XML instead)
[ ] Did I make direct changes to files? (If YES -> STOP, return XML instead)
[ ] Is my response PURE XML starting with <file_changes>? (Must be YES)
[ ] Does my XML contain the COMPLETE file content? (Must be YES)
[ ] Did I wrap code in <![CDATA[...]]>? (Must be YES)

START YOUR RESPONSE NOW WITH <file_changes> - NO OTHER TEXT:

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
