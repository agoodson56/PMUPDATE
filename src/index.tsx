import { Hono } from "hono";
import type {
    Project,
    BomItemWithInstalled,
    DailyEntry,
    LaborManualEntry,
    PendingUpload,
    BomTemplate,
} from "./db";
import { lookupLaborHours, normalize } from "./db";
import {
    parseFileToGrid,
    autoDetectMapping,
    applyMapping,
    DEFAULT_SKIP_PATTERNS,
    type Mapping,
    type Grid,
} from "./parsers";
import { consumeFlash, setFlash } from "./flash";
import { Dashboard } from "./views/dashboard";
import { Daily } from "./views/daily";
import { Admin, type AdminRow, type AdminTotals } from "./views/admin";
import { LaborManualView } from "./views/labor_manual";
import { MapView } from "./views/map";
import { TemplatesView } from "./views/templates";

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

    let grid: Grid;
    try {
        grid = await parseFileToGrid(file);
    } catch (e) {
        setFlash(c, "error", `Failed to parse BOM: ${(e as Error).message}`);
        return c.redirect("/");
    }
    if (Object.keys(grid).length === 0) {
        setFlash(c, "error", "BOM file is empty or unreadable.");
        return c.redirect("/");
    }

    // Stage the parsed grid + project metadata; user picks column mapping next.
    const uuid = crypto.randomUUID();
    await c.env.DB.prepare(
        "INSERT INTO pending_uploads (id, project_name, pm_name, bid_labor_hours, file_name, sheets_json) VALUES (?, ?, ?, ?, ?, ?)",
    ).bind(
        uuid, name, pm_name, bid_labor_hours, file.name, JSON.stringify(grid),
    ).run();

    // Best-effort cleanup of any abandoned uploads >1 day old.
    await c.env.DB.prepare(
        "DELETE FROM pending_uploads WHERE datetime(created_at) < datetime('now', '-1 day')",
    ).run().catch(() => { /* ignore */ });

    return c.redirect(`/projects/map/${uuid}`);
});

app.get("/projects/map/:uuid", async c => {
    const uuid = c.req.param("uuid");
    const pending = await c.env.DB
        .prepare("SELECT * FROM pending_uploads WHERE id = ?")
        .bind(uuid)
        .first<PendingUpload>();
    if (!pending) {
        setFlash(c, "error", "Upload session expired. Please re-upload the BOM.");
        return c.redirect("/");
    }
    const grid: Grid = JSON.parse(pending.sheets_json);
    const mapping = autoDetectMapping(grid);
    const templatesRes = await c.env.DB
        .prepare("SELECT * FROM bom_templates ORDER BY name")
        .all<BomTemplate>();
    const flash = consumeFlash(c);
    return htmlResponse(
        <MapView
            pending={pending}
            grid={grid}
            mapping={mapping}
            templates={templatesRes.results ?? []}
            flash={flash}
        />,
    );
});

app.post("/projects/map/:uuid", async c => {
    const uuid = c.req.param("uuid");
    const pending = await c.env.DB
        .prepare("SELECT * FROM pending_uploads WHERE id = ?")
        .bind(uuid)
        .first<PendingUpload>();
    if (!pending) {
        setFlash(c, "error", "Upload session expired. Please re-upload the BOM.");
        return c.redirect("/");
    }
    const grid: Grid = JSON.parse(pending.sheets_json);

    const form = await c.req.formData();
    const sheetName = String(form.get("sheet_name") ?? "");
    const headerRow1Based = parseInt(String(form.get("header_row") ?? "1"), 10);
    const headerRow = Math.max(0, (Number.isFinite(headerRow1Based) ? headerRow1Based : 1) - 1);
    const mapping: Mapping = {
        sheetName,
        headerRow,
        materialCol: parseInt(String(form.get("material_col") ?? "-1"), 10),
        qtyCol: parseInt(String(form.get("qty_col") ?? "-1"), 10),
        priceCol: parseInt(String(form.get("price_col") ?? "-1"), 10),
        unitCol: parseInt(String(form.get("unit_col") ?? "-1"), 10),
        hoursCol: parseInt(String(form.get("hours_col") ?? "-1"), 10),
        skipPatterns: DEFAULT_SKIP_PATTERNS,
    };

    if (!grid[mapping.sheetName]) {
        setFlash(c, "error", "Selected sheet does not exist.");
        return c.redirect(`/projects/map/${uuid}`);
    }
    if (mapping.materialCol < 0 || mapping.qtyCol < 0) {
        setFlash(c, "error", "Material name and Quantity columns are required.");
        return c.redirect(`/projects/map/${uuid}`);
    }

    const items = applyMapping(grid, mapping);
    if (items.length === 0) {
        setFlash(c, "error", "No line items found with current mapping. Check your column selections.");
        return c.redirect(`/projects/map/${uuid}`);
    }

    // Create project + BOM items.
    const projInsert = await c.env.DB
        .prepare("INSERT INTO projects (name, pm_name, bid_labor_hours, file_name) VALUES (?, ?, ?, ?)")
        .bind(pending.project_name, pending.pm_name, pending.bid_labor_hours, pending.file_name)
        .run();
    const projectId = projInsert.meta.last_row_id as number;

    const itemStmt = c.env.DB.prepare(
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
            itemStmt.bind(projectId, it.material, it.bom_qty, it.unit_price, hours, needsReview),
        );
    }
    if (batch.length) await c.env.DB.batch(batch);

    // Optionally save the mapping as a template.
    const saveTemplate = form.get("save_template") !== null;
    const templateName = String(form.get("template_name") ?? "").trim();
    if (saveTemplate && templateName) {
        const headers = grid[mapping.sheetName][mapping.headerRow] ?? [];
        const headerAt = (i: number): string | null =>
            i >= 0 && headers[i] != null
                ? String(headers[i]).trim() || null
                : null;
        await c.env.DB.prepare(`
            INSERT INTO bom_templates
                (name, sheet_pattern, material_header, qty_header, price_header, unit_header, hours_header, skip_patterns)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(name) DO UPDATE SET
                sheet_pattern  = excluded.sheet_pattern,
                material_header = excluded.material_header,
                qty_header     = excluded.qty_header,
                price_header   = excluded.price_header,
                unit_header    = excluded.unit_header,
                hours_header   = excluded.hours_header,
                skip_patterns  = excluded.skip_patterns
        `).bind(
            templateName,
            mapping.sheetName,
            headerAt(mapping.materialCol) ?? "",
            headerAt(mapping.qtyCol) ?? "",
            headerAt(mapping.priceCol),
            headerAt(mapping.unitCol),
            headerAt(mapping.hoursCol),
            JSON.stringify(mapping.skipPatterns),
        ).run();
    }

    // Done with the staged upload.
    await c.env.DB.prepare("DELETE FROM pending_uploads WHERE id = ?").bind(uuid).run();

    setFlash(
        c,
        "success",
        `Project '${pending.project_name}' imported with ${items.length} line items.`,
    );
    return c.redirect("/");
});

app.get("/templates", async c => {
    const res = await c.env.DB
        .prepare("SELECT * FROM bom_templates ORDER BY name")
        .all<BomTemplate>();
    const flash = consumeFlash(c);
    return htmlResponse(
        <TemplatesView templates={res.results ?? []} flash={flash} />,
    );
});

app.post("/templates/:id/delete", async c => {
    await c.env.DB
        .prepare("DELETE FROM bom_templates WHERE id = ?")
        .bind(Number(c.req.param("id")))
        .run();
    setFlash(c, "success", "Template deleted.");
    return c.redirect("/templates");
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

app.post("/project/:id/rematch-labor", async c => {
    const id = Number(c.req.param("id"));
    const project = await c.env.DB.prepare(
        "SELECT id FROM projects WHERE id = ?",
    ).bind(id).first();
    if (!project) return c.notFound();

    const items = await c.env.DB.prepare(
        "SELECT id, material, hours_per_unit, needs_review FROM bom_items WHERE project_id = ?",
    ).bind(id).all<{
        id: number;
        material: string;
        hours_per_unit: number;
        needs_review: number;
    }>();

    let matched = 0;
    let unchanged = 0;
    const updates: D1PreparedStatement[] = [];
    const updateStmt = c.env.DB.prepare(
        "UPDATE bom_items SET hours_per_unit = ?, needs_review = 0 WHERE id = ?",
    );
    for (const it of items.results ?? []) {
        const found = await lookupLaborHours(c.env.DB, it.material);
        if (found !== null && found !== it.hours_per_unit) {
            updates.push(updateStmt.bind(found, it.id));
            matched++;
        } else if (found !== null && it.needs_review) {
            // Same hours but flag still set — clear the flag.
            updates.push(updateStmt.bind(found, it.id));
            matched++;
        } else {
            unchanged++;
        }
    }
    if (updates.length) await c.env.DB.batch(updates);

    setFlash(
        c,
        "success",
        `Re-matched against labor manual: ${matched} updated, ${unchanged} unchanged.`,
    );
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
