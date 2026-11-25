import { createFileRoute } from "@tanstack/react-router";
import { CampaignDoor } from "@/components/legendary/campaign/shell";
import { TrainingPage } from "@/components/legendary/training/training-page";

// MB-20 Training Grounds (owner t381u): play the computer, Legendary only.
export const Route = createFileRoute("/training")({
  component: () => (
    <CampaignDoor>
      <TrainingPage />
    </CampaignDoor>
  ),
});
