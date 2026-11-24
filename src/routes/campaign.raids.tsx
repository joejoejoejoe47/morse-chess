import { createFileRoute } from "@tanstack/react-router";
import { RaidsPage } from "@/components/legendary/campaign/raid-page";

// Legendary Campaign (owner t381u): co-op raid lobby (host or join with a code).
export const Route = createFileRoute("/campaign/raids")({ component: RaidsPage });
