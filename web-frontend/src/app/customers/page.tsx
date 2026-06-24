import { redirect } from "next/navigation";

export default function CustomerRecordsPage() {
  redirect("/leads?view=records");
}
