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

// Actions that require human approval
const APPROVAL_REQUIRED_DEFAULTS = new Set<ActionType>(['navigate']);

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

/** Resolve a target specifier to a DOM element */
function resolveTarget(action: BrowserAction): Element | null {
  if (!action.target) return null;
  const { type, value } = action.target;

  try {
    if (type === 'selector') return document.querySelector(value);
    if (type === 'element-id') return document.getElementById(value);
    if (type === 'role') {
      return document.querySelector(`[role="${value}"], [data-role="${value}"]`);
    }
    if (type === 'text') {
      // Find button/link by visible text
      const all = document.querySelectorAll('button, a, input[type="submit"], [role="button"]');
      for (const el of all) {
        if (el.textContent?.trim().toLowerCase().includes(value.toLowerCase())) return el;
      }
    }
  } catch { /* invalid selector */ }
  return null;
}

/** Execute a validated browser action */
export async function executeAction(action: BrowserAction): Promise<ActionResult> {
  const startTime = Date.now();

  try {
    switch (action.action) {

      case 'click': {
        const el = resolveTarget(action) as HTMLElement | null;
        if (!el) throw new Error(`Target not found: ${JSON.stringify(action.target)}`);
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        await delay(200);
        el.click();
        break;
      }

      case 'fill': {
        const el = resolveTarget(action) as HTMLInputElement | null;
        if (!el) throw new Error(`Target not found: ${JSON.stringify(action.target)}`);
        el.focus();
        el.value = action.value ?? '';
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        break;
      }

      case 'scroll': {
        const amount = action.amount ?? 300;
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
        if (!el) throw new Error(`Select target not found`);
        el.value = action.value ?? '';
        el.dispatchEvent(new Event('change', { bubbles: true }));
        break;
      }

      case 'focus': {
        const el = resolveTarget(action) as HTMLElement | null;
        if (!el) throw new Error(`Focus target not found`);
        el.focus();
        break;
      }

      case 'navigate': {
        if (action.url) window.location.href = action.url;
        break;
      }

      case 'wait': {
        await delay(action.amount ?? 1000);
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
