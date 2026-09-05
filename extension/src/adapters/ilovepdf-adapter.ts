/**
 * ilovepdf Site Adapter — ilovepdf.com
 *
 * Supported workflows:
 *   - pdf_tools:    Select a PDF tool (merge, split, compress, convert, etc.)
 *   - file_upload:  Upload a PDF file for processing
 *   - process:      Click the process button to run the operation
 *   - download:     Click the download button to save the result
 *
 * Key characteristics:
 *   - Clean, static-ish HTML with clear buttons and links
 *   - No login required for all basic tools
 *   - File upload via <input type="file"> — agent can click it to trigger picker
 *   - Each tool is its own page (e.g. /merge-pdf, /split-pdf, /compress-pdf)
 *   - After processing, a download button appears
 *   - Stop before any premium/paid feature gate
 */

import { BaseSiteAdapter, type SiteCapabilities, type PageContext } from './adapter-interface';
import type { UIElement, BrowserAction } from '../utils/types';

export class IlovepdfAdapter extends BaseSiteAdapter {
  readonly name = 'ilovepdf';
  readonly domains = ['ilovepdf.com', 'www.ilovepdf.com'];
  readonly urlPatterns = [/https?:\/\/(?:www\.)?ilovepdf\.com/];
  readonly supportLevel = 'full' as const;
  readonly workflows = ['pdf_tools', 'file_upload', 'process', 'download'];

  getCapabilities(): SiteCapabilities {
    return {
      workflows: this.workflows,
      hasRichA11y: true,
      hasStableIds: true,
      domains: this.domains,
      requiresScrollBeforeInteraction: false,
      isDynamic: false,
      stopBeforePayment: true,
    };
  }

  normalizeElements(elements: UIElement[]): UIElement[] {
    return elements.map(el => {
      const hint = [
        el.placeholder, el.label, el.role, el.ariaLabel,
        el.domSelector, el.attributes?.['id'], el.attributes?.['class'],
        el.attributes?.['href'],
      ].join(' ').toLowerCase();

      // Tool selection links (Merge PDF, Split PDF, etc.)
      if (el.tagName === 'a' && /merge|split|compress|convert|rotate|unlock|protect|sign|watermark|ocr|repair|organize/.test(hint)) {
        return { ...el, role: `PDF tool link: ${el.label || el.role}`, ariaLabel: el.label || el.role };
      }
      // File upload input
      if (el.tagName === 'input' && el.attributes?.['type'] === 'file') {
        return { ...el, label: 'Select PDF file to upload', ariaLabel: 'Upload PDF', role: 'PDF file upload input' };
      }
      // "Select PDF files" / "Add files" button (often a label or styled button over a file input)
      if (/select.pdf|add.file|upload|choose.file|pick.file/.test(hint)) {
        return { ...el, label: 'Select/Upload PDF', ariaLabel: 'Select PDF files', role: 'File upload button' };
      }
      // Process / Convert / Merge / Compress action button
      if (el.tagName === 'button' && /process|convert|compress|merge|split|rotate|protect|unlock|apply|start/.test(hint)) {
        return { ...el, label: 'Process PDF', ariaLabel: 'Process / Apply', role: 'Process action button' };
      }
      // Download button
      if (/download|save/.test(hint) && el.tagName === 'button') {
        return { ...el, label: 'Download result', ariaLabel: 'Download', role: 'Download result button' };
      }
      // Login / Sign in links
      if (el.tagName === 'a' && /login|log.in|sign.in/.test(hint)) {
        return { ...el, label: 'Log in', ariaLabel: 'Log in', role: 'Login navigation link' };
      }
      // Sign up / Register link
      if (el.tagName === 'a' && /signup|sign.up|register/.test(hint)) {
        return { ...el, label: 'Sign up', ariaLabel: 'Sign up', role: 'Sign up link' };
      }
      // Login form inputs
      if (el.tagName === 'input' && /email|user/i.test(hint)) {
        return { ...el, label: 'Email address', role: 'Login email input' };
      }
      if (el.tagName === 'input' && /password|pass/i.test(hint)) {
        return { ...el, label: 'Password', role: 'Login password input' };
      }
      return el;
    });
  }

  enrichPageContext(ctx: PageContext): PageContext {
    const url = ctx.url.toLowerCase();
    let hint = '';

    if (url.includes('/login') || url.includes('login')) {
      hint = '[ILOVEPDF LOGIN] You are on the login page. Fill the email input and password input, then click the "Log in" button.';
    } else if (url === 'https://www.ilovepdf.com/' || url.endsWith('ilovepdf.com') || url.endsWith('ilovepdf.com/')) {
      hint = '[ILOVEPDF HOME] This is the ilovepdf homepage. You can click on any PDF tool (e.g. "Merge PDF", "Compress PDF") or click "Log in" in the top header to navigate to the login page.';
    } else if (url.includes('/merge-pdf')) {
      hint = '[ILOVEPDF MERGE] Upload two or more PDF files using the "Select PDF files" button, then click "Merge PDF" to combine them. After processing click "Download Merged PDF".';
    } else if (url.includes('/split-pdf')) {
      hint = '[ILOVEPDF SPLIT] Upload a PDF file, configure split options if needed, then click "Split PDF". Download the result.';
    } else if (url.includes('/compress-pdf')) {
      hint = '[ILOVEPDF COMPRESS] Upload a PDF file using "Select PDF files", then click "Compress PDF". Download the smaller file.';
    } else if (url.includes('/pdf-to-word') || url.includes('/word-to-pdf') || url.includes('/pdf-to')) {
      hint = '[ILOVEPDF CONVERT] Upload the source file using "Select PDF files", then click the Convert button. Download the converted file.';
    } else {
      hint = '[ILOVEPDF TOOL PAGE] Upload your file using the "Select PDF files" button, then click the action button (e.g. Process, Convert, Merge). Download the result when done.';
    }

    return {
      ...ctx,
      visibleText: `${hint}\n\n${ctx.visibleText}`,
    };
  }

  validateAction(action: BrowserAction): string | null {
    // Don't let the agent navigate to premium/paid pages
    if (action.action === 'navigate' && action.url) {
      if (/premium|pricing|subscribe|payment/.test(action.url.toLowerCase())) {
        return 'ilovepdf adapter: blocked navigation to premium/payment page.';
      }
    }
    return null;
  }

  describePageForLLM(ctx: PageContext): string {
    const url = ctx.url.toLowerCase();
    const toolName = url.split('/').filter(Boolean).pop()?.replace(/-/g, ' ') || 'PDF tool';
    return `ilovepdf.com — online PDF tools. Current tool: "${toolName}". ` +
      `Workflow: (1) Click the desired PDF tool or you are already on a tool page. ` +
      `(2) Click "Select PDF files" to upload. (3) Click the process button. (4) Click Download. ` +
      `No login required for basic tools. Stop before any premium feature.`;
  }
}
