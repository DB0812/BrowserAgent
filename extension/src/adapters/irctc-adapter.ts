/**
 * IRCTC Site Adapter — irctc.co.in
 *
 * Supported workflows:
 *   - train_search: Fill source/destination station, pick date, search trains
 *   - pnr_status:   Enter PNR number, check train status
 *
 * Key characteristics:
 *   - Older Angular application with some modern upgrades
 *   - Station search uses autocomplete (type station name/code → pick suggestion)
 *   - Date picker is a custom calendar widget
 *   - Login IS required for ticket booking — agent MUST stop at search results
 *   - PNR status check does NOT require login
 *   - stopBeforePayment: true (never proceed past seat selection / payment)
 */

import { BaseSiteAdapter, type SiteCapabilities, type PageContext } from './adapter-interface';
import type { UIElement, BrowserAction } from '../utils/types';

export class IrctcAdapter extends BaseSiteAdapter {
  readonly name = 'IRCTC';
  readonly domains = ['irctc.co.in', 'www.irctc.co.in'];
  readonly urlPatterns = [/https?:\/\/(?:www\.)?irctc\.co\.in/];
  readonly supportLevel = 'experimental' as const;
  readonly workflows = ['train_search', 'pnr_status'];

  getCapabilities(): SiteCapabilities {
    return {
      workflows: this.workflows,
      hasRichA11y: false,
      hasStableIds: false,
      domains: this.domains,
      requiresScrollBeforeInteraction: false,
      isDynamic: true,
      stopBeforePayment: true,
    };
  }

  normalizeElements(elements: UIElement[]): UIElement[] {
    return elements.map(el => {
      const hint = [
        el.placeholder, el.label, el.role, el.ariaLabel,
        el.domSelector, el.attributes?.['id'], el.attributes?.['name'],
        el.attributes?.['formcontrolname'], el.attributes?.['class'],
      ].join(' ').toLowerCase();

      // Source / From station input
      if (/from.station|origin|source.station|from\b/.test(hint) && el.tagName === 'input') {
        return { ...el, label: 'From Station', ariaLabel: 'From Station', role: 'Origin station search input' };
      }
      // Destination / To station input
      if (/to.station|destination.station|\bto\b|dest/.test(hint) && el.tagName === 'input') {
        return { ...el, label: 'To Station', ariaLabel: 'To Station', role: 'Destination station search input' };
      }
      // Journey date input / picker
      if (/journey.date|travel.date|date.of.journey|depart/.test(hint)) {
        return { ...el, label: 'Journey Date', ariaLabel: 'Journey Date', role: 'Journey date picker' };
      }
      // PNR input
      if (/pnr/.test(hint) && el.tagName === 'input') {
        return { ...el, label: 'PNR Number', ariaLabel: 'PNR Number', role: 'PNR number input' };
      }
      // Search / Find trains button
      if (el.tagName === 'button' && /search.train|find.train|get.train|search/.test(hint)) {
        return { ...el, label: 'Search Trains', ariaLabel: 'Search Trains', role: 'Search trains button' };
      }
      // Get PNR Status button
      if (el.tagName === 'button' && /pnr.status|get.status|check.pnr/.test(hint)) {
        return { ...el, label: 'Get PNR Status', ariaLabel: 'Check PNR Status', role: 'PNR status button' };
      }
      // Quota / class selector
      if (/quota|class|travel.class/.test(hint) && (el.tagName === 'select' || el.role === 'combobox')) {
        return { ...el, label: 'Travel Class/Quota', role: 'Travel class or quota selector' };
      }
      return el;
    });
  }

  enrichPageContext(ctx: PageContext): PageContext {
    const url = ctx.url.toLowerCase();
    let hint = '';

    if (url.includes('pnr') || url.includes('status')) {
      hint = '[IRCTC PNR STATUS] Enter your 10-digit PNR number in the PNR input field and click "Get PNR Status". No login required.';
    } else {
      hint = '[IRCTC TRAIN SEARCH] Steps: (1) Fill "From Station" field (type station name or code), (2) wait for autocomplete and click the correct station suggestion, (3) fill "To Station" and click suggestion, (4) pick Journey Date from the calendar, (5) optionally select travel class/quota, (6) click "Search Trains". STOP when train availability results are shown. Do NOT proceed to booking, seat selection, or payment — login is required for those steps.';
    }

    return {
      ...ctx,
      visibleText: `${hint}\n\n${ctx.visibleText}`,
    };
  }

  validateAction(action: BrowserAction): string | null {
    // Block navigation to booking / payment pages (login required there)
    if (action.action === 'navigate' && action.url) {
      if (/booking|payment|reserve|checkout|login/.test(action.url.toLowerCase())) {
        return 'IRCTC adapter: stopped before booking/payment page — login is required for booking. Task should stop at search results.';
      }
    }
    // Block clicking Book / Reserve buttons
    if (action.action === 'click' && action.target?.value) {
      if (/book.now|reserve|proceed.to.book/.test(action.target.value.toLowerCase())) {
        return 'IRCTC adapter: blocked click on booking button — login required.';
      }
    }
    return null;
  }

  describePageForLLM(ctx: PageContext): string {
    return `IRCTC (Indian Railways) — Experimental support. Supported no-login workflows: train_search, pnr_status. ` +
      `CRITICAL: After filling each station field, wait for the autocomplete dropdown and click the correct station. ` +
      `STOP immediately when train availability results appear. Do NOT attempt login or booking.`;
  }
}
