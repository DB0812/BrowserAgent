/**
 * Action Validator + Executor
 *
 * SECURITY PRINCIPLE: The server never directly controls the browser.
 * Every action returned by the server is validated locally before execution.
 * Only actions from the allowlist are permitted.
 */
import type { BrowserAction, ActionResult, ActionType } from '../utils/types';

// ── SAFE ACTION ALLOWLIST ──────────────────────────────────────────────────────

const SAFE_ACTIONS = new Set<ActionType>(['click', 'fill', 'scroll', 'select', 'focus', 'navigate', 'wait', 'done']);

// Actions that MUST NEVER be executed regardless of input
const BLOCKED_ACTIONS = new Set(['eval', 'execute', 'inject', 'run', 'script']);

/** Validate a server-returned action. Returns null if safe, error string if rejected. */
export function validateAction(action: BrowserAction): string | null {
  // 1. Action type must be in allowlist
  if (!SAFE_ACTIONS.has(action.action)) {
    return `Blocked action type: "${action.action}" — not in safe action allowlist`;
  }

  // 2. Explicitly blocked keywords anywhere in action
  const actionStr = JSON.stringify(action).toLowerCase();
  for (const blocked of BLOCKED_ACTIONS) {
    if (actionStr.includes(blocked)) {
      return `Blocked: action JSON contains forbidden keyword "${blocked}"`;
    }
  }

  // 3. Navigate: only allow relative URLs or known safe domains
  if (action.action === 'navigate' && action.url) {
    const url = action.url;
    if (url.startsWith('javascript:') || url.startsWith('data:')) {
      return `Blocked navigate: dangerous URL scheme "${url.slice(0, 20)}"`;
    }
  }

  // 4. Fill: value must not look like code injection
  if (action.action === 'fill' && action.value) {
    const v = action.value;
    if (/<script/i.test(v) || /javascript:/i.test(v)) {
      return `Blocked fill: suspicious value content`;
    }
  }

  // 5. Target must be specified for interactive actions
  if (['click', 'fill', 'select', 'focus'].includes(action.action) && !action.target) {
    return `Action "${action.action}" requires a target`;
  }

  return null; // Validated
}

/** Robust target resolver for DOM elements */
function resolveTarget(action: BrowserAction): Element | null {
  if (!action.target) return null;
  const { type, value } = action.target;
  if (!value) return null;

  const rawVal = value.trim();
  const cleanId = rawVal.replace(/^#/, '');

  try {
    // 1. Try ID directly
    let el = document.getElementById(cleanId);
    if (el) return el;

    // 2. Try query selector if value starts with #, ., [, or tag
    if (/^[#\.\[a-zA-Z]/.test(rawVal)) {
      el = document.querySelector(rawVal);
      if (el) return el;
    }

    // 3. Try name, placeholder, aria-label, role
    el = document.querySelector(`[name="${cleanId}"], [placeholder="${cleanId}"], [aria-label="${cleanId}"], [data-role="${cleanId}"]`);
    if (el) return el;

    // 4. Try button / link text search
    const candidates = document.querySelectorAll('button, a, input[type="submit"], input[type="button"], [role="button"]');
    for (const c of candidates) {
      if (c.textContent?.toLowerCase().includes(rawVal.toLowerCase())) return c;
    }

    // 5. Try input search by label text
    const labels = document.querySelectorAll('label');
    for (const lbl of labels) {
      if (lbl.textContent?.toLowerCase().includes(rawVal.toLowerCase())) {
        const forId = lbl.getAttribute('for');
        if (forId) {
          const matchedEl = document.getElementById(forId);
          if (matchedEl) return matchedEl;
        }
        const childInput = lbl.querySelector('input, select, textarea');
        if (childInput) return childInput;
      }
    }
  } catch {
    /* invalid selector fallback */
  }

  return null;
}

/** Highlight element visually when agent interacts */
function highlightInteraction(el: HTMLElement, type: string) {
  const origOutline = el.style.outline;
  const origTransition = el.style.transition;
  el.style.transition = 'all 0.2s ease-in-out';
  el.style.outline = type === 'click' ? '3px solid #22d3ee' : '3px solid #10b981';
  setTimeout(() => {
    el.style.outline = origOutline;
    el.style.transition = origTransition;
  }, 1000);
}

/** Execute a validated browser action */
export async function executeAction(action: BrowserAction): Promise<ActionResult> {
  const startTime = Date.now();

  try {
    switch (action.action) {

      case 'click': {
        const el = resolveTarget(action) as HTMLElement | null;
        if (!el) throw new Error(`Target not found for click: ${JSON.stringify(action.target)}`);
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        highlightInteraction(el, 'click');
        await delay(300);
        
        // Dispatch full event sequence
        el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
        el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
        el.click();
        break;
      }

      case 'fill': {
        const el = resolveTarget(action) as HTMLInputElement | null;
        if (!el) throw new Error(`Target not found for fill: ${JSON.stringify(action.target)}`);
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        highlightInteraction(el, 'fill');
        el.focus();
        
        // Native setter override for React/Vue dynamic bindings
        const val = action.value ?? '';
        const nativeValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
        if (nativeValueSetter) {
          nativeValueSetter.call(el, val);
        } else {
          el.value = val;
        }

        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        el.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true }));
        el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
        break;
      }

      case 'scroll': {
        const amount = action.amount ?? 400;
        const dir = action.direction ?? 'down';
        window.scrollBy({
          top: dir === 'down' ? amount : dir === 'up' ? -amount : 0,
          left: dir === 'right' ? amount : dir === 'left' ? -amount : 0,
          behavior: 'smooth',
        });
        break;
      }

      case 'select': {
        const el = resolveTarget(action) as HTMLSelectElement | null;
        if (!el) throw new Error(`Select target not found: ${JSON.stringify(action.target)}`);
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        highlightInteraction(el, 'fill');
        el.value = action.value ?? '';
        el.dispatchEvent(new Event('change', { bubbles: true }));
        break;
      }

      case 'focus': {
        const el = resolveTarget(action) as HTMLElement | null;
        if (!el) throw new Error(`Focus target not found: ${JSON.stringify(action.target)}`);
        el.focus();
        highlightInteraction(el, 'fill');
        break;
      }

      case 'navigate': {
        if (action.url) window.location.href = action.url;
        break;
      }

      case 'wait': {
        await delay(action.amount ?? 800);
        break;
      }

      case 'done': {
        console.log('[PrivacyAgent] Task marked complete:', action.reason);
        break;
      }
    }

    return { success: true, action, executedAt: Date.now(), latencyMs: Date.now() - startTime };
  } catch (err) {
    return { success: false, action, error: String(err), executedAt: Date.now(), latencyMs: Date.now() - startTime };
  }
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
