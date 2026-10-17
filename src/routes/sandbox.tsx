import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { MorseApp } from "@/components/battle/app";
import "@/battle-gate.css";

export const Route = createFileRoute("/sandbox")({
  component: SandboxPage,
});

function SandboxPage() {
  const navigate = useNavigate();
  return <MorseApp onLounge={() => void navigate({ to: "/" })} />;
}
