/**
 * Wikipedia Site Adapter — en.wikipedia.org
 *
 * Supported workflows:
 *   - search: Fill search box → click search → land on article
 *   - navigation: Click article links, navigate sections
 *   - article_reading: Extract headings, summarize visible content
 *
 * Key characteristics:
 *   - Very rich ARIA accessibility tree
 *   - Stable, well-maintained DOM structure
 *   - No login required, no CAPTCHA
 *   - Predictable search form (#searchInput)
 */

import { BaseSiteAdapter, type SiteCapabilities, type PageContext } from './adapter-interface';
import type { UIElement, BrowserAction } from '../utils/types';

export class WikipediaAdapter extends BaseSiteAdapter {
  readonly name = 'Wikipedia';
  readonly domains = ['en.wikipedia.org', 'wikipedia.org'];
  readonly urlPatterns = [/https?:\/\/(?:\w+\.)?wikipedia\.org/];
  readonly supportLevel = 'full' as const;
  readonly workflows = ['search', 'navigation', 'article_reading'];

  getCapabilities(): SiteCapabilities {
    return {
      workflows: this.workflows,
      hasRichA11y: true,
      hasStableIds: true,
      domains: this.domains,
      requiresScrollBeforeInteraction: false,
      isDynamic: false,
      stopBeforePayment: false,
    };
  }

  normalizeElements(elements: UIElement[]): UIElement[] {
    return elements.map(el => {
      // Enrich the Wikipedia search input
      if (el.domSelector === '#searchInput' || el.attributes['id'] === 'searchInput') {
        return { ...el, role: 'Wikipedia Search Input', ariaLabel: 'Search Wikipedia', label: 'Search Wikipedia' };
      }
      // Enrich search button
      if (el.domSelector === 'button[type="submit"]' && el.attributes['class']?.includes('search')) {
        return { ...el, role: 'Search Submit Button', ariaLabel: 'Search' };
      }
      // Mark result links clearly
      if (el.tagName === 'a' && el.attributes['href']?.startsWith('/wiki/')) {
        const articleTitle = el.attributes['href'].replace('/wiki/', '').replace(/_/g, ' ');
        return { ...el, role: `Wikipedia article link: ${articleTitle}`, ariaLabel: articleTitle };
      }
      return el;
    });
  }

  enrichPageContext(ctx: PageContext): PageContext {
    const isSearchResults = ctx.url.includes('search=') || ctx.url.includes('Special:Search');
    const isArticle = /\/wiki\/[^:]+$/.test(ctx.url) && !ctx.url.includes('Special:');
    const isMainPage = ctx.url.endsWith('/wiki/Main_Page') || ctx.url === 'https://en.wikipedia.org/';

    let pageDescription = '';
    if (isMainPage) pageDescription = 'Wikipedia Main Page — use the search box to find articles';
    else if (isSearchResults) pageDescription = 'Wikipedia Search Results — click a result link to open the article';
    else if (isArticle) {
      const title = ctx.title.replace(' - Wikipedia', '');
      pageDescription = `Wikipedia Article: "${title}" — content is available, consider task done if article is found`;
    }

    return {
      ...ctx,
      visibleText: pageDescription
        ? `[WIKIPEDIA CONTEXT: ${pageDescription}]\n\n${ctx.visibleText}`
        : ctx.visibleText,
    };
  }

  validateAction(action: BrowserAction): string | null {
    // Block any attempt to navigate to external sites
    if (action.action === 'navigate' && action.url) {
      if (!action.url.includes('wikipedia.org') && !action.url.startsWith('/')) {
        return 'Wikipedia adapter: blocked navigation to external site. Task should stay on Wikipedia.';
      }
    }
    return null;
  }

  handleSpecialCase(situation: string, elements: UIElement[]): BrowserAction | null {
    // Handle cookie consent banner if present
    if (situation.includes('cookie') || situation.includes('consent')) {
      const acceptBtn = elements.find(el =>
        (el.role?.toLowerCase().includes('accept') ||
         el.label?.toLowerCase().includes('accept')) &&
        el.tagName === 'button'
      );
      if (acceptBtn) {
        return {
          action: 'click',
          target: { type: 'selector', value: acceptBtn.domSelector },
          reason: 'Accept Wikipedia cookie consent to proceed',
          confidence: 0.95,
        };
      }
    }
    return null;
  }

  describePageForLLM(ctx: PageContext): string {
    const isArticle = /\/wiki\/[^:]+$/.test(ctx.url) && !ctx.url.includes('Special:');
    if (isArticle) {
      return `This is a Wikipedia article page. The article content is visible. If the task was to find/read information about a topic, this article page means the search task is nearing completion. Extract key information from PAGE TEXT and return 'done'.`;
    }
    return `Wikipedia | Supported workflows: ${this.workflows.join(', ')} | Use the search input (#searchInput) to search. After results appear, click a relevant article link.`;
  }
}
