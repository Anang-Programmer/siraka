import { Suspense, type ReactNode } from "react";
import { connection } from "next/server";
import AdminShell from "@/components/admin/admin-shell";
import { requireRole } from "@/lib/auth/require-role";

async function ProtectedAdminShell({ children }: { children: ReactNode }) {
  await connection();
  const profile = await requireRole("admin");

  return <AdminShell adminName={profile.full_name}>{children}</AdminShell>;
}

export default function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <Suspense fallback={<p role="status" className="p-4">Memuat dashboard...</p>}>
      <ProtectedAdminShell>{children}</ProtectedAdminShell>
    </Suspense>
  );
}