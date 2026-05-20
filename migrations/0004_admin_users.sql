-- 0004: Role-based access control on top of Cloudflare Access.
-- CF Access authenticates anyone with an @3dtsi.com email. This table
-- decides which of those authenticated users get admin privileges
-- (Summary page, Labor Manual, Templates, BOM upload/delete, etc.).
-- Everyone else is "crew" and can only view the projects list and
-- enter daily install quantities.
--
-- Bootstrap: if this table is empty, the first authenticated user is
-- automatically inserted as an admin (so the owner doesn't need to
-- seed by hand). Subsequent users default to crew until promoted via
-- the /admins page.

CREATE TABLE IF NOT EXISTS admin_users (
    email TEXT PRIMARY KEY,
    note TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
