import * as XLSX from "xlsx";

export type ParsedItem = {
    material: string;
    bom_qty: number;
    unit_price: number;
    hours_per_unit: number | null;
};

function norm(s: string | null | undefined): string {
    return (s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function toFloat(v: unknown, def = 0): number {
    if (v === null || v === undefined || v === "") return def;
    const s = String(v).replace(/[^0-9.\-]/g, "");
    if (s === "" || s === "-" || s === ".") return def;
    const n = parseFloat(s);
    return Number.isFinite(n) ? n : def;
}

function findCol(headers: string[], candidates: string[]): string | null {
    const normMap = new Map<string, string>();
    for (const h of headers) {
        if (h) normMap.set(norm(h), h);
    }
    for (const c of candidates) {
        const nc = norm(c);
        if (normMap.has(nc)) return normMap.get(nc)!;
    }
    for (const c of candidates) {
        const nc = norm(c);
        for (const [hn, h] of normMap.entries()) {
            if (hn && (nc.includes(hn) || hn.includes(nc))) return h;
        }
    }
    return null;
}

function parseRows(
    headers: string[],
    rows: Record<string, unknown>[],
): ParsedItem[] {
    const matCol = findCol(headers, ["material", "description", "item", "part", "product"]);
    const qtyCol = findCol(headers, ["qty", "quantity", "count"]);
    const priceCol = findCol(headers, ["unit price", "price", "unit cost", "cost"]);
    const hoursCol = findCol(headers, ["hours per unit", "hrs per unit", "labor hours", "hours", "hrs", "labor"]);

    const items: ParsedItem[] = [];
    for (const row of rows) {
        const material = matCol ? row[matCol] : null;
        if (material === null || material === undefined) continue;
        const matStr = String(material).trim();
        if (matStr === "") continue;
        items.push({
            material: matStr,
            bom_qty: toFloat(qtyCol ? row[qtyCol] : null),
            unit_price: toFloat(priceCol ? row[priceCol] : null),
            hours_per_unit: hoursCol ? toFloat(row[hoursCol]) : null,
        });
    }
    return items;
}

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

export async function parseCsv(file: File): Promise<ParsedItem[]> {
    const text = (await file.text()).replace(/^﻿/, "");
    const lines = text.split(/\r?\n/).filter(l => l.trim() !== "");
    if (lines.length === 0) return [];
    const headers = parseCsvLine(lines[0]);
    const rows: Record<string, string>[] = [];
    for (let i = 1; i < lines.length; i++) {
        const cells = parseCsvLine(lines[i]);
        const obj: Record<string, string> = {};
        headers.forEach((h, idx) => { obj[h] = cells[idx] ?? ""; });
        rows.push(obj);
    }
    return parseRows(headers, rows);
}

export async function parseXlsx(file: File): Promise<ParsedItem[]> {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    const sheetName = wb.SheetNames[0];
    if (!sheetName) return [];
    const ws = wb.Sheets[sheetName];
    const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, {
        header: 1,
        blankrows: false,
        defval: "",
    });
    if (aoa.length === 0) return [];
    // Find first non-empty row as header
    let headerIdx = 0;
    for (let i = 0; i < aoa.length; i++) {
        const r = aoa[i] as unknown[];
        if (r.some(c => c !== null && c !== undefined && String(c).trim() !== "")) {
            headerIdx = i;
            break;
        }
    }
    const headers = (aoa[headerIdx] as unknown[]).map(c => String(c ?? "").trim());
    const rows: Record<string, unknown>[] = [];
    for (let i = headerIdx + 1; i < aoa.length; i++) {
        const r = aoa[i] as unknown[];
        const obj: Record<string, unknown> = {};
        headers.forEach((h, idx) => { obj[h] = r[idx]; });
        rows.push(obj);
    }
    return parseRows(headers, rows);
}

export async function parsePdf(file: File): Promise<ParsedItem[]> {
    // unpdf works in edge runtimes (uses pdfjs-dist internally)
    const { extractText } = await import("unpdf");
    const buf = new Uint8Array(await file.arrayBuffer());
    const result = await extractText(buf, { mergePages: true });
    const text = Array.isArray(result.text) ? result.text.join("\n") : result.text;
    return parsePdfLines(text.split(/\r?\n/).map(l => l.trim()).filter(Boolean));
}

function parsePdfLines(lines: string[]): ParsedItem[] {
    // Best-effort table extraction from PDF text. PDF parsing is fragile;
    // works for simple tabular BOMs with whitespace-separated columns.
    let headerIdx = -1;
    let headerCols: string[] = [];
    for (let i = 0; i < lines.length; i++) {
        const l = lines[i].toLowerCase();
        if (/material|description|item|part/.test(l) && /qty|quantity/.test(l)) {
            headerIdx = i;
            headerCols = lines[i].split(/\s{2,}|\t+/).map(s => s.trim()).filter(Boolean);
            break;
        }
    }
    if (headerIdx < 0 || headerCols.length < 2) return [];
    const rows: Record<string, string>[] = [];
    for (let i = headerIdx + 1; i < lines.length; i++) {
        const cells = lines[i].split(/\s{2,}|\t+/).map(s => s.trim());
        if (cells.filter(Boolean).length < 2) continue;
        const obj: Record<string, string> = {};
        headerCols.forEach((h, idx) => { obj[h] = cells[idx] ?? ""; });
        rows.push(obj);
    }
    return parseRows(headerCols, rows);
}

export async function parseBom(file: File): Promise<ParsedItem[]> {
    const name = file.name.toLowerCase();
    if (name.endsWith(".csv")) return parseCsv(file);
    if (name.endsWith(".xlsx")) return parseXlsx(file);
    if (name.endsWith(".pdf")) return parsePdf(file);
    throw new Error(`Unsupported file type: ${file.name}`);
}
