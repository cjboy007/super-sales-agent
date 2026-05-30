import { redirect } from "next/navigation";
import { JADENOS_ONBOARDING_ROUTE } from "./onboarding-flow";

export default function OnboardingRedirectPage() {
  redirect(JADENOS_ONBOARDING_ROUTE);
}
