/**
 * MakeMyTrip Site Adapter — makemytrip.com
 *
 * Supported workflows:
 *   - flight_search: Fill origin/destination, pick dates, search
 *   - hotel_search:  Fill city, pick dates, search hotels
 *   - holiday_search: Browse holiday packages
 *
 * Key characteristics:
 *   - React SPA with dynamic autocomplete dropdowns
 *   - Similar UX pattern to Yatra — city fields use autocomplete
 *   - No login required for searching
 *   - Stop before any payment / booking confirmation
 */

import { BaseSiteAdapter, type SiteCapabilities, type PageContext } from './adapter-interface';
import type { UIElement, BrowserAction } from '../utils/types';

export class MakeMyTripAdapter extends BaseSiteAdapter {
  readonly name = 'MakeMyTrip';
  readonly domains = ['makemytrip.com', 'www.makemytrip.com'];
  readonly urlPatterns = [/https?:\/\/(?:www\.)?makemytrip\.com/];
  readonly supportLevel = 'partial' as const;
  readonly workflows = ['flight_search', 'hotel_search', 'holiday_search'];

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
        el.domSelector, el.attributes?.['id'], el.attributes?.['data-cy'],
        el.attributes?.['class'],
      ].join(' ').toLowerCase();

      // Origin input
      if (/from|origin|departure|flying.from|depart.from/.test(hint) && el.tagName === 'input') {
        return { ...el, label: 'From (Origin City)', ariaLabel: 'From City', role: 'Origin city search input' };
      }
      // Destination input
      if (/\bto\b|dest|arrival|flying.to|going.to/.test(hint) && el.tagName === 'input') {
        return { ...el, label: 'To (Destination City)', ariaLabel: 'To City', role: 'Destination city search input' };
      }
      // Departure date
      if (/depart|check.in|onward|travel.date/.test(hint)) {
        return { ...el, label: 'Departure Date', ariaLabel: 'Departure Date', role: 'Departure date picker' };
      }
      // Return date
      if (/return|check.out/.test(hint)) {
        return { ...el, label: 'Return Date', ariaLabel: 'Return Date', role: 'Return date picker' };
      }
      // Passenger / room count
      if (/passenger|travell|adult|guest|room|pax/.test(hint)) {
        return { ...el, label: 'Passengers', ariaLabel: 'Passengers', role: 'Passenger / room count selector' };
      }
      // Search button
      if (el.tagName === 'button' && /search|find|go|submit/.test(hint)) {
        return { ...el, label: 'Search', ariaLabel: 'Search flights / hotels', role: 'Search button' };
      }
      // Autocomplete suggestion
      if (/suggestion|autoComplete|city.list|airport.list/.test(hint) || el.role?.includes('option')) {
        return { ...el, role: `City/Airport suggestion: ${el.label || el.role}` };
      }
      return el;
    });
  }

  enrichPageContext(ctx: PageContext): PageContext {
    const url = ctx.url.toLowerCase();
    let hint = '';

    if (url.includes('/flights') || url.includes('flight')) {
      hint = '[MMT FLIGHT SEARCH] Steps: (1) Fill "From" city field, (2) wait for and click the city/airport suggestion in the dropdown, (3) fill "To" city field, (4) click suggestion, (5) click Departure Date, (6) pick date from calendar, (7) click Search. Stop when results load.';
    } else if (url.includes('/hotels') || url.includes('hotel')) {
      hint = '[MMT HOTEL SEARCH] Steps: (1) Fill city/destination field, (2) click suggestion, (3) pick Check-in date, (4) pick Check-out date, (5) set rooms/guests if needed, (6) click Search. Stop when results load.';
    } else if (url.includes('/holidays') || url.includes('holiday')) {
      hint = '[MMT HOLIDAYS] Browse holiday packages. Click on any package card to view details. Stop before payment.';
    } else {
      hint = '[MMT HOME] Select the tab for Flights, Hotels, or Holidays, then fill the search form. After results load, task is complete.';
    }

    return {
      ...ctx,
      visibleText: `${hint}\n\n${ctx.visibleText}`,
    };
  }

  validateAction(action: BrowserAction): string | null {
    if (action.action === 'navigate' && action.url) {
      if (/payment|booking|checkout|pay|confirm/.test(action.url.toLowerCase())) {
        return 'MakeMyTrip adapter: blocked navigation to payment/booking page.';
      }
    }
    if (action.action === 'click' && action.target?.value) {
      if (/book.now|pay.now|proceed.to.pay/.test(action.target.value.toLowerCase())) {
        return 'MakeMyTrip adapter: blocked click on payment/booking button.';
      }
    }
    return null;
  }

  describePageForLLM(ctx: PageContext): string {
    return `MakeMyTrip.com — travel booking portal. Supported: ${this.workflows.join(', ')}. ` +
      `IMPORTANT: This is a React SPA. After filling a city input, ALWAYS wait for the autocomplete dropdown and CLICK the correct suggestion. ` +
      `STOP as soon as search results appear. Do NOT proceed to booking or payment.`;
  }
}
