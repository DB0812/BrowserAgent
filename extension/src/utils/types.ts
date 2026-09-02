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

export type ExtensionMessage =
  | { type: 'ANALYZE_PAGE' }
  | { type: 'ACTION_REQUEST'; action: BrowserAction; actionId?: string }
  | { type: 'SETTINGS_UPDATE'; settings: PrivacySettings }
  | { type: 'GET_STATUS' }
  | { type: 'START_TASK'; instruction: string; targetUrl?: string; sessionId?: string }
  | { type: 'OCR_REQUEST'; imageData: string }
  | { type: 'AUDIT_EVENT'; event: AuditEvent }
  | { type: 'STATUS_UPDATE'; status: string }
  | { type: 'STEP_UPDATE'; step: number; label: string; status: string; action?: BrowserAction; latencyMs?: number; model?: string }
  | { type: 'TASK_DONE'; reason?: string; steps?: any[] };
