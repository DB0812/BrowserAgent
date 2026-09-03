/**
 * Books to Scrape Site Adapter — books.toscrape.com
 *
 * Supported workflows:
 *   - browse_category: Click category in nav sidebar → see book list
 *   - view_product: Click a book → see details, price, rating
 *   - navigate_pages: Use pagination (next/prev) to browse more books
 *
 * Key characteristics:
 *   - Purpose-built scraping test site — zero CAPTCHA, zero anti-bot
 *   - Stable, predictable DOM structure
 *   - No login required
 *   - Rich category navigation sidebar
 *   - Book cards with title, price, rating, availability
 *   - No payment/checkout — just browsing
 */

import { BaseSiteAdapter, type SiteCapabilities, type PageContext } from './adapter-interface';
import type { UIElement, BrowserAction } from '../utils/types';

export class BooksToscrapeAdapter extends BaseSiteAdapter {
  readonly name = 'Books to Scrape';
  readonly domains = ['books.toscrape.com'];
  readonly urlPatterns = [/https?:\/\/books\.toscrape\.com/];
  readonly supportLevel = 'full' as const;
  readonly workflows = ['browse_category', 'view_product', 'navigate_pages', 'search'];

  getCapabilities(): SiteCapabilities {
    return {
      workflows: this.workflows,
      hasRichA11y: false,
      hasStableIds: false,
      domains: this.domains,
      requiresScrollBeforeInteraction: false,
      isDynamic: false,
      stopBeforePayment: true,
    };
  }

  normalizeElements(elements: UIElement[]): UIElement[] {
    return elements.map(el => {
      // Enrich category navigation links
      if (el.tagName === 'a' && el.domSelector?.includes('side_categories')) {
        return { ...el, role: `Category navigation: ${el.role || el.label || 'category'}` };
      }
      // Enrich book title links
      if (el.tagName === 'a' && el.attributes['href']?.includes('catalogue/')) {
        const title = el.role || el.label || 'Book';
        return { ...el, role: `Book: ${title}`, ariaLabel: `View details for ${title}` };
      }
      // Enrich pagination
      if (el.tagName === 'a' && (el.role?.toLowerCase() === 'next' || el.label?.toLowerCase() === 'next')) {
        return { ...el, role: 'Pagination: Next page', ariaLabel: 'Go to next page' };
      }
      if (el.tagName === 'a' && (el.role?.toLowerCase() === 'previous' || el.label?.toLowerCase() === 'previous')) {
        return { ...el, role: 'Pagination: Previous page', ariaLabel: 'Go to previous page' };
      }
      return el;
    });
  }

  enrichPageContext(ctx: PageContext): PageContext {
    const isCatalogueRoot = ctx.url.endsWith('books.toscrape.com/') || ctx.url.endsWith('catalogue/');
    const isCategoryPage = ctx.url.includes('catalogue/category/');
    const isBookDetail = ctx.url.includes('catalogue/') && !ctx.url.includes('category/') && ctx.url.endsWith('.html');
    const isPage = ctx.url.includes('page-');

    let pageDescription = '';
    if (isCatalogueRoot) pageDescription = 'Books to Scrape home — browse categories in the sidebar on the left, or view all books';
    else if (isCategoryPage) {
      const catMatch = ctx.url.match(/category\/books\/([^/]+)/);
      const catName = catMatch ? catMatch[1].replace(/-\d+$/, '').replace(/-/g, ' ') : 'category';
      pageDescription = `Category page: "${catName}" — showing books in this category`;
    } else if (isBookDetail) {
      pageDescription = `Book detail page: "${ctx.title}" — showing full details, price, rating, availability`;
    } else if (isPage) {
      pageDescription = 'Paginated book listing — more books available via pagination links';
    }

    return {
      ...ctx,
      visibleText: pageDescription
        ? `[BOOKS.TOSCRAPE CONTEXT: ${pageDescription}]\n\n${ctx.visibleText}`
        : ctx.visibleText,
    };
  }

  validateAction(action: BrowserAction): string | null {
    // Block any checkout/purchase attempts — this is a demo only site
    if (action.action === 'click') {
      const target = action.target?.value?.toLowerCase() ?? '';
      if (target.includes('basket') || target.includes('checkout') || target.includes('add-to-basket')) {
        return 'Books to Scrape adapter: this is a demo site — stopping before basket/checkout. Task complete at browse stage.';
      }
    }
    return null;
  }

  handleSpecialCase(situation: string, _elements: UIElement[]): BrowserAction | null {
    // No special cases needed for books.toscrape.com — it's very clean
    return null;
  }

  describePageForLLM(ctx: PageContext): string {
    return `Books to Scrape — a book catalogue demo site. Navigate categories in the left sidebar, click book titles to see details. DO NOT add to basket. When books are listed or a book detail is visible, consider the browse task done.`;
  }
}
