import { createFileRoute } from "@tanstack/react-router";
import { RaidBattlePage } from "@/components/legendary/campaign/raid-page";

// Legendary Campaign (owner t381u): one co-op raid.
export const Route = createFileRoute("/campaign/raid/$raidId")({ component: Page });

function Page() {
  const { raidId } = Route.useParams();
  return <RaidBattlePage raidId={raidId} />;
}
