import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
  memo,
} from "react";
import Papa from "papaparse";
import * as GSheets from "./GoogleSheetsService";

// ============================================================
// Types
// ============================================================
interface ShelfEntry {
  org: string;
  side: string;
  pos: number;
  aliases?: string[];
}

interface WarehouseZone {
  id: string;
  name: string;
  section: string;
  order: number;
  color: string;
  shelves: ShelfEntry[];
}

interface ZoneEntry {
  zone: WarehouseZone;
  shelfPos: number;
  side: string;
}

interface InventoryItem {
  _id: string;
  _rowIndex: number;
  [key: string]: unknown;
}

interface PickItem extends InventoryItem {
  _shelfPos: number;
  _shelfSide: string;
  _pickItemKey: string;
  _notHere?: boolean;
  _orderIdx?: number;
  _origIdx?: number;
}

interface PickRunZone {
  zoneId: string;
  zoneName: string;
  section: string;
  order: number;
  color: string;
  items: PickItem[];
  unfoundCount?: number;

  _autoCompleted?: boolean;
  _sinkToBottom?: boolean;
}

interface PickRunDataType {
  zones: PickRunZone[];
  unmapped: InventoryItem[];
}

interface OrgStat {
  name: string;
  total: number;
  found: number;
}

interface SavedState {
  inventoryList: InventoryItem[];
  csvFileName: string;
  foundCount: number;
  foundIds: string[];
  notFoundIds: string[];
  detectedColumns: Record<string, string>;
  organizations: string[];
  pickRunData: PickRunDataType | null;
  notHereItems: Record<string, boolean>;
  deployReasonFilter: string;
  googleSheetId?: string;
  googleSheetTitle?: string;
  googleSheetTab?: string;
  googleSyncEnabled?: boolean;
}

interface GoogleSheetsState {
  isSignedIn: boolean;
  isConnected: boolean;
  isLoading: boolean;
  error: string;
  spreadsheetId: string;
  spreadsheetTitle: string;
  sheetTab: string;
  sheetTabs: GSheets.SheetInfo[];
  realtimeSync: boolean;
  recentSpreadsheets: Array<{ id: string; name: string; modifiedTime: string }>;
  showSetup: boolean;
  clientId: string;
  sheetHeaders: string[];
  foundColumnIndex: number;
}

// ============================================================
// Constants
// ============================================================
const PAGE_SIZE = 30;
const STORAGE_KEY = "inventoryScanner_savedState";
const VIBRATE_DURATION = 200;

const COLORS = {
  primary: "#6366f1",
  primaryDark: "#4f46e5",
  primaryLight: "#818cf8",
  success: "#10b981",
  successBg: "#d1fae5",
  error: "#ef4444",
  errorBg: "#fee2e2",
  warning: "#f59e0b",
  info: "#3b82f6",
  infoBg: "#dbeafe",
  white: "#ffffff",
  background: "#f8fafc",
  surface: "#ffffff",
  text: "#1e293b",
  textSecondary: "#64748b",
  textMuted: "#94a3b8",
  border: "#e2e8f0",
  hover: "#f1f5f9",
  pickRun: "#f97316",
};

// ============================================================
// WAREHOUSE ZONE MAP
// ============================================================
const WAREHOUSE_ZONES: WarehouseZone[] = [
  {
    id: "Z1", name: "Aisle 1", section: "Column 1", order: 1, color: "#991b1b",
    shelves: [
      { org: "OneTrust", side: "-", pos: 1 },
      { org: "BDS", side: "-", pos: 2 },
      { org: "Anyscale", side: "-", pos: 3 },
      { org: "Staffbase", side: "-", pos: 4 },
      { org: "Velocity", side: "-", pos: 5 },
      { org: "Phaidra", side: "-", pos: 6 },
      { org: "Sysdig", side: "-", pos: 7 },
    ],
  },
  {
    id: "Z2", name: "Aisle 2", section: "Column 2", order: 2, color: "#ef4444",
    shelves: [
      { org: "MathCo", side: "-", pos: 1 },
      { org: "QbDVision", side: "-", pos: 2 },
      { org: "TrueAnom", side: "-", pos: 3 },
      { org: "JumpCloud", side: "-", pos: 4 },
      { org: "Crisis24", side: "-", pos: 5 },
      { org: "Stack Overflow", side: "-", pos: 6, aliases: ["StackOverflow"] },
      { org: "SandboxAQ", side: "-", pos: 7 },
    ],
  },
  {
    id: "Z3", name: "Aisle 3", section: "Column 3", order: 3, color: "#f97316",
    shelves: [
      { org: "Fabulous", side: "-", pos: 1 },
      { org: "Int. Growth", side: "-", pos: 2, aliases: ["International Growth"] },
      { org: "Movable Ink", side: "-", pos: 3 },
      { org: "Kleiner Perk", side: "-", pos: 4, aliases: ["Kleiner Perkins"] },
      { org: "ShopMonkey", side: "-", pos: 5 },
      { org: "StackAdapt", side: "-", pos: 6 },
      { org: "NewRelic", side: "-", pos: 7, aliases: ["New Relic"] },
      { org: "Verve", side: "-", pos: 8 },
      { org: "Torchlight", side: "-", pos: 9 },
      { org: "TaxJar", side: "-", pos: 10 },
      { org: "Energy Found", side: "-", pos: 11, aliases: ["Energy Foundation", "Energy Found.", "Energy Found."] },
    ],
  },
  {
    id: "Z4", name: "Aisle 4", section: "Column 4", order: 4, color: "#eab308",
    shelves: [
      { org: "Single Grain", side: "-", pos: 1 },
      { org: "SnapCare", side: "-", pos: 2 },
      { org: "Sidecar Heath", side: "-", pos: 3, aliases: ["Sidecar", "Sidecar Health"] },
      { org: "Sift", side: "-", pos: 4 },
      { org: "SoRare", side: "-", pos: 5, aliases: ["Sorare"] },
      { org: "Synthesia", side: "-", pos: 6 },
    ],
  },
  {
    id: "Z5", name: "Aisle 5", section: "Column 5", order: 5, color: "#22c55e",
    shelves: [
      { org: "OpenSesame", side: "-", pos: 1 },
      { org: "Astronomer", side: "-", pos: 2 },
      { org: "Primer", side: "-", pos: 3 },
      { org: "Productboard", side: "-", pos: 4 },
      { org: "Wise", side: "-", pos: 5 },
      { org: "Railbookers", side: "-", pos: 6 },
    ],
  },
  {
    id: "Z6", name: "Aisle 6", section: "Column 6", order: 6, color: "#06b6d4",
    shelves: [
      { org: "Neo4j", side: "-", pos: 1 },
      { org: "SOCI", side: "-", pos: 2 },
      { org: "Lokalise", side: "-", pos: 3 },
      { org: "Earnest Ana.", side: "-", pos: 4, aliases: ["Earnest", "Earnest Analytics"] },
      { org: "Moonpay", side: "-", pos: 5, aliases: ["MoonPay"] },
      { org: "Nylas", side: "-", pos: 6 },
      { org: "Pacvue", side: "-", pos: 7 },
      { org: "Tailscale", side: "-", pos: 8 },
      { org: "Archer Faris", side: "-", pos: 9, aliases: ["Archer"] },
      { org: "Mysten", side: "-", pos: 10 },
      { org: "Nanoramic", side: "-", pos: 11 },
    ],
  },
  {
    id: "Z7", name: "Aisle 7", section: "Column 7", order: 7, color: "#8b5cf6",
    shelves: [
      { org: "Pax8", side: "-", pos: 1 },
      { org: "HackerOne", side: "-", pos: 2 },
      { org: "Varo Bank", side: "-", pos: 3 },
    ],
  },
  {
    id: "Z8", name: "Aisle 8", section: "Column 8", order: 8, color: "#ec4899",
    shelves: [
      { org: "Varo Bank", side: "-", pos: 1 },
      { org: "Houzz", side: "-", pos: 2 },
      { org: "FirstBase", side: "-", pos: 3 },
      { org: "Dotdigital", side: "-", pos: 4 },
      { org: "Finfare", side: "-", pos: 5 },
      { org: "AppDirect", side: "-", pos: 6 },
    ],
  },
  {
    id: "Z9", name: "Aisle 9", section: "Column 9", order: 9, color: "#d946ef",
    shelves: [
      { org: "Mercari", side: "-", pos: 1 },
      { org: "8th Light", side: "-", pos: 2 },
      { org: "Kallidus", side: "-", pos: 3 },
      { org: "3Cloud", side: "-", pos: 4 },
    ],
  },
  {
    id: "Z10", name: "Aisle 10", section: "Column 10", order: 10, color: "#0ea5e9",
    shelves: [
      { org: "Pantheon", side: "-", pos: 1 },
      { org: "Anaplan", side: "-", pos: 2 },
      { org: "Crosby Legal", side: "-", pos: 3 },
      { org: "Papa", side: "-", pos: 4 },
    ],
  },
  {
    id: "Z11", name: "Aisle 11", section: "Column 11", order: 11, color: "#64748b",
    shelves: [
      { org: "HackerRank", side: "-", pos: 1 },
      { org: "BGB", side: "-", pos: 2 },
      { org: "Paxos", side: "-", pos: 3 },
      { org: "SpotOn", side: "-", pos: 4 },
      { org: "Rithum", side: "-", pos: 5 },
      { org: "ZenBusiness", side: "-", pos: 6, aliases: ["ZenB."] },
      { org: "A16Z", side: "-", pos: 7 },
    ],
  },
  {
    id: "Z12", name: "Aisle 12", section: "Column 12", order: 12, color: "#a3a3a3",
    shelves: [
      { org: "RefugeeR.", side: "-", pos: 1, aliases: ["Refugee Resettlement"] },
      { org: "Binti", side: "-", pos: 2 },
      { org: "Akasa", side: "-", pos: 3 },
      { org: "Benifex", side: "-", pos: 4, aliases: ["Benefex"] },
      { org: "Docebo", side: "-", pos: 5 },
    ],
  },
  {
    id: "Z13", name: "Aisle 13", section: "Column 13", order: 13, color: "#78716c",
    shelves: [
      { org: "Fortis Games", side: "-", pos: 1 },
      { org: "Bitscale", side: "-", pos: 2 },
      { org: "BallotReady", side: "-", pos: 3, aliases: ["Ballot Ready"] },
      { org: "Ashby", side: "-", pos: 4 },
      { org: "Beamery", side: "-", pos: 5 },
      { org: "One", side: "-", pos: 6, aliases: ["One Corp Finance", "Corp Finance"] },
      { org: "Lastpass", side: "-", pos: 7, aliases: ["LastPass"] },
    ],
  },
  {
    id: "Z14", name: "Aisle 14", section: "Column 14", order: 14, color: "#b45309",
    shelves: [
      { org: "Sprout", side: "-", pos: 1 },
      { org: "Corp Finance", side: "-", pos: 2, aliases: ["One Corp Finance"] },
      { org: "Smile/Venly", side: "-", pos: 3, aliases: ["Smile", "Venly"] },
      { org: "Apollo Graph", side: "-", pos: 4, aliases: ["Apollo GraphQL"] },
      { org: "Replicant", side: "-", pos: 5 },
      { org: "Kinsta", side: "-", pos: 6 },
      { org: "Abnormal", side: "-", pos: 7 },
    ],
  },
  {
    id: "Z15", name: "Row 15", section: "Lower Row 15", order: 15, color: "#dc2626",
    shelves: [
      { org: "Prenuvo", side: "-", pos: 1 },
      { org: "Harmonic", side: "-", pos: 2 },
      { org: "Discord", side: "-", pos: 3 },
      { org: "Med Trainer", side: "-", pos: 4 },
      { org: "Concert Ai", side: "-", pos: 5, aliases: ["ConcertAI", "Concert AI"] },
    ],
  },
  {
    id: "Z16", name: "Row 16", section: "Lower Row 16", order: 16, color: "#ea580c",
    shelves: [
      { org: "Sovos", side: "-", pos: 1 },
      { org: "Cybercoders", side: "-", pos: 2, aliases: ["CyberCoders"] },
      { org: "Momentus", side: "-", pos: 3 },
    ],
  },
  {
    id: "Z17", name: "Row 17", section: "Lower Row 17", order: 17, color: "#ca8a04",
    shelves: [
      { org: "Matillion", side: "-", pos: 1 },
      { org: "Brightwheel", side: "-", pos: 2, aliases: ["BrightW"] },
      { org: "UiPath", side: "-", pos: 3, aliases: ["Ui Path", "Uipath"] },
      { org: "Typeform", side: "-", pos: 4 },
      { org: "Life360", side: "-", pos: 5 },
    ],
  },
  {
    id: "Z18", name: "Row 18", section: "Lower Row 18", order: 18, color: "#16a34a",
    shelves: [
      { org: "Mercury", side: "-", pos: 1 },
      { org: "Assent", side: "-", pos: 2 },
      { org: "GAN Integrity", side: "-", pos: 3 },
      { org: "Prison Fellow.", side: "-", pos: 4, aliases: ["Prison Fellowship"] },
      { org: "SUI Foundat.", side: "-", pos: 5, aliases: ["SUI Foundation"] },
      { org: "Veramed", side: "-", pos: 6 },
      { org: "Fluidstack", side: "-", pos: 7, aliases: ["FluidStack"] },
      { org: "Mews", side: "-", pos: 8 },
      { org: "Motion", side: "-", pos: 9 },
      { org: "Digital Ai", side: "-", pos: 10, aliases: ["Digital AI"] },
    ],
  },
  {
    id: "Z19", name: "Row 19", section: "Lower Row 19", order: 19, color: "#0891b2",
    shelves: [
      { org: "Cresta", side: "-", pos: 1 },
      { org: "Atrium", side: "-", pos: 2 },
      { org: "ECI", side: "-", pos: 3 },
      { org: "Postman", side: "-", pos: 4 },
      { org: "Verint", side: "-", pos: 5, aliases: ["Verint Used", "Verint New"] },
      { org: "Cover Genius", side: "-", pos: 6 },
      { org: "Branching Mind", side: "-", pos: 7 },
      { org: "Exports", side: "-", pos: 8 },
    ],
  },
  {
    id: "Z20", name: "Row 20", section: "Lower Row 20", order: 20, color: "#7c3aed",
    shelves: [
      { org: "Ramp", side: "-", pos: 1 },
      { org: "Braze", side: "-", pos: 2 },
      { org: "Logically Ai", side: "-", pos: 3, aliases: ["Logically AI"] },
      { org: "Wisp", side: "-", pos: 4 },
      { org: "Permutive", side: "-", pos: 5 },
      { org: "ECI", side: "-", pos: 6 },
      { org: "Seat Geek", side: "-", pos: 7, aliases: ["SeatGeek"] },
      { org: "Sentinel 1", side: "-", pos: 8, aliases: ["Sentinel One", "SentinelOne"] },
    ],
  },
  {
    id: "Z21", name: "Row 21", section: "Lower Row 21", order: 21, color: "#be185d",
    shelves: [
      { org: "YouGov", side: "-", pos: 1 },
      { org: "Wrapbook", side: "-", pos: 2 },
      { org: "Cloudflare", side: "-", pos: 3 },
      { org: "Prepared", side: "-", pos: 4 },
      { org: "Kraken", side: "-", pos: 5 },
      { org: "Coastal Bank", side: "-", pos: 6, aliases: ["CoastalBank"] },
      { org: "Macabacus", side: "-", pos: 7 },
      { org: "Ramp", side: "-", pos: 8 },
    ],
  },
  {
    id: "Z22", name: "Row 22", section: "Walkway", order: 22, color: "#525252",
    shelves: [],
  },
  {
    id: "Z23", name: "Row 23 (Bottom Floor)", section: "Bottom Row", order: 23, color: "#78716c",
    shelves: [
      { org: "Carta", side: "-", pos: 1 },
      { org: "Strava", side: "-", pos: 2 },
      { org: "Horizon3.ai", side: "-", pos: 3, aliases: ["Horizon3"] },
      { org: "Sophos", side: "-", pos: 4 },
      { org: "CoreLight", side: "-", pos: 5, aliases: ["Corelight"] },
      { org: "Wiz", side: "-", pos: 6 },
      { org: "Care Lumen", side: "-", pos: 7 },
      { org: "evermore", side: "-", pos: 8, aliases: ["Evermore"] },
      { org: "Mindoula", side: "-", pos: 9 },
      { org: "Anyscale", side: "-", pos: 10 },
      { org: "Dutchie", side: "-", pos: 11 },
    ],
  },
];

// ============================================================
// PICK RUN ORDER
// ============================================================
const PICK_RUN_ORDER: Record<string, string[]> = {
  Z1: ["OneTrust", "BDS", "Anyscale", "Staffbase", "Velocity", "Phaidra", "Sysdig"],
  Z2: ["MathCo", "QbDVision", "TrueAnom", "JumpCloud", "Crisis24", "Stack Overflow", "SandboxAQ"],
  Z3: ["Fabulous", "Int. Growth", "Movable Ink", "Kleiner Perk", "ShopMonkey", "StackAdapt", "NewRelic", "Verve", "Torchlight", "TaxJar", "Energy Found"],
  Z4: ["Single Grain", "SnapCare", "Sidecar Heath", "Sift", "SoRare", "Synthesia"],
  Z5: ["OpenSesame", "Astronomer", "Primer", "Productboard", "Wise", "Railbookers"],
  Z6: ["Neo4j", "SOCI", "Lokalise", "Earnest Ana.", "Moonpay", "Nylas", "Pacvue", "Tailscale", "Archer Faris", "Mysten", "Nanoramic"],
  Z7: ["Pax8", "HackerOne", "Varo Bank"],
  Z8: ["Varo Bank", "Houzz", "FirstBase", "Dotdigital", "Finfare", "AppDirect"],
  Z9: ["Mercari", "8th Light", "Kallidus", "3Cloud"],
  Z10: ["Pantheon", "Anaplan", "Crosby Legal", "Papa"],
  Z11: ["HackerRank", "BGB", "Paxos", "SpotOn", "Rithum", "ZenBusiness", "A16Z"],
  Z12: ["RefugeeR.", "Binti", "Akasa", "Benifex", "Docebo"],
  Z13: ["Fortis Games", "Bitscale", "BallotReady", "Ashby", "Beamery", "One", "Lastpass"],
  Z14: ["Sprout", "Corp Finance", "Smile/Venly", "Apollo Graph", "Replicant", "Kinsta", "Abnormal"],
  Z15: ["Prenuvo", "Harmonic", "Discord", "Med Trainer", "Concert Ai"],
  Z16: ["Sovos", "Cybercoders", "Momentus"],
  Z17: ["Matillion", "Brightwheel", "UiPath", "Typeform", "Life360"],
  Z18: ["Mercury", "Assent", "GAN Integrity", "Prison Fellow.", "SUI Foundat.", "Veramed", "Fluidstack", "Mews", "Motion", "Digital Ai"],
  Z19: ["Cresta", "Atrium", "ECI", "Postman", "Verint", "Cover Genius", "Branching Mind", "Exports"],
  Z20: ["Ramp", "Braze", "Logically Ai", "Wisp", "Permutive", "ECI", "Seat Geek", "Sentinel 1"],
  Z21: ["YouGov", "Wrapbook", "Cloudflare", "Prepared", "Kraken", "Coastal Bank", "Macabacus", "Ramp"],
  Z23: ["Carta", "Strava", "Horizon3.ai", "Sophos", "CoreLight", "Wiz", "Care Lumen", "evermore", "Mindoula", "Anyscale", "Dutchie"],
};

// ============================================================
// Utility functions
// ============================================================
const normalizeOrg = (org: unknown): string => (org as string)?.toString().trim().toLowerCase() || "";

const buildOrderIndex = (list: string[]): Map<string, number> => {
  const map = new Map<string, number>();
  list.forEach((name, idx) => map.set(normalizeOrg(name), idx));
  return map;
};

const ORG_ALIASES: Record<string, string> = {
  "sprout social": "sprout",
};

const getOrderIndexForOrg = (
  orgName: unknown,
  orderIndex: Map<string, number>,
  orderList: string[]
): number | undefined => {
  const nOrg = normalizeOrg(orgName);
  if (!nOrg) return undefined;
  const alias = ORG_ALIASES[nOrg];
  if (alias) {
    const aliasIndex = orderIndex.get(normalizeOrg(alias));
    if (aliasIndex !== undefined) return aliasIndex;
  }
  const direct = orderIndex.get(nOrg);
  if (direct !== undefined) return direct;
  for (let i = 0; i < orderList.length; i++) {
    const normalized = normalizeOrg(orderList[i]);
    if (!normalized) continue;
    if (nOrg.includes(normalized) || normalized.includes(nOrg)) return i;
  }
  return undefined;
};

const ORG_TO_ZONES_MAP: Record<string, ZoneEntry[]> = {};
WAREHOUSE_ZONES.forEach((zone) => {
  zone.shelves.forEach((shelf) => {
    const entry: ZoneEntry = { zone, shelfPos: shelf.pos, side: shelf.side };
    const key = shelf.org.toLowerCase().trim();
    if (!ORG_TO_ZONES_MAP[key]) ORG_TO_ZONES_MAP[key] = [];
    ORG_TO_ZONES_MAP[key].push(entry);
    if (shelf.aliases) {
      shelf.aliases.forEach((alias) => {
        const aliasKey = alias.toLowerCase().trim();
        if (!ORG_TO_ZONES_MAP[aliasKey]) ORG_TO_ZONES_MAP[aliasKey] = [];
        ORG_TO_ZONES_MAP[aliasKey].push(entry);
      });
    }
  });
});

const getZonesForOrg = (orgName: unknown): ZoneEntry[] => {
  if (!orgName) return [];
  const key = (orgName as string).toString().toLowerCase().trim();
  if (ORG_TO_ZONES_MAP[key]) return ORG_TO_ZONES_MAP[key];
  for (const [mapKey, entries] of Object.entries(ORG_TO_ZONES_MAP)) {
    if (key.includes(mapKey) || mapKey.includes(key)) return entries;
  }
  return [];
};

// Column name mappings
const COLUMN_MAPPINGS: Record<string, string[]> = {
  inventoryId: ["Inventory ID", "inventory_id", "inventoryId", "InventoryID", "inventory-id", "Asset ID"],
  serialNumber: ["Serial Number", "serial_number", "serialNumber", "SerialNumber", "serial-number", "SN", "sn", "Serial number"],
  productTitle: ["Product Title", "product_title", "productTitle", "ProductTitle", "product-title", "Title", "title", "Description", "description", "Product title", "product_description", "Product"],
  organization: ["Organization", "organization", "ORGANIZATION", "Org", "org", "Company", "company", "Department", "department", "Division", "division", "Team", "team", "Group", "group", "Unit", "unit", "Location", "location", "Site", "site", "Branch", "branch", "organisation_name", "organization_name", "Organization name"],
  deployReason: ["deploy_reason", "Deploy Reason", "deployReason", "DeployReason", "deploy-reason", "Reason", "reason", "Deployment Reason", "deployment_reason", "deploymentReason"],
  deployStatus: ["deploy_status", "Deploy Status", "deployStatus", "DeployStatus", "deploy-status", "Status", "status"],
  category: ["Category", "category", "Item Category", "item_category", "Product Category", "product_category"],
  found: ["Found", "found", "FOUND", "scanned", "Scanned", "SCANNED"],
};

const getColumnValue = (item: Record<string, unknown>, columnType: string): string | null => {
  if (!item || !columnType) return null;
  const possibleNames = COLUMN_MAPPINGS[columnType] || [];
  for (const name of possibleNames) {
    if (item[name] !== undefined && item[name] !== null) return item[name] as string;
  }
  return null;
};

const setColumnValue = (item: Record<string, unknown>, columnType: string, value: unknown): Record<string, unknown> => {
  if (!item || !columnType) return item;
  const possibleNames = COLUMN_MAPPINGS[columnType] || [];
  for (const name of possibleNames) {
    if (name in item) return { ...item, [name]: value };
  }
  if (possibleNames.length > 0) return { ...item, [possibleNames[0]]: value };
  return item;
};

// Persistence
const saveToStorage = (data: SavedState): void => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (error) {
    console.warn("Could not save to localStorage:", error);
  }
};

const loadFromStorage = (): SavedState | null => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as SavedState;
  } catch (error) {
    console.warn("Could not load from localStorage:", error);
    return null;
  }
};

const clearStorage = (): void => {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
};

const normalize = (str: unknown): string => (str as string)?.toString().trim().toLowerCase() || "";
const safeValue = (item: Record<string, unknown>, columnType: string): string => getColumnValue(item, columnType) || "N/A";

const formatDeployReason = (value: unknown): string => {
  if (!value) return "N/A";
  const normalizedValue = (value as string).toString().trim().toUpperCase();
  if (normalizedValue === "RECYCLING_REQUESTED") return "Recycling Requested";
  if (normalizedValue === "MARKED_FOR_DESTRUCTION") return "Marked For Destruction";
  if (normalizedValue === "OUT_FOR_DESTRUCTION") return "Out For Destruction";
  if (normalizedValue === "AWAITING_INFORMATION") return "Awaiting Information";
  return (value as string).toString();
};

const formatDeployStatus = (value: unknown): string => {
  if (!value) return "N/A";
  const normalizedValue = (value as string).toString().trim().toUpperCase();
  if (normalizedValue === "AVAILABLE") return "Available";
  if (normalizedValue === "UNAVAILABLE") return "Unavailable";
  if (normalizedValue === "DEPLOYED") return "Deployed";
  if (normalizedValue === "ARCHIVED") return "Archived";
  return (value as string).toString();
};

const formatCategory = (value: unknown): string => {
  if (!value) return "N/A";
  const normalizedValue = (value as string).toString().trim().toUpperCase();
  if (normalizedValue === "COMPUTER") return "Computer";
  if (normalizedValue === "MOBILE_PHONE") return "Phone";
  if (normalizedValue === "TABLET") return "Tablet";
  if (normalizedValue === "EXTERNAL_HDD") return "External Hard Drive";
  return (value as string).toString();
};

const generateExportFilename = (csvFileName: string): string => {
  const baseName = csvFileName ? csvFileName.replace(/\.[^/.]+$/, "") : "inventory";
  const timestamp = new Date().toISOString().slice(0, 10);
  return `Items_found_${baseName}_${timestamp}.csv`;
};

const triggerHapticFeedback = (): void => {
  if ("vibrate" in navigator) navigator.vibrate(VIBRATE_DURATION);
};

const parseBoolean = (value: unknown): boolean => {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalizedValue = value.toLowerCase().trim();
    return normalizedValue === "true" || normalizedValue === "1" || normalizedValue === "yes";
  }
  return false;
};

const normalizeDeployReason = (value: unknown): string =>
  (value as string)?.toString().trim().toUpperCase() || "";

const matchesDeployReasonFilter = (item: Record<string, unknown>, filter: string): boolean => {
  if (!filter || filter === "ALL") return true;
  const deployReason = normalizeDeployReason(getColumnValue(item, "deployReason"));
  if (filter === "RECYCLING_REQUESTED") return deployReason === "RECYCLING_REQUESTED";
  if (filter === "MARKED_FOR_DESTRUCTION") return deployReason === "MARKED_FOR_DESTRUCTION";
  if (filter === "OUT_FOR_DESTRUCTION") return deployReason === "OUT_FOR_DESTRUCTION";
  if (filter === "AWAITING_INFORMATION") return deployReason === "AWAITING_INFORMATION";
  if (filter === "BOTH") return deployReason === "RECYCLING_REQUESTED" || deployReason === "MARKED_FOR_DESTRUCTION";
  if (filter === "ALL_DESTRUCTION") return deployReason === "MARKED_FOR_DESTRUCTION" || deployReason === "OUT_FOR_DESTRUCTION";
  if (filter === "NONE") return !deployReason;
  return true;
};

// ============================================================
// Hooks
// ============================================================
const useInventorySearch = (inventoryList: InventoryItem[]) => {
  const [searchQuery, setSearchQuery] = useState("");
  const filteredList = useMemo(() => {
    if (!searchQuery) return [] as InventoryItem[];
    const query = searchQuery.toLowerCase();
    return inventoryList.filter((item) => {
      const inventoryId = getColumnValue(item, "inventoryId")?.toLowerCase() || "";
      const serialNumber = getColumnValue(item, "serialNumber")?.toLowerCase() || "";
      const productTitle = getColumnValue(item, "productTitle")?.toLowerCase() || "";
      const organization = getColumnValue(item, "organization")?.toLowerCase() || "";
      const deployReason = getColumnValue(item, "deployReason")?.toLowerCase() || "";
      return (
        inventoryId.includes(query) ||
        serialNumber.includes(query) ||
        productTitle.includes(query) ||
        organization.includes(query) ||
        deployReason.includes(query)
      );
    });
  }, [searchQuery, inventoryList]);
  return { searchQuery, setSearchQuery, filteredList };
};

// ============================================================
// SVG Icon Components
// ============================================================
const CheckIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
    <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
  </svg>
);
const WarningIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
    <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z" />
  </svg>
);
const LargeSuccessIcon = () => (
  <svg width="60" height="60" viewBox="0 0 24 24" fill={COLORS.success}>
    <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
  </svg>
);
const LargeErrorIcon = () => (
  <svg width="60" height="60" viewBox="0 0 24 24" fill={COLORS.error}>
    <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
  </svg>
);
const SearchIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="11" cy="11" r="8" />
    <path d="m21 21-4.35-4.35" />
  </svg>
);
const DownloadIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
    <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z" />
  </svg>
);
const PackageIcon = () => (
  <svg width="40" height="40" viewBox="0 0 24 24" fill="currentColor" opacity="0.5">
    <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 3h5v5h-5V6zm-6 0h5v5H6V6zm0 13v-5h5v5H6zm6 0v-5h5v5h-5z" />
  </svg>
);
const FilterIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
    <path d="M10 18h4v-2h-4v2zM3 6v2h18V6H3zm3 7h12v-2H6v2z" />
  </svg>
);
const ResetIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z" />
  </svg>
);
const RouteIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
    <path d="M21 3L3 10.53v.98l6.84 2.65L12.48 21h.98L21 3z" />
  </svg>
);
const WalkIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
    <path d="M13.5 5.5c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zM9.8 8.9L7 23h2.1l1.8-8 2.1 2v6h2v-7.5l-2.1-2 .6-3C14.8 12 16.8 13 19 13v-2c-1.9 0-3.5-1-4.3-2.4l-1-1.6c-.4-.6-1-1-1.7-1-.3 0-.5.1-.8.1L6 8.3V13h2V9.6l1.8-.7" />
  </svg>
);

const GoogleSheetsIcon = () => (
  <svg width="20" height="20" viewBox="0 0 48 48">
    <path fill="#43a047" d="M37,45H11c-1.657,0-3-1.343-3-3V6c0-1.657,1.343-3,3-3h19l10,10v29C40,43.657,38.657,45,37,45z" />
    <path fill="#c8e6c9" d="M40 13L30 13 30 3z" />
    <path fill="#2e7d32" d="M30 13L40 23 40 13z" />
    <path fill="#e8f5e9" d="M31 23L15 23 15 40 33 40 33 23z" />
    <path fill="#1b5e20" d="M15 23H33V25H15zM15 27H33V29H15zM15 31H33V33H15zM15 35H33V37H15z" />
    <path fill="#1b5e20" d="M22 23H24V40H22z" />
  </svg>
);

const CloudSyncIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
    <path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM19 18H6c-2.21 0-4-1.79-4-4s1.79-4 4-4h.71C7.37 7.69 9.48 6 12 6c3.04 0 5.5 2.46 5.5 5.5v.5H19c1.66 0 3 1.34 3 3s-1.34 3-3 3z" />
  </svg>
);

const GoogleLogo = () => (
  <svg width="18" height="18" viewBox="0 0 48 48">
    <path fill="#FFC107" d="M43.611,20.083H42V20H24v8h11.303c-1.649,4.657-6.08,8-11.303,8c-6.627,0-12-5.373-12-12c0-6.627,5.373-12,12-12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C12.955,4,4,12.955,4,24c0,11.045,8.955,20,20,20c11.045,0,20-8.955,20-20C44,22.659,43.862,21.35,43.611,20.083z" />
    <path fill="#FF3D00" d="M6.306,14.691l6.571,4.819C14.655,15.108,18.961,12,24,12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C16.318,4,9.656,8.337,6.306,14.691z" />
    <path fill="#4CAF50" d="M24,44c5.166,0,9.86-1.977,13.409-5.192l-6.19-5.238C29.211,35.091,26.715,36,24,36c-5.202,0-9.619-3.317-11.283-7.946l-6.522,5.025C9.505,39.556,16.227,44,24,44z" />
    <path fill="#1976D2" d="M43.611,20.083H42V20H24v8h11.303c-0.792,2.237-2.231,4.166-4.087,5.571c0.001-0.001,0.002-0.001,0.003-0.002l6.19,5.238C36.971,39.205,44,34,44,24C44,22.659,43.862,21.35,43.611,20.083z" />
  </svg>
);

// ============================================================
// Google Sheets Connector — Sign in with Google
// ============================================================
interface GoogleSheetsConnectorProps {
  googleState: GoogleSheetsState;
  onSignIn: () => Promise<void>;
  onSignOut: () => void;
  onSelectSpreadsheet: (spreadsheetId: string) => Promise<void>;
  onSelectTab: (tabTitle: string) => void;
  onLoadSheet: () => Promise<void>;
  onToggleSync: (enabled: boolean) => void;
  onExportToSheet: () => Promise<void>;
  onDisconnect: () => void;
  onSetClientId: (clientId: string) => void;
  onShowSetup: (show: boolean) => void;
  hasInventory: boolean;
  foundCount: number;
  totalCount: number;
}

const GoogleSheetsConnector: React.FC<GoogleSheetsConnectorProps> = ({
  googleState, onSignIn, onSignOut, onSelectSpreadsheet, onSelectTab, onLoadSheet,
  onToggleSync, onExportToSheet, onDisconnect, onSetClientId, onShowSetup,
  hasInventory, foundCount, totalCount,
}) => {
  const [signInLoading, setSignInLoading] = useState(false);
  const [selectLoading, setSelectLoading] = useState<string | null>(null);
  const [exportLoading, setExportLoading] = useState(false);
  const [localClientId, setLocalClientId] = useState(googleState.clientId);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [manualUrl, setManualUrl] = useState("");

  const handleSignIn = async () => { setSignInLoading(true); try { await onSignIn(); } finally { setSignInLoading(false); } };
  const handleSelectSpreadsheet = async (id: string) => { setSelectLoading(id); try { await onSelectSpreadsheet(id); } finally { setSelectLoading(null); } };
  const handleManualConnect = async () => { const id = GSheets.extractSpreadsheetId(manualUrl); if (!id) return; await handleSelectSpreadsheet(id); };
  const handleExport = async () => { setExportLoading(true); try { await onExportToSheet(); } finally { setExportLoading(false); } };

  if (googleState.showSetup) {
    return (
      <div style={{ marginBottom: "20px", padding: "20px", borderRadius: "16px", border: "2px solid #34a853", backgroundColor: "#f0fdf4" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px" }}><GoogleSheetsIcon /><span style={{ fontSize: "16px", fontWeight: "700", color: "#1e293b" }}>Google Sheets Setup</span></div>
        <div style={{ fontSize: "13px", color: "#64748b", marginBottom: "12px", lineHeight: "1.6" }}>
          To sign in with Google, you need an OAuth Client ID:<br />
          1. Go to <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener noreferrer" style={{ color: "#4285f4", textDecoration: "underline" }}>Google Cloud Console</a><br />
          2. Create an OAuth 2.0 Client ID (Web application)<br />
          3. Add <strong>{window.location.origin}</strong> to Authorized JavaScript Origins<br />
          4. Enable <strong>Google Sheets API</strong> and <strong>Google Drive API</strong>
        </div>
        <input type="text" value={localClientId} onChange={(e) => setLocalClientId(e.target.value)} placeholder="Paste your OAuth Client ID here..." style={{ width: "100%", padding: "12px", fontSize: "13px", borderRadius: "8px", border: "1px solid #d1d5db", backgroundColor: "#ffffff", marginBottom: "12px", boxSizing: "border-box", fontFamily: "monospace" }} />
        <div style={{ display: "flex", gap: "8px" }}>
          <button onClick={() => { onSetClientId(localClientId.trim()); onShowSetup(false); }} disabled={!localClientId.trim()} style={{ padding: "10px 20px", fontSize: "14px", fontWeight: "600", borderRadius: "8px", border: "none", backgroundColor: localClientId.trim() ? "#34a853" : "#94a3b8", color: "#fff", cursor: localClientId.trim() ? "pointer" : "not-allowed" }}>Save & Continue</button>
          {googleState.clientId && <button onClick={() => onShowSetup(false)} style={{ padding: "10px 20px", fontSize: "14px", fontWeight: "600", borderRadius: "8px", border: "1px solid #d1d5db", backgroundColor: "#fff", color: "#64748b", cursor: "pointer" }}>Cancel</button>}
        </div>
      </div>
    );
  }

  if (!googleState.clientId) {
    return (
      <div style={{ marginBottom: "20px", padding: "20px", borderRadius: "16px", border: "2px dashed #34a853", backgroundColor: "#f0fdf4" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px" }}><GoogleSheetsIcon /><span style={{ fontSize: "16px", fontWeight: "700", color: "#1e293b" }}>Google Sheets</span></div>
        <div style={{ fontSize: "13px", color: "#64748b", marginBottom: "16px", lineHeight: "1.5" }}>Connect your Google account to import inventory from Google Sheets, sync scans in real time, and export results.</div>
        <button onClick={() => onShowSetup(true)} style={{ width: "100%", padding: "12px 20px", fontSize: "15px", fontWeight: "600", borderRadius: "10px", border: "1px solid #dadce0", backgroundColor: "#fff", color: "#3c4043", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "10px", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}><GoogleLogo /> Set up Google Sheets Connection</button>
      </div>
    );
  }

  if (!googleState.isSignedIn) {
    return (
      <div style={{ marginBottom: "20px", padding: "20px", borderRadius: "16px", border: "2px dashed #34a853", backgroundColor: "#f0fdf4" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}><GoogleSheetsIcon /><span style={{ fontSize: "16px", fontWeight: "700", color: "#1e293b" }}>Google Sheets</span></div>
          <button onClick={() => onShowSetup(true)} style={{ padding: "4px 10px", fontSize: "11px", fontWeight: "600", borderRadius: "6px", border: "1px solid #d1d5db", backgroundColor: "#fff", color: "#64748b", cursor: "pointer" }}>Settings</button>
        </div>
        {googleState.error && <div style={{ padding: "8px 12px", borderRadius: "8px", backgroundColor: "#fee2e2", color: "#dc2626", fontSize: "13px", marginBottom: "12px" }}>{googleState.error}</div>}
        <button onClick={handleSignIn} disabled={signInLoading} style={{ width: "100%", padding: "12px 20px", fontSize: "15px", fontWeight: "600", borderRadius: "10px", border: "1px solid #dadce0", backgroundColor: "#fff", color: "#3c4043", cursor: signInLoading ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "10px", boxShadow: "0 1px 3px rgba(0,0,0,0.08)", opacity: signInLoading ? 0.7 : 1 }}><GoogleLogo />{signInLoading ? "Signing in..." : "Sign in with Google"}</button>
      </div>
    );
  }

  if (!googleState.isConnected) {
    return (
      <div style={{ marginBottom: "20px", padding: "20px", borderRadius: "16px", border: "2px solid #34a853", backgroundColor: "#f0fdf4" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}><div style={{ width: "8px", height: "8px", borderRadius: "50%", backgroundColor: "#34a853" }} /><span style={{ fontSize: "15px", fontWeight: "700", color: "#1e293b" }}>Choose a Spreadsheet</span></div>
          <button onClick={onSignOut} style={{ padding: "4px 10px", fontSize: "11px", fontWeight: "600", borderRadius: "6px", border: "1px solid #fca5a5", backgroundColor: "#fff", color: "#dc2626", cursor: "pointer" }}>Sign Out</button>
        </div>
        {googleState.error && <div style={{ padding: "8px 12px", borderRadius: "8px", backgroundColor: "#fee2e2", color: "#dc2626", fontSize: "13px", marginBottom: "12px" }}>{googleState.error}</div>}
        {googleState.isLoading ? (
          <div style={{ textAlign: "center", padding: "20px", color: "#64748b", fontSize: "14px" }}>Loading your spreadsheets...</div>
        ) : googleState.recentSpreadsheets.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "6px", maxHeight: "280px", overflowY: "auto", marginBottom: "12px" }}>
            {googleState.recentSpreadsheets.map((sheet) => (
              <button key={sheet.id} onClick={() => handleSelectSpreadsheet(sheet.id)} disabled={selectLoading !== null} style={{ padding: "12px 14px", borderRadius: "10px", border: "1px solid #e2e8f0", backgroundColor: selectLoading === sheet.id ? "#dcfce7" : "#fff", cursor: selectLoading !== null ? "not-allowed" : "pointer", textAlign: "left", display: "flex", alignItems: "center", gap: "12px", transition: "all 0.15s ease", opacity: selectLoading !== null && selectLoading !== sheet.id ? 0.5 : 1 }}>
                <GoogleSheetsIcon />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: "13px", fontWeight: "600", color: "#1e293b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sheet.name}</div>
                  <div style={{ fontSize: "11px", color: "#94a3b8" }}>Modified {new Date(sheet.modifiedTime).toLocaleDateString()}</div>
                </div>
                {selectLoading === sheet.id && <span style={{ fontSize: "12px", color: "#34a853", fontWeight: "600" }}>Opening...</span>}
              </button>
            ))}
          </div>
        ) : (
          <div style={{ textAlign: "center", padding: "16px", color: "#94a3b8", fontSize: "13px", marginBottom: "12px" }}>No spreadsheets found. Try pasting a URL below.</div>
        )}
        <div style={{ borderTop: "1px solid #e2e8f0", paddingTop: "12px" }}>
          {showUrlInput ? (
            <div style={{ display: "flex", gap: "8px" }}>
              <input type="text" value={manualUrl} onChange={(e) => setManualUrl(e.target.value)} placeholder="Paste Google Sheet URL..." style={{ flex: 1, padding: "10px 12px", fontSize: "13px", borderRadius: "8px", border: "1px solid #d1d5db", backgroundColor: "#ffffff", boxSizing: "border-box" }} onKeyDown={(e) => { if (e.key === "Enter" && manualUrl.trim()) handleManualConnect(); }} />
              <button onClick={handleManualConnect} disabled={!manualUrl.trim() || selectLoading !== null} style={{ padding: "10px 16px", fontSize: "13px", fontWeight: "600", borderRadius: "8px", border: "none", backgroundColor: manualUrl.trim() ? "#34a853" : "#94a3b8", color: "#fff", cursor: manualUrl.trim() ? "pointer" : "not-allowed", whiteSpace: "nowrap" }}>Open</button>
            </div>
          ) : (
            <button onClick={() => setShowUrlInput(true)} style={{ width: "100%", padding: "8px", fontSize: "12px", fontWeight: "500", color: "#64748b", backgroundColor: "transparent", border: "none", cursor: "pointer", textDecoration: "underline" }}>Or paste a Google Sheet URL instead</button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{ marginBottom: "20px", padding: "16px", borderRadius: "16px", border: "2px solid #34a853", backgroundColor: "#f0fdf4" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0, flex: 1 }}><div style={{ width: "8px", height: "8px", borderRadius: "50%", backgroundColor: "#34a853", flexShrink: 0 }} /><span style={{ fontSize: "14px", fontWeight: "700", color: "#1e293b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{googleState.spreadsheetTitle}</span></div>
        <button onClick={onDisconnect} style={{ padding: "4px 10px", fontSize: "11px", fontWeight: "600", borderRadius: "6px", border: "1px solid #fca5a5", backgroundColor: "#fff", color: "#dc2626", cursor: "pointer", flexShrink: 0, marginLeft: "8px" }}>Disconnect</button>
      </div>
      {googleState.error && <div style={{ padding: "8px 12px", borderRadius: "8px", backgroundColor: "#fee2e2", color: "#dc2626", fontSize: "13px", marginBottom: "12px" }}>{googleState.error}</div>}
      <div style={{ marginBottom: "12px" }}>
        <div style={{ fontSize: "12px", fontWeight: "600", color: "#64748b", marginBottom: "4px" }}>Sheet Tab</div>
        <select value={googleState.sheetTab} onChange={(e) => onSelectTab(e.target.value)} style={{ width: "100%", padding: "8px 12px", fontSize: "13px", borderRadius: "8px", border: "1px solid #d1d5db", backgroundColor: "#fff", cursor: "pointer" }}>
          <option value="">Select a tab...</option>
          {googleState.sheetTabs.map((tab) => (<option key={tab.sheetId} value={tab.title}>{tab.title} ({tab.rowCount} data rows)</option>))}
        </select>
      </div>
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "12px" }}>
        <button onClick={onLoadSheet} disabled={!googleState.sheetTab || googleState.isLoading} style={{ padding: "10px 16px", fontSize: "13px", fontWeight: "600", borderRadius: "8px", border: "none", backgroundColor: googleState.sheetTab && !googleState.isLoading ? "#4285f4" : "#94a3b8", color: "#fff", cursor: googleState.sheetTab && !googleState.isLoading ? "pointer" : "not-allowed", display: "flex", alignItems: "center", gap: "6px" }}><DownloadIcon />{googleState.isLoading ? "Loading..." : "Import from Sheet"}</button>
        <button onClick={handleExport} disabled={!hasInventory || exportLoading || !googleState.sheetTab} style={{ padding: "10px 16px", fontSize: "13px", fontWeight: "600", borderRadius: "8px", border: "none", backgroundColor: hasInventory && !exportLoading && googleState.sheetTab ? "#34a853" : "#94a3b8", color: "#fff", cursor: hasInventory && !exportLoading && googleState.sheetTab ? "pointer" : "not-allowed", display: "flex", alignItems: "center", gap: "6px" }}><GoogleSheetsIcon />{exportLoading ? "Exporting..." : "Export to New Tab"}</button>
      </div>
      {hasInventory && googleState.sheetTab && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", borderRadius: "8px", backgroundColor: googleState.realtimeSync ? "#dcfce7" : "#f1f5f9", border: `1px solid ${googleState.realtimeSync ? "#86efac" : "#e2e8f0"}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}><CloudSyncIcon /><div><div style={{ fontSize: "13px", fontWeight: "600", color: "#1e293b" }}>Real-time Sync {googleState.realtimeSync ? "ON" : "OFF"}</div><div style={{ fontSize: "11px", color: "#64748b" }}>{googleState.realtimeSync ? "Scanned items update the sheet instantly" : "Push scan results to the sheet live"}</div></div></div>
          <button onClick={() => onToggleSync(!googleState.realtimeSync)} style={{ width: "48px", height: "26px", borderRadius: "13px", border: "none", backgroundColor: googleState.realtimeSync ? "#34a853" : "#94a3b8", cursor: "pointer", position: "relative", transition: "background-color 0.2s ease" }}><div style={{ width: "22px", height: "22px", borderRadius: "50%", backgroundColor: "#fff", position: "absolute", top: "2px", left: googleState.realtimeSync ? "24px" : "2px", transition: "left 0.2s ease", boxShadow: "0 1px 3px rgba(0,0,0,0.2)" }} /></button>
        </div>
      )}
      {hasInventory && <div style={{ fontSize: "11px", color: "#64748b", marginTop: "8px", textAlign: "center" }}>{foundCount} of {totalCount} items scanned{googleState.realtimeSync && " • Syncing to Google Sheets"}</div>}
    </div>
  );
};

// Sub-Components
// ============================================================
const StatusMessage: React.FC<{ message: string; isError?: boolean }> = ({ message, isError = false }) => {
  if (!message) return null;
  return (
    <div
      aria-live="polite"
      style={{
        padding: "12px 16px",
        borderRadius: "12px",
        fontSize: "14px",
        fontWeight: "500",
        marginBottom: "20px",
        display: "flex",
        alignItems: "center",
        gap: "8px",
        backgroundColor: isError ? COLORS.errorBg : COLORS.successBg,
        color: isError ? COLORS.error : COLORS.success,
        border: `1px solid ${isError ? COLORS.error : COLORS.success}20`,
        animation: "slideIn 0.3s ease-out",
      }}
    >
      {isError ? <WarningIcon /> : <CheckIcon />}
      {message}
    </div>
  );
};

const RestoredBanner: React.FC<{ fileName: string; onDismiss: () => void }> = ({ fileName, onDismiss }) => (
  <div
    style={{
      padding: "12px 16px",
      borderRadius: "12px",
      fontSize: "14px",
      fontWeight: "500",
      marginBottom: "20px",
      display: "flex",
      alignItems: "center",
      gap: "8px",
      backgroundColor: COLORS.infoBg,
      color: COLORS.info,
      border: `1px solid ${COLORS.info}20`,
      animation: "slideIn 0.3s ease-out",
    }}
  >
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <path d="M13 3c-4.97 0-9 4.03-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42C8.27 19.99 10.51 21 13 21c4.97 0 9-4.03 9-9s-4.03-9-9-9zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z" />
    </svg>
    <span style={{ flex: 1 }}>
      Session restored from <strong>"{fileName}"</strong> - your scan progress is safe!
    </span>
    <button
      onClick={onDismiss}
      style={{
        background: "none",
        border: "none",
        color: COLORS.info,
        cursor: "pointer",
        fontSize: "18px",
        padding: "0 4px",
        lineHeight: 1,
      }}
      title="Dismiss"
    >
      X
    </button>
  </div>
);

const SimpleScanResult: React.FC<{
  scannedCode: string;
  found: boolean;
  scannedItem?: InventoryItem | null;
}> = ({ scannedCode, found, scannedItem }) => {
  if (!scannedCode) return null;
  const deployReason = scannedItem ? getColumnValue(scannedItem, "deployReason") : null;
  const deployStatus = scannedItem ? getColumnValue(scannedItem, "deployStatus") : null;
  const hasReason = deployReason && deployReason !== "N/A";
  const hasStatus = deployStatus && deployStatus !== "N/A";
  const deployReasonNormalized = deployReason?.toString().trim().toUpperCase() || "";
  const isRecycle = deployReasonNormalized === "RECYCLING_REQUESTED";
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "12px",
        padding: "20px",
        borderRadius: "16px",
        marginBottom: "24px",
        backgroundColor: found ? COLORS.successBg : COLORS.errorBg,
        border: `2px solid ${found ? COLORS.success : COLORS.error}20`,
        animation: "pulse 0.5s ease-out",
      }}
      aria-live="assertive"
      role="alert"
    >
      <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
        <div style={{ display: "flex", alignItems: "center" }}>
          {found ? <LargeSuccessIcon /> : <LargeErrorIcon />}
        </div>
        <div
          style={{
            fontSize: "18px",
            fontWeight: "600",
            color: COLORS.text,
            fontFamily: "monospace",
          }}
        >
          {scannedCode}
        </div>
      </div>
      {found && (hasReason || hasStatus) && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", justifyContent: "center" }}>
          {hasReason && (
            <span
              style={{
                backgroundColor: isRecycle ? COLORS.warning + "20" : COLORS.error + "15",
                color: isRecycle ? COLORS.warning : COLORS.error,
                padding: "4px 10px",
                borderRadius: "6px",
                fontSize: "12px",
                fontWeight: "600",
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
              }}
            >
              Reason: {formatDeployReason(deployReason)}
            </span>
          )}
          {hasStatus && (
            <span
              style={{
                backgroundColor: deployStatus.toString().toUpperCase() === "AVAILABLE" ? "#10b98120" : "#8b5cf620",
                color: deployStatus.toString().toUpperCase() === "AVAILABLE" ? "#059669" : "#7c3aed",
                padding: "4px 10px",
                borderRadius: "6px",
                fontSize: "12px",
                fontWeight: "600",
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
              }}
            >
              Status: {formatDeployStatus(deployStatus)}
            </span>
          )}
        </div>
      )}
    </div>
  );
};

const Statistics: React.FC<{
  foundCount: number;
  totalCount: number;
  notFoundCount: number;
  organizationStats: OrgStat[];
}> = ({ foundCount, totalCount, notFoundCount, organizationStats }) => {
  const percentage = totalCount > 0 ? Math.round((foundCount / totalCount) * 100) : 0;
  return (
    <div
      style={{
        background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
        borderRadius: "20px",
        padding: "20px",
        marginBottom: "24px",
        boxShadow: "0 10px 25px rgba(0,0,0,0.1)",
      }}
    >
      <div
        style={{
          backgroundColor: "rgba(255,255,255,0.2)",
          borderRadius: "12px",
          height: "8px",
          marginBottom: "20px",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${percentage}%`,
            backgroundColor: "#ffffff",
            borderRadius: "12px",
            transition: "width 0.5s ease-out",
            boxShadow: "0 0 10px rgba(255,255,255,0.5)",
          }}
        />
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: "8px",
          marginBottom: organizationStats && organizationStats.length > 0 ? "16px" : "0",
        }}
      >
        {[
          { value: foundCount, label: "Found" },
          { value: notFoundCount, label: "Not Found" },
          { value: totalCount - foundCount - (notFoundCount || 0), label: "Remaining" },
          { value: `${percentage}%`, label: "Complete" },
        ].map((stat) => (
          <div
            key={stat.label}
            style={{
              textAlign: "center",
              backgroundColor: "rgba(255,255,255,0.15)",
              borderRadius: "12px",
              padding: "8px",
              backdropFilter: "blur(10px)",
              minWidth: 0,
            }}
          >
            <div
              style={{
                fontSize: "clamp(20px, 5vw, 28px)",
                fontWeight: "bold",
                color: "#ffffff",
                textShadow: "0 2px 4px rgba(0,0,0,0.1)",
              }}
            >
              {stat.value}
            </div>
            <div
              style={{
                fontSize: "clamp(10px, 2.5vw, 12px)",
                color: "rgba(255,255,255,0.9)",
                marginTop: "2px",
              }}
            >
              {stat.label}
            </div>
          </div>
        ))}
      </div>
      {organizationStats && organizationStats.length > 0 && (
        <div
          style={{
            backgroundColor: "rgba(255,255,255,0.1)",
            borderRadius: "12px",
            padding: "12px",
            backdropFilter: "blur(10px)",
          }}
        >
          <div
            style={{
              fontSize: "12px",
              fontWeight: "600",
              color: "rgba(255,255,255,0.9)",
              marginBottom: "8px",
            }}
          >
            Organizations
          </div>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "8px",
              maxHeight: "100px",
              overflowY: "auto",
            }}
          >
            {organizationStats.map((org) => (
              <div
                key={org.name}
                style={{
                  backgroundColor: "rgba(255,255,255,0.2)",
                  borderRadius: "8px",
                  padding: "4px 8px",
                  fontSize: "11px",
                  color: "#ffffff",
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                }}
              >
                <span style={{ fontWeight: "600" }}>{org.name}</span>
                <span style={{ opacity: 0.9 }}>({org.found}/{org.total})</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

const InventoryItemRow = memo<{
  item: InventoryItem;
  isFound: boolean;
  isNotFound: boolean;
}>(({ item, isFound, isNotFound }) => {
  const [isHovered, setIsHovered] = useState(false);
  const organization = getColumnValue(item, "organization");
  const deployReason = getColumnValue(item, "deployReason");
  const deployStatus = getColumnValue(item, "deployStatus");
  const category = getColumnValue(item, "category");
  const deployReasonNorm = deployReason?.toString().trim().toUpperCase();
  const isRecycle = deployReasonNorm === "RECYCLING_REQUESTED";

  const rowBackgroundColor = isFound
    ? COLORS.successBg
    : isNotFound
    ? COLORS.errorBg
    : COLORS.surface;
  const rowBorderColor = isFound
    ? COLORS.success + "30"
    : isNotFound
    ? COLORS.error + "30"
    : COLORS.border;

  return (
    <li
      style={{
        padding: "16px",
        marginBottom: "8px",
        backgroundColor: rowBackgroundColor,
        border: `1px solid ${rowBorderColor}`,
        borderRadius: "12px",
        position: "relative",
        transition: "all 0.3s ease",
        cursor: "default",
        transform: isHovered ? "translateX(4px)" : "translateX(0)",
        boxShadow: isHovered ? "0 4px 12px rgba(0,0,0,0.08)" : "0 1px 3px rgba(0,0,0,0.05)",
        opacity: isFound ? 0.7 : isNotFound ? 0.75 : 1,
      }}
      title={isFound ? "Found item" : isNotFound ? "Not found during pick run" : "Not yet scanned"}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {isFound && (
        <div
          style={{
            position: "absolute",
            right: "16px",
            top: "50%",
            transform: "translateY(-50%)",
            width: "32px",
            height: "32px",
            borderRadius: "50%",
            backgroundColor: COLORS.success,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "white",
            fontSize: "18px",
            boxShadow: "0 2px 8px rgba(16, 185, 129, 0.3)",
          }}
        >
          <CheckIcon />
        </div>
      )}
      {isNotFound && !isFound && (
        <div
          style={{
            position: "absolute",
            right: "16px",
            top: "50%",
            transform: "translateY(-50%)",
            width: "32px",
            height: "32px",
            borderRadius: "50%",
            backgroundColor: COLORS.error,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "white",
            fontSize: "18px",
            boxShadow: "0 2px 8px rgba(239, 68, 68, 0.3)",
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
          </svg>
        </div>
      )}
      <div style={{ paddingRight: isFound || isNotFound ? "48px" : "0" }}>
        <div style={{ display: "flex", gap: "8px", marginBottom: "8px", flexWrap: "wrap" }}>
          <span
            style={{
              backgroundColor: COLORS.primaryLight + "20",
              color: COLORS.primaryDark,
              padding: "4px 8px",
              borderRadius: "6px",
              fontSize: "11px",
              fontWeight: "600",
              fontFamily: "monospace",
              wordBreak: "break-all",
            }}
          >
            SN: {safeValue(item, "serialNumber")}
          </span>
          <span
            style={{
              backgroundColor: "#14b8a620",
              color: "#0f766e",
              padding: "4px 8px",
              borderRadius: "6px",
              fontSize: "11px",
              fontWeight: "600",
              fontFamily: "monospace",
              wordBreak: "break-all",
            }}
          >
            ID: {safeValue(item, "inventoryId")}
          </span>
          {organization && organization !== "N/A" && (
            <span
              style={{
                backgroundColor: COLORS.info + "20",
                color: COLORS.info,
                padding: "4px 8px",
                borderRadius: "6px",
                fontSize: "11px",
                fontWeight: "600",
                wordBreak: "break-all",
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
              }}
            >
              ORG: {organization}
            </span>
          )}
          {deployReason && deployReason !== "N/A" && (
            <span
              style={{
                backgroundColor: isRecycle ? COLORS.warning + "20" : COLORS.error + "15",
                color: isRecycle ? COLORS.warning : COLORS.error,
                padding: "4px 8px",
                borderRadius: "6px",
                fontSize: "11px",
                fontWeight: "600",
                wordBreak: "break-all",
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
              }}
            >
              Deploy Reason: {formatDeployReason(deployReason)}
            </span>
          )}
          {deployStatus && deployStatus !== "N/A" && (
            <span
              style={{
                backgroundColor: deployStatus.toUpperCase() === "AVAILABLE" ? "#10b98120" : "#8b5cf620",
                color: deployStatus.toUpperCase() === "AVAILABLE" ? "#059669" : "#7c3aed",
                padding: "4px 8px",
                borderRadius: "6px",
                fontSize: "11px",
                fontWeight: "600",
                wordBreak: "break-all",
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
              }}
            >
              Status: {formatDeployStatus(deployStatus)}
            </span>
          )}
          {isNotFound && !isFound && (
            <span
              style={{
                backgroundColor: COLORS.error + "15",
                color: COLORS.error,
                padding: "4px 8px",
                borderRadius: "6px",
                fontSize: "11px",
                fontWeight: "600",
                wordBreak: "break-all",
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
              }}
            >
              Not Found
            </span>
          )}
          {category && category !== "N/A" && (
            <span
              style={{
                backgroundColor: COLORS.info + "15",
                color: COLORS.info,
                padding: "4px 8px",
                borderRadius: "6px",
                fontSize: "11px",
                fontWeight: "600",
                wordBreak: "break-all",
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
              }}
            >
              Category: {formatCategory(category)}
            </span>
          )}
        </div>
        <div style={{ fontSize: "14px", color: COLORS.text, fontWeight: "500", wordBreak: "break-word" }}>
          {safeValue(item, "productTitle")}
        </div>
      </div>
    </li>
  );
});

const ActionButtons: React.FC<{
  onExport: () => void;
  onReset: () => void;
  disabled: boolean;
}> = ({ onExport, onReset, disabled }) => (
  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "12px" }}>
    <button
      onClick={onExport}
      disabled={disabled}
      style={{
        padding: "14px 20px",
        fontSize: "15px",
        fontWeight: "600",
        borderRadius: "12px",
        border: "none",
        backgroundColor: disabled ? COLORS.textMuted : COLORS.primary,
        color: "#fff",
        cursor: disabled ? "not-allowed" : "pointer",
        transition: "all 0.3s ease",
        boxShadow: disabled ? "none" : "0 4px 14px rgba(99, 102, 241, 0.3)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "8px",
      }}
      title={disabled ? "Upload inventory CSV first" : "Export updated inventory CSV"}
    >
      <DownloadIcon /> Export CSV
    </button>
    <button
      onClick={onReset}
      disabled={disabled}
      style={{
        padding: "14px 20px",
        fontSize: "15px",
        fontWeight: "600",
        borderRadius: "12px",
        border: `2px solid ${disabled ? COLORS.border : COLORS.error}`,
        backgroundColor: COLORS.white,
        color: disabled ? COLORS.textMuted : COLORS.error,
        cursor: disabled ? "not-allowed" : "pointer",
        transition: "all 0.3s ease",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "8px",
      }}
      title="Reset all data and clear saved session"
    >
      <ResetIcon /> Reset Data
    </button>
  </div>
);

const PickRunButton: React.FC<{
  onClick: () => void;
  disabled: boolean;
  unfoundCount: number;
}> = ({ onClick, disabled, unfoundCount }) => (
  <div style={{ marginBottom: "24px" }}>
    <button
      onClick={onClick}
      disabled={disabled || unfoundCount === 0}
      style={{
        width: "100%",
        padding: "16px 20px",
        fontSize: "16px",
        fontWeight: "700",
        borderRadius: "12px",
        border: "none",
        background: disabled || unfoundCount === 0
          ? COLORS.textMuted
          : "linear-gradient(135deg, #f97316 0%, #ef4444 100%)",
        color: "#fff",
        cursor: disabled || unfoundCount === 0 ? "not-allowed" : "pointer",
        transition: "all 0.3s ease",
        boxShadow: disabled || unfoundCount === 0
          ? "none"
          : "0 4px 14px rgba(249, 115, 22, 0.4)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "10px",
        letterSpacing: "0.5px",
      }}
      title="Generate optimized pick run route based on warehouse map"
    >
      <RouteIcon />
      Start Pick Run ({unfoundCount} items)
    </button>
  </div>
);

const OrganizationFilter: React.FC<{
  organizations: string[];
  selectedOrg: string;
  onOrgChange: (org: string) => void;
}> = ({ organizations, selectedOrg, onOrgChange }) => {
  if (!organizations || organizations.length === 0) return null;
  return (
    <div
      style={{
        marginBottom: "16px",
        padding: "12px",
        backgroundColor: COLORS.surface,
        borderRadius: "12px",
        border: `1px solid ${COLORS.border}`,
      }}
    >
      <div
        style={{
          fontSize: "14px",
          fontWeight: "600",
          marginBottom: "8px",
          color: COLORS.text,
          display: "flex",
          alignItems: "center",
          gap: "6px",
        }}
      >
        <FilterIcon /> Filter by Organization
      </div>
      <select
        value={selectedOrg}
        onChange={(e) => onOrgChange(e.target.value)}
        style={{
          width: "100%",
          padding: "8px 12px",
          fontSize: "14px",
          borderRadius: "8px",
          border: `1px solid ${COLORS.border}`,
          backgroundColor: COLORS.background,
          color: COLORS.text,
          cursor: "pointer",
          outline: "none",
        }}
      >
        <option value="">All Organizations</option>
        {organizations.map((org) => (
          <option key={org} value={org}>{org}</option>
        ))}
      </select>
    </div>
  );
};

const DeployReasonFilter: React.FC<{
  value: string;
  onChange: (value: string) => void;
}> = ({ value, onChange }) => {
  return (
    <div
      style={{
        marginBottom: "16px",
        padding: "12px",
        backgroundColor: COLORS.surface,
        borderRadius: "12px",
        border: `1px solid ${COLORS.border}`,
      }}
    >
      <div
        style={{
          fontSize: "14px",
          fontWeight: "600",
          marginBottom: "8px",
          color: COLORS.text,
          display: "flex",
          alignItems: "center",
          gap: "6px",
        }}
      >
        <FilterIcon /> Filter by Deploy Reason
      </div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: "100%",
          padding: "8px 12px",
          fontSize: "14px",
          borderRadius: "8px",
          border: `1px solid ${COLORS.border}`,
          backgroundColor: COLORS.background,
          color: COLORS.text,
          cursor: "pointer",
          outline: "none",
        }}
      >
        <option value="ALL">All Items</option>
        <option value="RECYCLING_REQUESTED">Recycling Requested</option>
        <option value="MARKED_FOR_DESTRUCTION">Marked for Destruction</option>
        <option value="OUT_FOR_DESTRUCTION">Out for Destruction</option>
        <option value="AWAITING_INFORMATION">Awaiting Information</option>
        <option value="ALL_DESTRUCTION">All Destruction (Marked + Out)</option>
        <option value="NONE">No Deploy Reason</option>
      </select>
    </div>
  );
};

const ConfirmResetModal: React.FC<{
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}> = ({ isOpen, onConfirm, onCancel }) => {
  if (!isOpen) return null;
  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0, 0, 0, 0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        padding: "16px",
        animation: "fadeIn 0.2s ease-out",
      }}
      onClick={onCancel}
    >
      <div
        style={{
          backgroundColor: COLORS.white,
          borderRadius: "20px",
          padding: "32px",
          maxWidth: "400px",
          width: "100%",
          boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
          animation: "slideIn 0.3s ease-out",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ textAlign: "center", marginBottom: "24px" }}>
          <div
            style={{
              width: "64px",
              height: "64px",
              borderRadius: "50%",
              backgroundColor: COLORS.errorBg,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 16px",
            }}
          >
            <svg width="32" height="32" viewBox="0 0 24 24" fill={COLORS.error}>
              <path d="M12 2C6.47 2 2 6.47 2 12s4.47 10 10 10 10-4.47 10-10S17.53 2 12 2zm5 13.59L15.59 17 12 13.41 8.41 17 7 15.59 10.59 12 7 8.41 8.41 7 12 10.59 15.59 7 17 8.41 13.41 12 17 15.59z" />
            </svg>
          </div>
          <h3 style={{ fontSize: "20px", fontWeight: "700", color: COLORS.text, margin: "0 0 8px 0" }}>
            Reset All Data?
          </h3>
          <p style={{ fontSize: "14px", color: COLORS.textSecondary, lineHeight: "1.5", margin: 0 }}>
            This will permanently delete your inventory data, all scan progress, and the saved session. This action cannot be undone.
          </p>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
          <button
            onClick={onCancel}
            style={{
              padding: "12px 20px",
              fontSize: "15px",
              fontWeight: "600",
              borderRadius: "12px",
              border: `1px solid ${COLORS.border}`,
              backgroundColor: COLORS.white,
              color: COLORS.text,
              cursor: "pointer",
              transition: "all 0.2s ease",
            }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            style={{
              padding: "12px 20px",
              fontSize: "15px",
              fontWeight: "600",
              borderRadius: "12px",
              border: "none",
              backgroundColor: COLORS.error,
              color: "#fff",
              cursor: "pointer",
              transition: "all 0.2s ease",
              boxShadow: "0 4px 14px rgba(239, 68, 68, 0.3)",
            }}
          >
            Yes, Reset
          </button>
        </div>
      </div>
    </div>
  );
};

// ============================================================
// PICK RUN VIEW
// ============================================================
interface PickRunViewProps {
  pickRunData: PickRunDataType;
  inventoryList: InventoryItem[];
  detectedColumns: Record<string, string>;
  foundIdSet: Set<string>;
  notFoundIdSet: Set<string>;
  deployReasonFilter: string;
  onDeployReasonChange: (value: string) => void;
  onClose: () => void;
  scannerValue: string;
  onScannerChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onScannerKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  handScannerInputRef: React.RefObject<HTMLInputElement | null>;
  lastScannedCode: string;
  lastScanFound: boolean;
  notHereItems: Record<string, boolean>;
  onNotHere: (key: string, isNotHere: boolean, itemId: string) => void;

}

const PickRunView: React.FC<PickRunViewProps> = ({
  pickRunData,
  inventoryList,
  detectedColumns,
  foundIdSet,
  deployReasonFilter,
  onDeployReasonChange,
  onClose,
  scannerValue,
  onScannerChange,
  onScannerKeyDown,
  handScannerInputRef,
  lastScannedCode,
  lastScanFound,
  notHereItems,
  onNotHere,
}) => {
  const [expandedZones, setExpandedZones] = useState<Record<string, boolean>>({});

  const inventoryById = useMemo(() => {
    const map = new Map<string, InventoryItem>();
    inventoryList.forEach((item) => map.set(item._id, item));
    return map;
  }, [inventoryList]);

  const foundColumnName = detectedColumns.found || "Found";
  const isFoundItem = useCallback(
    (item: Record<string, unknown>) => foundIdSet.has(item._id as string) || !!item[foundColumnName],
    [foundIdSet, foundColumnName]
  );

  const liveZones = useMemo(() => {
    const zones = pickRunData.zones.map((zone) => {
      const orderList = PICK_RUN_ORDER[zone.zoneId] || [];
      const orderIndex = buildOrderIndex(orderList);
      const liveItems: PickItem[] = zone.items.map((pickItem, idx) => {
        const liveItem = inventoryById.get(pickItem._id);
        return {
          ...(liveItem || pickItem),
          _shelfPos: pickItem._shelfPos,
          _shelfSide: pickItem._shelfSide,
          _pickItemKey: pickItem._pickItemKey,
          _notHere: !!notHereItems[pickItem._pickItemKey],
          _orderIdx: getOrderIndexForOrg(
            getColumnValue((liveItem || pickItem) as Record<string, unknown>, "organization"),
            orderIndex,
            orderList
          ),
          _origIdx: idx,
        } as PickItem;
      });
      liveItems.sort((a, b) => {
        const aActive = !isFoundItem(a) && !a._notHere;
        const bActive = !isFoundItem(b) && !b._notHere;
        if (aActive !== bActive) return aActive ? -1 : 1;
        if (a._notHere !== b._notHere) return a._notHere ? 1 : -1;
        const aHas = a._orderIdx !== undefined;
        const bHas = b._orderIdx !== undefined;
        if (aHas && bHas) return (a._orderIdx as number) - (b._orderIdx as number);
        if (aHas && !bHas) return -1;
        if (!aHas && bHas) return 1;
        return (a._origIdx ?? 0) - (b._origIdx ?? 0);
      });
      const stillUnfound = liveItems.filter((item) => !isFoundItem(item) && !item._notHere);
      const allDone = stillUnfound.length === 0;
      return {
        ...zone,
        items: liveItems,
        unfoundCount: stillUnfound.length,
        _autoCompleted: allDone,
        _sinkToBottom: allDone,
      };
    });
    return zones.sort((a, b) => {
      if (a._sinkToBottom !== b._sinkToBottom) return a._sinkToBottom ? 1 : -1;
      return a.order - b.order;
    });
  }, [pickRunData.zones, inventoryList, foundColumnName, notHereItems, foundIdSet, isFoundItem, inventoryById]);

  const uniqueTotals = useMemo(() => {
    const seenIds = new Set<string>();
    const seenUnfoundIds = new Set<string>();
    const seenNotHereIds = new Set<string>();
    const seenFoundIds = new Set<string>();
    liveZones.forEach((zone) => {
      zone.items.forEach((item) => {
        seenIds.add(item._id);
        if (item._notHere) {
          seenNotHereIds.add(item._id);
        } else if (!isFoundItem(item)) {
          seenUnfoundIds.add(item._id);
        } else {
          seenFoundIds.add(item._id);
        }
      });
    });
    return {
      totalItems: seenIds.size,
      totalRemaining: seenUnfoundIds.size,
      totalFound: seenFoundIds.size,
      totalNotHere: seenNotHereIds.size,
    };
  }, [liveZones, isFoundItem]);

  const { totalItems, totalRemaining, totalFound, totalNotHere } = uniqueTotals;

  const unmappedItems = useMemo(() => {
    return pickRunData.unmapped.map((pickItem) => {
      const liveItem = inventoryList.find((inv) => inv._id === pickItem._id);
      return liveItem || pickItem;
    });
  }, [pickRunData.unmapped, inventoryList]);
  const unmappedUnfound = unmappedItems.filter((item) => !isFoundItem(item));

  const toggleZone = (zoneId: string) => {
    setExpandedZones((prev) => ({ ...prev, [zoneId]: !prev[zoneId] }));
  };

  const isPickRunComplete = totalRemaining === 0 && unmappedUnfound.length === 0;

  return (
    <div style={{ animation: "slideIn 0.3s ease-out" }}>
      {/* Pick Run Header */}
      <div
        style={{
          background: "linear-gradient(135deg, #f97316 0%, #ef4444 100%)",
          borderRadius: "20px",
          padding: "20px",
          marginBottom: "20px",
          boxShadow: "0 10px 25px rgba(0,0,0,0.1)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <WalkIcon />
            <span style={{ fontSize: "20px", fontWeight: "700", color: "#fff" }}>Pick Run</span>
          </div>
          <button
            onClick={onClose}
            style={{
              padding: "8px 16px",
              fontSize: "13px",
              fontWeight: "600",
              borderRadius: "8px",
              border: "2px solid rgba(255,255,255,0.4)",
              backgroundColor: "transparent",
              color: "#fff",
              cursor: "pointer",
            }}
          >
            Exit Pick Run
          </button>
        </div>
        <div
          style={{
            backgroundColor: "rgba(255,255,255,0.2)",
            borderRadius: "12px",
            height: "8px",
            marginBottom: "12px",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              height: "100%",
              width: totalItems > 0 ? `${Math.round((totalFound / totalItems) * 100)}%` : "0%",
              backgroundColor: "#ffffff",
              borderRadius: "12px",
              transition: "width 0.5s ease-out",
            }}
          />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "8px" }}>
          {[
            { value: totalFound, label: "Scanned" },
            { value: totalNotHere, label: "Not Found" },
            { value: totalRemaining + unmappedUnfound.length, label: "Remaining" },
          ].map((stat) => (
            <div
              key={stat.label}
              style={{
                textAlign: "center",
                backgroundColor: "rgba(255,255,255,0.15)",
                borderRadius: "10px",
                padding: "8px",
              }}
            >
              <div style={{ fontSize: "22px", fontWeight: "bold", color: "#fff" }}>{stat.value}</div>
              <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.9)" }}>{stat.label}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ marginBottom: "16px" }}>
        <DeployReasonFilter value={deployReasonFilter} onChange={onDeployReasonChange} />
      </div>

      <div style={{ marginBottom: "16px" }}>
        <input
          ref={handScannerInputRef}
          type="text"
          aria-label="Pick run scanner input"
          value={scannerValue}
          onChange={onScannerChange}
          onKeyDown={onScannerKeyDown}
          placeholder="Scan items as you walk..."
          autoComplete="off"
          spellCheck={false}
          style={{
            width: "100%",
            padding: "14px",
            fontSize: "15px",
            borderRadius: "12px",
            border: `2px solid ${COLORS.pickRun}`,
            backgroundColor: COLORS.surface,
            fontFamily: "'SF Mono', Monaco, 'Cascadia Code', monospace",
            boxShadow: "0 0 0 3px rgba(249, 115, 22, 0.15)",
            boxSizing: "border-box",
          }}
        />
      </div>

      {lastScannedCode && <SimpleScanResult scannedCode={lastScannedCode} found={lastScanFound} />}

      {isPickRunComplete && (
        <div
          style={{
            padding: "24px",
            borderRadius: "16px",
            backgroundColor: COLORS.successBg,
            border: `2px solid ${COLORS.success}30`,
            textAlign: "center",
            marginBottom: "20px",
            animation: "pulse 0.5s ease-out",
          }}
        >
          <div style={{ fontSize: "48px", marginBottom: "12px" }}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill={COLORS.success}>
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
            </svg>
          </div>
          <div style={{ fontSize: "20px", fontWeight: "700", color: COLORS.success, marginBottom: "4px" }}>
            Pick Run Complete!
          </div>
          <div style={{ fontSize: "14px", color: COLORS.textSecondary }}>
            All {totalItems} items have been scanned.
          </div>
        </div>
      )}

      <div
        style={{
          fontSize: "14px",
          fontWeight: "600",
          color: COLORS.textSecondary,
          marginBottom: "4px",
          display: "flex",
          alignItems: "center",
          gap: "6px",
        }}
      >
        <RouteIcon /> Walk Route (Aisle 1 --&gt; 14, then Row 15 --&gt; 23)
      </div>
      <div
        style={{
          fontSize: "11px",
          color: COLORS.textMuted,
          marginBottom: "12px",
          lineHeight: "1.5",
          paddingLeft: "26px",
        }}
      >
        Aisles 1-14 (top columns left to right) --&gt; Rows 15-21 (lower section) --&gt; Row 23 (bottom floor to Carta)
      </div>

      {liveZones.map((zone) => {
        const isExpanded = expandedZones[zone.zoneId] !== false;
        const allDone = (zone.unfoundCount ?? 0) === 0;
        return (
          <div
            key={zone.zoneId}
            style={{
              marginBottom: "12px",
              borderRadius: "12px",
              overflow: "hidden",
              border: `1px solid ${allDone ? COLORS.success + "40" : zone.color + "40"}`,
              backgroundColor: allDone ? COLORS.successBg : COLORS.surface,
              opacity: allDone ? 0.55 : 1,
            }}
          >
            <button
              onClick={() => toggleZone(zone.zoneId)}
              style={{
                width: "100%",
                padding: "14px 16px",
                border: "none",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "12px",
                backgroundColor: allDone ? COLORS.successBg : "transparent",
                textAlign: "left",
              }}
            >
              <div
                style={{
                  width: "36px",
                  height: "36px",
                  borderRadius: "10px",
                  backgroundColor: allDone ? COLORS.success : zone.color,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#fff",
                  fontSize: "14px",
                  fontWeight: "700",
                  flexShrink: 0,
                }}
              >
                {allDone ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                  </svg>
                ) : (
                  <span>{zone.order}</span>
                )}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: "14px",
                    fontWeight: "600",
                    color: allDone ? COLORS.success : COLORS.text,
                    textDecoration: allDone ? "line-through" : "none",
                  }}
                >
                  {zone.zoneName}
                </div>
                <div style={{ fontSize: "12px", color: COLORS.textSecondary }}>
                  {allDone
                    ? `All ${zone.items.length} items scanned`
                    : `${zone.unfoundCount} of ${zone.items.length} items remaining`}
                </div>
              </div>
              <div
                style={{
                  fontSize: "18px",
                  color: COLORS.textMuted,
                  transition: "transform 0.2s ease",
                  transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)",
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M7 10l5 5 5-5z" />
                </svg>
              </div>
            </button>

            {isExpanded && (
              <div style={{ padding: "0 12px 12px" }}>
                {zone.items.map((item) => {
                  const isFound = isFoundItem(item);
                  const isNotHere = item._notHere;
                  return (
                    <div
                      key={item._pickItemKey || item._id}
                      style={{
                        padding: "10px 12px",
                        marginBottom: "6px",
                        borderRadius: "8px",
                        backgroundColor: isFound ? COLORS.successBg : isNotHere ? COLORS.errorBg : COLORS.background,
                        border: `1px solid ${isFound ? COLORS.success + "30" : isNotHere ? COLORS.error + "30" : COLORS.border}`,
                        display: "flex",
                        alignItems: "flex-start",
                        flexWrap: "wrap",
                        gap: "8px",
                        opacity: isFound ? 0.7 : isNotHere ? 0.7 : 1,
                        textDecoration: isFound || isNotHere ? "line-through" : "none",
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: "12px", fontWeight: "600", color: COLORS.text, fontFamily: "monospace", marginBottom: "4px", wordBreak: "break-all" }}>
                          <span style={{ backgroundColor: "#14b8a620", color: "#0f766e", padding: "4px 8px", borderRadius: "6px", fontSize: "11px", fontWeight: "600", fontFamily: "monospace", wordBreak: "break-all", display: "inline-block" }}>
                            ID: {safeValue(item, "inventoryId")}
                          </span>
                        </div>
                        <div style={{ fontSize: "12px", fontWeight: "600", color: COLORS.text, fontFamily: "monospace", marginBottom: "4px", wordBreak: "break-all" }}>
                          <span style={{ backgroundColor: COLORS.primaryLight + "20", color: COLORS.primaryDark, padding: "4px 8px", borderRadius: "6px", fontSize: "11px", fontWeight: "600", fontFamily: "monospace", wordBreak: "break-all", display: "inline-block", marginRight: "6px" }}>
                            SN: {safeValue(item, "serialNumber")}
                          </span>
                          {getColumnValue(item, "category") && getColumnValue(item, "category") !== "N/A" && (
                            <span style={{ backgroundColor: "#f9731620", color: "#c2410c", padding: "4px 8px", borderRadius: "6px", fontSize: "11px", fontWeight: "600", display: "inline-block" }}>
                              CAT: {formatCategory(getColumnValue(item, "category"))}
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: "11px", fontWeight: "600", color: COLORS.info, marginBottom: "6px" }}>
                          <span style={{ backgroundColor: COLORS.info + "20", color: COLORS.info, padding: "4px 8px", borderRadius: "6px", fontSize: "11px", fontWeight: "600", display: "inline-block" }}>
                            ORG: {getColumnValue(item, "organization") || "N/A"}
                          </span>
                        </div>
                        {(() => {
                          const deployReason = getColumnValue(item, "deployReason");
                          const deployStatus = getColumnValue(item, "deployStatus");
                          const hasReason = deployReason && deployReason !== "N/A";
                          const hasStatus = deployStatus && deployStatus !== "N/A";
                          if (!hasReason && !hasStatus) return null;
                          const drNorm = deployReason?.toString().trim().toUpperCase() || "";
                          const drIsRecycle = drNorm === "RECYCLING_REQUESTED";
                          return (
                            <div style={{ marginBottom: "6px", display: "flex", flexWrap: "wrap", gap: "4px" }}>
                              {hasReason && (
                                <span
                                  style={{
                                    backgroundColor: drIsRecycle ? COLORS.warning + "20" : COLORS.error + "15",
                                    color: drIsRecycle ? COLORS.warning : COLORS.error,
                                    padding: "4px 8px",
                                    borderRadius: "6px",
                                    fontSize: "11px",
                                    fontWeight: "600",
                                    wordBreak: "break-all",
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: "4px",
                                  }}
                                >
                                  Deploy Reason: {formatDeployReason(deployReason)}
                                </span>
                              )}
                              {hasStatus && (
                                <span
                                  style={{
                                    backgroundColor: deployStatus.toString().toUpperCase() === "AVAILABLE" ? "#10b98120" : "#8b5cf620",
                                    color: deployStatus.toString().toUpperCase() === "AVAILABLE" ? "#059669" : "#7c3aed",
                                    padding: "4px 8px",
                                    borderRadius: "6px",
                                    fontSize: "11px",
                                    fontWeight: "600",
                                    wordBreak: "break-all",
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: "4px",
                                  }}
                                >
                                  Status: {formatDeployStatus(deployStatus)}
                                </span>
                              )}
                            </div>
                          );
                        })()}
                        <div style={{ fontSize: "11px", color: COLORS.textSecondary, whiteSpace: "normal", overflow: "visible", textOverflow: "unset", wordBreak: "break-word" }}>
                          {safeValue(item, "productTitle")}
                        </div>
                      </div>
                      {!isFound && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onNotHere(item._pickItemKey, !isNotHere, item._id);
                          }}
                          style={{
                            padding: "4px 8px",
                            borderRadius: "6px",
                            fontSize: "10px",
                            fontWeight: "600",
                            border: "none",
                            cursor: "pointer",
                            flexShrink: 0,
                            backgroundColor: isNotHere ? "#dbeafe" : "#fee2e2",
                            color: isNotHere ? "#2563eb" : "#dc2626",
                            alignSelf: "flex-start",
                          }}
                        >
                          {isNotHere ? "Undo" : "Not Found"}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {unmappedItems.length > 0 && (
        <div
          style={{
            marginBottom: "12px",
            borderRadius: "12px",
            overflow: "hidden",
            border: "1px solid #8b5cf6",
            backgroundColor: COLORS.white,
          }}
        >
          <button
            onClick={() => toggleZone("unmapped")}
            style={{
              width: "100%",
              padding: "14px 16px",
              border: "none",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "12px",
              backgroundColor: "transparent",
              textAlign: "left",
            }}
          >
            <div
              style={{
                width: "36px",
                height: "36px",
                borderRadius: "10px",
                backgroundColor: "#8b5cf6",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#fff",
                fontSize: "14px",
                fontWeight: "700",
                flexShrink: 0,
              }}
            >
              ?
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: "14px", fontWeight: "600", color: "#7c3aed" }}>Unknown Location</div>
              <div style={{ fontSize: "12px", color: COLORS.textSecondary }}>
                {unmappedUnfound.length} of {unmappedItems.length} items - org not found on warehouse map
              </div>
            </div>
          </button>
          {expandedZones["unmapped"] !== false && (
            <div style={{ padding: "0 12px 12px" }}>
              {unmappedItems.map((item) => {
                const isFound = !!(item as Record<string, unknown>)[foundColumnName];
                return (
                  <div
                    key={item._id}
                    style={{
                      padding: "10px 12px",
                      marginBottom: "6px",
                      borderRadius: "8px",
                      backgroundColor: isFound ? COLORS.successBg : COLORS.background,
                      border: `1px solid ${isFound ? COLORS.success + "30" : COLORS.border}`,
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                      opacity: isFound ? 0.7 : 1,
                    }}
                  >
                    <div
                      style={{
                        width: "24px",
                        height: "24px",
                        borderRadius: "6px",
                        flexShrink: 0,
                        backgroundColor: isFound ? COLORS.success : COLORS.border,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "#fff",
                        fontSize: "12px",
                      }}
                    >
                      {isFound && (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                        </svg>
                      )}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: "12px", fontWeight: "600", color: COLORS.text, fontFamily: "monospace" }}>
                        {safeValue(item, "serialNumber")} / {safeValue(item, "inventoryId")}
                      </div>
                      <div style={{ fontSize: "11px", color: COLORS.textSecondary }}>
                        {safeValue(item, "productTitle")}
                      </div>
                      {(() => {
                        const deployReason = getColumnValue(item, "deployReason");
                        const deployStatus = getColumnValue(item, "deployStatus");
                        const hasReason = deployReason && deployReason !== "N/A";
                        const hasStatus = deployStatus && deployStatus !== "N/A";
                        if (!hasReason && !hasStatus) return null;
                        const drNorm = deployReason?.toString().trim().toUpperCase() || "";
                        const drIsRecycle = drNorm === "RECYCLING_REQUESTED";
                        return (
                          <div style={{ marginTop: "4px", display: "flex", flexWrap: "wrap", gap: "4px" }}>
                            {hasReason && (
                              <span
                                style={{
                                  backgroundColor: drIsRecycle ? COLORS.warning + "20" : COLORS.error + "15",
                                  color: drIsRecycle ? COLORS.warning : COLORS.error,
                                  padding: "4px 8px",
                                  borderRadius: "6px",
                                  fontSize: "11px",
                                  fontWeight: "600",
                                  wordBreak: "break-all",
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: "4px",
                                }}
                              >
                                Deploy Reason: {formatDeployReason(deployReason)}
                              </span>
                            )}
                            {hasStatus && (
                              <span
                                style={{
                                  backgroundColor: deployStatus.toString().toUpperCase() === "AVAILABLE" ? "#10b98120" : "#8b5cf620",
                                  color: deployStatus.toString().toUpperCase() === "AVAILABLE" ? "#059669" : "#7c3aed",
                                  padding: "4px 8px",
                                  borderRadius: "6px",
                                  fontSize: "11px",
                                  fontWeight: "600",
                                  wordBreak: "break-all",
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: "4px",
                                }}
                              >
                                Status: {formatDeployStatus(deployStatus)}
                              </span>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                    <span
                      style={{
                        padding: "2px 8px",
                        borderRadius: "6px",
                        fontSize: "10px",
                        fontWeight: "600",
                        backgroundColor: "#8b5cf620",
                        color: "#7c3aed",
                      }}
                    >
                      {(getColumnValue(item, "organization") as string) || "No Org"}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {!isPickRunComplete && totalFound > 0 && (
        <div
          style={{
            padding: "16px",
            borderRadius: "12px",
            backgroundColor: COLORS.errorBg,
            border: `1px solid ${COLORS.error}20`,
            marginTop: "16px",
          }}
        >
          <div
            style={{
              fontSize: "14px",
              fontWeight: "600",
              color: COLORS.error,
              marginBottom: "8px",
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            <WarningIcon /> Items Still Missing ({totalRemaining + unmappedUnfound.length})
          </div>
          <div style={{ fontSize: "12px", color: COLORS.textSecondary, lineHeight: "1.5" }}>
            These items were not found during your pick run. They may be misplaced, checked out, or in a different location.
          </div>
        </div>
      )}
    </div>
  );
};

// ============================================================
// Infinite Scroll List
// ============================================================
const InfiniteScrollList = memo<{
  items: InventoryItem[];
  listStyle: React.CSSProperties;
  emptyContent: React.ReactNode;
  isItemFound: (item: InventoryItem) => boolean;
  isItemNotFound: (item: InventoryItem) => boolean;
}>(({ items, listStyle, emptyContent, isItemFound, isItemNotFound }) => {
  const containerRef = useRef<HTMLUListElement>(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [items]);

  const handleScroll = useCallback(() => {
    const element = containerRef.current;
    if (!element) return;
    if (element.scrollHeight - element.scrollTop - element.clientHeight < 100) {
      setVisibleCount((prev) => Math.min(prev + PAGE_SIZE, items.length));
    }
  }, [items.length]);

  const visibleItems = useMemo(() => items.slice(0, visibleCount), [items, visibleCount]);

  if (items.length === 0) {
    return (
      <ul style={listStyle} ref={containerRef}>
        {emptyContent}
      </ul>
    );
  }

  return (
    <ul ref={containerRef} onScroll={handleScroll} style={listStyle} aria-live="polite" aria-label="Inventory list">
      {visibleItems.map((item) => (
        <InventoryItemRow key={item._id} item={item} isFound={isItemFound(item)} isNotFound={isItemNotFound(item)} />
      ))}
      {visibleCount < items.length && (
        <li style={{ padding: "12px", textAlign: "center", color: COLORS.textMuted, fontSize: "13px" }}>
          Scroll down to load more... ({visibleCount} of {items.length})
        </li>
      )}
    </ul>
  );
});

// ============================================================
// MAIN COMPONENT
// ============================================================
export default function InventoryScanner() {
  const [inventoryList, setInventoryList] = useState<InventoryItem[]>([]);
  const [uploadStatus, setUploadStatus] = useState("");
  const [csvFileName, setCsvFileName] = useState("");
  const [lastScannedCode, setLastScannedCode] = useState("");
  const [lastScanFound, setLastScanFound] = useState(false);
  const [scannerValue, setScannerValue] = useState("");
  const [foundCount, setFoundCount] = useState(0);
  const [foundIdSet, setFoundIdSet] = useState<Set<string>>(new Set());
  const [notFoundIdSet, setNotFoundIdSet] = useState<Set<string>>(new Set());
  const [detectedColumns, setDetectedColumns] = useState<Record<string, string>>({});
  const [organizations, setOrganizations] = useState<string[]>([]);
  const [selectedOrganization, setSelectedOrganization] = useState("");
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showRestoredBanner, setShowRestoredBanner] = useState(false);
  const [pickRunMode, setPickRunMode] = useState(false);
  const [pickRunData, setPickRunData] = useState<PickRunDataType | null>(null);
  const [notHereItems, setNotHereItems] = useState<Record<string, boolean>>({});
  const [deployReasonFilter, setDeployReasonFilter] = useState("ALL");

  const [, setFoundMap] = useState<Map<string, boolean>>(new Map());
  const handScannerInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const hasRestoredRef = useRef(false);
  const lookupMapRef = useRef<Map<string, number>>(new Map());

  // Google Sheets state
  const [googleState, setGoogleState] = useState<GoogleSheetsState>({
    isConnected: false,
    isLoading: false,
    error: "",
    spreadsheetId: "",
    spreadsheetTitle: "",
    sheetTab: "",
    sheetTabs: [],
    realtimeSync: false,
    showSetup: false,
    isSignedIn: false,
    recentSpreadsheets: [],
    clientId: GSheets.getSavedClientId(),
    sheetHeaders: [],
    foundColumnIndex: -1,
  });
  const pendingSyncQueue = useRef<Array<{ itemId: string; rowIndex: number }>>([]);
  const syncInProgress = useRef(false);
  const queueGoogleSyncRef = useRef<((item: InventoryItem) => void) | null>(null);

  const { searchQuery, setSearchQuery, filteredList } = useInventorySearch(inventoryList);

  const isItemFound = useCallback(
    (item: InventoryItem) => {
      const foundColumnName = detectedColumns.found || "Found";
      return foundIdSet.has(item._id) || !!(item as Record<string, unknown>)[foundColumnName];
    },
    [foundIdSet, detectedColumns]
  );

  const isItemNotFound = useCallback(
    (item: InventoryItem) => notFoundIdSet.has(item._id),
    [notFoundIdSet]
  );

  useEffect(() => {
    setFoundCount(foundIdSet.size);
  }, [foundIdSet]);

  const buildLookupMap = useCallback((dataList: InventoryItem[]) => {
    const map = new Map<string, number>();
    dataList.forEach((item, index) => {
      const inventoryId = normalize(getColumnValue(item, "inventoryId"));
      const serialNumber = normalize(getColumnValue(item, "serialNumber"));
      if (inventoryId) map.set(inventoryId, index);
      if (serialNumber) map.set(serialNumber, index);
    });
    lookupMapRef.current = map;
  }, []);

  // Persistence: Save
  useEffect(() => {
    if (inventoryList.length === 0) return;
    saveToStorage({
      inventoryList,
      csvFileName,
      foundCount,
      foundIds: Array.from(foundIdSet),
      notFoundIds: Array.from(notFoundIdSet),
      detectedColumns,
      organizations,
      pickRunData,
      notHereItems,
      deployReasonFilter,
      googleSheetId: googleState.spreadsheetId || undefined,
      googleSheetTitle: googleState.spreadsheetTitle || undefined,
      googleSheetTab: googleState.sheetTab || undefined,
      googleSyncEnabled: googleState.realtimeSync || undefined,
    });
  }, [inventoryList, csvFileName, foundCount, foundIdSet, notFoundIdSet, detectedColumns, organizations, pickRunData, notHereItems, deployReasonFilter, googleState.spreadsheetId, googleState.spreadsheetTitle, googleState.sheetTab, googleState.realtimeSync]);

  // Persistence: Restore
  useEffect(() => {
    if (hasRestoredRef.current) return;
    hasRestoredRef.current = true;
    const saved = loadFromStorage();
    if (!saved || !saved.inventoryList || saved.inventoryList.length === 0) return;
    setInventoryList(saved.inventoryList);
    setCsvFileName(saved.csvFileName || "");
    setFoundCount(saved.foundCount || 0);
    setFoundIdSet(new Set(saved.foundIds || []));
    setNotFoundIdSet(new Set(saved.notFoundIds || []));
    setDetectedColumns(saved.detectedColumns || {});
    setOrganizations(saved.organizations || []);
    setPickRunData(saved.pickRunData || null);
    setNotHereItems(saved.notHereItems || {});
    setDeployReasonFilter(saved.deployReasonFilter || "ALL");
    setShowRestoredBanner(true);
    buildLookupMap(saved.inventoryList);
    const restoredFoundMap = new Map<string, boolean>();
    const foundCol = (saved.detectedColumns && saved.detectedColumns.found) || "Found";
    saved.inventoryList.forEach((item) => {
      if ((item as Record<string, unknown>)[foundCol]) restoredFoundMap.set(item._id, true);
    });
    setFoundMap(restoredFoundMap);
    setUploadStatus(`Restored ${saved.inventoryList.length} items from "${saved.csvFileName || "saved session"}".`);
    setTimeout(() => {
      handScannerInputRef.current?.focus();
    }, 300);
  }, [buildLookupMap]);

  const clearInventory = useCallback(() => {
    setInventoryList([]);
    setUploadStatus("");
    setCsvFileName("");
    setLastScannedCode("");
    setLastScanFound(false);
    setSearchQuery("");
    setScannerValue("");
    setFoundCount(0);
    setDetectedColumns({});
    setOrganizations([]);
    setSelectedOrganization("");
    setFoundMap(new Map());
    setFoundIdSet(new Set());
    setNotFoundIdSet(new Set());
    setShowRestoredBanner(false);
    setPickRunMode(false);
    setPickRunData(null);
    setDeployReasonFilter("BOTH");
    lookupMapRef.current = new Map();
    clearStorage();
    if (fileInputRef.current) fileInputRef.current.value = "";
    // Reset Google Sheets sync state (keep client ID and connection)
    setGoogleState((prev) => ({
      ...prev,
      realtimeSync: false,
      sheetHeaders: [],
      foundColumnIndex: -1,
    }));
  }, [setSearchQuery]);

  const handleResetClick = useCallback(() => {
    setShowResetConfirm(true);
  }, []);

  const handleResetConfirm = useCallback(() => {
    setShowResetConfirm(false);
    clearInventory();
  }, [clearInventory]);

  const handleResetCancel = useCallback(() => {
    setShowResetConfirm(false);
    setTimeout(() => {
      handScannerInputRef.current?.focus();
    }, 50);
  }, []);

  const detectColumns = (data: Record<string, unknown>[]): Record<string, string> => {
    if (!data || data.length === 0) return {};
    const firstItem = data[0];
    const detected: Record<string, string> = {};
    for (const [columnType, names] of Object.entries(COLUMN_MAPPINGS)) {
      for (const name of names) {
        if (firstItem[name] !== undefined) {
          detected[columnType] = name;
          break;
        }
      }
    }
    return detected;
  };

  const onFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) {
        clearInventory();
        return;
      }
      const fileName = file.name.toLowerCase();
      if (fileName.endsWith(".xlsx") || fileName.endsWith(".xls") || fileName.endsWith(".xlsm") || fileName.endsWith(".xlsb")) {
        setUploadStatus("Error: Excel files (.xlsx, .xls) must be saved as CSV first. Please open in Excel and 'Save As' CSV format.");
        return;
      }
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          if (results.data.length === 0) {
            setUploadStatus("Error: File is empty or not properly formatted");
            clearInventory();
            return;
          }
          const columns = detectColumns(results.data as Record<string, unknown>[]);
          setDetectedColumns(columns);
          if (!columns.inventoryId && !columns.serialNumber) {
            setUploadStatus("Error: CSV must contain either 'inventory_id' or 'serial_number' column (or similar variants)");
            clearInventory();
            return;
          }
          const uniqueOrganizations = new Set<string>();
          const initialFoundMap = new Map<string, boolean>();
          let initialFoundCount = 0;
          const initialFoundIds = new Set<string>();
          const dataList: InventoryItem[] = (results.data as Record<string, unknown>[]).map((item, index) => {
            const foundValue = getColumnValue(item, "found");
            const foundStatus = foundValue !== null ? parseBoolean(foundValue) : false;
            const orgValue = getColumnValue(item, "organization");
            if (orgValue && orgValue !== "N/A" && orgValue.trim() !== "") uniqueOrganizations.add(orgValue);
            const serialNum = getColumnValue(item, "serialNumber") || "";
            const inventoryId = getColumnValue(item, "inventoryId") || "";
            const uniqueId = `row_${index}_${serialNum}_${inventoryId}`;
            const itemWithFound = columns.found
              ? { ...item, [columns.found]: foundStatus }
              : { ...item, Found: foundStatus };
            if (foundStatus) {
              initialFoundCount++;
              initialFoundMap.set(uniqueId, true);
              initialFoundIds.add(uniqueId);
            }
            return { ...itemWithFound, _id: uniqueId, _rowIndex: index } as InventoryItem;
          });
          setInventoryList(dataList);
          setFoundMap(initialFoundMap);
          setFoundIdSet(initialFoundIds);
          setCsvFileName(file.name);
          setFoundCount(initialFoundCount);
          setOrganizations(Array.from(uniqueOrganizations).sort());
          setShowRestoredBanner(false);
          setPickRunMode(false);
          setPickRunData(null);
          buildLookupMap(dataList);
          let statusMsg = `Successfully loaded ${dataList.length} items from "${file.name}"`;
          if (initialFoundCount > 0) statusMsg += ` (${initialFoundCount} already found)`;
          if (uniqueOrganizations.size > 0) statusMsg += ` with ${uniqueOrganizations.size} organization(s)`;
          statusMsg += ".";
          setUploadStatus(statusMsg);
          setLastScannedCode("");
          e.target.blur();
          setTimeout(() => {
            handScannerInputRef.current?.focus();
          }, 300);
        },
        error: (err) => {
          setUploadStatus(`Error parsing file: ${err.message}. Make sure it's a valid CSV or text file.`);
          clearInventory();
          e.target.blur();
        },
      });
    },
    [clearInventory, buildLookupMap]
  );

  const processScannedCode = useCallback(
    (decodedText: string) => {
      if (inventoryList.length === 0) {
        setLastScannedCode(decodedText);
        setLastScanFound(false);
        return;
      }
      const code = normalize(decodedText);
      const foundItemIndex = lookupMapRef.current.get(code);
      if (foundItemIndex !== undefined) {
        const foundItem = inventoryList[foundItemIndex];
        const foundColumnName = detectedColumns.found || "Found";
        setLastScannedCode(decodedText);
        setLastScanFound(true);
        const isAlreadyFound = foundIdSet.has(foundItem._id) || !!(foundItem as Record<string, unknown>)[foundColumnName];
        if (!isAlreadyFound) {
          setFoundIdSet((prev) => {
            const next = new Set(prev);
            next.add(foundItem._id);
            return next;
          });
          setNotFoundIdSet((prev) => {
            if (!prev.has(foundItem._id)) return prev;
            const next = new Set(prev);
            next.delete(foundItem._id);
            return next;
          });
          // Update the actual item in inventoryList so the data model stays in sync
          setInventoryList((prev) => {
            const updated = [...prev];
            updated[foundItemIndex] = { ...updated[foundItemIndex], [foundColumnName]: true } as InventoryItem;
            return updated;
          });
          // Queue Google Sheets real-time sync via ref
          queueGoogleSyncRef.current?.(foundItem);
        }
        triggerHapticFeedback();
      } else {
        setLastScannedCode(decodedText);
        setLastScanFound(false);
      }
      setTimeout(() => {
        handScannerInputRef.current?.focus();
      }, 50);
    },
    [inventoryList, detectedColumns, foundIdSet]
  );

  const handleHandScannerKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        const code = scannerValue.trim();
        if (code) {
          processScannedCode(code);
          setScannerValue("");
        }
        e.preventDefault();
      }
    },
    [scannerValue, processScannedCode]
  );

  const exportCSV = useCallback(() => {
    if (inventoryList.length === 0) return;
    const foundColumnName = detectedColumns.found || "Found";
    const exportData = inventoryList.map((item) => {
      const { _id, _rowIndex, ...exportItem } = item;
      void _id;
      void _rowIndex;
      const found = foundIdSet.has(item._id) || !!(item as Record<string, unknown>)[foundColumnName];
      return setColumnValue(exportItem as Record<string, unknown>, "found", found);
    });
    const csv = Papa.unparse(exportData as object[]);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = generateExportFilename(csvFileName);
    anchor.click();
    URL.revokeObjectURL(url);
  }, [inventoryList, csvFileName, foundIdSet, detectedColumns]);

  // ============================================================
  // Google Sheets Handlers
  // ============================================================
  const updateGoogleState = useCallback((updates: Partial<GoogleSheetsState>) => {
    setGoogleState((prev) => ({ ...prev, ...updates }));
  }, []);

  const handleGoogleSetClientId = useCallback((clientId: string) => {
    GSheets.saveClientId(clientId);
    updateGoogleState({ clientId, showSetup: false });
  }, [updateGoogleState]);

  const handleGoogleShowSetup = useCallback((show: boolean) => {
    updateGoogleState({ showSetup: show });
  }, [updateGoogleState]);

  const handleGoogleSignIn = useCallback(async () => {
    updateGoogleState({ isLoading: true, error: "" });
    try {
      await GSheets.initialize(googleState.clientId);
      await GSheets.authenticate();
      let recentSpreadsheets: Array<{ id: string; name: string; modifiedTime: string }> = [];
      try { recentSpreadsheets = await GSheets.listRecentSpreadsheets(); } catch { /* Drive API might not be enabled */ }
      updateGoogleState({ isSignedIn: true, isLoading: false, recentSpreadsheets, error: "" });
    } catch (error) {
      updateGoogleState({ isLoading: false, error: `Sign-in failed: ${(error as Error).message}` });
    }
  }, [googleState.clientId, updateGoogleState]);

  const handleGoogleSignOut = useCallback(() => {
    GSheets.signOut();
    updateGoogleState({ isSignedIn: false, isConnected: false, spreadsheetId: "", spreadsheetTitle: "", sheetTab: "", sheetTabs: [], realtimeSync: false, recentSpreadsheets: [], error: "", sheetHeaders: [], foundColumnIndex: -1 });
  }, [updateGoogleState]);

  const handleGoogleSelectSpreadsheet = useCallback(async (spreadsheetId: string) => {
    updateGoogleState({ isLoading: true, error: "" });
    try {
      const info = await GSheets.getSpreadsheetInfo(spreadsheetId);
      updateGoogleState({ isConnected: true, isLoading: false, spreadsheetId: info.spreadsheetId, spreadsheetTitle: info.title, sheetTabs: info.sheets, sheetTab: info.sheets.length > 0 ? info.sheets[0].title : "", error: "" });
    } catch (error) {
      updateGoogleState({ isLoading: false, error: `Failed to open spreadsheet: ${(error as Error).message}` });
    }
  }, [updateGoogleState]);

  const handleGoogleSelectTab = useCallback((tabTitle: string) => {
    updateGoogleState({ sheetTab: tabTitle });
  }, [updateGoogleState]);

  // Helper: Process raw sheet rows into the inventory data structure (same logic as CSV)
  const processSheetData = useCallback((data: Record<string, string>[], sourceName: string) => {
    const columns = (() => {
      if (!data || data.length === 0) return {};
      const firstItem = data[0];
      const detected: Record<string, string> = {};
      for (const [columnType, names] of Object.entries(COLUMN_MAPPINGS)) {
        for (const name of names) {
          if (firstItem[name] !== undefined) {
            detected[columnType] = name;
            break;
          }
        }
      }
      return detected;
    })();

    if (!columns.inventoryId && !columns.serialNumber) {
      return { error: "Sheet must contain either 'Inventory ID' or 'Serial Number' column (or similar variants)" };
    }

    const uniqueOrganizations = new Set<string>();
    const initialFoundMap = new Map<string, boolean>();
    let initialFoundCount = 0;
    const initialFoundIds = new Set<string>();
    const dataList: InventoryItem[] = data.map((item, index) => {
      const foundValue = getColumnValue(item as Record<string, unknown>, "found");
      const foundStatus = foundValue !== null ? parseBoolean(foundValue) : false;
      const orgValue = getColumnValue(item as Record<string, unknown>, "organization");
      if (orgValue && orgValue !== "N/A" && orgValue.trim() !== "") uniqueOrganizations.add(orgValue);
      const serialNum = getColumnValue(item as Record<string, unknown>, "serialNumber") || "";
      const inventoryId = getColumnValue(item as Record<string, unknown>, "inventoryId") || "";
      const uniqueId = `row_${index}_${serialNum}_${inventoryId}`;
      const itemWithFound = columns.found
        ? { ...item, [columns.found]: foundStatus }
        : { ...item, Found: foundStatus };
      if (foundStatus) {
        initialFoundCount++;
        initialFoundMap.set(uniqueId, true);
        initialFoundIds.add(uniqueId);
      }
      return { ...itemWithFound, _id: uniqueId, _rowIndex: index } as InventoryItem;
    });

    return { dataList, columns, uniqueOrganizations, initialFoundMap, initialFoundCount, initialFoundIds, sourceName };
  }, []);

  const handleGoogleLoadSheet = useCallback(async () => {
    if (!googleState.spreadsheetId || !googleState.sheetTab) return;
    updateGoogleState({ isLoading: true, error: "" });
    try {
      const sheetData = await GSheets.readSheetData(googleState.spreadsheetId, googleState.sheetTab);
      if (sheetData.rows.length === 0) {
        updateGoogleState({ isLoading: false, error: "Sheet is empty" });
        return;
      }

      const result = processSheetData(sheetData.rows, `${googleState.spreadsheetTitle} → ${googleState.sheetTab}`);
      if ("error" in result) {
        updateGoogleState({ isLoading: false, error: result.error as string });
        return;
      }

      const { dataList, columns, uniqueOrganizations, initialFoundMap, initialFoundCount, initialFoundIds } = result as {
        dataList: InventoryItem[];
        columns: Record<string, string>;
        uniqueOrganizations: Set<string>;
        initialFoundMap: Map<string, boolean>;
        initialFoundCount: number;
        initialFoundIds: Set<string>;
      };

      // Find the "Found" column index in the sheet for real-time sync
      const foundColName = columns.found || "Found";
      const foundColIdx = GSheets.findColumnIndex(sheetData.headers, foundColName);

      setInventoryList(dataList);
      setFoundMap(initialFoundMap);
      setFoundIdSet(initialFoundIds);
      setCsvFileName(`${googleState.spreadsheetTitle} - ${googleState.sheetTab}`);
      setFoundCount(initialFoundCount);
      setDetectedColumns(columns);
      setOrganizations(Array.from(uniqueOrganizations).sort());
      setShowRestoredBanner(false);
      setPickRunMode(false);
      setPickRunData(null);
      buildLookupMap(dataList);

      updateGoogleState({
        isLoading: false,
        error: "",
        sheetHeaders: sheetData.headers,
        foundColumnIndex: foundColIdx > 0 ? foundColIdx : -1,
      });

      let statusMsg = `Loaded ${dataList.length} items from Google Sheet "${googleState.spreadsheetTitle}" → "${googleState.sheetTab}"`;
      if (initialFoundCount > 0) statusMsg += ` (${initialFoundCount} already found)`;
      statusMsg += ".";
      setUploadStatus(statusMsg);
      setLastScannedCode("");

      setTimeout(() => {
        handScannerInputRef.current?.focus();
      }, 300);
    } catch (error) {
      updateGoogleState({ isLoading: false, error: `Failed to load sheet: ${(error as Error).message}` });
    }
  }, [googleState.spreadsheetId, googleState.sheetTab, googleState.spreadsheetTitle, updateGoogleState, processSheetData, buildLookupMap]);

  const handleGoogleToggleSync = useCallback(async (enabled: boolean) => {
    if (!enabled) { updateGoogleState({ realtimeSync: false }); return; }
    if (googleState.foundColumnIndex > 0) { updateGoogleState({ realtimeSync: true }); return; }
    const headers = googleState.sheetHeaders;
    const foundColName = detectedColumns.found || "Found";
    const foundIdx = GSheets.findColumnIndex(headers, foundColName);
    if (foundIdx > 0) { updateGoogleState({ realtimeSync: true, foundColumnIndex: foundIdx }); return; }
    // No Found column — auto-create one
    try {
      updateGoogleState({ isLoading: true, error: "" });
      const newColIndex = await GSheets.addHeaderColumn(googleState.spreadsheetId, googleState.sheetTab, "Found", headers.length);
      updateGoogleState({ realtimeSync: true, foundColumnIndex: newColIndex, sheetHeaders: [...headers, "Found"], isLoading: false, error: "" });
    } catch (error) {
      updateGoogleState({ realtimeSync: false, isLoading: false, error: `Could not add "Found" column: ${(error as Error).message}. Make sure the sheet is set to "Anyone with the link can edit".` });
    }
  }, [updateGoogleState, googleState.foundColumnIndex, googleState.sheetHeaders, googleState.spreadsheetId, googleState.sheetTab, googleState.clientId, detectedColumns]);

  // Process sync queue - batch updates to Google Sheets
  const processSyncQueue = useCallback(async () => {
    if (syncInProgress.current || pendingSyncQueue.current.length === 0) return;
    if (!googleState.realtimeSync || !googleState.spreadsheetId || !googleState.sheetTab) return;
    if (googleState.foundColumnIndex <= 0) return;

    syncInProgress.current = true;
    const batch = [...pendingSyncQueue.current];
    pendingSyncQueue.current = [];

    try {
      const updates = batch.map((entry) => ({
        row: entry.rowIndex + 2, // +2 because row 1 is headers, and rowIndex is 0-based
        column: googleState.foundColumnIndex,
        value: true as string | boolean,
      }));
      await GSheets.batchUpdateCells(googleState.spreadsheetId, googleState.sheetTab, updates);
    } catch (error) {
      console.warn("Google Sheets sync error:", error);
      // Re-queue failed items
      pendingSyncQueue.current.push(...batch);
    }
    syncInProgress.current = false;

    // Process any items that arrived while we were syncing
    if (pendingSyncQueue.current.length > 0) {
      setTimeout(processSyncQueue, 500);
    }
  }, [googleState.realtimeSync, googleState.spreadsheetId, googleState.sheetTab, googleState.foundColumnIndex, ]);

  // Queue an item for sync when scanned
  const queueGoogleSync = useCallback((item: InventoryItem) => {
    if (!googleState.realtimeSync || googleState.foundColumnIndex <= 0) return;
    pendingSyncQueue.current.push({ itemId: item._id, rowIndex: item._rowIndex });
    setTimeout(processSyncQueue, 300);
  }, [googleState.realtimeSync, googleState.foundColumnIndex, processSyncQueue]);

  // Keep the ref up to date so processScannedCode can use it
  useEffect(() => {
    queueGoogleSyncRef.current = queueGoogleSync;
  }, [queueGoogleSync]);

  const handleGoogleExportToSheet = useCallback(async () => {
    if (inventoryList.length === 0 || !googleState.spreadsheetId) return;

    try {
      const foundColumnName = detectedColumns.found || "Found";
      // Build headers from detected columns + all original columns
      const allKeys = new Set<string>();
      inventoryList.forEach((item) => {
        Object.keys(item).forEach((key) => {
          if (key !== "_id" && key !== "_rowIndex") allKeys.add(key);
        });
      });
      const headers = Array.from(allKeys);

      const rows = inventoryList.map((item) => {
        return headers.map((header) => {
          if (header === foundColumnName || header === "Found") {
            const found = foundIdSet.has(item._id) || !!(item as Record<string, unknown>)[foundColumnName];
            return found;
          }
          const value = (item as Record<string, unknown>)[header];
          return value !== null && value !== undefined ? String(value) : "";
        });
      });

      const timestamp = new Date().toISOString().slice(0, 16).replace("T", " ");
      const newTabTitle = `Scan Results ${timestamp}`;

      await GSheets.exportToNewSheet(googleState.spreadsheetId, newTabTitle, headers, rows);

      // Refresh tabs
      const info = await GSheets.getSpreadsheetInfo(googleState.spreadsheetId);
      updateGoogleState({ sheetTabs: info.sheets });

      setUploadStatus(`Exported ${inventoryList.length} items to new sheet tab "${newTabTitle}" ✓`);
    } catch (error) {
      updateGoogleState({ error: `Export failed: ${(error as Error).message}` });
    }
  }, [inventoryList, googleState.spreadsheetId, detectedColumns, foundIdSet, updateGoogleState]);

  const handleGoogleDisconnect = useCallback(() => {
    updateGoogleState({
      isConnected: false,
      spreadsheetId: "",
      spreadsheetTitle: "",
      sheetTab: "",
      sheetTabs: [],
      realtimeSync: false,
      error: "",
      sheetHeaders: [],
      foundColumnIndex: -1,
    });
  }, [updateGoogleState]);

  const generatePickRun = useCallback(() => {
    // Include ALL items matching the deploy reason filter (not just unfound),
    // so scanned items remain visible in the pick run with a "found" state.
    const filteredItems = inventoryList.filter(
      (item) => matchesDeployReasonFilter(item, deployReasonFilter)
    );
    if (filteredItems.length === 0) return;
    const zoneGroups: Record<string, PickRunZone> = {};
    const unmapped: InventoryItem[] = [];
    filteredItems.forEach((item) => {
      const org = getColumnValue(item, "organization");
      const entries = getZonesForOrg(org);
      if (entries.length > 0) {
        entries.forEach((entry) => {
          const zone = entry.zone;
          if (!zoneGroups[zone.id]) {
            zoneGroups[zone.id] = {
              zoneId: zone.id,
              zoneName: zone.name,
              section: zone.section,
              order: zone.order,
              color: zone.color,
              items: [],
            };
          }
          const itemId = getColumnValue(item, "inventoryId") || getColumnValue(item, "serialNumber") || JSON.stringify(item);
          zoneGroups[zone.id].items.push({
            ...item,
            _shelfPos: entry.shelfPos || 999,
            _shelfSide: entry.side || "?",
            _pickItemKey: `${zone.id}_${itemId}`,
          } as PickItem);
        });
      } else {
        unmapped.push(item);
      }
    });
    Object.values(zoneGroups).forEach((group) => {
      group.items.sort((a, b) => a._shelfPos - b._shelfPos);
    });
    const sortedZones = Object.values(zoneGroups).sort((a, b) => a.order - b.order);
    setPickRunData({ zones: sortedZones, unmapped });
    setNotHereItems({});
    setPickRunMode(true);
    setLastScannedCode("");
    setLastScanFound(false);
    setTimeout(() => {
      handScannerInputRef.current?.focus();
    }, 100);
  }, [inventoryList, deployReasonFilter]);

  useEffect(() => {
    handScannerInputRef.current?.focus();
  }, []);

  // Global keyboard capture
  useEffect(() => {
    if (inventoryList.length === 0) return;
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const tagName = target.tagName.toLowerCase();
      if (tagName === "select" || tagName === "textarea" || (tagName === "input" && target !== handScannerInputRef.current)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key.length > 1 && e.key !== "Enter") return;
      if (document.activeElement !== handScannerInputRef.current) handScannerInputRef.current?.focus();
    };
    document.addEventListener("keydown", handleGlobalKeyDown, true);
    return () => {
      document.removeEventListener("keydown", handleGlobalKeyDown, true);
    };
  }, [inventoryList.length]);

  const organizationStats = useMemo<OrgStat[]>(() => {
    if (!detectedColumns.organization) return [];
    const stats: Record<string, OrgStat> = {};
    inventoryList.forEach((item) => {
      const org = getColumnValue(item, "organization");
      if (org && org !== "N/A") {
        if (!stats[org]) stats[org] = { name: org, total: 0, found: 0 };
        stats[org].total++;
        if (isItemFound(item)) stats[org].found++;
      }
    });
    return Object.values(stats).sort((a, b) => a.name.localeCompare(b.name));
  }, [inventoryList, detectedColumns, isItemFound]);

  const filteredByReason = useMemo(() => {
    if (deployReasonFilter === "ALL") return inventoryList;
    return inventoryList.filter((item) => matchesDeployReasonFilter(item, deployReasonFilter));
  }, [inventoryList, deployReasonFilter]);

  const filteredByOrg = useMemo(() => {
    if (!selectedOrganization || !detectedColumns.organization) return filteredByReason;
    return filteredByReason.filter((item) => getColumnValue(item, "organization") === selectedOrganization);
  }, [filteredByReason, selectedOrganization, detectedColumns]);

  const displayList = searchQuery
    ? filteredList.filter((item) => {
        if (!matchesDeployReasonFilter(item, deployReasonFilter)) return false;
        if (!selectedOrganization || !detectedColumns.organization) return true;
        return getColumnValue(item, "organization") === selectedOrganization;
      })
    : filteredByOrg;

  const sortedDisplayList = useMemo(() => {
    return [...displayList].sort((a, b) => {
      // Sort order: active (0) → not-found (1) → found (2)
      const getSortBucket = (item: InventoryItem): number => {
        if (isItemFound(item)) return 2;
        if (isItemNotFound(item)) return 1;
        return 0;
      };
      const aBucket = getSortBucket(a);
      const bBucket = getSortBucket(b);
      if (aBucket !== bBucket) return aBucket - bBucket;
      return a._rowIndex - b._rowIndex;
    });
  }, [displayList, isItemFound, isItemNotFound]);

  const filteredFoundCount = useMemo(() => {
    return displayList.filter((item) => isItemFound(item)).length;
  }, [displayList, isItemFound]);

  const filteredNotFoundCount = useMemo(() => {
    return displayList.filter((item) => isItemNotFound(item)).length;
  }, [displayList, isItemNotFound]);

  const overallNotFoundCount = useMemo(() => {
    return filteredByReason.filter((item) => isItemNotFound(item)).length;
  }, [filteredByReason, isItemNotFound]);

  const unfoundCount = useMemo(() => {
    return filteredByReason.filter((item) => !isItemFound(item)).length;
  }, [filteredByReason, isItemFound]);

  // Only regenerate pick run when deploy reason filter changes while in pick run mode.
  // We intentionally exclude generatePickRun from deps to avoid re-triggering on every
  // scan (which mutates inventoryList and would wipe notHereItems).
  const previousDeployReasonFilter = useRef(deployReasonFilter);
  useEffect(() => {
    if (pickRunMode && previousDeployReasonFilter.current !== deployReasonFilter) {
      previousDeployReasonFilter.current = deployReasonFilter;
      generatePickRun();
    }
    if (!pickRunMode) {
      setPickRunData(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deployReasonFilter, pickRunMode]);

  const styles: Record<string, React.CSSProperties> = {
    container: {
      maxWidth: "640px",
      margin: "0 auto",
      padding: "16px",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
      minHeight: "100vh",
      backgroundColor: COLORS.background,
      boxSizing: "border-box",
    },
    innerContainer: {
      backgroundColor: COLORS.white,
      borderRadius: "24px",
      padding: "clamp(16px, 4vw, 32px)",
      boxShadow: "0 20px 40px rgba(0,0,0,0.08)",
    },
    header: {
      textAlign: "center",
      marginBottom: "24px",
      fontSize: "clamp(24px, 6vw, 32px)",
      fontWeight: "700",
      background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
      backgroundClip: "text",
      WebkitBackgroundClip: "text",
      WebkitTextFillColor: "transparent",
      letterSpacing: "-0.5px",
    },
    fileUploadArea: { position: "relative", marginBottom: "20px" },
    fileInput: {
      width: "100%",
      padding: "14px",
      fontSize: "14px",
      borderRadius: "12px",
      border: `2px dashed ${COLORS.border}`,
      backgroundColor: COLORS.surface,
      cursor: "pointer",
      transition: "all 0.3s ease",
      boxSizing: "border-box",
    },
    fileHelpText: {
      fontSize: "11px",
      color: COLORS.textMuted,
      marginTop: "8px",
      textAlign: "center",
    },
    sectionTitle: {
      fontSize: "16px",
      fontWeight: "600",
      marginBottom: "12px",
      color: COLORS.text,
      display: "flex",
      alignItems: "center",
      gap: "8px",
    },
    scannerInput: {
      width: "100%",
      padding: "14px",
      fontSize: "15px",
      borderRadius: "12px",
      border: `2px solid ${COLORS.primary}`,
      backgroundColor: COLORS.surface,
      marginBottom: "20px",
      fontFamily: "'SF Mono', Monaco, 'Cascadia Code', monospace",
      transition: "all 0.3s ease",
      boxShadow: "0 0 0 3px rgba(99, 102, 241, 0.1)",
      boxSizing: "border-box",
    },
    searchInput: {
      width: "100%",
      padding: "12px 14px 12px 44px",
      fontSize: "14px",
      borderRadius: "12px",
      border: `1px solid ${COLORS.border}`,
      backgroundColor: COLORS.surface,
      marginBottom: "16px",
      transition: "all 0.3s ease",
      boxSizing: "border-box",
    },
    searchIconWrapper: { position: "relative" as const },
    searchIconPosition: {
      position: "absolute" as const,
      left: "14px",
      top: "50%",
      transform: "translateY(-50%)",
      color: COLORS.textMuted,
      pointerEvents: "none" as const,
    },
    list: {
      maxHeight: "400px",
      overflowY: "auto",
      padding: "8px",
      margin: "0",
      listStyle: "none",
      backgroundColor: COLORS.background,
      borderRadius: "16px",
      border: `1px solid ${COLORS.border}`,
    },
    emptyState: {
      padding: "32px 16px",
      textAlign: "center",
      color: COLORS.textMuted,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
    },
    emptyStateText: { fontSize: "14px", fontWeight: "500" },
  };

  // Inject CSS animations
  useEffect(() => {
    if (typeof document !== "undefined" && !document.querySelector("#scanner-animations")) {
      const style = document.createElement("style");
      style.id = "scanner-animations";
      style.textContent = `
        @keyframes slideIn { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes pulse { 0% { transform: scale(1); } 50% { transform: scale(1.02); } 100% { transform: scale(1); } }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
      `;
      document.head.appendChild(style);
    }
  }, []);

  const emptyContent = (
    <li style={styles.emptyState}>
      <div style={{ marginBottom: "12px" }}>
        <PackageIcon />
      </div>
      <div style={styles.emptyStateText}>
        {searchQuery
          ? "No items found matching your search"
          : selectedOrganization
          ? `No items for ${selectedOrganization}`
          : "No items in inventory"}
      </div>
    </li>
  );

  return (
    <div style={styles.container}>
      <div style={styles.innerContainer}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "12px", marginBottom: "4px" }}>
          <h1 style={{ ...styles.header, marginBottom: 0 }}>Inventory Scanner</h1>
          <button
            onClick={() => window.location.reload()}
            title="Reload page to get latest updates"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "36px",
              height: "36px",
              borderRadius: "10px",
              border: `1px solid ${COLORS.border}`,
              backgroundColor: COLORS.surface,
              cursor: "pointer",
              color: COLORS.textSecondary,
              transition: "all 0.2s ease",
              flexShrink: 0,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = COLORS.primary;
              e.currentTarget.style.color = "#fff";
              e.currentTarget.style.borderColor = COLORS.primary;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = COLORS.surface;
              e.currentTarget.style.color = COLORS.textSecondary;
              e.currentTarget.style.borderColor = COLORS.border;
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 2v6h-6" />
              <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
              <path d="M3 22v-6h6" />
              <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
            </svg>
          </button>
        </div>

        {showRestoredBanner && inventoryList.length > 0 && (
          <RestoredBanner fileName={csvFileName} onDismiss={() => setShowRestoredBanner(false)} />
        )}

        {!pickRunMode && (
          <>
            {/* Google Sheets Connector */}
            <GoogleSheetsConnector
              googleState={googleState}
              onSignIn={handleGoogleSignIn}
              onSignOut={handleGoogleSignOut}
              onSelectSpreadsheet={handleGoogleSelectSpreadsheet}
              onSelectTab={handleGoogleSelectTab}
              onLoadSheet={handleGoogleLoadSheet}
              onToggleSync={handleGoogleToggleSync}
              onExportToSheet={handleGoogleExportToSheet}
              onDisconnect={handleGoogleDisconnect}
              onSetClientId={handleGoogleSetClientId}
              onShowSetup={handleGoogleShowSetup}
              hasInventory={inventoryList.length > 0}
              foundCount={foundCount}
              totalCount={inventoryList.length}
            />

            {/* Divider */}
            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "20px" }}>
              <div style={{ flex: 1, height: "1px", backgroundColor: COLORS.border }} />
              <span style={{ fontSize: "12px", color: COLORS.textMuted, fontWeight: "500" }}>or upload a CSV file</span>
              <div style={{ flex: 1, height: "1px", backgroundColor: COLORS.border }} />
            </div>

            <div style={styles.fileUploadArea}>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.CSV,.txt,.tsv,.tab"
                aria-label="Upload inventory file"
                onChange={onFileChange}
                style={styles.fileInput}
              />
              <div style={styles.fileHelpText}>
                Accepts: CSV, TXT, TSV files (Excel files must be saved as CSV first)
                <br />
                Supports columns: Inventory ID, Serial Number, Product Title, Organization, Deploy Reason
              </div>
            </div>
          </>
        )}

        <StatusMessage message={uploadStatus} isError={uploadStatus.includes("Error")} />

        {inventoryList.length > 0 && pickRunMode && pickRunData && (
          <PickRunView
            pickRunData={pickRunData}
            inventoryList={inventoryList}
            detectedColumns={detectedColumns}
            foundIdSet={foundIdSet}
            notFoundIdSet={notFoundIdSet}
            deployReasonFilter={deployReasonFilter}
            onDeployReasonChange={setDeployReasonFilter}
            onClose={() => setPickRunMode(false)}
            scannerValue={scannerValue}
            onScannerChange={(e) => setScannerValue(e.target.value)}
            onScannerKeyDown={handleHandScannerKeyDown}
            handScannerInputRef={handScannerInputRef}
            lastScannedCode={lastScannedCode}
            lastScanFound={lastScanFound}
            notHereItems={notHereItems}
            onNotHere={(key, isNotHere, itemId) => {
              setNotHereItems((prev) => {
                const next = { ...prev };
                if (isNotHere) next[key] = true;
                else delete next[key];
                return next;
              });
              if (itemId) {
                setNotFoundIdSet((prev) => {
                  const next = new Set(prev);
                  if (isNotHere) next.add(itemId);
                  else next.delete(itemId);
                  return next;
                });
              }
            }}

          />
        )}

        {inventoryList.length > 0 && !pickRunMode && (
          <>
            <DeployReasonFilter value={deployReasonFilter} onChange={setDeployReasonFilter} />
            <OrganizationFilter organizations={organizations} selectedOrg={selectedOrganization} onOrgChange={setSelectedOrganization} />

            <div style={styles.sectionTitle}>
              <SearchIcon /> Scan Items
            </div>

            <input
              ref={handScannerInputRef}
              type="text"
              aria-label="Hand scanner input"
              value={scannerValue}
              onChange={(e) => setScannerValue(e.target.value)}
              onKeyDown={handleHandScannerKeyDown}
              placeholder="Ready to scan... (press Enter after scan)"
              autoComplete="off"
              spellCheck={false}
              style={styles.scannerInput}
            />

            <SimpleScanResult scannedCode={lastScannedCode} found={lastScanFound} />

            <Statistics
              foundCount={selectedOrganization ? filteredFoundCount : foundCount}
              notFoundCount={selectedOrganization ? filteredNotFoundCount : overallNotFoundCount}
              totalCount={selectedOrganization ? displayList.length : inventoryList.length}
              organizationStats={organizationStats}
            />

            <ActionButtons onExport={exportCSV} onReset={handleResetClick} disabled={inventoryList.length === 0} />

            <PickRunButton
              onClick={() => {
                if (pickRunData) {
                  setPickRunMode(true);
                  setTimeout(() => {
                    handScannerInputRef.current?.focus();
                  }, 100);
                } else {
                  generatePickRun();
                }
              }}
              disabled={inventoryList.length === 0}
              unfoundCount={unfoundCount}
            />

            <div style={styles.sectionTitle}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19 3h-4.18C14.4 1.84 13.3 1 12 1c-1.3 0-2.4.84-2.82 2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 0c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zm2 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z" />
              </svg>
              Inventory Items
              {selectedOrganization && (
                <span style={{ fontSize: "12px", color: COLORS.textSecondary }}>({displayList.length} items)</span>
              )}
            </div>

            <div style={styles.searchIconWrapper}>
              <div style={styles.searchIconPosition}>
                <SearchIcon />
              </div>
              <input
                type="search"
                placeholder="Search items..."
                aria-label="Search inventory list"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={styles.searchInput}
              />
            </div>

            <InfiniteScrollList
              items={sortedDisplayList}
              listStyle={styles.list}
              emptyContent={emptyContent}
              isItemFound={isItemFound}
              isItemNotFound={isItemNotFound}
            />
          </>
        )}
      </div>

      <ConfirmResetModal isOpen={showResetConfirm} onConfirm={handleResetConfirm} onCancel={handleResetCancel} />
    </div>
  );
}
