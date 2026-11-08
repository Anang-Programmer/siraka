import { Suspense } from "react";
import { connection } from "next/server";
import KomtingDashboard from "@/components/komting/komting-dashboard";
import { requireRole } from "@/lib/auth/require-role";

async function KomtingDashboardContent() {
  await connection();
  await requireRole("komting");
  return <KomtingDashboard />;
}

export default function KomtingDashboardPage() {
  return (
    <Suspense fallback={<div className="p-5 text-sm text-slate-500">Memuat dashboard Komting...</div>}>
      <KomtingDashboardContent />
    </Suspense>
  );
}
