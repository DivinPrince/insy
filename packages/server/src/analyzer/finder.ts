import fg from 'fast-glob';
import { readFile } from 'fs/promises';
import path from 'path';
import type { ElementContext, SourceFile } from '@pixelcode/shared';

const glob = fg;

export class SourceFileFinder {
  constructor(private projectRoot: string) {}

  async findSourceFiles(context: ElementContext): Promise<SourceFile[]> {
    const strategies = [
      () => this.tryDataSourceAttribute(context),
      () => this.tryDebugInfo(context),
      () => this.tryHTMLFile(context),          // Special case for plain HTML
      () => this.tryComponentSearch(context),   // Search for React/Vue components
      () => this.tryHeuristicSearch(context),
      () => this.tryFallbackScan(context),      // Fallback: scan all source files
    ];

    for (const strategy of strategies) {
      const results = await strategy();
      if (results.length > 0) {
        return results;
      }
    }

    return [];
  }

  private async tryDataSourceAttribute(context: ElementContext): Promise<SourceFile[]> {
    if (!context.sourceHints?.dataSource) {
      return [];
    }

    const [relativePath, lineStr] = context.sourceHints.dataSource.split(':');
    const filePath = path.join(this.projectRoot, relativePath);
    const lineStart = lineStr ? parseInt(lineStr, 10) : 1;

    try {
      await readFile(filePath, 'utf-8');
      return [
        {
          path: filePath,
          relevance: 1.0,
          lineStart,
        },
      ];
    } catch {
      return [];
    }
  }

  private async tryDebugInfo(context: ElementContext): Promise<SourceFile[]> {
    // React debug info
    if (
      (context.framework.type === 'react' || context.framework.type === 'nextjs') &&
      context.frameworkContext
    ) {
      const reactContext = context.frameworkContext as any;
      if (reactContext.source?.fileName) {
        // Try multiple path resolutions for React source
        const possiblePaths = this.resolvePossiblePaths(reactContext.source.fileName);
        
        for (const filePath of possiblePaths) {
          try {
            await readFile(filePath, 'utf-8');
            console.log('[Finder] Found via React debug info:', filePath);
            return [
              {
                path: filePath,
                relevance: 0.95,
                lineStart: reactContext.source.lineNumber || 1,
              },
            ];
          } catch {
            // Try next path
          }
        }
      }
    }

    // Vue debug info
    if (context.framework.type === 'vue' && context.frameworkContext) {
      const vueContext = context.frameworkContext as any;
      if (vueContext.source) {
        const possiblePaths = this.resolvePossiblePaths(vueContext.source);
        
        for (const filePath of possiblePaths) {
          try {
            await readFile(filePath, 'utf-8');
            console.log('[Finder] Found via Vue debug info:', filePath);
            return [
              {
                path: filePath,
                relevance: 0.95,
                lineStart: 1,
              },
            ];
          } catch {
            // Try next path
          }
        }
      }
    }

    return [];
  }
  
  // Helper to resolve various path formats to actual file paths
  private resolvePossiblePaths(sourcePath: string): string[] {
    const paths: string[] = [];
    
    // Normalize the path
    let normalized = sourcePath.replace(/\\/g, '/');
    
    // Remove webpack/vite prefixes
    normalized = normalized.replace(/^(webpack:\/\/|vite:\/\/|\/\/)/, '');
    normalized = normalized.replace(/^\.[\/\\]/, '');
    
    // Try direct join
    paths.push(path.join(this.projectRoot, normalized));
    
    // Try with src/ prefix
    if (!normalized.startsWith('src/')) {
      paths.push(path.join(this.projectRoot, 'src', normalized));
    }
    
    // Try with app/ prefix (Next.js)
    if (!normalized.startsWith('app/')) {
      paths.push(path.join(this.projectRoot, 'app', normalized));
    }
    
    // Try stripping common prefixes
    const prefixes = ['src/', 'app/', 'pages/', 'components/', './'];
    for (const prefix of prefixes) {
      if (normalized.startsWith(prefix)) {
        paths.push(path.join(this.projectRoot, normalized.substring(prefix.length)));
      }
    }
    
    // If path looks absolute, try it as-is (for local dev paths)
    if (path.isAbsolute(sourcePath)) {
      paths.push(sourcePath);
    }
    
    return [...new Set(paths)]; // Remove duplicates
  }

  private async tryHTMLFile(context: ElementContext): Promise<SourceFile[]> {
    // For plain HTML frameworks, look for HTML files
    if (context.framework.type !== 'html') {
      return [];
    }

    // Look for index.html or any HTML files in common locations
    const htmlPatterns = [
      'index.html',
      '*.html',
      'public/index.html',
      'public/*.html',
      'examples/**/*.html',
      'src/**/*.html',
      '**/*.html',
    ];

    console.log('[Finder] Searching for HTML files in:', this.projectRoot);

    try {
      const htmlFiles = await glob(htmlPatterns, {
        cwd: this.projectRoot,
        absolute: true,
        ignore: ['**/node_modules/**', '**/dist/**', '**/build/**'],
      });

      console.log('[Finder] Found HTML files:', htmlFiles);

      const results: SourceFile[] = [];

      // Search HTML files for the element's content or attributes
      for (const filePath of htmlFiles) {
        try {
          const content = await readFile(filePath, 'utf-8');
          
          // Base relevance - always consider HTML files as candidates
          let relevance = 0.3;
          
          // Check for matching tag name in content
          const tagName = context.element.tagName.toLowerCase();
          if (content.toLowerCase().includes(`<${tagName}`)) {
            relevance += 0.2;
          }
          
          // Check for text content match
          if (context.element.textContent) {
            const textContent = context.element.textContent.trim();
            if (textContent && textContent.length > 0 && content.includes(textContent)) {
              relevance += 0.3;
            }
          }
          
          // Check for id match
          if (context.element.id && content.includes(`id="${context.element.id}"`)) {
            relevance += 0.4;
          }
          
          // Check for class match
          if (context.element.className) {
            const classes = context.element.className.split(' ').filter(c => c.trim());
            for (const cls of classes) {
              if (content.includes(cls)) {
                relevance += 0.1;
                break;
              }
            }
          }

          // Always include HTML files with at least base relevance
          // If the tag exists in the file, that's enough to be a candidate
          if (relevance >= 0.3) {
            results.push({
              path: filePath,
              relevance: Math.min(relevance, 1.0),
              lineStart: 1,
            });
            console.log('[Finder] Matched file:', filePath, 'relevance:', relevance);
          }
        } catch (err) {
          console.error('[Finder] Error reading file:', filePath, err);
        }
      }

      // If we found any results, return them sorted by relevance
      if (results.length > 0) {
        return results.sort((a, b) => b.relevance - a.relevance);
      }

      // If no matches found but we have HTML files, return the first one as fallback
      if (htmlFiles.length > 0) {
        console.log('[Finder] No matches, using fallback:', htmlFiles[0]);
        return [{
          path: htmlFiles[0],
          relevance: 0.5,
          lineStart: 1,
        }];
      }

      return [];
    } catch (err) {
      console.error('[Finder] Error searching for HTML files:', err);
      return [];
    }
  }

  // New strategy: Search for React/Vue component files by analyzing fiber path
  private async tryComponentSearch(context: ElementContext): Promise<SourceFile[]> {
    if (context.framework.type !== 'react' && context.framework.type !== 'nextjs' && context.framework.type !== 'vue') {
      return [];
    }

    const reactContext = context.frameworkContext as any;
    if (!reactContext?.fiberPath || reactContext.fiberPath.length === 0) {
      return [];
    }

    console.log('[Finder] Searching by component path:', reactContext.fiberPath);

    // Find meaningful component names from the fiber path
    const componentNames = reactContext.fiberPath.filter((name: string) => {
      // Skip HTML tags and common React internals
      const lowerName = name.toLowerCase();
      const htmlTags = ['div', 'span', 'p', 'a', 'button', 'input', 'form', 'ul', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'img', 'nav', 'header', 'footer', 'main', 'section', 'article'];
      const reactInternals = ['suspense', 'fragment', 'provider', 'consumer', 'context', 'portal', 'strict'];
      
      return !htmlTags.includes(lowerName) && 
             !reactInternals.includes(lowerName) &&
             name.length > 1 &&
             /^[A-Z]/.test(name); // Component names start with uppercase
    });

    if (componentNames.length === 0) {
      return [];
    }

    console.log('[Finder] Looking for components:', componentNames);

    // Search for files that might contain these components
    const patterns = [
      'src/**/*.{jsx,tsx,js,ts}',
      'app/**/*.{jsx,tsx,js,ts}',
      'pages/**/*.{jsx,tsx,js,ts}',
      'components/**/*.{jsx,tsx,js,ts}',
      '**/*.{jsx,tsx}',
    ];

    const files = await glob(patterns, {
      cwd: this.projectRoot,
      ignore: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/.next/**'],
      absolute: true,
    });

    const results: SourceFile[] = [];

    for (const filePath of files) {
      try {
        const content = await readFile(filePath, 'utf-8');
        let relevance = 0;

        // Check if file contains any of the component definitions
        for (const compName of componentNames) {
          // Check for function component declaration
          if (content.includes(`function ${compName}`) || 
              content.includes(`const ${compName} =`) ||
              content.includes(`export default function ${compName}`) ||
              content.includes(`export function ${compName}`)) {
            relevance += 0.5;
          }

          // Check for class component
          if (content.includes(`class ${compName}`)) {
            relevance += 0.5;
          }

          // Check if file name matches component name
          const fileName = path.basename(filePath, path.extname(filePath));
          if (fileName.toLowerCase() === compName.toLowerCase() || 
              fileName === compName ||
              fileName === `${compName}.component` ||
              fileName === `${compName}Component`) {
            relevance += 0.4;
          }
        }

        // Check for element's className in the file (but filter out generic Tailwind classes)
        if (context.element.className) {
          const classes = context.element.className.split(' ').filter(c => {
            const trimmed = c.trim();
            // Skip common utility classes
            const utilityClasses = ['flex', 'grid', 'block', 'inline', 'hidden', 'relative', 'absolute', 'fixed', 'sticky',
              'w-full', 'h-full', 'p-', 'm-', 'px-', 'py-', 'mx-', 'my-', 'pt-', 'pb-', 'pl-', 'pr-',
              'text-', 'bg-', 'border', 'rounded', 'shadow', 'overflow', 'items-', 'justify-', 'gap-'];
            return trimmed.length > 3 && !utilityClasses.some(u => trimmed.startsWith(u) || trimmed === u);
          });

          for (const cls of classes) {
            if (content.includes(`"${cls}"`) || content.includes(`'${cls}'`) || content.includes(`className="${cls}`)) {
              relevance += 0.2;
            }
          }
        }

        // Check for text content (if significant)
        if (context.element.textContent && context.element.textContent.length > 5 && context.element.textContent.length < 100) {
          const textContent = context.element.textContent.trim();
          if (content.includes(textContent)) {
            relevance += 0.3;
          }
        }

        if (relevance > 0.3) {
          results.push({
            path: filePath,
            relevance: Math.min(relevance, 1.0),
            lineStart: 1,
          });
        }
      } catch {
        // Skip files that can't be read
      }
    }

    if (results.length > 0) {
      const sorted = results.sort((a, b) => b.relevance - a.relevance).slice(0, 5);
      console.log('[Finder] Found components:', sorted.map(r => `${path.basename(r.path)} (${r.relevance.toFixed(2)})`));
      return sorted;
    }

    return [];
  }

  private async tryHeuristicSearch(context: ElementContext): Promise<SourceFile[]> {
    const searchTerms = this.buildSearchTerms(context);
    
    if (searchTerms.length === 0) {
      return [];
    }
    
    const files = await this.searchCodebase(searchTerms);

    const results = files
      .map((file) => ({
        ...file,
        confidence: this.calculateConfidence(file, context),
      }))
      .filter((f) => f.confidence > 0.4) // Lower threshold
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 5)
      .map(({ confidence, ...file }) => ({ ...file, relevance: confidence }));
      
    if (results.length > 0) {
      console.log('[Finder] Heuristic search found:', results.map(r => `${path.basename(r.path)} (${r.relevance.toFixed(2)})`));
    }
    
    return results;
  }
  
  // Fallback: scan all source files and pick the most likely one
  private async tryFallbackScan(context: ElementContext): Promise<SourceFile[]> {
    console.log('[Finder] Using fallback scan...');
    
    const patterns = [
      'src/**/*.{jsx,tsx,js,ts,vue,html}',
      'app/**/*.{jsx,tsx,js,ts}',
      'pages/**/*.{jsx,tsx,js,ts}',
      'components/**/*.{jsx,tsx,js,ts,vue}',
      '*.{html,jsx,tsx}',
    ];

    const files = await glob(patterns, {
      cwd: this.projectRoot,
      ignore: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/.next/**'],
      absolute: true,
    });

    if (files.length === 0) {
      return [];
    }

    const results: SourceFile[] = [];

    for (const filePath of files) {
      try {
        const content = await readFile(filePath, 'utf-8');
        let relevance = 0.2; // Base relevance

        // Prefer files with JSX content
        if (content.includes('className=') || content.includes('class=')) {
          relevance += 0.1;
        }

        // Check for element's tag in JSX format
        const tagName = context.element.tagName.toLowerCase();
        if (content.includes(`<${tagName}`) || content.includes(`<${tagName.charAt(0).toUpperCase() + tagName.slice(1)}`)) {
          relevance += 0.1;
        }

        // Prefer entry points
        const fileName = path.basename(filePath).toLowerCase();
        if (['page.tsx', 'page.jsx', 'index.tsx', 'index.jsx', 'app.tsx', 'app.jsx', 'index.html'].includes(fileName)) {
          relevance += 0.2;
        }

        // Check for main/home pages
        if (filePath.includes('/page.') || filePath.includes('/home') || filePath.includes('/index.')) {
          relevance += 0.1;
        }

        results.push({
          path: filePath,
          relevance,
          lineStart: 1,
        });
      } catch {
        // Skip
      }
    }

    if (results.length > 0) {
      const sorted = results.sort((a, b) => b.relevance - a.relevance).slice(0, 3);
      console.log('[Finder] Fallback found:', sorted.map(r => `${path.basename(r.path)} (${r.relevance.toFixed(2)})`));
      return sorted;
    }

    return [];
  }

  private buildSearchTerms(context: ElementContext): string[] {
    const terms: string[] = [];

    // Component name (highest priority)
    const componentName = this.getComponentName(context);
    if (componentName) {
      terms.push(componentName);
    }

    // Unique text content (only if it's meaningful)
    if (context.element.textContent) {
      const text = context.element.textContent.trim();
      if (text.length > 10 && text.length < 100) {
        terms.push(text);
      }
    }

    // CSS classes (filter out common utility classes)
    if (context.element.className) {
      const classes = context.element.className.split(' ').filter((c) => {
        const cls = c.trim();
        // Skip common Tailwind/utility classes
        const utilityPrefixes = ['flex', 'grid', 'block', 'inline', 'hidden', 'w-', 'h-', 'p-', 'm-', 'px-', 'py-', 
          'mx-', 'my-', 'pt-', 'pb-', 'pl-', 'pr-', 'mt-', 'mb-', 'ml-', 'mr-', 'text-', 'bg-', 'border-', 
          'rounded', 'shadow', 'overflow-', 'items-', 'justify-', 'gap-', 'space-', 'font-', 'leading-',
          'tracking-', 'opacity-', 'z-', 'top-', 'bottom-', 'left-', 'right-', 'inset-', 'min-', 'max-',
          'sm:', 'md:', 'lg:', 'xl:', '2xl:', 'hover:', 'focus:', 'active:', 'dark:'];
        return cls.length > 3 && !utilityPrefixes.some(p => cls.startsWith(p) || cls === p.slice(0, -1));
      });
      terms.push(...classes);
    }

    // ID (if present, it's usually unique)
    if (context.element.id) {
      terms.push(context.element.id);
    }

    return terms;
  }

  private async searchCodebase(
    searchTerms: string[]
  ): Promise<Array<{ path: string; lineStart: number; excerpt: string }>> {
    const results: Array<{ path: string; lineStart: number; excerpt: string }> = [];

    // Get all source files - including root-level HTML files
    const patterns = [
      '*.{html,htm}',                                    // Root-level HTML files
      'src/**/*.{js,jsx,ts,tsx,vue,html}',
      'app/**/*.{js,jsx,ts,tsx,html}',
      'pages/**/*.{js,jsx,ts,tsx,html}',
      'components/**/*.{js,jsx,ts,tsx,vue}',
      'public/**/*.html',                                 // Public HTML files
      'examples/**/*.{html,js,jsx,ts,tsx}',              // Example files
    ];

    const files = await glob(patterns, {
      cwd: this.projectRoot,
      ignore: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/.next/**'],
      absolute: true,
    });

    // Search each file for terms
    for (const filePath of files) {
      try {
        const content = await readFile(filePath, 'utf-8');
        const lines = content.split('\n');

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          for (const term of searchTerms) {
            if (line.includes(term)) {
              results.push({
                path: filePath,
                lineStart: i + 1,
                excerpt: line.trim(),
              });
              break; // Found a match in this line
            }
          }
        }
      } catch (error) {
        // Skip files that can't be read
      }
    }

    return results;
  }

  private calculateConfidence(
    file: { path: string; lineStart: number; excerpt: string },
    context: ElementContext
  ): number {
    let score = 0.3; // Lower base score

    const componentName = this.getComponentName(context);
    if (componentName && file.excerpt.includes(componentName)) {
      score += 0.4;
    }

    if (context.element.textContent) {
      const text = context.element.textContent.trim();
      if (text.length > 5 && file.excerpt.includes(text.substring(0, 30))) {
        score += 0.2;
      }
    }
    
    // Bonus for JSX files
    if (file.path.endsWith('.tsx') || file.path.endsWith('.jsx')) {
      score += 0.1;
    }
    
    // Check if file path suggests it's a page or main component
    if (file.path.includes('/page.') || file.path.includes('/index.') || file.path.includes('/app.')) {
      score += 0.1;
    }

    return Math.min(score, 1.0);
  }

  private getComponentName(context: ElementContext): string | undefined {
    if (
      (context.framework.type === 'react' || context.framework.type === 'nextjs') &&
      context.frameworkContext
    ) {
      return (context.frameworkContext as any).componentName;
    }
    if (context.framework.type === 'vue' && context.frameworkContext) {
      return (context.frameworkContext as any).componentName;
    }
    return undefined;
  }
}
