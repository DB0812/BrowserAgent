/**
 * Yatra Site Adapter — yatra.com
 *
 * Supported workflows:
 *   - flight_search: Fill origin/destination, pick dates, search flights
 *   - hotel_search:  Fill city, pick dates, search hotels
 *   - bus_search:    Fill from/to cities, pick date, search buses
 *
 * Key characteristics:
 *   - React SPA — DOM updates dynamically after every field interaction
 *   - Autocomplete dropdowns appear after typing city names (need a click on suggestion)
 *   - Date pickers are custom calendar widgets (use click on date cell)
 *   - No login required for search
 *   - Stop before any payment / booking confirmation
 */

import { BaseSiteAdapter, type SiteCapabilities, type PageContext } from './adapter-interface';
import type { UIElement, BrowserAction } from '../utils/types';

export class YatraAdapter extends BaseSiteAdapter {
  readonly name = 'Yatra';
  readonly domains = ['yatra.com', 'www.yatra.com'];
  readonly urlPatterns = [/https?:\/\/(?:www\.)?yatra\.com/];
  readonly supportLevel = 'partial' as const;
  readonly workflows = ['flight_search', 'hotel_search', 'bus_search'];

  getCapabilities(): SiteCapabilities {
    return {
      workflows: this.workflows,
      hasRichA11y: false,
      hasStableIds: false,
      domains: this.domains,
      requiresScrollBeforeInteraction: false,
      isDynamic: true,           // React SPA — wait after each interaction
      stopBeforePayment: true,   // Never proceed past search results
    };
  }

  normalizeElements(elements: UIElement[]): UIElement[] {
    return elements.map(el => {
      const hint = [
        el.placeholder, el.label, el.role, el.ariaLabel,
        el.domSelector, el.attributes?.['id'], el.attributes?.['name'],
        el.attributes?.['data-cy'], el.attributes?.['class'],
      ].join(' ').toLowerCase();

      // Origin / From city input
      if (/from|origin|source|departure|leaving.from|flying.from/.test(hint) && el.tagName === 'input') {
        return { ...el, label: 'From City (Origin)', ariaLabel: 'From City', role: 'Origin city search input' };
      }
      // Destination / To city input
      if (/\bto\b|dest|arrival|going.to|flying.to/.test(hint) && el.tagName === 'input') {
        return { ...el, label: 'To City (Destination)', ariaLabel: 'To City', role: 'Destination city search input' };
      }
      // Departure date
      if (/depart|check.in|start.date|travel.date|onward/.test(hint)) {
        return { ...el, label: 'Departure Date', ariaLabel: 'Departure Date', role: 'Departure date picker' };
      }
      // Return date
      if (/return|check.out|end.date/.test(hint)) {
        return { ...el, label: 'Return Date', ariaLabel: 'Return Date', role: 'Return date picker' };
      }
      // Passenger / guest count
      if (/passenger|travell|adult|pax|guest|room/.test(hint)) {
        return { ...el, label: 'Passengers', ariaLabel: 'Passenger count', role: 'Passenger / guest count selector' };
      }
      // Search / Find button
      if (el.tagName === 'button' && /search|find|go|submit/.test(hint)) {
        return { ...el, label: 'Search', ariaLabel: 'Search', role: 'Search button' };
      }
      // Autocomplete suggestion list items
      if (/suggestion|autocomplete|dropdown.item|city.option/.test(hint) || el.role?.includes('option')) {
        return { ...el, role: `Autocomplete suggestion: ${el.label || el.role}` };
      }
      return el;
    });
  }

  enrichPageContext(ctx: PageContext): PageContext {
    const url = ctx.url.toLowerCase();
    let hint = '';

    if (url.includes('/flights') || url.includes('flight')) {
      hint = '[YATRA FLIGHT SEARCH] Steps: (1) Fill "From City" field, (2) wait for autocomplete dropdown, (3) click the correct city suggestion, (4) fill "To City" field, (5) click city suggestion, (6) pick Departure Date from calendar, (7) click Search button. After results load, task is complete — do NOT proceed to booking.';
    } else if (url.includes('/hotels') || url.includes('hotel')) {
      hint = '[YATRA HOTEL SEARCH] Steps: (1) Fill city/destination field, (2) click suggestion, (3) pick Check-in date, (4) pick Check-out date, (5) click Search. After results load, task is complete.';
    } else if (url.includes('/bus') || url.includes('bus')) {
      hint = '[YATRA BUS SEARCH] Steps: (1) Fill From city, (2) click suggestion, (3) fill To city, (4) click suggestion, (5) pick travel date, (6) click Search. After results load, task is complete.';
    } else {
      hint = '[YATRA HOME] Choose the correct tab (Flights/Hotels/Buses) first, then fill the search form. After results load, task is complete — do NOT proceed to booking or payment.';
    }

    return {
      ...ctx,
      visibleText: `${hint}\n\n${ctx.visibleText}`,
    };
  }

  validateAction(action: BrowserAction): string | null {
    // Block any navigation to payment / booking pages
    if (action.action === 'navigate' && action.url) {
      const url = action.url.toLowerCase();
      if (/payment|book|checkout|pay|confirm/.test(url)) {
        return 'Yatra adapter: blocked navigation to payment/booking page. Task should stop at search results.';
      }
    }
    // Block clicking "Book Now" / "Pay" buttons
    if (action.action === 'click' && action.target?.value) {
      const v = action.target.value.toLowerCase();
      if (/pay.now|book.now|proceed.to.pay|checkout/.test(v)) {
        return 'Yatra adapter: blocked click on payment/booking button.';
      }
    }
    return null;
  }

  handleSpecialCase(situation: string, elements: UIElement[]): BrowserAction | null {
    // Handle cookie / GDPR consent banner
    if (/cookie|consent|accept/.test(situation.toLowerCase())) {
      const btn = elements.find(el =>
        el.tagName === 'button' &&
        /accept|ok|got.it|agree/.test((el.label || el.role || '').toLowerCase())
      );
      if (btn) {
        return {
          action: 'click',
          target: { type: 'element-id', value: btn.elementId || btn.id },
          reason: 'Accept cookie consent to proceed with Yatra search',
          confidence: 0.92,
        };
      }
    }
    return null;
  }

  describePageForLLM(ctx: PageContext): string {
    return `Yatra.com — travel booking portal. Supported: ${this.workflows.join(', ')}. ` +
      `IMPORTANT: This is a React SPA. After filling a city input, WAIT for the autocomplete dropdown and CLICK on the correct suggestion before moving to the next field. ` +
      `STOP the task as soon as search results are visible. Do NOT proceed to booking or payment.`;
  }
}
