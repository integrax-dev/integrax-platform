/**
 * Documentation Fetcher
 *
 * Fetches API documentation from various sources:
 * - OpenAPI/Swagger URLs
 * - Markdown files
 * - HTML documentation pages
 * - Raw text
 */

import * as cheerio from 'cheerio';
import type { APIDocumentation } from './types';

export interface FetchOptions {
  timeout?: number;
  headers?: Record<string, string>;
  followRedirects?: boolean;
}

export class DocFetcher {
  private timeout: number;

  constructor(options: { timeout?: number } = {}) {
    this.timeout = options.timeout || 30000;
  }

  /**
   * Fetch documentation from a URL
   */
  async fetchUrl(url: string, options: FetchOptions = {}): Promise<APIDocumentation> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), options.timeout || this.timeout);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'IntegraX-ConnectorLearning/1.0',
          'Accept': 'application/json, text/html, text/markdown, */*',
          ...options.headers,
        },
        redirect: options.followRedirects !== false ? 'follow' : 'manual',
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const contentType = response.headers.get('content-type') || '';
      const content = await response.text();

      // Detect source type
      const source = this.detectSourceType(url, contentType, content);

      return {
        source,
        content: source === 'html' ? this.extractTextFromHtml(content) : content,
        baseUrl: this.extractBaseUrl(url),
      };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Parse OpenAPI/Swagger specification
   */
  async parseOpenAPI(urlOrContent: string): Promise<APIDocumentation> {
    let content: string;
    let baseUrl: string | undefined;

    if (urlOrContent.startsWith('http')) {
      const doc = await this.fetchUrl(urlOrContent);
      content = doc.content;
      baseUrl = doc.baseUrl;
    } else {
      content = urlOrContent;
    }

    // Try to parse as JSON first, then YAML
    let parsed: any;
    try {
      parsed = JSON.parse(content);
    } catch {
      // Try YAML
      const yaml = await import('yaml');
      parsed = yaml.parse(content);
    }

    // Validate it's an OpenAPI spec
    if (!parsed.openapi && !parsed.swagger) {
      throw new Error('Not a valid OpenAPI/Swagger specification');
    }

    return {
      source: 'openapi',
      content: JSON.stringify(parsed, null, 2),
      baseUrl: parsed.servers?.[0]?.url || baseUrl,
      version: parsed.openapi || parsed.swagger,
    };
  }

  /**
   * Fetch documentation from multiple pages (crawl)
   */
  async crawlDocumentation(
    startUrl: string,
    options: {
      maxPages?: number;
      urlPattern?: RegExp;
      includeExamples?: boolean;
    } = {}
  ): Promise<APIDocumentation[]> {
    const maxPages = options.maxPages || 10;
    const visited = new Set<string>();
    const docs: APIDocumentation[] = [];
    const toVisit = [startUrl];

    while (toVisit.length > 0 && docs.length < maxPages) {
      const url = toVisit.shift()!;
      if (visited.has(url)) continue;
      visited.add(url);

      try {
        const response = await fetch(url, {
          headers: { 'User-Agent': 'IntegraX-ConnectorLearning/1.0' },
        });

        if (!response.ok) continue;

        const html = await response.text();
        const $ = cheerio.load(html);

        // Extract documentation content
        const docContent = this.extractDocContent($);
        if (docContent) {
          docs.push({
            source: 'html',
            content: docContent,
            baseUrl: this.extractBaseUrl(url),
          });
        }

        // Find more documentation links
        $('a[href]').each((_, el) => {
          const href = $(el).attr('href');
          if (!href) return;

          const absoluteUrl = new URL(href, url).toString();

          // Only follow links matching pattern or staying on same domain
          if (options.urlPattern) {
            if (options.urlPattern.test(absoluteUrl)) {
              toVisit.push(absoluteUrl);
            }
          } else if (absoluteUrl.startsWith(this.extractBaseUrl(url))) {
            // Check if it looks like API docs
            if (this.looksLikeApiDocs(absoluteUrl)) {
              toVisit.push(absoluteUrl);
            }
          }
        });
      } catch (err) {
        // Skip failed pages
        console.error(`Failed to fetch ${url}:`, err);
      }
    }

    return docs;
  }

  /**
   * Process raw markdown documentation
   */
  parseMarkdown(content: string): APIDocumentation {
    return {
      source: 'markdown',
      content,
    };
  }

  /**
   * Process raw text documentation
   */
  parseRaw(content: string): APIDocumentation {
    return {
      source: 'raw',
      content,
    };
  }

  // ============ Private Helpers ============

  private detectSourceType(
    url: string,
    contentType: string,
    content: string
  ): APIDocumentation['source'] {
    // Check URL
    if (url.includes('openapi') || url.includes('swagger')) {
      return 'openapi';
    }
    if (url.endsWith('.md')) {
      return 'markdown';
    }

    // Check content type
    if (contentType.includes('application/json')) {
      try {
        const parsed = JSON.parse(content);
        if (parsed.openapi || parsed.swagger) {
          return 'openapi';
        }
      } catch {
        // Not JSON
      }
      return 'raw';
    }
    if (contentType.includes('text/html')) {
      return 'html';
    }
    if (contentType.includes('text/markdown')) {
      return 'markdown';
    }

    // Check content
    if (content.trim().startsWith('{')) {
      try {
        const parsed = JSON.parse(content);
        if (parsed.openapi || parsed.swagger) {
          return 'openapi';
        }
      } catch {
        // Not JSON
      }
    }
    if (content.includes('```') || content.startsWith('#')) {
      return 'markdown';
    }

    return 'raw';
  }

  private extractTextFromHtml(html: string): string {
    const $ = cheerio.load(html);

    // Remove scripts, styles, nav, footer
    $('script, style, nav, footer, header, aside').remove();

    // Try to find main content
    const mainContent =
      $('main').text() ||
      $('article').text() ||
      $('.content').text() ||
      $('.documentation').text() ||
      $('body').text();

    return mainContent.replace(/\s+/g, ' ').trim();
  }

  private extractDocContent($: cheerio.CheerioAPI): string | null {
    // Look for API documentation patterns
    const selectors = [
      '.api-reference',
      '.endpoint',
      '.api-docs',
      '[data-endpoint]',
      'code.language-json',
      'code.language-curl',
      '.http-method',
      '.request-example',
      '.response-example',
    ];

    let content = '';

    // Extract endpoints
    $('pre, code').each((_, el) => {
      const text = $(el).text();
      if (this.looksLikeEndpoint(text)) {
        content += text + '\n\n';
      }
    });

    // Extract method/path patterns
    $('*').each((_, el) => {
      const text = $(el).text();
      if (/^(GET|POST|PUT|PATCH|DELETE)\s+\//.test(text.trim())) {
        content += text.trim() + '\n';
      }
    });

    return content.length > 100 ? content : null;
  }

  private extractBaseUrl(url: string): string {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.host}`;
  }

  private looksLikeApiDocs(url: string): boolean {
    const patterns = [
      /\/api\//i,
      /\/docs?\//i,
      /\/reference/i,
      /\/endpoints?/i,
      /\/v\d+\//i,
      /developer/i,
    ];
    return patterns.some((p) => p.test(url));
  }

  private looksLikeEndpoint(text: string): boolean {
    const patterns = [
      /^(GET|POST|PUT|PATCH|DELETE)\s+\//,
      /curl\s+-X?\s*(GET|POST|PUT|PATCH|DELETE)/i,
      /"(url|endpoint|path)":\s*"[^"]+"/,
      /https?:\/\/[^\s]+\/api\//,
    ];
    return patterns.some((p) => p.test(text));
  }
}

export function createDocFetcher(options?: { timeout?: number }): DocFetcher {
  return new DocFetcher(options);
}
