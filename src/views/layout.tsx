import type { Flash } from "../flash";
import type { UserContext } from "../auth";

type LayoutProps = {
    title?: string;
    flash?: Flash | null;
    extraScripts?: string;
    user?: UserContext | null;
    children?: unknown;
};

export function Layout(props: LayoutProps) {
    const title = props.title ?? "3D Technology Services - Project Manager";
    const isAdmin = !!props.user?.isAdmin;
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
                            {isAdmin ? <a href="/labor-manual">Labor Manual</a> : null}
                            {isAdmin ? <a href="/templates">Templates</a> : null}
                            {isAdmin ? <a href="/admins">Admins</a> : null}
                            {props.user?.email ? (
                                <span class="nav-user">
                                    {props.user.email}
                                    {isAdmin ? <span class="role-badge admin">admin</span> : <span class="role-badge crew">crew</span>}
                                </span>
                            ) : null}
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
