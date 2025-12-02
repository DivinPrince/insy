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
      () => this.tryHeuristicSearch(context),
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
        const filePath = path.join(this.projectRoot, reactContext.source.fileName);
        try {
          await readFile(filePath, 'utf-8');
          return [
            {
              path: filePath,
              relevance: 0.95,
              lineStart: reactContext.source.lineNumber || 1,
            },
          ];
        } catch {
          // File not found
        }
      }
    }

    // Vue debug info
    if (context.framework.type === 'vue' && context.frameworkContext) {
      const vueContext = context.frameworkContext as any;
      if (vueContext.source) {
        const filePath = path.join(this.projectRoot, vueContext.source);
        try {
          await readFile(filePath, 'utf-8');
          return [
            {
              path: filePath,
              relevance: 0.95,
              lineStart: 1,
            },
          ];
        } catch {
          // File not found
        }
      }
    }

    return [];
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

  private async tryHeuristicSearch(context: ElementContext): Promise<SourceFile[]> {
    const searchTerms = this.buildSearchTerms(context);
    const files = await this.searchCodebase(searchTerms);

    return files
      .map((file) => ({
        ...file,
        confidence: this.calculateConfidence(file, context),
      }))
      .filter((f) => f.confidence > 0.5)
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 5)
      .map(({ confidence, ...file }) => ({ ...file, relevance: confidence }));
  }

  private buildSearchTerms(context: ElementContext): string[] {
    const terms: string[] = [];

    // Component name
    const componentName = this.getComponentName(context);
    if (componentName) {
      terms.push(componentName);
    }

    // Unique text content
    if (context.element.textContent && context.element.textContent.length > 10) {
      terms.push(context.element.textContent.trim());
    }

    // CSS classes
    if (context.element.className) {
      const classes = context.element.className.split(' ').filter((c) => c.trim());
      terms.push(...classes);
    }

    // ID
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
    let score = 0.5;

    const componentName = this.getComponentName(context);
    if (componentName && file.excerpt.includes(componentName)) {
      score += 0.3;
    }

    if (context.element.textContent && file.excerpt.includes(context.element.textContent)) {
      score += 0.2;
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
