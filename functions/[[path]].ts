import app from "../src/index";

type Env = { DB: D1Database; ASSETS: Fetcher };

export const onRequest: PagesFunction<Env> = async (context) => {
    const url = new URL(context.request.url);
    // Let Pages serve static assets directly; everything else hits the Hono app.
    if (url.pathname.startsWith("/static/") || url.pathname === "/favicon.ico") {
        return context.env.ASSETS.fetch(context.request);
    }
    return app.fetch(context.request, context.env, {
        waitUntil: context.waitUntil.bind(context),
        passThroughOnException: context.passThroughOnException.bind(context),
        props: {},
    });
};
