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
 *   - Flight search is at /flights (one-way) or /flights with return date
 *   - City fields use autocomplete — must click suggestion after typing
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
        el.attributes?.['class'], el.attributes?.['data-testid'],
      ].join(' ').toLowerCase();

      // ── One Way tab / Round Trip tab ──
      if (/one.way|oneway/.test(hint) && (el.tagName === 'li' || el.tagName === 'button' || el.tagName === 'a' || el.role?.includes('tab'))) {
        return { ...el, label: 'One Way tab', ariaLabel: 'One Way', role: 'Trip type tab - select One Way' };
      }
      if (/round.trip|roundtrip/.test(hint) && (el.tagName === 'li' || el.tagName === 'button' || el.tagName === 'a' || el.role?.includes('tab'))) {
        return { ...el, label: 'Round Trip tab', ariaLabel: 'Round Trip', role: 'Trip type tab - select Round Trip' };
      }

      // ── Origin/From input ──
      if (/from|origin|departure|flying.from|depart.from/.test(hint) && el.tagName === 'input') {
        return { ...el, label: 'From (Origin City)', ariaLabel: 'From City', role: 'Origin city search input - type city name and click suggestion' };
      }
      // ── Destination/To input ──
      if (/\bto\b|dest|arrival|flying.to|going.to/.test(hint) && el.tagName === 'input') {
        return { ...el, label: 'To (Destination City)', ariaLabel: 'To City', role: 'Destination city search input - type city name and click suggestion' };
      }
      // ── Generic city input when above don't match (MMT uses placeholder like "From") ──
      if (/^\s*(from|to)\s*$/.test(el.placeholder ?? '') && el.tagName === 'input') {
        const isFrom = /^from/i.test(el.placeholder ?? '');
        return {
          ...el,
          label: isFrom ? 'From (Origin City)' : 'To (Destination City)',
          role: isFrom ? 'Origin city input' : 'Destination city input',
        };
      }

      // ── Departure date ──
      if (/depart|check.in|onward|travel.date/.test(hint)) {
        return { ...el, label: 'Departure Date', ariaLabel: 'Departure Date', role: 'Departure date picker - click to open calendar' };
      }
      // ── Return date ──
      if (/return|check.out/.test(hint)) {
        return { ...el, label: 'Return Date', ariaLabel: 'Return Date', role: 'Return date picker' };
      }
      // ── Passengers ──
      if (/passenger|travell|adult|guest|room|pax/.test(hint)) {
        return { ...el, label: 'Passengers', ariaLabel: 'Passengers', role: 'Passenger count selector' };
      }
      // ── Search button ──
      if (el.tagName === 'button' && /search|find|go|submit/.test(hint)) {
        return { ...el, label: 'Search Flights', ariaLabel: 'Search', role: 'Search button - click to find flights' };
      }
      // ── Autocomplete dropdown suggestions ──
      if (/suggestion|autoComplete|city.list|airport.list/.test(hint) || el.role?.includes('option')) {
        return { ...el, role: `City/Airport autocomplete suggestion: ${el.label || el.role}` };
      }
      // ── Flights tab on homepage ──
      if (/\bflight\b/.test(hint) && (el.tagName === 'li' || el.role?.includes('tab'))) {
        return { ...el, label: 'Flights tab', role: 'Click to go to flight search' };
      }
      return el;
    });
  }

  enrichPageContext(ctx: PageContext): PageContext {
    const url = ctx.url.toLowerCase();
    let hint = '';

    if (url.includes('/flights') || url.includes('flight')) {
      hint = `[MMT FLIGHT SEARCH PAGE]
IMPORTANT WORKFLOW — follow these steps exactly in order:
1. If you need a one-way trip: click the "One Way" tab first.
2. Click the "From" input field and type the origin city name (e.g. "Chennai" or "MAA").
3. WAIT for autocomplete dropdown to appear, then CLICK the first matching city/airport suggestion.
4. Click the "To" input field and type the destination city name (e.g. "Mumbai" or "BOM").
5. WAIT for autocomplete dropdown, then CLICK the first suggestion.
6. Click the Departure Date picker and select tomorrow's date from the calendar.
7. Click the "Search Flights" button.
8. When results load, the task is DONE — call done().

RULES:
- ALWAYS click the autocomplete suggestion after typing — do NOT press Enter.
- If the From/To fields already have values, clear them before typing.
- Do NOT navigate to booking pages. Stop at results.`;
    } else if (url.includes('/hotels') || url.includes('hotel')) {
      hint = '[MMT HOTEL SEARCH] Steps: (1) Fill destination field and click suggestion, (2) pick Check-in date, (3) pick Check-out date, (4) click Search.';
    } else if (url.includes('/holidays') || url.includes('holiday')) {
      hint = '[MMT HOLIDAYS] Browse holiday packages. Click any package card. Stop before payment.';
    } else {
      // Homepage — guide agent to navigate directly to flights
      hint = `[MMT HOME PAGE]
The user wants to search for flights. 
BEST ACTION: Navigate directly to https://www.makemytrip.com/flights/ to go to the flight search form.
Alternatively, click the "Flights" tab in the top navigation.
Do NOT interact with the homepage promotional banners or offers.`;
    }

    return {
      ...ctx,
      visibleText: `${hint}\n\nPAGE CONTENT:\n${ctx.visibleText}`,
    };
  }

  validateAction(action: BrowserAction): string | null {
    if (action.action === 'navigate' && action.url) {
      const u = action.url.toLowerCase();
      if (/payment|booking|checkout|pay\/|confirm/.test(u)) {
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
    const url = ctx.url.toLowerCase();
    if (url.includes('/flights')) {
      return `MakeMyTrip.com Flights Page. React SPA with autocomplete city inputs. ` +
        `CRITICAL: After typing in any city field, you MUST click the autocomplete suggestion that appears in the dropdown — do NOT press Enter. ` +
        `Workflow: One Way tab → From city → click suggestion → To city → click suggestion → Departure date → Search button. ` +
        `Stop immediately when flight results appear.`;
    }
    return `MakeMyTrip.com — travel booking. If on home page, navigate to /flights for flight search. ` +
      `Stop before any payment or booking step.`;
  }
}
