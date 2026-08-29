// ─────────────────────────────────────────────────────────────────────────────
// Shared TypeScript types for the Privacy-Preserving Browser Agent
// ─────────────────────────────────────────────────────────────────────────────

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
  | 'ssn'
  | 'passport';

export type SensitivityLevel = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export type PIISource = 'dom' | 'ocr' | 'vision' | 'regex';

export type RedactionMethod = 'mask' | 'blur' | 'replace' | 'remove';

export type PrivacyLevel = 'STRICT' | 'BALANCED' | 'PERMISSIVE';

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PIIEntity {
  id: string;
  type: PIIType;
  confidence: number;           // 0.0 – 1.0
  source: PIISource;
  sensitivity: SensitivityLevel;
  redactionMethod: RedactionMethod;
  bbox?: BoundingBox;           // Visual bounding box if detected visually
  domSelector?: string;         // CSS selector for DOM elements
  rawValue?: string;            // ONLY stored locally, never transmitted
  placeholder: string;          // e.g. "[EMAIL REDACTED]"
  timestamp: number;
}

export interface UIElement {
  id: string;
  type: string;         // 'input' | 'button' | 'select' | 'link' | 'text' | 'image'
  role?: string;        // semantic role, e.g. 'origin', 'search-button'
  label?: string;       // associated label text
  placeholder?: string;
  value?: string;       // ONLY non-sensitive values
  sensitive: boolean;
  sensitivityType?: PIIType;
  bbox?: BoundingBox;
  domSelector: string;
  interactable: boolean;
  visible: boolean;
  tagName: string;
  attributes: Record<string, string>;
}

export interface SanitizedContext {
  pageUrl: string;       // URL with sensitive query params stripped
  pageTitle: string;
  pageType: string;      // e.g. 'travel_booking', 'login', 'payment'
  timestamp: number;
  elements: UIElement[];
  sanitizedText: string; // Page text with PII replaced by placeholders
  ocrTexts: string[];    // OCR-extracted text (already redacted)
  piiSummary: {
    totalDetected: number;
    totalRedacted: number;
    byType: Record<string, number>;
  };
  screenshotIncluded: boolean;
  sanitizedScreenshot?: string; // base64 dataURL, only if faces/visual PII required
}

// ── ACTION TYPES ──────────────────────────────────────────────────────────────

export type ActionType = 'click' | 'fill' | 'scroll' | 'select' | 'focus' | 'navigate' | 'wait' | 'done';

export interface BrowserAction {
  action: ActionType;
  target?: {
    type: 'selector' | 'element-id' | 'role' | 'text';
    value: string;
  };
  value?: string;
  direction?: 'up' | 'down' | 'left' | 'right';
  amount?: number;
  url?: string;
  reason: string;
  confidence: number;
  requiresApproval?: boolean;
}

export interface ActionResult {
  success: boolean;
  action: BrowserAction;
  error?: string;
  executedAt: number;
  latencyMs: number;
}

// ── TASK / SESSION TYPES ──────────────────────────────────────────────────────

export type AgentStatus = 'idle' | 'analyzing' | 'detecting' | 'redacting' | 'sending' | 'reasoning' | 'acting' | 'awaiting-approval' | 'done' | 'error';
export type PrivacyStatus = 'protected' | 'analyzing' | 'blocked' | 'unknown';

export interface AgentTask {
  taskId: string;
  sessionId: string;
  instruction: string;
  status: AgentStatus;
  steps: ActionResult[];
  startedAt: number;
  completedAt?: number;
}

// ── MESSAGES ─────────────────────────────────────────────────────────────────

export type ExtensionMessage =
  | { type: 'START_TASK'; instruction: string; sessionId: string }
  | { type: 'ANALYZE_PAGE' }
  | { type: 'GET_STATUS' }
  | { type: 'APPROVE_ACTION'; actionId: string }
  | { type: 'DENY_ACTION'; actionId: string }
  | { type: 'SETTINGS_UPDATE'; settings: PrivacySettings }
  | { type: 'STATUS_UPDATE'; status: AgentStatus; privacyStatus: PrivacyStatus; piiCount: number }
  | { type: 'TASK_RESULT'; result: ActionResult }
  | { type: 'PII_DETECTED'; entities: PIIEntity[] }
  | { type: 'ACTION_REQUEST'; action: BrowserAction; actionId: string }
  | { type: 'AUDIT_EVENT'; event: AuditEvent }
  | { type: 'CONTEXT_READY'; context: SanitizedContext }
  | { type: 'OCR_RESULT'; words: OcrWord[] }
  | { type: 'OCR_REQUEST'; imageData: string };

export interface PrivacySettings {
  privacyLevel: PrivacyLevel;
  enabledCategories: PIIType[];
  defaultRedactionMethod: RedactionMethod;
  requireApprovalFor: ActionType[];
  sendScreenshots: boolean;
  enableOCR: boolean;
  enableFaceDetection: boolean;
}

export interface AuditEvent {
  id: string;
  timestamp: number;
  type: 'pii_detected' | 'pii_redacted' | 'action_executed' | 'action_blocked' | 'context_sent' | 'response_received' | 'approval_requested';
  piiType?: PIIType;
  confidence?: number;
  source?: PIISource;
  redactionMethod?: RedactionMethod;
  detail: string;
  rawDataTransmitted: false; // Always false — this is the invariant
}

export interface OcrWord {
  text: string;
  confidence: number;
  bbox: BoundingBox;
}

export interface LatencyMetrics {
  domAnalysis: number;
  piiDetection: number;
  redaction: number;
  ocr: number;
  faceDetection: number;
  network: number;
  serverReasoning: number;
  total: number;
}

export interface PrivacyScore {
  overall: number;           // 0–100
  piiRecall: number;
  piiPrecision: number;
  redactionPrecision: number;
  rawBytesTransmitted: number;
  rawScreenshotsTransmitted: number;
  formula: string;
}
