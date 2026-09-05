/**
 * Shared Type Definitions for Privacy-Preserving Browser Agent Extension
 */

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type PIIType =
  | 'email'
  | 'phone'
  | 'name'
  | 'address'
  | 'credit_card'
  | 'cvv'
  | 'password'
  | 'aadhaar'
  | 'pan'
  | 'dob'
  | 'upi'
  | 'ifsc'
  | 'api_key'
  | 'auth_token'
  | 'face'
  | 'qr_code'
  | 'barcode'
  | 'signature'
  | 'account_number'
  | 'passport'
  | 'ssn';

export type SensitivityLevel = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export type RedactionMethod = 'remove' | 'mask' | 'replace' | 'blur';

export type PIISource = 'dom' | 'regex' | 'ocr' | 'vision';

export interface PIIEntity {
  id: string;
  type: PIIType;
  confidence: number;
  source: PIISource;
  sensitivity: SensitivityLevel;
  redactionMethod: RedactionMethod;
  bbox?: BoundingBox;
  domSelector?: string;
  targetElement?: HTMLElement | Element;
  isFixed?: boolean;
  rawValue?: string;
  placeholder: string;
  timestamp: number;
}

export type ActionType =
  | 'click'
  | 'fill'
  | 'scroll'
  | 'select'
  | 'focus'
  | 'navigate'
  | 'wait'
  | 'back'
  | 'forward'
  | 'finish'
  | 'ask_user'
  | 'done';

export interface ActionTarget {
  type?: string;
  value?: string;
}

export interface BrowserAction {
  action: ActionType;
  target?: ActionTarget;
  value?: string;
  url?: string;
  amount?: number;
  direction?: 'up' | 'down' | 'left' | 'right';
  reason?: string;
  thought?: string;
  confidence?: number;
  requiresApproval?: boolean;
  prompt?: string; // For ask_user: question to show the user
}

export interface ActionResult {
  success: boolean;
  action: BrowserAction;
  error?: string;
  executedAt: number;
  latencyMs: number;
}

export interface PrivacySettings {
  privacyLevel: 'STRICT' | 'BALANCED' | 'PERMISSIVE';
  enabledCategories: PIIType[];
  defaultRedactionMethod: RedactionMethod;
  requireApprovalFor: ActionType[];
  sendScreenshots: boolean;
  enableOCR: boolean;
  enableFaceDetection: boolean;
}

export interface UIElement {
  id: string;
  elementId?: string; // Stable el_NNN ID from ElementRegistry
  type: string;
  role: string;
  label?: string;
  placeholder?: string;
  value?: string;
  sensitive: boolean;
  sensitivityType?: PIIType;
  bbox: BoundingBox;
  domSelector: string;
  interactable: boolean;
  visible: boolean;
  tagName: string;
  attributes: Record<string, string>;
  // Accessibility fields
  ariaLabel?: string;
  ariaRole?: string;
  accessibleName?: string;
}

export interface PiiSummary {
  totalDetected: number;
  totalRedacted: number;
  byType: Record<string, number>;
}

export interface SanitizedContext {
  pageUrl: string;
  pageTitle: string;
  pageType: string;
  timestamp: number;
  elements: UIElement[];
  sanitizedText: string;
  ocrTexts: string[];
  piiSummary: PiiSummary;
  screenshotIncluded: boolean;
  screenshot?: string;
  sanitizedScreenshot?: string;
  perceptionLevel?: 1 | 2 | 3 | 4;
  stateHash?: string;
  siteAdapter?: string;
}

export type AuditEventType = 'pii_detected' | 'action_blocked' | 'action_executed' | 'data_sent' | 'screenshot_redacted';

export interface AuditEvent {
  id: string;
  timestamp: number;
  type: AuditEventType;
  detail: string;
  rawDataTransmitted: boolean;
  piiType?: PIIType;
  confidence?: number;
  source?: PIISource;
  redactionMethod?: RedactionMethod;
}

export interface OcrWord {
  text: string;
  confidence: number;
  bbox: BoundingBox;
}

// ── ELEMENT REGISTRY ───────────────────────────────────────────────────────────

/** A single entry in the stable element registry */
export interface ElementRecord {
  elementId: string;        // Stable ID: el_001, el_002, ...
  domSelector: string;      // Local-only CSS selector for action resolution
  tag: string;
  role: string;
  text: string;
  ariaLabel?: string;
  ariaRole?: string;
  placeholder?: string;
  inputType?: string;
  visible: boolean;
  enabled: boolean;
  sensitive: boolean;
  bbox: BoundingBox;
}

// ── TASK STATE MACHINE ─────────────────────────────────────────────────────────

export type TaskState =
  | 'IDLE'
  | 'UNDERSTANDING'
  | 'PERCEIVING'
  | 'SANITIZING'
  | 'PLANNING'
  | 'VALIDATING'
  | 'EXECUTING'
  | 'WAITING_FOR_PAGE'
  | 'RE_PERCEIVING'
  | 'COMPLETED'
  | 'PRIVACY_BLOCKED'
  | 'ACTION_INVALID'
  | 'LOW_CONFIDENCE'
  | 'UNSUPPORTED_SITE'
  | 'USER_REQUIRED'
  | 'ERROR';

// ── SITE COMPATIBILITY ─────────────────────────────────────────────────────────

export type SiteCompatibility = 'full' | 'partial' | 'experimental' | 'unsupported';

export interface SiteStatus {
  url: string;
  domain: string;
  compatibility: SiteCompatibility;
  adapterName?: string;
  workflows?: string[];
}

// ── EXTENSION MESSAGES ─────────────────────────────────────────────────────────

export type ExtensionMessage =
  | { type: 'ANALYZE_PAGE'; forceRefresh?: boolean; screenshot?: string }
  | { type: 'ACTION_REQUEST'; action: BrowserAction; actionId?: string }
  | { type: 'SETTINGS_UPDATE'; settings: PrivacySettings }
  | { type: 'GET_STATUS' }
  | { type: 'START_TASK'; instruction: string; targetUrl?: string; sessionId?: string }
  | { type: 'STOP_TASK' }
  | { type: 'OCR_REQUEST'; imageData: string }
  | { type: 'AUDIT_EVENT'; event: AuditEvent }
  | { type: 'STATUS_UPDATE'; status: string; taskState?: TaskState }
  | { type: 'TASK_STATE_CHANGE'; taskState: TaskState; detail?: string }
  | { type: 'STEP_UPDATE'; step: number; label: string; status: string; action?: BrowserAction; latencyMs?: number; model?: string; confidence?: number }
  | { type: 'TASK_DONE'; reason?: string; steps?: any[] }
  | { type: 'SITE_STATUS'; siteStatus: SiteStatus }
  | { type: 'USER_INPUT_REQUEST'; prompt: string; actionId: string }
  | { type: 'USER_INPUT_RESPONSE'; value: string; actionId: string }
  | { type: 'ACTION_APPROVAL_REQUEST'; action: BrowserAction; actionId: string; confidence: number }
  | { type: 'ACTION_APPROVAL_RESPONSE'; approved: boolean; actionId: string }
  | { type: 'TOGGLE_FLOATING_PANEL'; show?: boolean }
  | { type: 'FALLBACK_MODE'; reason: string };
