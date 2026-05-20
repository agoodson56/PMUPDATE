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

export function normalize(s: string | null | undefined): string {
    return (s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

export async function lookupLaborHours(
    db: D1Database,
    material: string,
): Promise<number | null> {
    const target = normalize(material);
    const res = await db
        .prepare("SELECT material_pattern, hours_per_unit FROM labor_manual")
        .all<{ material_pattern: string; hours_per_unit: number }>();
    const rows = res.results ?? [];
    for (const r of rows) {
        if (normalize(r.material_pattern) === target) return r.hours_per_unit;
    }
    for (const r of rows) {
        const pn = normalize(r.material_pattern);
        if (pn && (pn.includes(target) || target.includes(pn))) {
            return r.hours_per_unit;
        }
    }
    return null;
}
