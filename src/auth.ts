import type { Context, MiddlewareHandler } from "hono";
import { setFlash } from "./flash";

export type UserContext = {
    email: string;
    isAdmin: boolean;
};

type Env = {
    Bindings: { DB: D1Database };
    Variables: { user: UserContext };
};

/**
 * Pulls the authenticated user's email from the
 * `Cf-Access-Authenticated-User-Email` request header (set by Cloudflare
 * Access on every request after the user signs in) and decides whether
 * they're an admin.
 *
 * Bootstrap: if the admin_users table is empty, the first user to hit
 * the app is auto-inserted as the initial admin. Avoids needing to seed
 * by hand.
 */
export async function getUserContext(c: Context<Env>): Promise<UserContext> {
    let email = c.req.header("Cf-Access-Authenticated-User-Email") || "";

    // Local-dev fallback: when not behind CF Access, identify as a
    // single stable dev user so the rest of the app still works.
    if (!email) {
        const host = new URL(c.req.url).hostname;
        if (host === "localhost" || host === "127.0.0.1") {
            email = "dev@localhost";
        } else {
            return { email: "", isAdmin: false };
        }
    }

    const adminRow = await c.env.DB
        .prepare("SELECT email FROM admin_users WHERE email = ?")
        .bind(email)
        .first();
    if (adminRow) return { email, isAdmin: true };

    // Bootstrap: if no admins yet, the first authenticated user
    // becomes admin.
    const countRow = await c.env.DB
        .prepare("SELECT COUNT(*) AS n FROM admin_users")
        .first<{ n: number }>();
    if (countRow && countRow.n === 0) {
        await c.env.DB
            .prepare(
                "INSERT OR IGNORE INTO admin_users (email, note) VALUES (?, ?)",
            )
            .bind(email, "Auto-bootstrapped first user")
            .run();
        return { email, isAdmin: true };
    }

    return { email, isAdmin: false };
}

/** Populates c.var.user on every request. Apply globally with app.use("*"). */
export const populateUser: MiddlewareHandler<Env> = async (c, next) => {
    const user = await getUserContext(c);
    c.set("user", user);
    return next();
};

/** Blocks non-admins. Apply per-route on every admin endpoint. */
export const adminOnly: MiddlewareHandler<Env> = async (c, next) => {
    const user = c.get("user") ?? (await getUserContext(c));
    if (!user.isAdmin) {
        setFlash(c, "error", "You don't have permission to access that page.");
        return c.redirect("/");
    }
    return next();
};
