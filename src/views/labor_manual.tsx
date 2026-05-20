import { Layout } from "./layout";
import type { LaborManualEntry } from "../db";
import type { Flash } from "../flash";
import type { UserContext } from "../auth";

export function LaborManualView({
    rows,
    flash,
    user,
}: {
    rows: LaborManualEntry[];
    flash: Flash | null;
    user: UserContext;
}) {
    return (
        <Layout title="Labor Manual · 3DTS Project Manager" flash={flash} user={user}>
            <section class="header-row">
                <div>
                    <h1>Office Installation Hours Manual</h1>
                    <p class="muted">
                        Labor hours per unit for known materials. BOM uploads match by name (case-insensitive, partial match).
                    </p>
                </div>
            </section>

            <form method="post" action="/labor-manual" class="inline-form">
                <label>Material Pattern
                    <input type="text" name="material_pattern" required placeholder="e.g. 1/2 EMT Conduit" />
                </label>
                <label>Hours / Unit
                    <input type="number" step="0.001" min="0" name="hours_per_unit" required />
                </label>
                <label>Category
                    <input type="text" name="category" placeholder="e.g. Conduit" />
                </label>
                <label class="grow">Notes
                    <input type="text" name="notes" />
                </label>
                <button class="btn btn-primary" type="submit">Add / Update</button>
            </form>

            <table class="data-table">
                <thead>
                    <tr>
                        <th>Material</th>
                        <th class="num">Hrs / Unit</th>
                        <th>Category</th>
                        <th>Notes</th>
                        <th></th>
                    </tr>
                </thead>
                <tbody>
                    {rows.length > 0 ? rows.map(r => (
                        <tr>
                            <td>{r.material_pattern}</td>
                            <td class="num">{r.hours_per_unit.toFixed(3)}</td>
                            <td>{r.category || ""}</td>
                            <td>{r.notes || ""}</td>
                            <td>
                                <form
                                    method="post"
                                    action={`/labor-manual/${r.id}/delete`}
                                    onsubmit="return confirm('Delete this entry?');"
                                    style="display:inline"
                                >
                                    <button class="btn btn-ghost" type="submit">Delete</button>
                                </form>
                            </td>
                        </tr>
                    )) : (
                        <tr>
                            <td colspan={5} class="muted">
                                No labor manual entries yet. Add entries above, or let BOM uploads flag items as <em>Needs Review</em>.
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>
        </Layout>
    );
}
