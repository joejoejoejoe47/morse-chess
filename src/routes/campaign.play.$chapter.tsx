import { createFileRoute } from "@tanstack/react-router";
import { BattlePage } from "@/components/legendary/campaign/battle-page";

// Legendary Campaign (owner t381u): one boss battle.
export const Route = createFileRoute("/campaign/play/$chapter")({ component: Page });

function Page() {
  const { chapter } = Route.useParams();
  return <BattlePage chapter={chapter} />;
}
