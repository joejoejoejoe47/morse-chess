import { createFileRoute } from "@tanstack/react-router";
import { CampaignMapPage } from "@/components/legendary/campaign/map-page";

// Legendary Campaign (owner t381u): the world map.
export const Route = createFileRoute("/campaign/")({ component: CampaignMapPage });
