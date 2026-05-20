import { Layout } from "./layout";
import type { AdminUser } from "../db";
import type { Flash } from "../flash";
import type { UserContext } from "../auth";

export function AdminsView({
    admins,
    flash,
    user,
}: {
    admins: AdminUser[];
    flash: Flash | null;
    user: UserContext;
}) {
    return (
        <Layout title="Admin Users · 3DTS Project Manager" flash={flash} user={user}>
            <section class="header-row">
                <div>
                    <h1>Admin Users</h1>
                    <p class="muted">
                        Anyone whose @3dtsi.com email is in this list can access the Summary, Labor Manual, Templates, and upload / delete BOMs. Everyone else (crew) can only see the projects list and the Daily Entry page.
                    </p>
                </div>
            </section>

            <form method="post" action="/admins" class="inline-form">
                <label class="grow">Add admin by email
                    <input
                        type="email"
                        name="email"
                        required
                        placeholder="e.g. jane.smith@3dtsi.com"
                    />
                </label>
                <label>Note (optional)
                    <input type="text" name="note" placeholder="e.g. Operations Manager" />
                </label>
                <button type="submit" class="btn btn-primary">Grant Admin</button>
            </form>

            <table class="data-table">
                <thead>
                    <tr>
                        <th>Email</th>
                        <th>Note</th>
                        <th>Added</th>
                        <th></th>
                    </tr>
                </thead>
                <tbody>
                    {admins.length > 0 ? admins.map(a => (
                        <tr>
                            <td>
                                <strong>{a.email}</strong>
                                {a.email === user.email ? <span class="badge badge-active" style="margin-left:8px">you</span> : null}
                            </td>
                            <td>{a.note || ""}</td>
                            <td class="muted">{(a.created_at || "").slice(0, 10)}</td>
                            <td>
                                {a.email === user.email ? (
                                    <span class="muted">— cannot remove self</span>
                                ) : (
                                    <form
                                        method="post"
                                        action={`/admins/${encodeURIComponent(a.email)}/delete`}
                                        onsubmit="return confirm('Revoke admin access from this user?');"
                                        style="display:inline"
                                    >
                                        <button type="submit" class="btn btn-ghost">Revoke</button>
                                    </form>
                                )}
                            </td>
                        </tr>
                    )) : (
                        <tr>
                            <td colspan={4} class="muted">No admins yet — the first authenticated user becomes the bootstrap admin.</td>
                        </tr>
                    )}
                </tbody>
            </table>
        </Layout>
    );
}
