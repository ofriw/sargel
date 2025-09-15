export interface InspectElementArgs {
  css_selector: string;
  url: string;
  property_groups?: string[];
  css_edits?: Record<string, string>;
  limit?: number;
  autoCenter?: boolean;  // Default: true - automatically center elements in viewport
  autoZoom?: boolean;    // Default: true - automatically zoom to optimal size
  zoomFactor?: number;   // Override automatic zoom calculation (0.5-3.0)
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface BoxModel {
  content: Rect;
  padding: Rect;
  border: Rect;
  margin: Rect;
}

export interface SpacingInfo {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface ElementMetrics {
  viewport: Rect;
  boxSizing?: string;  // 'content-box' | 'border-box'
  page: Rect;
  bodyOffset: {
    x: number;
    y: number;
  };
  scroll: {
    x: number;
    y: number;
  };
  viewportSize: {
    width: number;
    height: number;
  };
  margin: SpacingInfo;
  padding: SpacingInfo;
  border: SpacingInfo;
}

export interface CascadeRule {
  selector: string;
  source: string;
  specificity: string;
  properties: Record<string, string>;
}

export interface GroupedStyles {
  [groupName: string]: Record<string, string>;
}

export interface ElementPosition {
  centerX: number;
  centerY: number;
  width: number;
  height: number;
}

export interface ViewportInfo {
  width: number;
  height: number;
  deviceScaleFactor: number;
  mobile: boolean;
}

export interface ViewportAdjustments {
  original_positions: ElementPosition[];  // Original positions of all selected elements
  centered: boolean;
  zoom_factor: number;
  original_viewport: ViewportInfo;
}


export interface ElementDistance {
  horizontal: number;  // pixels between nearest horizontal edges
  vertical: number;    // pixels between nearest vertical edges
  center_to_center: number;  // diagonal distance between element centers
}

export interface ElementAlignment {
  top: boolean;     // top edges aligned
  bottom: boolean;  // bottom edges aligned
  left: boolean;    // left edges aligned
  right: boolean;   // right edges aligned
  vertical_center: boolean;   // vertical centers aligned
  horizontal_center: boolean; // horizontal centers aligned
}

export interface ElementRelationship {
  from: string;  // first element selector
  to: string;    // second element selector
  distance: ElementDistance;
  alignment: ElementAlignment;
}

export interface ElementInspection {
  selector: string;
  computed_styles: Record<string, string>;
  grouped_styles?: GroupedStyles;
  cascade_rules: CascadeRule[];
  box_model: BoxModel;
  applied_edits?: Record<string, string>;
}

export interface MultiInspectionResult {
  elements: ElementInspection[];
  relationships?: ElementRelationship[];
  screenshot: string;
  viewport_adjustments?: ViewportAdjustments;
  stats?: {
    total_properties: number;
    filtered_properties: number;
    total_rules: number;
    filtered_rules: number;
  };
}

export interface ChromeTarget {
  id: string;
  title: string;
  type: string;
  url: string;
  webSocketDebuggerUrl: string;
}

export interface ChromeVersion {
  Browser: string;
  'Protocol-Version': string;
  'User-Agent': string;
  'V8-Version': string;
  'WebKit-Version': string;
  webSocketDebuggerUrl: string;
}

export interface BrowserInstance {
  port: number;
  version?: ChromeVersion;
  targets: ChromeTarget[];
  chromeInstance?: any; // chrome-launcher instance
}

export interface CDPMessage {
  id: number;
  method: string;
  params?: any;
}

export interface CDPResponse {
  id: number;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

export interface MultipleTabsError {
  available_tabs: Array<{
    title: string;
    url: string;
  }>;
}

export class MultipleTabsException extends Error {
  public readonly availableTabs: Array<{ title: string; url: string }>;
  
  constructor(availableTabs: Array<{ title: string; url: string }>, targetTitle?: string) {
    const message = targetTitle 
      ? `Target not found: "${targetTitle}". Please specify one of the available tabs.`
      : 'Multiple tabs found. Please specify target_title.';
    super(message);
    this.name = 'MultipleTabsException';
    this.availableTabs = availableTabs;
  }
}