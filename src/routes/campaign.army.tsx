import { createFileRoute } from "@tanstack/react-router";
import { ArmyPage } from "@/components/legendary/campaign/army-page";

// Legendary Campaign (owner t381u): the persistent army.
export const Route = createFileRoute("/campaign/army")({ component: ArmyPage });
