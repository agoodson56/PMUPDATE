# 3DTS Project Manager

Online Project Manager for 3D Technology Services, Inc. — material BOM upload, daily install tracking, material/labor cost summaries, and bid vs. actual labor reporting.

Built on **Cloudflare Pages Functions + D1** (SQLite at the edge) with **Hono + JSX**. Git-connected auto-deploy, runs globally, free tier eligible.

---

## Quick start

### Prerequisites

- Node.js 18+ and npm
- A free Cloudflare account
- Wrangler CLI (installed automatically via `npm install`)

### One-time setup (do this once)

```bash
# 1. Install dependencies
npm install

# 2. Log in to Cloudflare
npx wrangler login

# 3. Create the D1 database
npm run db:create
```

The `db:create` step prints a `database_id`. **Paste that ID into `wrangler.toml`** in the `database_id` field, then commit & push that change.

```bash
# 4. Apply schema migrations
npm run db:migrate:local      # local development
npm run db:migrate            # remote (production) D1

# 5. Run locally
npm run dev
```

Visit the URL Wrangler prints (typically <http://localhost:8788>).

### Deploy

This repo is connected to Cloudflare Pages via Git. **Every push to `main` auto-deploys.**

In the Cloudflare Pages project settings, configure:

| Setting             | Value                  |
|---------------------|------------------------|
| Build command       | `npm run build`        |
| Build output        | `public`               |
| Root directory      | *(leave blank)*        |

The D1 binding (`DB` → `pm-db`) is declared in `wrangler.toml` and picked up by Pages automatically. If you prefer dashboard-only setup, add the binding under Pages project → Settings → Functions → D1 database bindings.

For manual one-off deploys: `npm run deploy`.

---

## File structure

```
PMUPDATES/
├── wrangler.toml                # Cloudflare config (Pages + D1)
├── package.json                 # Dependencies and scripts
├── tsconfig.json                # TypeScript + Hono JSX config
├── migrations/
│   └── 0001_init.sql            # D1 schema
├── functions/
│   └── [[path]].ts              # Pages Functions catch-all → Hono app
├── src/
│   ├── index.tsx                # Hono routes (the actual app)
│   ├── db.ts                    # D1 types + helpers
│   ├── parsers.ts               # BOM parsing (CSV / XLSX / PDF)
│   ├── flash.ts                 # Cookie-based flash messages
│   └── views/                   # JSX page components
│       ├── layout.tsx
│       ├── dashboard.tsx        # Page 1: project list + BOM upload
│       ├── daily.tsx            # Page 2: daily install entry
│       ├── admin.tsx            # Page 3: cost & labor summary
│       └── labor_manual.tsx     # Office Installation Hours Manual admin
├── public/                      # Static assets (Pages build output)
│   └── static/
│       ├── style.css            # 3DTS branding (teal / white / black / gold)
│       └── daily.js             # Daily-entry live calculator
├── _legacy_flask/               # Original Flask version (reference only — not deployed)
└── README.md
```

---

## How BOM upload works

The app accepts `.csv`, `.xlsx`, and `.pdf` files. The parser auto-detects columns by header name (case-insensitive, fuzzy match):

| Field           | Header aliases recognized                                      |
|-----------------|----------------------------------------------------------------|
| Material name   | `material`, `description`, `item`, `part`, `product`           |
| BOM quantity    | `qty`, `quantity`, `count`                                     |
| Unit price      | `unit price`, `price`, `unit cost`, `cost`                     |
| Labor hours/unit | `hours per unit`, `hrs per unit`, `labor hours`, `hours`, `hrs`, `labor` |

**Recommended BOM format (CSV/XLSX):**

```csv
Material,Qty,Unit Price,Hours Per Unit
1/2" EMT Conduit,500,1.25,0.05
6-32 Ground Lug,200,0.85,0.02
12-2 Romex,1500,0.78,0.01
```

If a row has no `Hours Per Unit`, the parser looks up the material in the **Labor Manual** table. If no match, the item is flagged **Needs Review**, and an admin can fill in the labor rate from the project summary page.

**PDF parsing** is best-effort: it extracts text and tries to identify a header row containing `material/description` + `qty/quantity`, then splits subsequent lines on whitespace. PDFs with rich tables (vector text + clear column structure) work; scanned PDFs and complex layouts may not. If PDF parsing fails, export to XLSX or CSV.

---

## How calculations work

### Per BOM line

| Field                  | Formula                                                          |
|------------------------|------------------------------------------------------------------|
| Material Total $       | `Unit Price × BOM Qty`                                           |
| Labor Book Hours       | `Hours Per Unit × BOM Qty`                                       |
| Installed Qty          | Sum of `qty_installed` across all daily entries                  |
| Installed Labor Hours  | `Hours Per Unit × Installed Qty`                                 |
| Remaining Qty          | `BOM Qty - Installed Qty`                                        |
| Remaining Labor Hours  | `Labor Book Hours - Installed Labor Hours`                       |

### Project totals

| KPI                            | Formula                                                       |
|--------------------------------|---------------------------------------------------------------|
| Total Material Cost            | Σ Material Total $ per line                                   |
| Total Labor Book Hours         | Σ Labor Book Hours per line                                   |
| Installed Labor (Book) Hours   | Σ Installed Labor Hours per line                              |
| Total Actual Field Hours       | Σ `total_hours` across all daily entries                      |
| Labor Book − Bid               | `Total Labor Book Hours - Bid Labor Hours`                    |
| Actual − Bid                   | `Actual Field Hours - Bid Labor Hours`                        |
| Actual − Installed Labor Book  | `Actual Field Hours - Installed Labor (Book) Hours`           |

A negative difference means *under* budget; positive means *over* budget. The summary KPI cards color them green/red automatically.

---

## Database schema

D1 tables (see `migrations/0001_init.sql` for the source of truth):

- `projects` — name, PM, bid hours, status, upload metadata
- `bom_items` — material, BOM qty, unit price, labor hours/unit, `needs_review` flag
- `daily_entries` — date, total field hours, notes per day
- `daily_entry_items` — installed quantity per BOM line per day
- `labor_manual` — material patterns → hours/unit (the Office Installation Hours Manual)

---

## Assumptions

- BOM files use a header row in the first non-empty row.
- Material names are unique enough within a project that BOM matching works. (We store them verbatim per project; the labor manual lookup uses normalized matching.)
- The PM enters daily hours as a single number (not split per worker).
- "Calculate" on the daily entry page is a client-side preview; "Save Daily Entry" is what persists data and clears the inputs.
- No authentication — every visitor can see and edit all projects. Add Cloudflare Access or a simple basic-auth middleware if needed.

---

## Testing checklist

Run through each of these once after deploy:

1. **Dashboard renders** — `/` shows the empty state.
2. **BOM upload (CSV)** — upload `Material,Qty,Unit Price,Hours Per Unit` CSV; project appears with correct line count.
3. **BOM upload (XLSX)** — same data as XLSX, parser detects columns correctly.
4. **BOM upload (PDF)** — best-effort; verify simple tabular PDFs parse.
5. **Project card** — shows PM name, upload date, bid hours, status badge.
6. **Daily entry list** — same materials appear with BOM qty, installed = 0, remaining = BOM qty.
7. **Save daily entry** — enter installed quantities + total hours, click Save. Inputs clear; history shows new row.
8. **Running totals** — return to Daily; "Installed To Date" reflects yesterday's saved quantities; "Remaining" decreased.
9. **Summary page** — material costs, labor book hours, installed quantities all match expectations.
10. **Bid vs labor book** — change "Bid Labor Hours" via the Update form; the three difference KPIs recompute.
11. **Actual vs bid / labor book** — verify the three labor-comparison KPIs.
12. **Needs Review flow** — upload a BOM without `Hours Per Unit`; items flagged. Open admin → Edit row → enter hours → flag clears.
13. **Labor Manual** — add an entry, re-upload a BOM with the same material name; hours auto-fill, not flagged.
14. **Delete project** — confirm dialog appears; deleted project cascades (BOM + daily entries gone).
15. **Mobile** — open `/` on a phone-sized viewport; nav, cards, tables remain usable (tables horizontally scroll).

---

## Customizing

- **Color scheme** — edit CSS variables at the top of `public/static/style.css` (`--teal`, `--gold`, etc.).
- **Add fields** — extend `migrations/0001_init.sql` with a new migration (e.g. `0002_xxx.sql`) and update the JSX view + route handler.
- **Auth** — add Cloudflare Access in front of the Worker, or wrap routes with a Hono auth middleware checking a header/cookie.

---

## Notes on the legacy Flask code

The original Flask + SQLite version (built before pivoting to Cloudflare) is preserved in `_legacy_flask/` for reference. It is **not** deployed — only `src/`, `migrations/`, and `public/` ship to Cloudflare. Delete `_legacy_flask/` whenever you're confident in the Workers version.
