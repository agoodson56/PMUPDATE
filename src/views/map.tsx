import { raw } from "hono/html";
import { Layout } from "./layout";
import type { PendingUpload, BomTemplate } from "../db";
import type { Grid, Mapping } from "../parsers";
import type { Flash } from "../flash";

type Props = {
    pending: PendingUpload;
    grid: Grid;
    mapping: Mapping | null;
    templates: BomTemplate[];
    flash: Flash | null;
};

export function MapView({ pending, grid, mapping, templates, flash }: Props) {
    const sheetNames = Object.keys(grid);
    const fallback: Mapping = {
        sheetName: sheetNames[0] ?? "",
        headerRow: 0,
        materialCol: -1,
        qtyCol: -1,
        priceCol: -1,
        unitCol: -1,
        hoursCol: -1,
        skipPatterns: [],
    };
    const initial = mapping ?? fallback;

    // Embed everything the client needs to render the preview and apply
    // templates without a server roundtrip.
    const initialState = {
        grid,
        mapping: initial,
        templates: templates.map(t => ({
            id: t.id,
            name: t.name,
            sheet_pattern: t.sheet_pattern,
            material_header: t.material_header,
            qty_header: t.qty_header,
            price_header: t.price_header,
            unit_header: t.unit_header,
            hours_header: t.hours_header,
        })),
    };

    return (
        <Layout
            title={`Map columns · ${pending.project_name}`}
            flash={flash}
            extraScripts="/static/map.js"
        >
            <nav class="breadcrumbs">
                <a href="/">Projects</a> / Map BOM columns
            </nav>

            <section class="header-row">
                <div>
                    <h1>Map BOM Columns</h1>
                    <p class="muted">
                        <strong>{pending.project_name}</strong>
                        {"  ·  "}PM <strong>{pending.pm_name}</strong>
                        {"  ·  "}Bid {pending.bid_labor_hours.toFixed(1)} h
                        {"  ·  "}File <em>{pending.file_name}</em>
                    </p>
                </div>
                <div class="actions">
                    <a href="/" class="btn btn-ghost">Cancel</a>
                </div>
            </section>

            <p class="muted">
                I made a best guess at which column holds each field. Adjust if it's wrong. The <strong>Preview</strong> table below updates as you change selections — it shows what will actually be imported.
            </p>

            <form method="post" action={`/projects/map/${pending.id}`} id="map-form">
                {templates.length > 0 ? (
                    <div class="inline-form">
                        <label class="grow">Apply saved template
                            <select id="template-select">
                                <option value="">— none —</option>
                                {templates.map(t => (
                                    <option value={String(t.id)}>{t.name}</option>
                                ))}
                            </select>
                        </label>
                        <button type="button" class="btn btn-secondary" id="apply-template">Apply</button>
                    </div>
                ) : null}

                <div class="inline-form">
                    <label>Sheet
                        <select name="sheet_name" id="sheet-select">
                            {sheetNames.map(s => (
                                <option value={s}>{s}</option>
                            ))}
                        </select>
                    </label>
                    <label>Header row (1-based)
                        <input
                            type="number"
                            name="header_row"
                            id="header-row"
                            min="1"
                            value={String(initial.headerRow + 1)}
                        />
                    </label>
                </div>

                <h2>
                    Sheet preview
                    <span class="muted" style="font-size:13px;font-weight:normal">
                        {"  "}— click a row to set it as the header row
                    </span>
                </h2>
                <div id="sheet-preview" class="preview-table-wrap"></div>

                <h2>Column mapping</h2>
                <div class="map-cols">
                    <label>Material name <span class="req">*</span>
                        <select name="material_col" id="map-material" required></select>
                    </label>
                    <label>Quantity <span class="req">*</span>
                        <select name="qty_col" id="map-qty" required></select>
                    </label>
                    <label>Unit price
                        <select name="price_col" id="map-price"></select>
                    </label>
                    <label>Unit (ea / ft / lot)
                        <select name="unit_col" id="map-unit"></select>
                    </label>
                    <label>Hours per unit
                        <select name="hours_col" id="map-hours"></select>
                    </label>
                </div>

                <h2>
                    Preview
                    <span id="preview-count" class="muted" style="font-size:14px;font-weight:normal"></span>
                </h2>
                <div id="items-preview"></div>

                <div class="inline-form" style="margin-top: 20px">
                    <label class="checkbox-label" style="min-width: 240px; flex-direction: row; align-items: center; text-transform: none">
                        <input
                            type="checkbox"
                            name="save_template"
                            id="save-template-checkbox"
                            value="1"
                            style="width: auto; margin-right: 8px"
                        />
                        Save this mapping as a template
                    </label>
                    <label class="grow">Template name
                        <input
                            type="text"
                            name="template_name"
                            id="template-name"
                            placeholder="e.g. SmartPlans, Graybar, Anixter"
                            disabled
                        />
                    </label>
                </div>

                <div class="form-actions">
                    <a href="/" class="btn btn-ghost">Cancel</a>
                    <button type="submit" class="btn btn-primary" id="import-btn">Import BOM</button>
                </div>
            </form>

            <script>{raw(`window.__MAP_STATE__ = ${JSON.stringify(initialState)};`)}</script>
        </Layout>
    );
}
