import { raw } from "hono/html";
import { Layout } from "./layout";
import type { Project, BomItemWithInstalled, DailyEntry } from "../db";
import type { Flash } from "../flash";
import type { UserContext } from "../auth";
import { caDateTime } from "../dates";

type Props = {
    project: Project;
    items: BomItemWithInstalled[];
    history: DailyEntry[];
    today: string;
    flash: Flash | null;
    user: UserContext;
};

export function Daily({ project, items, history, today, flash, user }: Props) {
    return (
        <Layout
            title={`${project.name} · Daily Entry`}
            flash={flash}
            extraScripts="/static/daily.js"
            user={user}
        >
            <nav class="breadcrumbs">
                <a href="/">Projects</a> / <span>{project.name}</span> / Daily Entry
            </nav>

            <section class="header-row">
                <div>
                    <h1>{project.name}</h1>
                    <p class="muted">
                        PM: <strong>{project.pm_name}</strong>
                        {"  ·  "}Bid Hours: {project.bid_labor_hours.toFixed(1)}
                    </p>
                </div>
                <div class="actions">
                    {user.isAdmin ? (
                        <a href={`/project/${project.id}/admin`} class="btn btn-secondary">View Summary</a>
                    ) : null}
                </div>
            </section>

            <form method="post" action={`/project/${project.id}/daily`} id="daily-form">
                <div class="entry-meta">
                    <label>Date
                        <input type="date" name="entry_date" id="entry_date" value={today} required />
                    </label>
                    {/* Force the date input to TODAY in California (Pacific
                        time) regardless of the browser's local timezone or
                        whether the server-side render guessed correctly. */}
                    <script>{raw(`
                        (function () {
                            var input = document.getElementById('entry_date');
                            if (!input) return;
                            try {
                                input.value = new Intl.DateTimeFormat('sv-SE', {
                                    timeZone: 'America/Los_Angeles',
                                    year: 'numeric', month: '2-digit', day: '2-digit'
                                }).format(new Date());
                            } catch (e) {
                                // Fall back to browser-local date.
                                var d = new Date();
                                input.value = d.getFullYear() + '-' +
                                    String(d.getMonth() + 1).padStart(2, '0') + '-' +
                                    String(d.getDate()).padStart(2, '0');
                            }
                        })();
                    `)}</script>
                    <label>Total Hours Today
                        <input type="number" name="total_hours" id="total_hours" step="0.25" min="0" value="0" required />
                    </label>
                    <label class="grow">Notes
                        <input type="text" name="notes" placeholder="Optional notes (crew, weather, blockers, etc.)" />
                    </label>
                </div>

                {items.length > 0 ? (
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>Material</th>
                                <th class="num">BOM Qty</th>
                                <th class="num">Installed To Date</th>
                                <th class="num">Remaining</th>
                                <th class="num">Installed Today</th>
                            </tr>
                        </thead>
                        <tbody>
                            {items.map(it => {
                                const remaining = it.bom_qty - it.installed;
                                return (
                                    <tr class={it.needs_review ? "warn" : ""}>
                                        <td>
                                            {it.material}
                                            {it.needs_review ? <span class="badge badge-warn">Needs Review</span> : null}
                                        </td>
                                        <td class="num">{it.bom_qty.toFixed(2)}</td>
                                        <td class="num">{it.installed.toFixed(2)}</td>
                                        <td class={`num ${remaining < 0 ? "neg" : ""}`}>{remaining.toFixed(2)}</td>
                                        <td class="num">
                                            <input
                                                type="number"
                                                name={`installed_${it.id}`}
                                                step="0.01"
                                                min="0"
                                                class="install-input"
                                                data-bom-qty={String(it.bom_qty)}
                                                data-installed={String(it.installed)}
                                            />
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                        <tfoot>
                            <tr>
                                <th colspan={4} class="num">Today's Total Installed Units:</th>
                                <th class="num"><span id="total-installed-today">0.00</span></th>
                            </tr>
                        </tfoot>
                    </table>
                ) : (
                    <p class="empty">No BOM items found for this project.</p>
                )}

                <div id="calc-preview" class="preview hidden"></div>

                <div class="form-actions">
                    <button type="button" class="btn btn-secondary" onclick="calculatePreview()">Calculate</button>
                    <button type="submit" class="btn btn-primary">Save Daily Entry</button>
                    <span class="muted">Saving commits today's installs and clears the inputs for tomorrow.</span>
                </div>
            </form>

            <section class="history">
                <h2>Daily History</h2>
                {history.length > 0 ? (
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>Date</th>
                                <th class="num">Field Hours</th>
                                <th>Notes</th>
                                <th>Logged</th>
                            </tr>
                        </thead>
                        <tbody>
                            {history.map(h => (
                                <tr>
                                    <td>{h.entry_date}</td>
                                    <td class="num">{h.total_hours.toFixed(2)}</td>
                                    <td>{h.notes || ""}</td>
                                    <td class="muted">{caDateTime(h.created_at)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                ) : (
                    <p class="muted">No daily entries recorded yet.</p>
                )}
            </section>
        </Layout>
    );
}
