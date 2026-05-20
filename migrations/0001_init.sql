-- 3DTS Project Manager - initial schema for Cloudflare D1

CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    pm_name TEXT NOT NULL,
    bid_labor_hours REAL NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'Active',
    file_name TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS bom_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    material TEXT NOT NULL,
    bom_qty REAL NOT NULL DEFAULT 0,
    unit_price REAL NOT NULL DEFAULT 0,
    hours_per_unit REAL NOT NULL DEFAULT 0,
    needs_review INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS daily_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    entry_date TEXT NOT NULL,
    total_hours REAL NOT NULL DEFAULT 0,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS daily_entry_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    daily_entry_id INTEGER NOT NULL,
    bom_item_id INTEGER NOT NULL,
    qty_installed REAL NOT NULL DEFAULT 0,
    FOREIGN KEY (daily_entry_id) REFERENCES daily_entries(id) ON DELETE CASCADE,
    FOREIGN KEY (bom_item_id) REFERENCES bom_items(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS labor_manual (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    material_pattern TEXT NOT NULL UNIQUE,
    hours_per_unit REAL NOT NULL DEFAULT 0,
    category TEXT,
    notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_bom_items_project ON bom_items(project_id);
CREATE INDEX IF NOT EXISTS idx_daily_entries_project ON daily_entries(project_id);
CREATE INDEX IF NOT EXISTS idx_daily_entry_items_entry ON daily_entry_items(daily_entry_id);
CREATE INDEX IF NOT EXISTS idx_daily_entry_items_bom ON daily_entry_items(bom_item_id);
