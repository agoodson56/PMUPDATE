import { Layout } from "./layout";
import type { Project } from "../db";
import type { Flash } from "../flash";

export type AdminRow = {
    id: number;
    material: string;
    unit_price: number;
    bom_qty: number;
    hours_per_unit: number;
    needs_review: number;
    line_material_cost: number;
    labor_book_hours: number;
    installed: number;
    installed_labor_hours: number;
    remaining_qty: number;
    remaining_labor_hours: number;
};

export type AdminTotals = {
    material_cost: number;
    labor_book_hours: number;
    installed_qty: number;
    installed_labor_hours: number;
    actual_field_hours: number;
    labor_book_vs_bid: number;
    actual_vs_bid: number;
    actual_vs_labor_book: number;
};

const signed = (n: number) => (n >= 0 ? "+" : "") + n.toFixed(2);

export function Admin({
    project,
    rows,
    totals,
    flash,
}: {
    project: Project;
    rows: AdminRow[];
    totals: AdminTotals;
    flash: Flash | null;
}) {
    return (
        <Layout title={`${project.name} · Summary`} flash={flash}>
            <nav class="breadcrumbs">
                <a href="/">Projects</a> / <span>{project.name}</span> / Summary
            </nav>

            <section class="header-row">
                <div>
                    <h1>{project.name}</h1>
                    <p class="muted">
                        PM: <strong>{project.pm_name}</strong>{"  ·  "}Status:{" "}
                        <span class={`badge badge-${project.status.toLowerCase()}`}>{project.status}</span>
                    </p>
                </div>
                <div class="actions">
                    <a href={`/project/${project.id}/daily`} class="btn btn-secondary">Daily Entry</a>
                </div>
            </section>

            <form method="post" action={`/project/${project.id}/update`} class="inline-form">
                <label>Bid Labor Hours
                    <input
                        type="number"
                        name="bid_labor_hours"
                        step="0.1"
                        min="0"
                        value={project.bid_labor_hours.toFixed(2)}
                    />
                </label>
                <label>Status
                    <select name="status">
                        {["Active", "Hold", "Complete"].map(s => (
                            <option value={s} selected={project.status === s}>{s}</option>
                        ))}
                    </select>
                </label>
                <button class="btn btn-secondary" type="submit">Update Project</button>
            </form>

            <h2>Project Totals</h2>
            <div class="kpi-grid">
                <Kpi label="Total Material Cost" value={`$${totals.material_cost.toFixed(2)}`} />
                <Kpi label="Total Labor Book Hours" value={totals.labor_book_hours.toFixed(2)} />
                <Kpi label="Installed Labor (Book) Hours" value={totals.installed_labor_hours.toFixed(2)} />
                <Kpi label="Actual Field Hours" value={totals.actual_field_hours.toFixed(2)} />
                <Kpi label="Bid Labor Hours" value={project.bid_labor_hours.toFixed(2)} />
                <Kpi
                    label="Labor Book − Bid"
                    value={`${signed(totals.labor_book_vs_bid)} h`}
                    state={totals.labor_book_vs_bid <= 0 ? "pos" : "neg"}
                />
                <Kpi
                    label="Actual − Bid"
                    value={`${signed(totals.actual_vs_bid)} h`}
                    state={totals.actual_vs_bid <= 0 ? "pos" : "neg"}
                />
                <Kpi
                    label="Actual − Installed Labor Book"
                    value={`${signed(totals.actual_vs_labor_book)} h`}
                    state={totals.actual_vs_labor_book <= 0 ? "pos" : "neg"}
                />
            </div>

            <h2>Material &amp; Labor Breakdown</h2>
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Material</th>
                        <th class="num">Unit $</th>
                        <th class="num">BOM Qty</th>
                        <th class="num">Material Total</th>
                        <th class="num">Hrs / Unit</th>
                        <th class="num">Labor Book Hrs</th>
                        <th class="num">Installed</th>
                        <th class="num">Installed Labor Hrs</th>
                        <th class="num">Remaining</th>
                        <th class="num">Remaining Labor Hrs</th>
                        <th>Edit</th>
                    </tr>
                </thead>
                <tbody>
                    {rows.length > 0 ? rows.map(r => (
                        <tr class={r.needs_review ? "warn" : ""}>
                            <td>
                                {r.material}
                                {r.needs_review ? <span class="badge badge-warn">Needs Review</span> : null}
                            </td>
                            <td class="num">${r.unit_price.toFixed(2)}</td>
                            <td class="num">{r.bom_qty.toFixed(2)}</td>
                            <td class="num">${r.line_material_cost.toFixed(2)}</td>
                            <td class="num">{r.hours_per_unit.toFixed(3)}</td>
                            <td class="num">{r.labor_book_hours.toFixed(2)}</td>
                            <td class="num">{r.installed.toFixed(2)}</td>
                            <td class="num">{r.installed_labor_hours.toFixed(2)}</td>
                            <td class={`num ${r.remaining_qty < 0 ? "neg" : ""}`}>{r.remaining_qty.toFixed(2)}</td>
                            <td class="num">{r.remaining_labor_hours.toFixed(2)}</td>
                            <td>
                                <details>
                                    <summary>Edit</summary>
                                    <form method="post" action={`/project/${project.id}/bom-item/${r.id}`}>
                                        <label class="micro">Unit $
                                            <input type="number" name="unit_price" step="0.01" min="0" value={r.unit_price.toFixed(2)} />
                                        </label>
                                        <label class="micro">Hrs / Unit
                                            <input type="number" name="hours_per_unit" step="0.001" min="0" value={r.hours_per_unit.toFixed(3)} />
                                        </label>
                                        <button class="btn btn-secondary" type="submit">Save</button>
                                    </form>
                                </details>
                            </td>
                        </tr>
                    )) : (
                        <tr><td colspan={11} class="muted">No BOM items.</td></tr>
                    )}
                </tbody>
                <tfoot>
                    <tr>
                        <th>Totals</th>
                        <th></th>
                        <th></th>
                        <th class="num">${totals.material_cost.toFixed(2)}</th>
                        <th></th>
                        <th class="num">{totals.labor_book_hours.toFixed(2)}</th>
                        <th class="num">{totals.installed_qty.toFixed(2)}</th>
                        <th class="num">{totals.installed_labor_hours.toFixed(2)}</th>
                        <th></th>
                        <th class="num">{(totals.labor_book_hours - totals.installed_labor_hours).toFixed(2)}</th>
                        <th></th>
                    </tr>
                </tfoot>
            </table>
        </Layout>
    );
}

function Kpi({ label, value, state }: { label: string; value: string; state?: "pos" | "neg" }) {
    return (
        <div class={`kpi ${state ? state : ""}`}>
            <div class="kpi-label">{label}</div>
            <div class="kpi-value">{value}</div>
        </div>
    );
}
