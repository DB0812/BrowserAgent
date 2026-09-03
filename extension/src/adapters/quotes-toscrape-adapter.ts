/**
 * Quotes to Scrape Site Adapter — quotes.toscrape.com
 *
 * Supported workflows:
 *   - search: Search quotes by keyword
 *   - filter_by_tag: Click a tag to filter quotes by topic
 *   - navigate_pages: Use next/prev pagination
 *   - author_profile: Click author name to see their profile
 *
 * Key characteristics:
 *   - Purpose-built scraping test site — zero CAPTCHA, zero anti-bot
 *   - Stable, predictable structure
 *   - No login required for browsing (login page exists but is not needed)
 *   - Tag cloud for filtering by topic (e.g. "life", "love", "humor")
 *   - Multi-step navigation demonstrates agent loop
 */

import { BaseSiteAdapter, type SiteCapabilities, type PageContext } from './adapter-interface';
import type { UIElement, BrowserAction } from '../utils/types';

export class QuotesToscrapeAdapter extends BaseSiteAdapter {
  readonly name = 'Quotes to Scrape';
  readonly domains = ['quotes.toscrape.com'];
  readonly urlPatterns = [/https?:\/\/quotes\.toscrape\.com/];
  readonly supportLevel = 'full' as const;
  readonly workflows = ['search', 'filter_by_tag', 'navigate_pages', 'author_profile'];

  getCapabilities(): SiteCapabilities {
    return {
      workflows: this.workflows,
      hasRichA11y: false,
      hasStableIds: false,
      domains: this.domains,
      requiresScrollBeforeInteraction: false,
      isDynamic: false,
      stopBeforePayment: false,
    };
  }

  normalizeElements(elements: UIElement[]): UIElement[] {
    return elements.map(el => {
      // Enrich tag links
      if (el.tagName === 'a' && el.attributes['href']?.startsWith('/tag/')) {
        const tag = el.attributes['href'].replace('/tag/', '').replace(/\/$/, '');
        return { ...el, role: `Quote tag filter: "${tag}"`, ariaLabel: `Filter quotes by tag: ${tag}` };
      }
      // Enrich author links
      if (el.tagName === 'a' && el.attributes['href']?.startsWith('/author/')) {
        const author = el.role || el.label || 'Author';
        return { ...el, role: `Author profile: ${author}`, ariaLabel: `View profile of ${author}` };
      }
      // Enrich pagination
      if (el.tagName === 'a' && el.attributes['href']?.includes('/page/')) {
        const isNext = el.role?.toLowerCase().includes('next') || el.label?.toLowerCase().includes('next');
        const isPrev = el.role?.toLowerCase().includes('previous') || el.label?.toLowerCase().includes('previous');
        if (isNext) return { ...el, role: 'Pagination: Next page', ariaLabel: 'Go to next page of quotes' };
        if (isPrev) return { ...el, role: 'Pagination: Previous page', ariaLabel: 'Go to previous page' };
      }
      // Enrich search input (on /search page)
      if (el.tagName === 'input' && (el.attributes['name'] === 'q' || el.attributes['id'] === 'q')) {
        return { ...el, role: 'Quote search input', ariaLabel: 'Search quotes by keyword', label: 'Search quotes' };
      }
      return el;
    });
  }

  enrichPageContext(ctx: PageContext): PageContext {
    const isHomePage = ctx.url === 'http://quotes.toscrape.com/' || ctx.url === 'https://quotes.toscrape.com/';
    const isTagPage = ctx.url.includes('/tag/');
    const isSearchPage = ctx.url.includes('/search');
    const isAuthorPage = ctx.url.includes('/author/');
    const isPage = ctx.url.match(/\/page\/\d+/);

    let pageDescription = '';
    if (isHomePage) pageDescription = 'Quotes to Scrape home — quotes listed, tags in sidebar, use search or click tags to filter';
    else if (isTagPage) {
      const tagMatch = ctx.url.match(/\/tag\/([^/]+)/);
      const tag = tagMatch ? tagMatch[1].replace(/-/g, ' ') : 'topic';
      pageDescription = `Quotes filtered by tag: "${tag}" — showing quotes about ${tag}`;
    } else if (isSearchPage) {
      pageDescription = 'Quote search page — use the search box to find quotes by keyword';
    } else if (isAuthorPage) {
      pageDescription = `Author profile page: "${ctx.title}" — showing author biography and details`;
    } else if (isPage) {
      pageDescription = 'Paginated quotes listing — more quotes via next/previous pagination';
    }

    return {
      ...ctx,
      visibleText: pageDescription
        ? `[QUOTES.TOSCRAPE CONTEXT: ${pageDescription}]\n\n${ctx.visibleText}`
        : ctx.visibleText,
    };
  }

  validateAction(action: BrowserAction): string | null {
    // Block login attempts — not needed for demo
    if (action.action === 'navigate' && action.url?.includes('/login')) {
      return 'Quotes to Scrape: login not required for browsing. Redirect blocked.';
    }
    return null;
  }

  handleSpecialCase(situation: string, elements: UIElement[]): BrowserAction | null {
    return null;
  }

  describePageForLLM(ctx: PageContext): string {
    return `Quotes to Scrape — a demo quote website. Browse quotes, click tags (e.g. "life", "love") to filter, use search to find quotes by keyword, navigate pages with next/previous. When quotes matching the task are visible, consider the task done.`;
  }
}
