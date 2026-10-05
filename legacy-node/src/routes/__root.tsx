import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import { AuthProvider } from "@/lib/auth/provider";
import { PreviewHostBridge } from "@/components/preview-host-bridge";
import { ThemeProvider } from "@/components/theme";
import { BellHost } from "@/components/bell-host";
import { StudioSplash } from "@/components/studio-splash";
import { CoinDock } from "@/components/coin-dock";
import { Toaster } from "sonner";
import appCss from "../styles.css?url";

const APP_NAME = "Morse Chess";

const THEME_BOOT = `try{var t=localStorage.getItem('mores-theme');var r=document.documentElement;r.classList.remove('light','dark');r.classList.add(t==='light'?'light':'dark');r.style.colorScheme=t==='light'?'light':'dark';}catch(e){document.documentElement.classList.add('dark')}`;

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { title: APP_NAME },
      { name: "theme-color", content: "#0c0d0b" },
      {
        name: "description",
        content:
          "Morse Chess — a private club board. Challenge by name, play timed or breeze, keep score.",
      },
      { name: "application-name", content: APP_NAME },
      { property: "og:title", content: APP_NAME },
      { property: "og:site_name", content: "MorseChess.com" },
      {
        property: "og:description",
        content: "Sit at the Morse table. Challenge a name, or sit across MorseBot.",
      },
    ],
    links: [
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/__grok/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/__grok/icon-180.png" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,600;0,700;1,500&family=IBM+Plex+Mono:wght@400;500&family=Outfit:wght@400;500;600&display=swap",
      },
    ],
  }),
  component: () => (
    <html lang="en" className="antialiased" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
        <HeadContent />
      </head>
      <body className="club-wash min-h-dvh">
        <PreviewHostBridge />
        <AuthProvider>
          <ThemeProvider>
            <BellHost />
            <Outlet />
          </ThemeProvider>
        </AuthProvider>
        <StudioSplash />
        <CoinDock />
        <Toaster
          theme="system"
          position="top-center"
          toastOptions={{
            className: "!bg-panel !text-ivory !border-line !font-[Outfit,sans-serif]",
          }}
        />
        <Scripts />
      </body>
    </html>
  ),
});
