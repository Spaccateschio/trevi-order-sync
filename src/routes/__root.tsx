import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import { Toaster } from "@/components/ui/sonner";
import { supabase } from "@/integrations/supabase/client";
import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";

// ===== Auto-reload once on stale chunk load failures =====
// After a new deployment the open browser tab may request an old JS chunk that
// no longer exists ("Failed to fetch dynamically imported module"), showing a
// blank screen. Reload the page once, with a guard against reload loops.
const CHUNK_RELOAD_FLAG = "trevi-chunk-reload-attempt";

function isChunkLoadError(message: string): boolean {
  return /failed to fetch dynamically imported module|importing a module script failed|error loading dynamically imported module|vite:preloadError/i.test(
    message,
  );
}

function reloadOnceForChunkError(): boolean {
  if (typeof window === "undefined" || !isBrowserReloadSafe()) return false;
  try {
    if (window.sessionStorage.getItem(CHUNK_RELOAD_FLAG)) return false;
    window.sessionStorage.setItem(CHUNK_RELOAD_FLAG, "1");
  } catch {
    return false;
  }
  window.location.reload();
  return true;
}

function isBrowserReloadSafe(): boolean {
  try {
    // Skip while the document is still loading (initial boot) or unloading,
    // and inside iframes used for printing.
    if (document.readyState === "loading" || document.visibilityState === "unloaded") return false;
    if (window.self !== window.top) return false;
    return true;
  } catch {
    return false;
  }
}

if (typeof window !== "undefined") {
  window.addEventListener(
    "error",
    (event) => {
      const message =
        (event.target instanceof HTMLScriptElement && `failed to fetch dynamically imported module: ${event.target.src}`) ||
        (event instanceof ErrorEvent && event.message) ||
        "";
      if (message && isChunkLoadError(message)) {
        event.preventDefault();
        reloadOnceForChunkError();
      }
    },
    true,
  );
  window.addEventListener("vite:preloadError", (event) => {
    event.preventDefault();
    reloadOnceForChunkError();
  });
}

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Pagina non trovata</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          La pagina che cerchi non esiste o è stata spostata.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Torna alla home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: ErrorComponentProps) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
    // A stale chunk after a deployment lands here as a router-level error too:
    // reload once instead of leaving a broken page on screen.
    if (error instanceof Error && isChunkLoadError(error.message)) {
      reloadOnceForChunkError();
    }
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          Questa pagina non si è caricata
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Qualcosa è andato storto. Puoi riprovare o tornare alla home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Riprova
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Torna alla home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Trevi Fruit" },
      {
        name: "description",
        content:
          "Trevi Fruit: raccolta ordini, preparazione e consegne per la distribuzione ortofrutticola.",
      },
      { property: "og:title", content: "Trevi Fruit" },
      {
        property: "og:description",
        content:
          "Trevi Fruit: raccolta ordini, preparazione e consegne per la distribuzione ortofrutticola.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Outfit:wght@500;600;700&display=swap",
      },
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="it">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
      router.invalidate();
      if (event !== "SIGNED_OUT") queryClient.invalidateQueries();
    });
    return () => data.subscription.unsubscribe();
  }, [router, queryClient]);

  return (
    <QueryClientProvider client={queryClient}>
      {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
      <Outlet />
      <Toaster />
    </QueryClientProvider>
  );
}
