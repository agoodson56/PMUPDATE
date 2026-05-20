import * as XLSX from "xlsx";

export type ParsedItem = {
    material: string;
    bom_qty: number;
    unit_price: number;
    hours_per_unit: number | null;
};

export type GridRow = (string | number | null)[];
export type GridSheet = GridRow[];
export type Grid = { [sheetName: string]: GridSheet };

export type Mapping = {
    sheetName: string;
    headerRow: number;       // 0-based index of the header row in the sheet
    materialCol: number;     // 0-based column index
    qtyCol: number;
    priceCol: number;        // -1 = none
    unitCol: number;         // -1 = none
    hoursCol: number;        // -1 = none
    skipPatterns: string[];  // regex source strings, case-insensitive
};

export const DEFAULT_SKIP_PATTERNS: string[] = [
    "^subtotal\\b",
    "^total\\b",
    "^grand total\\b",
    "^bid price\\b",
    "^pricing summary\\b",
    "^material( & equipment)? subtotal\\b",
    "^total line items\\b",
    "^\\d+\\s*$",
];

// ---------- shared helpers ----------

function norm(s: string | null | undefined): string {
    return (s ?? "").toString().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function toFloat(v: unknown, def = 0): number {
    if (v === null || v === undefined || v === "") return def;
    const s = String(v).replace(/[^0-9.\-]/g, "");
    if (!s || s === "-" || s === ".") return def;
    const n = parseFloat(s);
    return Number.isFinite(n) ? n : def;
}

function cellStr(v: unknown): string {
    if (v === null || v === undefined) return "";
    return String(v);
}

// ---------- format-specific readers (produce a Grid) ----------

function parseCsvLine(line: string): string[] {
    const out: string[] = [];
    let cur = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (inQuotes) {
            if (c === '"') {
                if (line[i + 1] === '"') { cur += '"'; i++; }
                else inQuotes = false;
            } else cur += c;
        } else {
            if (c === '"') inQuotes = true;
            else if (c === ",") { out.push(cur); cur = ""; }
            else cur += c;
        }
    }
    out.push(cur);
    return out.map(s => s.trim());
}

async function readCsv(file: File): Promise<Grid> {
    const text = (await file.text()).replace(/^﻿/, "");
    const lines = text.split(/\r?\n/);
    const rows: GridSheet = [];
    for (const line of lines) {
        if (line.trim() === "" && rows.length === 0) continue;
        rows.push(parseCsvLine(line));
    }
    return { "CSV": rows };
}

async function readXlsx(file: File): Promise<Grid> {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    const grid: Grid = {};
    for (const name of wb.SheetNames) {
        const ws = wb.Sheets[name];
        const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, {
            header: 1,
            blankrows: false,
            defval: "",
        });
        grid[name] = aoa.map(r =>
            (r as unknown[]).map(c => {
                if (c === null || c === undefined) return "";
                if (typeof c === "number") return c;
                return String(c);
            }),
        );
    }
    return grid;
}

async function readPdf(file: File): Promise<Grid> {
    const { extractText } = await import("unpdf");
    const buf = new Uint8Array(await file.arrayBuffer());
    const result = await extractText(buf, { mergePages: true });
    const text = Array.isArray(result.text) ? result.text.join("\n") : result.text;
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    // PDF tabular extraction is best-effort: split on 2+ spaces or tabs.
    const rows: GridSheet = lines.map(l =>
        l.split(/\s{2,}|\t+/).map(s => s.trim()),
    );
    return { "PDF": rows };
}

export async function parseFileToGrid(file: File): Promise<Grid> {
    const name = file.name.toLowerCase();
    if (name.endsWith(".csv")) return readCsv(file);
    if (name.endsWith(".xlsx")) return readXlsx(file);
    if (name.endsWith(".pdf")) return readPdf(file);
    throw new Error(`Unsupported file type: ${file.name}`);
}

// ---------- auto-detect best mapping ----------

const MATERIAL_KEYWORDS = [
    "item / description", "item description", "material description",
    "material name", "description", "material", "item", "product",
];
const QTY_KEYWORDS = ["qty", "quantity", "count"];
const PRICE_KEYWORDS = ["unit cost", "unit price", "price", "cost"];
const UNIT_KEYWORDS = ["unit", "uom", "units"];
const HOURS_KEYWORDS = [
    "hours per unit", "hrs per unit", "labor hours", "hours", "hrs", "labor",
];

function findColIdx(headers: string[], candidates: string[]): number {
    const normHeaders = headers.map(h => norm(h));
    // Exact first.
    for (const c of candidates) {
        const nc = norm(c);
        const i = normHeaders.indexOf(nc);
        if (i >= 0) return i;
    }
    // Partial: header contains candidate (not the reverse).
    for (const c of candidates) {
        const nc = norm(c);
        if (!nc) continue;
        for (let i = 0; i < normHeaders.length; i++) {
            if (normHeaders[i] && normHeaders[i].includes(nc)) return i;
        }
    }
    return -1;
}

function pickBomSheet(grid: Grid): string {
    const names = Object.keys(grid);
    if (names.length === 0) return "";
    const preferred = [
        "bill of materials", "bom", "materials", "parts list",
        "line items", "items", "parts",
    ];
    const lower = names.map(n => n.toLowerCase());
    for (const p of preferred) {
        for (let i = 0; i < lower.length; i++) {
            if (lower[i].includes(p)) return names[i];
        }
    }
    return names[0];
}

function findHeaderRowIdx(sheet: GridSheet): number {
    const max = Math.min(sheet.length, 60);
    for (let i = 0; i < max; i++) {
        const cells = (sheet[i] ?? []).map(c =>
            cellStr(c).toLowerCase().trim(),
        );
        const hasQty = cells.some(c => /^(qty|quantity|count)$/.test(c));
        const hasItem = cells.some(c =>
            /(item|description|material|product)/.test(c),
        );
        if (hasQty && hasItem) return i;
    }
    return -1;
}

export function autoDetectMapping(grid: Grid): Mapping | null {
    const sheetName = pickBomSheet(grid);
    if (!sheetName) return null;
    const sheet = grid[sheetName];
    if (!sheet || sheet.length === 0) return null;

    let headerRow = findHeaderRowIdx(sheet);
    if (headerRow < 0) {
        // Fall back to first non-empty row.
        for (let i = 0; i < sheet.length; i++) {
            if (sheet[i].some(c => cellStr(c).trim() !== "")) {
                headerRow = i;
                break;
            }
        }
    }
    if (headerRow < 0) return null;

    const headers = (sheet[headerRow] ?? []).map(c => cellStr(c).trim());

    return {
        sheetName,
        headerRow,
        materialCol: findColIdx(headers, MATERIAL_KEYWORDS),
        qtyCol: findColIdx(headers, QTY_KEYWORDS),
        priceCol: findColIdx(headers, PRICE_KEYWORDS),
        unitCol: findColIdx(headers, UNIT_KEYWORDS),
        hoursCol: findColIdx(headers, HOURS_KEYWORDS),
        skipPatterns: DEFAULT_SKIP_PATTERNS,
    };
}

// ---------- apply mapping to grid ----------

// Backwards-compatible wrapper used by the upload route until the
// explicit column-mapping UI is built.
export async function parseBom(file: File): Promise<ParsedItem[]> {
    const grid = await parseFileToGrid(file);
    const mapping = autoDetectMapping(grid);
    if (!mapping) return [];
    return applyMapping(grid, mapping);
}

export function applyMapping(grid: Grid, mapping: Mapping): ParsedItem[] {
    const sheet = grid[mapping.sheetName];
    if (!sheet) return [];
    if (mapping.materialCol < 0 || mapping.qtyCol < 0) return [];

    const skipRes = mapping.skipPatterns.map(p => {
        try { return new RegExp(p, "i"); } catch { return null; }
    }).filter((r): r is RegExp => r !== null);

    const items: ParsedItem[] = [];
    for (let i = mapping.headerRow + 1; i < sheet.length; i++) {
        const row = sheet[i] ?? [];
        const matRaw = row[mapping.materialCol];
        if (matRaw === null || matRaw === undefined) continue;
        const material = String(matRaw).trim();
        if (!material) continue;
        if (skipRes.some(re => re.test(material))) continue;

        // If a unit column was selected, require a non-empty unit cell
        // (drops category-header rows and pricing-summary rows).
        if (mapping.unitCol >= 0) {
            const unit = cellStr(row[mapping.unitCol]).trim();
            if (!unit) continue;
        }

        items.push({
            material,
            bom_qty: toFloat(row[mapping.qtyCol]),
            unit_price: mapping.priceCol >= 0 ? toFloat(row[mapping.priceCol]) : 0,
            hours_per_unit: mapping.hoursCol >= 0 ? toFloat(row[mapping.hoursCol]) : null,
        });
    }
    return items;
}
