import { redirect } from "next/navigation";

export default function AgentStatusRedirect() {
  redirect("/settings?panel=runtime");
}
