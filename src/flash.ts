import type { Context } from "hono";
import { getCookie, setCookie } from "hono/cookie";

export type FlashCategory = "success" | "error";
export type Flash = { category: FlashCategory; message: string };

const COOKIE = "pm_flash";

export function setFlash(c: Context, category: FlashCategory, message: string): void {
    const value = encodeURIComponent(JSON.stringify({ category, message }));
    setCookie(c, COOKIE, value, {
        path: "/",
        httpOnly: true,
        sameSite: "Lax",
        maxAge: 60,
    });
}

export function consumeFlash(c: Context): Flash | null {
    const raw = getCookie(c, COOKIE);
    if (!raw) return null;
    setCookie(c, COOKIE, "", { path: "/", maxAge: 0 });
    try {
        const parsed = JSON.parse(decodeURIComponent(raw)) as Flash;
        if (parsed && typeof parsed.message === "string") return parsed;
        return null;
    } catch {
        return null;
    }
}
