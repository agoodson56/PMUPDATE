import { Hono } from "hono";
import type {
    Project,
    BomItemWithInstalled,
    DailyEntry,
    LaborManualEntry,
} from "./db";
import { lookupLaborHours, normalize } from "./db";
import { parseBom } from "./parsers";
import { consumeFlash, setFlash } from "./flash";
import { Dashboard } from "./views/dashboard";
import { Daily } from "./views/daily";
import { Admin, type AdminRow, type AdminTotals } from "./views/admin";
import { LaborManualView } from "./views/labor_manual";

type Bindings = {
    DB: D1Database;
};

const app = new Hono<{ Bindings: Bindings }>();

// ---------- Helpers ----------

function toFloat(v: unknown, def = 0): number {
    if (v === null || v === undefined || v === "") return def;
    const s = String(v).replace(/[^0-9.\-]/g, "");
    if (s === "" || s === "-" || s === ".") return def;
    const n = parseFloat(s);
    return Number.isFinite(n) ? n : def;
}

function isFile(v: unknown): v is File {
    return (
        typeof v === "object" &&
        v !== null &&
        "arrayBuffer" in v &&
        typeof (v as { arrayBuffer: unknown }).arrayBuffer === "function" &&
        "name" in v
    );
}

function todayIso(): string {
    return new Date().toISOString().slice(0, 10);
}

function htmlResponse(node: unknown): Response {
    return new Response("<!doctype html>" + String(node), {
        headers: { "Content-Type": "text/html; charset=utf-8" },
    });
}

// ---------- Routes ----------

app.get("/", async c => {
    const res = await c.env.DB
        .prepare("SELECT * FROM projects ORDER BY datetime(created_at) DESC")
        .all<Project>();
    const flash = consumeFlash(c);
    return htmlResponse(<Dashboard projects={res.results ?? []} flash={flash} />);
});

app.post("/projects", async c => {
    const form = await c.req.formData();
    const name = String(form.get("name") ?? "").trim();
    const pm_name = String(form.get("pm_name") ?? "").trim();
    const bid_labor_hours = toFloat(form.get("bid_labor_hours"));
    const fileEntry: unknown = form.get("bom_file");

    if (!name || !pm_name || !isFile(fileEntry) || !fileEntry.name) {
        setFlash(c, "error", "Missing project name, PM name, or BOM file.");
        return c.redirect("/");
    }
    const file = fileEntry;

    const lower = file.name.toLowerCase();
    if (!lower.endsWith(".csv") && !lower.endsWith(".xlsx") && !lower.endsWith(".pdf")) {
        setFlash(c, "error", `Unsupported file type. Use .csv, .xlsx, or .pdf.`);
        return c.redirect("/");
    }

    let items;
    try {
        items = await parseBom(file);
    } catch (e) {
        setFlash(c, "error", `Failed to parse BOM: ${(e as Error).message}`);
        return c.redirect("/");
    }

    if (!items.length) {
        setFlash(c, "error", "No items found in BOM. Ensure the file has Material and Qty columns.");
        return c.redirect("/");
    }

    const projInsert = await c.env.DB
        .prepare(
            "INSERT INTO projects (name, pm_name, bid_labor_hours, file_name) VALUES (?, ?, ?, ?)",
        )
        .bind(name, pm_name, bid_labor_hours, file.name)
        .run();
    const projectId = projInsert.meta.last_row_id as number;

    const stmt = c.env.DB.prepare(
        "INSERT INTO bom_items (project_id, material, bom_qty, unit_price, hours_per_unit, needs_review) VALUES (?, ?, ?, ?, ?, ?)",
    );
    const batch: D1PreparedStatement[] = [];
    for (const it of items) {
        let hours = it.hours_per_unit;
        let needsReview = 0;
        if (hours === null || hours === 0) {
            const found = await lookupLaborHours(c.env.DB, it.material);
            if (found !== null) {
                hours = found;
            } else {
                hours = 0;
                needsReview = 1;
            }
        }
        batch.push(
            stmt.bind(projectId, it.material, it.bom_qty, it.unit_price, hours, needsReview),
        );
    }
    if (batch.length) await c.env.DB.batch(batch);

    setFlash(c, "success", `Project '${name}' created with ${items.length} line items.`);
    return c.redirect("/");
});

app.post("/project/:id/delete", async c => {
    const id = Number(c.req.param("id"));
    await c.env.DB.prepare("DELETE FROM projects WHERE id = ?").bind(id).run();
    setFlash(c, "success", "Project deleted.");
    return c.redirect("/");
});

async function getProject(db: D1Database, id: number): Promise<Project | null> {
    return await db.prepare("SELECT * FROM projects WHERE id = ?").bind(id).first<Project>();
}

async function getItemsWithInstalled(
    db: D1Database,
    projectId: number,
): Promise<BomItemWithInstalled[]> {
    const res = await db.prepare(`
        SELECT b.id, b.project_id, b.material, b.bom_qty, b.unit_price, b.hours_per_unit, b.needs_review,
               COALESCE(SUM(d.qty_installed), 0) AS installed
        FROM bom_items b
        LEFT JOIN daily_entry_items d ON d.bom_item_id = b.id
        WHERE b.project_id = ?
        GROUP BY b.id
        ORDER BY b.id
    `).bind(projectId).all<BomItemWithInstalled>();
    return res.results ?? [];
}

app.get("/project/:id/daily", async c => {
    const id = Number(c.req.param("id"));
    const project = await getProject(c.env.DB, id);
    if (!project) return c.notFound();
    const items = await getItemsWithInstalled(c.env.DB, id);
    const histRes = await c.env.DB.prepare(`
        SELECT * FROM daily_entries
        WHERE project_id = ?
        ORDER BY entry_date DESC, datetime(created_at) DESC
    `).bind(id).all<DailyEntry>();
    const flash = consumeFlash(c);
    return htmlResponse(
        <Daily
            project={project}
            items={items}
            history={histRes.results ?? []}
            today={todayIso()}
            flash={flash}
        />,
    );
});

app.post("/project/:id/daily", async c => {
    const id = Number(c.req.param("id"));
    const project = await getProject(c.env.DB, id);
    if (!project) return c.notFound();

    const form = await c.req.formData();
    const entry_date = (String(form.get("entry_date") ?? "").trim()) || todayIso();
    const total_hours = toFloat(form.get("total_hours"));
    const notes = String(form.get("notes") ?? "").trim();

    const installs: { bomId: number; qty: number }[] = [];
    for (const [k, v] of form.entries()) {
        if (!k.startsWith("installed_")) continue;
        const bomIdStr = k.slice("installed_".length);
        const bomId = Number(bomIdStr);
        if (!Number.isFinite(bomId)) continue;
        const qty = toFloat(v);
        if (qty > 0) installs.push({ bomId, qty });
    }

    if (installs.length === 0 && total_hours === 0) {
        setFlash(c, "error", "Nothing to save — enter installed quantities or hours.");
        return c.redirect(`/project/${id}/daily`);
    }

    const entryRes = await c.env.DB.prepare(
        "INSERT INTO daily_entries (project_id, entry_date, total_hours, notes) VALUES (?, ?, ?, ?)",
    ).bind(id, entry_date, total_hours, notes).run();
    const entryId = entryRes.meta.last_row_id as number;

    if (installs.length) {
        const itemStmt = c.env.DB.prepare(
            "INSERT INTO daily_entry_items (daily_entry_id, bom_item_id, qty_installed) VALUES (?, ?, ?)",
        );
        await c.env.DB.batch(
            installs.map(i => itemStmt.bind(entryId, i.bomId, i.qty)),
        );
    }

    setFlash(
        c,
        "success",
        `Saved daily entry for ${entry_date} — ${installs.length} item(s), ${total_hours.toFixed(2)} hours.`,
    );
    return c.redirect(`/project/${id}/daily`);
});

app.get("/project/:id/admin", async c => {
    const id = Number(c.req.param("id"));
    const project = await getProject(c.env.DB, id);
    if (!project) return c.notFound();
    const items = await getItemsWithInstalled(c.env.DB, id);
    const actualRes = await c.env.DB
        .prepare("SELECT COALESCE(SUM(total_hours), 0) AS h FROM daily_entries WHERE project_id = ?")
        .bind(id)
        .first<{ h: number }>();
    const actual_field_hours = actualRes?.h ?? 0;

    let total_material_cost = 0;
    let total_labor_book_hours = 0;
    let total_installed_qty = 0;
    let total_installed_labor_hours = 0;
    const rows: AdminRow[] = items.map(it => {
        const line_material_cost = it.unit_price * it.bom_qty;
        const labor_book_hours = it.hours_per_unit * it.bom_qty;
        const installed_labor_hours = it.hours_per_unit * it.installed;
        const remaining_qty = it.bom_qty - it.installed;
        const remaining_labor_hours = labor_book_hours - installed_labor_hours;
        total_material_cost += line_material_cost;
        total_labor_book_hours += labor_book_hours;
        total_installed_qty += it.installed;
        total_installed_labor_hours += installed_labor_hours;
        return {
            id: it.id,
            material: it.material,
            unit_price: it.unit_price,
            bom_qty: it.bom_qty,
            hours_per_unit: it.hours_per_unit,
            needs_review: it.needs_review,
            line_material_cost,
            labor_book_hours,
            installed: it.installed,
            installed_labor_hours,
            remaining_qty,
            remaining_labor_hours,
        };
    });

    const totals: AdminTotals = {
        material_cost: total_material_cost,
        labor_book_hours: total_labor_book_hours,
        installed_qty: total_installed_qty,
        installed_labor_hours: total_installed_labor_hours,
        actual_field_hours,
        labor_book_vs_bid: total_labor_book_hours - project.bid_labor_hours,
        actual_vs_bid: actual_field_hours - project.bid_labor_hours,
        actual_vs_labor_book: actual_field_hours - total_installed_labor_hours,
    };

    const flash = consumeFlash(c);
    return htmlResponse(<Admin project={project} rows={rows} totals={totals} flash={flash} />);
});

app.post("/project/:id/update", async c => {
    const id = Number(c.req.param("id"));
    const form = await c.req.formData();
    const bid = toFloat(form.get("bid_labor_hours"));
    const status = String(form.get("status") ?? "Active");
    await c.env.DB.prepare(
        "UPDATE projects SET bid_labor_hours = ?, status = ? WHERE id = ?",
    ).bind(bid, status, id).run();
    setFlash(c, "success", "Project updated.");
    return c.redirect(`/project/${id}/admin`);
});

app.post("/project/:id/bom-item/:bomId", async c => {
    const id = Number(c.req.param("id"));
    const bomId = Number(c.req.param("bomId"));
    const form = await c.req.formData();
    const hours = toFloat(form.get("hours_per_unit"));
    const priceRaw = form.get("unit_price");

    if (priceRaw !== null && String(priceRaw) !== "") {
        await c.env.DB.prepare(
            "UPDATE bom_items SET hours_per_unit = ?, unit_price = ?, needs_review = 0 WHERE id = ? AND project_id = ?",
        ).bind(hours, toFloat(priceRaw), bomId, id).run();
    } else {
        await c.env.DB.prepare(
            "UPDATE bom_items SET hours_per_unit = ?, needs_review = 0 WHERE id = ? AND project_id = ?",
        ).bind(hours, bomId, id).run();
    }
    setFlash(c, "success", "Item updated.");
    return c.redirect(`/project/${id}/admin`);
});

app.get("/labor-manual", async c => {
    const res = await c.env.DB
        .prepare("SELECT * FROM labor_manual ORDER BY category, material_pattern")
        .all<LaborManualEntry>();
    const flash = consumeFlash(c);
    return htmlResponse(<LaborManualView rows={res.results ?? []} flash={flash} />);
});

app.post("/labor-manual", async c => {
    const form = await c.req.formData();
    const pattern = String(form.get("material_pattern") ?? "").trim();
    const hours = toFloat(form.get("hours_per_unit"));
    const category = String(form.get("category") ?? "").trim();
    const notes = String(form.get("notes") ?? "").trim();

    if (!pattern) {
        setFlash(c, "error", "Material pattern is required.");
        return c.redirect("/labor-manual");
    }
    await c.env.DB.prepare(`
        INSERT INTO labor_manual (material_pattern, hours_per_unit, category, notes)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(material_pattern) DO UPDATE SET
            hours_per_unit = excluded.hours_per_unit,
            category = excluded.category,
            notes = excluded.notes
    `).bind(pattern, hours, category, notes).run();
    setFlash(c, "success", `Saved '${pattern}'.`);
    return c.redirect("/labor-manual");
});

app.post("/labor-manual/:id/delete", async c => {
    const id = Number(c.req.param("id"));
    await c.env.DB.prepare("DELETE FROM labor_manual WHERE id = ?").bind(id).run();
    return c.redirect("/labor-manual");
});

// Keep linter quiet about unused import
void normalize;

export default app;
