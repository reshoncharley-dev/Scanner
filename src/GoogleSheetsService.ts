// Google Sheets Service - OAuth2 via Google Identity Services + Sheets API v4

const SCOPES = "https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.readonly";
const DISCOVERY_DOC = "https://sheets.googleapis.com/$discovery/rest?version=v4";
const CLIENT_ID_KEY = "gsheets_client_id";

export interface SheetInfo { sheetId: number; title: string; rowCount: number; columnCount: number; }
export interface SpreadsheetInfo { spreadsheetId: string; title: string; sheets: SheetInfo[]; }
export interface SheetData { headers: string[]; rows: Record<string, string>[]; }

let tokenClient: unknown = null;
let accessToken: string | null = null;
let gapiInited = false;
let gisInited = false;

function loadScript(src: string, id: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.getElementById(id)) { resolve(); return; }
    const s = document.createElement("script");
    s.id = id; s.src = src; s.async = true; s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(s);
  });
}

async function initGapi(): Promise<void> {
  if (gapiInited) return;
  await loadScript("https://apis.google.com/js/api.js", "gapi-script");
  await new Promise<void>((resolve) => {
    (window as any).gapi.load("client", async () => {
      await (window as any).gapi.client.init({});
      await (window as any).gapi.client.load(DISCOVERY_DOC);
      gapiInited = true;
      resolve();
    });
  });
}

async function initGis(clientId: string): Promise<void> {
  if (gisInited) return;
  await loadScript("https://accounts.google.com/gsi/client", "gis-script");
  await new Promise<void>((resolve) => {
    const iv = setInterval(() => {
      if (typeof (window as any).google !== "undefined" && (window as any).google.accounts?.oauth2) { clearInterval(iv); resolve(); }
    }, 100);
    setTimeout(() => { clearInterval(iv); resolve(); }, 5000);
  });
  tokenClient = (window as any).google.accounts.oauth2.initTokenClient({ client_id: clientId, scope: SCOPES, callback: () => {} });
  gisInited = true;
}

function requestAccessToken(): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!tokenClient) { reject(new Error("GIS not initialized")); return; }
    const tc = tokenClient as any;
    tc.callback = (resp: any) => { if (resp.error) { reject(new Error(resp.error)); return; } accessToken = resp.access_token; resolve(resp.access_token); };
    tc.error_callback = (err: any) => { reject(new Error(err.message || "OAuth error")); };
    tc.requestAccessToken({ prompt: accessToken ? "" : "consent" });
  });
}

const g = () => (window as any).gapi.client.sheets.spreadsheets;

export const getSavedClientId = (): string => localStorage.getItem(CLIENT_ID_KEY) || "";
export const saveClientId = (id: string): void => { localStorage.setItem(CLIENT_ID_KEY, id); };
export const isAuthenticated = (): boolean => !!accessToken;

export async function initialize(clientId: string): Promise<void> { await initGapi(); await initGis(clientId); }
export async function authenticate(): Promise<void> { await requestAccessToken(); }
export function signOut(): void {
  if (accessToken) (window as any).google.accounts.oauth2.revoke(accessToken, () => {});
  accessToken = null; gisInited = false; tokenClient = null;
}

export function extractSpreadsheetId(urlOrId: string): string | null {
  const t = urlOrId.trim();
  if (/^[a-zA-Z0-9_-]{20,}$/.test(t)) return t;
  const m = t.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  return m ? m[1] : null;
}

export async function getSpreadsheetInfo(spreadsheetId: string): Promise<SpreadsheetInfo> {
  if (!accessToken) throw new Error("Not authenticated");
  const resp = await g().get({ spreadsheetId, fields: "spreadsheetId,properties.title,sheets.properties" });
  const result = resp.result;
  const sheets: SheetInfo[] = (result.sheets || []).map((s: any) => ({
    sheetId: s.properties.sheetId, title: s.properties.title,
    rowCount: s.properties.gridProperties?.rowCount || 0,
    columnCount: s.properties.gridProperties?.columnCount || 0,
  }));
  try {
    const ranges = sheets.map((s) => `'${s.title}'!A:A`);
    if (ranges.length > 0) {
      const br = await g().values.batchGet({ spreadsheetId, ranges });
      (br.result.valueRanges || []).forEach((vr: any, i: number) => {
        if (i < sheets.length) sheets[i].rowCount = Math.max(0, (vr.values?.length || 0) - 1);
      });
    }
  } catch { /* fallback to grid counts */ }
  return { spreadsheetId: result.spreadsheetId, title: result.properties.title, sheets };
}

export async function readSheetData(spreadsheetId: string, sheetTitle: string): Promise<SheetData> {
  if (!accessToken) throw new Error("Not authenticated");
  const resp = await g().values.get({ spreadsheetId, range: `'${sheetTitle}'`, valueRenderOption: "UNFORMATTED_VALUE", dateTimeRenderOption: "FORMATTED_STRING" });
  const values: string[][] = resp.result.values || [];
  if (values.length === 0) return { headers: [], rows: [] };
  const headers = values[0].map((h: any) => String(h).trim());
  const rows = values.slice(1).map((row: any[]) => {
    const rec: Record<string, string> = {};
    headers.forEach((h, i) => { rec[h] = i < row.length ? String(row[i] ?? "") : ""; });
    return rec;
  });
  return { headers, rows };
}

export async function batchUpdateCells(spreadsheetId: string, sheetTitle: string, updates: Array<{ row: number; column: number; value: string | boolean }>): Promise<void> {
  if (!accessToken) throw new Error("Not authenticated");
  const data = updates.map((u) => ({ range: `'${sheetTitle}'!${colLetter(u.column)}${u.row}`, values: [[u.value]] }));
  await g().values.batchUpdate({ spreadsheetId, resource: { valueInputOption: "USER_ENTERED", data } });
}

export async function exportToNewSheet(spreadsheetId: string, newSheetTitle: string, headers: string[], rows: (string | boolean)[][]): Promise<string> {
  if (!accessToken) throw new Error("Not authenticated");
  await g().batchUpdate({ spreadsheetId, resource: { requests: [{ addSheet: { properties: { title: newSheetTitle } } }] } });
  await g().values.update({ spreadsheetId, range: `'${newSheetTitle}'!A1`, valueInputOption: "USER_ENTERED", resource: { values: [headers, ...rows] } });
  return newSheetTitle;
}

export async function addHeaderColumn(spreadsheetId: string, sheetTitle: string, headerName: string, existingHeaderCount: number): Promise<number> {
  if (!accessToken) throw new Error("Not authenticated");
  const newColIndex = existingHeaderCount + 1;
  const cellRef = `'${sheetTitle}'!${colLetter(newColIndex)}1`;
  await g().values.update({ spreadsheetId, range: cellRef, valueInputOption: "USER_ENTERED", resource: { values: [[headerName]] } });
  return newColIndex;
}

export async function listRecentSpreadsheets(): Promise<Array<{ id: string; name: string; modifiedTime: string }>> {
  if (!accessToken) throw new Error("Not authenticated");
  const resp = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=mimeType='application/vnd.google-apps.spreadsheet'&orderBy=modifiedTime desc&pageSize=20&fields=files(id,name,modifiedTime)`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!resp.ok) throw new Error("Failed to list spreadsheets");
  const data = await resp.json();
  return (data.files || []).map((f: any) => ({ id: f.id, name: f.name, modifiedTime: f.modifiedTime }));
}

function colLetter(col: number): string {
  let r = "", c = col;
  while (c > 0) { c--; r = String.fromCharCode(65 + (c % 26)) + r; c = Math.floor(c / 26); }
  return r;
}

export function findColumnIndex(headers: string[], name: string): number {
  const i = headers.findIndex((h) => h.toLowerCase().trim() === name.toLowerCase().trim());
  return i >= 0 ? i + 1 : -1;
}
