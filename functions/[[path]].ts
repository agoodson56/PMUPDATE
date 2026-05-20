import { handle } from "hono/cloudflare-pages";
import app from "../src/index";

const honoHandler = handle(app);

export const onRequest: PagesFunction = async (context) => {
    const url = new URL(context.request.url);
    // Let Pages serve static assets (CSS/JS/images) directly.
    if (url.pathname.startsWith("/static/") || url.pathname === "/favicon.ico") {
        return context.next();
    }
    return honoHandler(context);
};
