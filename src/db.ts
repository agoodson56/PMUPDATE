export type Project = {
    id: number;
    name: string;
    pm_name: string;
    bid_labor_hours: number;
    status: string;
    file_name: string | null;
    created_at: string;
};

export type BomItem = {
    id: number;
    project_id: number;
    material: string;
    bom_qty: number;
    unit_price: number;
    hours_per_unit: number;
    needs_review: number;
};

export type BomItemWithInstalled = BomItem & { installed: number };

export type DailyEntry = {
    id: number;
    project_id: number;
    entry_date: string;
    total_hours: number;
    notes: string | null;
    created_at: string;
};

export type LaborManualEntry = {
    id: number;
    material_pattern: string;
    hours_per_unit: number;
    category: string | null;
    notes: string | null;
};

export type PendingUpload = {
    id: string;
    project_name: string;
    pm_name: string;
    bid_labor_hours: number;
    file_name: string;
    sheets_json: string;
    created_at: string;
};

export type BomTemplate = {
    id: number;
    name: string;
    sheet_pattern: string | null;
    material_header: string;
    qty_header: string;
    price_header: string | null;
    unit_header: string | null;
    hours_header: string | null;
    skip_patterns: string | null;
    created_at: string;
};

export function normalize(s: string | null | undefined): string {
    return (s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

export async function lookupLaborHours(
    db: D1Database,
    material: string,
): Promise<number | null> {
    const target = normalize(material);
    if (!target) return null;
    const res = await db
        .prepare("SELECT material_pattern, hours_per_unit FROM labor_manual")
        .all<{ material_pattern: string; hours_per_unit: number }>();
    const rows = res.results ?? [];

    // Exact match wins.
    for (const r of rows) {
        if (normalize(r.material_pattern) === target) return r.hours_per_unit;
    }

    // Partial: the *material* contains the *pattern* (e.g. "Cat 6A Patch
    // Cord 10ft" contains "Patch Cord"). Among multiple matches, prefer
    // the longest (most specific) pattern.
    let best: { len: number; hours: number } | null = null;
    for (const r of rows) {
        const pn = normalize(r.material_pattern);
        if (pn && target.includes(pn)) {
            if (!best || pn.length > best.len) {
                best = { len: pn.length, hours: r.hours_per_unit };
            }
        }
    }
    return best ? best.hours : null;
}
