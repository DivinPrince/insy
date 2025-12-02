import type { CodeChange, CodeChangeAction, StructuredCodeResponse } from '@pixelcode/shared';

/**
 * Parse structured XML response from AI
 * 
 * Expected format:
 * <file_changes>
 *   <summary>Brief description</summary>
 *   <file path="/path/to/file" action="modify" language="tsx">
 *     <description>What changed</description>
 *     <content><![CDATA[...code...]]></content>
 *   </file>
 * </file_changes>
 */
export function parseStructuredResponse(response: string): StructuredCodeResponse {
  // Try to extract <file_changes> block
  const fileChangesMatch = response.match(/<file_changes>([\s\S]*?)<\/file_changes>/);
  
  if (!fileChangesMatch) {
    console.warn('[Parser] No <file_changes> block found, falling back to legacy parsing');
    return parseLegacyResponse(response);
  }
  
  const fileChangesContent = fileChangesMatch[1];
  
  // Extract summary
  const summaryMatch = fileChangesContent.match(/<summary>([\s\S]*?)<\/summary>/);
  const summary = summaryMatch ? summaryMatch[1].trim() : undefined;
  
  // Extract all file blocks
  const fileRegex = /<file\s+path="([^"]+)"\s+action="([^"]+)"\s+language="([^"]+)">([\s\S]*?)<\/file>/g;
  const changes: CodeChange[] = [];
  
  let match;
  while ((match = fileRegex.exec(fileChangesContent)) !== null) {
    const [, filePath, action, language, fileContent] = match;
    
    // Validate action
    if (!isValidAction(action)) {
      console.warn(`[Parser] Invalid action "${action}" for file ${filePath}, defaulting to "modify"`);
    }
    
    // Extract description
    const descMatch = fileContent.match(/<description>([\s\S]*?)<\/description>/);
    const description = descMatch ? descMatch[1].trim() : undefined;
    
    // Extract content - handle CDATA and regular content
    let content = '';
    const cdataMatch = fileContent.match(/<content><!\[CDATA\[([\s\S]*?)\]\]><\/content>/);
    if (cdataMatch) {
      content = cdataMatch[1];
    } else {
      const contentMatch = fileContent.match(/<content>([\s\S]*?)<\/content>/);
      if (contentMatch) {
        content = unescapeXml(contentMatch[1]);
      }
    }
    
    // Trim leading/trailing newlines but preserve internal formatting
    content = content.replace(/^\n+/, '').replace(/\n+$/, '');
    
    changes.push({
      filePath,
      action: isValidAction(action) ? action : 'modify',
      language,
      content,
      description,
    });
  }
  
  if (changes.length === 0) {
    console.warn('[Parser] No <file> blocks found in <file_changes>, falling back to legacy parsing');
    return parseLegacyResponse(response);
  }
  
  console.log(`[Parser] Successfully parsed ${changes.length} file change(s)`);
  return { changes, summary };
}

/**
 * Legacy parser for backward compatibility with simple code block responses
 */
function parseLegacyResponse(response: string): StructuredCodeResponse {
  // Extract code block from response
  const codeBlockRegex = /```(\w+)?\s*\n([\s\S]+?)```/;
  const match = response.match(codeBlockRegex);
  
  if (!match) {
    console.warn('[Parser] No code block found in response');
    return {
      changes: [{
        filePath: 'unknown',
        action: 'modify',
        language: 'javascript',
        content: response.trim(),
      }],
    };
  }
  
  const language = match[1] || 'javascript';
  const code = match[2].trim();
  
  return {
    changes: [{
      filePath: 'unknown',  // Will need to be filled in by caller
      action: 'modify',
      language,
      content: code,
    }],
  };
}

/**
 * Check if a string is a valid CodeChangeAction
 */
function isValidAction(action: string): action is CodeChangeAction {
  return ['create', 'modify', 'delete'].includes(action);
}

/**
 * Unescape XML entities in content
 */
function unescapeXml(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

/**
 * Check if response appears to be in structured XML format
 */
export function isStructuredResponse(response: string): boolean {
  return response.includes('<file_changes>') && response.includes('</file_changes>');
}
