import type { Flash } from "../flash";

type LayoutProps = {
    title?: string;
    flash?: Flash | null;
    extraScripts?: string;
    children?: unknown;
};

export function Layout(props: LayoutProps) {
    const title = props.title ?? "3D Technology Services - Project Manager";
    return (
        <html lang="en">
            <head>
                <meta charSet="utf-8" />
                <meta name="viewport" content="width=device-width, initial-scale=1" />
                <title>{title}</title>
                <link rel="stylesheet" href="/static/style.css" />
            </head>
            <body>
                <header class="topbar">
                    <div class="container topbar-inner">
                        <a href="/" class="brand">
                            <span class="brand-mark">3DTS</span>
                            <span class="brand-name">Project Manager</span>
                        </a>
                        <nav class="nav">
                            <a href="/">Projects</a>
                            <a href="/labor-manual">Labor Manual</a>
                            <a href="/templates">Templates</a>
                        </nav>
                    </div>
                </header>
                <main class="container">
                    {props.flash ? (
                        <div class={`flash flash-${props.flash.category}`}>{props.flash.message}</div>
                    ) : null}
                    {props.children}
                </main>
                <footer class="footer">
                    <div class="container">3D Technology Services, Inc. · Project Manager</div>
                </footer>
                {props.extraScripts ? (
                    <script src={props.extraScripts}></script>
                ) : null}
            </body>
        </html>
    );
}
