-- 0003: BOM column-mapping infrastructure.
--   pending_uploads holds the parsed file grid + project metadata between
--   "upload" and "import" (user confirms the column mapping on the map page).
--   bom_templates stores reusable per-supplier column mappings so the PM
--   doesn't have to map again the next time the same supplier sends a BOM.

CREATE TABLE IF NOT EXISTS pending_uploads (
    id TEXT PRIMARY KEY,
    project_name TEXT NOT NULL,
    pm_name TEXT NOT NULL,
    bid_labor_hours REAL NOT NULL DEFAULT 0,
    file_name TEXT NOT NULL,
    sheets_json TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_pending_uploads_created ON pending_uploads(created_at);

CREATE TABLE IF NOT EXISTS bom_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    sheet_pattern TEXT,
    material_header TEXT NOT NULL,
    qty_header TEXT NOT NULL,
    price_header TEXT,
    unit_header TEXT,
    hours_header TEXT,
    skip_patterns TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
