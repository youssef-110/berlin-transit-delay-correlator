import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getSessionUser } from "@/lib/auth";
import { buildDashboard } from "@/services/status";
import { DashboardClient } from "@/components/DashboardClient";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata: Metadata = {
  title: "Commute Dashboard",
  description: "Live Berlin-Potsdam transit disruption monitor, weather correlation, and alert history.",
};

export default async function DashboardPage() {
  const user = await getSessionUser();
  if (!user) {
    redirect("/login");
  }

  const initialData = await buildDashboard(user.id);
  if (!initialData) {
    redirect("/login");
  }

  return <DashboardClient initialData={initialData} />;
}
