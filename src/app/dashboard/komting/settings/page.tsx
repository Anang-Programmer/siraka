import { Suspense } from "react";
import { connection } from "next/server";
import KomtingSettings from "@/components/komting/komting-settings";
import { requireRole } from "@/lib/auth/require-role";

async function KomtingSettingsContent() {
  await connection();
  await requireRole("komting");
  return <KomtingSettings />;
}

export default function KomtingSettingsPage() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-slate-500">Memuat pengaturan...</div>}>
      <KomtingSettingsContent />
    </Suspense>
  );
}
