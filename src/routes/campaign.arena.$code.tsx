import { createFileRoute } from "@tanstack/react-router";
import { ArenaBattlePage } from "@/components/legendary/campaign/builder-page";

// Legendary Campaign (owner t381u): play a shared custom arena by code.
export const Route = createFileRoute("/campaign/arena/$code")({ component: Page });

function Page() {
  const { code } = Route.useParams();
  return <ArenaBattlePage code={code} />;
}
