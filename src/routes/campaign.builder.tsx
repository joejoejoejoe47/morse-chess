import { createFileRoute } from "@tanstack/react-router";
import { BuilderPage } from "@/components/legendary/campaign/builder-page";

// Legendary Campaign (owner t381u): Arena Builder (make and share custom boss arenas).
export const Route = createFileRoute("/campaign/builder")({ component: BuilderPage });
