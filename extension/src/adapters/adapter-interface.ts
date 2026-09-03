/**
 * SiteAdapter Interface — Generic compatibility layer for specific websites.
 *
 * The generic agent core handles: perception, privacy, reasoning, action planning,
 * validation, execution, state tracking, logging, metrics.
 *
 * A SiteAdapter provides ONLY compatibility hints — NOT task logic.
 */

import type { UIElement, BrowserAction, SiteCompatibility } from '../utils/types';

export interface SiteCapabilities {
  /** What types of tasks this site can handle */
  workflows: string[];
  /** Whether the site has rich ARIA accessibility data */
  hasRichA11y: boolean;
  /** Whether the site has predictable stable element IDs */
  hasStableIds: boolean;
  /** Domains and URL patterns this adapter serves */
  domains: string[];
  /** Whether the site requires special scroll handling */
  requiresScrollBeforeInteraction: boolean;
  /** Hint: does this site load results dynamically (need wait after action)? */
  isDynamic: boolean;
  /** Warn: stop agent before any financial transaction */
  stopBeforePayment: boolean;
}

export interface ElementMapping {
  /** Semantic name of this element role */
  semanticRole: string;
  /** ARIA roles to match */
  ariaRoles?: string[];
  /** Text patterns to match */
  textPatterns?: RegExp[];
  /** CSS selector hints (fallback only) */
  selectorHints?: string[];
  /** Data attribute hints */
  dataAttributes?: Record<string, string>;
}

export interface PageContext {
  url: string;
  domain: string;
  elements: UIElement[];
  visibleText: string;
  title: string;
}

/**
 * Base SiteAdapter interface.
 * Implement this interface for each supported website.
 */
export interface SiteAdapter {
  /** Human-readable site name */
  readonly name: string;
  /** Domains this adapter handles, e.g. ['en.wikipedia.org'] */
  readonly domains: string[];
  /** URL regex patterns this adapter matches */
  readonly urlPatterns: RegExp[];
  /** Support level for this site */
  readonly supportLevel: SiteCompatibility;
  /** Supported workflow types */
  readonly workflows: string[];

  /**
   * Returns true if this adapter handles the given URL.
   */
  matches(url: string): boolean;

  /**
   * Returns the full capability specification for this site.
   */
  getCapabilities(): SiteCapabilities;

  /**
   * Enrich the page context with site-specific semantic annotations.
   * Called AFTER generic DOM/A11y analysis — only adds context, never removes.
   */
  enrichPageContext(ctx: PageContext): PageContext;

  /**
   * Normalize extracted UI elements — add semantic labels, fix roles.
   * Called AFTER generic element extraction.
   */
  normalizeElements(elements: UIElement[]): UIElement[];

  /**
   * Site-specific action validation. Return error string if action is
   * invalid for this site, null if OK. Called BEFORE action execution.
   * E.g. block checkout actions on e-commerce sites.
   */
  validateAction(action: BrowserAction): string | null;

  /**
   * Handle a site-specific special case situation.
   * Returns a suggested action, or null to let the generic agent decide.
   * E.g. handle cookie consent dialogs, login walls.
   */
  handleSpecialCase(situation: string, elements: UIElement[]): BrowserAction | null;

  /**
   * Returns a natural language description of the page context,
   * suitable for the LLM system prompt enrichment.
   */
  describePageForLLM(ctx: PageContext): string;
}

/**
 * Abstract base class providing default no-op implementations.
 * Site adapters should extend this and override what they need.
 */
export abstract class BaseSiteAdapter implements SiteAdapter {
  abstract readonly name: string;
  abstract readonly domains: string[];
  abstract readonly urlPatterns: RegExp[];
  abstract readonly supportLevel: SiteCompatibility;
  abstract readonly workflows: string[];

  matches(url: string): boolean {
    try {
      const hostname = new URL(url).hostname.replace(/^www\./, '');
      const domainMatch = this.domains.some(d => hostname === d || hostname.endsWith(`.${d}`));
      const patternMatch = this.urlPatterns.some(p => p.test(url));
      return domainMatch || patternMatch;
    } catch {
      return false;
    }
  }

  abstract getCapabilities(): SiteCapabilities;

  enrichPageContext(ctx: PageContext): PageContext {
    return ctx; // Default: pass through unchanged
  }

  normalizeElements(elements: UIElement[]): UIElement[] {
    return elements; // Default: pass through unchanged
  }

  validateAction(action: BrowserAction): string | null {
    return null; // Default: allow all actions
  }

  handleSpecialCase(_situation: string, _elements: UIElement[]): BrowserAction | null {
    return null; // Default: let generic agent handle it
  }

  describePageForLLM(ctx: PageContext): string {
    return `Site: ${this.name} | Workflows: ${this.workflows.join(', ')}`;
  }
}
