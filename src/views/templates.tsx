import { Layout } from "./layout";
import type { BomTemplate } from "../db";
import type { Flash } from "../flash";
import type { UserContext } from "../auth";

export function TemplatesView({
    templates,
    flash,
    user,
}: {
    templates: BomTemplate[];
    flash: Flash | null;
    user: UserContext;
}) {
    return (
        <Layout title="BOM Templates · 3DTS Project Manager" flash={flash} user={user}>
            <section class="header-row">
                <div>
                    <h1>BOM Column Templates</h1>
                    <p class="muted">
                        Saved column mappings per supplier. On a future BOM upload, pick the matching template on the map page and the columns auto-fill — no remapping needed.
                    </p>
                </div>
            </section>

            <table class="data-table">
                <thead>
                    <tr>
                        <th>Name</th>
                        <th>Sheet pattern</th>
                        <th>Material col</th>
                        <th>Qty col</th>
                        <th>Price col</th>
                        <th>Unit col</th>
                        <th>Hours col</th>
                        <th></th>
                    </tr>
                </thead>
                <tbody>
                    {templates.length > 0 ? templates.map(t => (
                        <tr>
                            <td><strong>{t.name}</strong></td>
                            <td><span class="muted">{t.sheet_pattern || "—"}</span></td>
                            <td>{t.material_header}</td>
                            <td>{t.qty_header}</td>
                            <td>{t.price_header || "—"}</td>
                            <td>{t.unit_header || "—"}</td>
                            <td>{t.hours_header || "—"}</td>
                            <td>
                                <form
                                    method="post"
                                    action={`/templates/${t.id}/delete`}
                                    onsubmit="return confirm('Delete this template?');"
                                    style="display:inline"
                                >
                                    <button type="submit" class="btn btn-ghost">Delete</button>
                                </form>
                            </td>
                        </tr>
                    )) : (
                        <tr>
                            <td colspan={8} class="muted">
                                No templates yet. The next time you upload a BOM, check <em>Save this mapping as a template</em> on the map page to create one.
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>
        </Layout>
    );
}
