import { raw } from "hono/html";
import { Layout } from "./layout";
import type { Project } from "../db";
import type { Flash } from "../flash";

export function Dashboard({ projects, flash }: { projects: Project[]; flash: Flash | null }) {
    return (
        <Layout title="Projects · 3DTS Project Manager" flash={flash}>
            <section class="hero">
                <div>
                    <h1>Projects</h1>
                    <p class="muted">Upload a BOM to start tracking a project.</p>
                </div>
                <button class="btn btn-primary" onclick="openModal()">+ New Project / Upload BOM</button>
            </section>

            {projects.length > 0 ? (
                <div class="card-grid">
                    {projects.map(p => (
                        <div class="card">
                            <div class="card-head">
                                <h3>{p.name}</h3>
                                <span class={`badge badge-${p.status.toLowerCase()}`}>{p.status}</span>
                            </div>
                            <dl class="card-meta">
                                <dt>PM</dt><dd>{p.pm_name}</dd>
                                <dt>Uploaded</dt><dd>{(p.created_at || "").slice(0, 10)}</dd>
                                <dt>Bid Hours</dt><dd>{p.bid_labor_hours.toFixed(1)}</dd>
                                {p.file_name ? (<><dt>BOM File</dt><dd class="truncate">{p.file_name}</dd></>) : null}
                            </dl>
                            <div class="card-actions">
                                <a href={`/project/${p.id}/daily`} class="btn btn-primary">Daily Entry</a>
                                <a href={`/project/${p.id}/admin`} class="btn btn-secondary">Summary</a>
                                <form
                                    method="post"
                                    action={`/project/${p.id}/delete`}
                                    onsubmit="return confirm('Delete this project and all its data? This cannot be undone.');"
                                    style="display:inline"
                                >
                                    <button class="btn btn-ghost" type="submit">Delete</button>
                                </form>
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div class="empty">
                    <p><strong>No projects yet.</strong></p>
                    <p class="muted">Click <em>New Project / Upload BOM</em> to get started.</p>
                </div>
            )}

            <div id="upload-modal" class="modal" onclick="if(event.target===this)closeModal()">
                <div class="modal-inner">
                    <h2>New Project</h2>
                    <form method="post" action="/projects" enctype="multipart/form-data">
                        <label>Project Name
                            <input type="text" name="name" required placeholder="e.g. Riverside Hospital Phase 2" />
                        </label>
                        <label>PM Name
                            <input type="text" name="pm_name" required placeholder="e.g. Jane Smith" />
                        </label>
                        <label>Bid Labor Hours
                            <input type="number" name="bid_labor_hours" step="0.1" min="0" value="0" required />
                        </label>
                        <label>BOM File <span class="muted">(.xlsx, .csv, .pdf)</span>
                            <input type="file" name="bom_file" accept=".xlsx,.csv,.pdf" required />
                        </label>
                        <div class="actions">
                            <button type="button" class="btn btn-ghost" onclick="closeModal()">Cancel</button>
                            <button type="submit" class="btn btn-primary">Create Project</button>
                        </div>
                    </form>
                </div>
            </div>

            <script>{raw(`
                function openModal(){ document.getElementById('upload-modal').classList.add('open'); }
                function closeModal(){ document.getElementById('upload-modal').classList.remove('open'); }
                document.addEventListener('keydown', function(e){ if (e.key === 'Escape') closeModal(); });
            `)}</script>
        </Layout>
    );
}
