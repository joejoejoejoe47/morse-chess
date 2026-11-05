import { createRootRoute, Outlet } from "@tanstack/react-router";
import { AuthProvider } from "@/lib/auth/provider";
import { ThemeProvider } from "@/components/theme";
import { BellHost } from "@/components/bell-host";
import { SoundtrackHost } from "@/components/soundtrack-host";
import { StudioSplash } from "@/components/studio-splash";
import { CoinDock } from "@/components/coin-dock";
import { MasterPopupHost } from "@/components/master-popup-host";
import { MailPopupHost } from "@/components/mail-popup-host";
import { GcHost } from "@/components/gc-mail";
import { Toaster } from "sonner";
import { BotBuddyHost } from "@/components/bots/bot-buddy-host";

export const Route = createRootRoute({
  component: () => (
    <>
      <AuthProvider>
        <ThemeProvider>
          <BellHost />
          <SoundtrackHost />
          <MasterPopupHost />
          <MailPopupHost />
          <GcHost />
          <Outlet />
          <BotBuddyHost />
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
    </>
  ),
});
