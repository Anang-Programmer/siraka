import { Suspense, type ReactNode } from "react";
import { connection } from "next/server";
import KomtingShell from "@/components/komting/komting-shell";
import { requireRole } from "@/lib/auth/require-role";

async function ProtectedKomtingShell({
  children,
}: {
  children: ReactNode;
}) {
  await connection();
  // Lindungi semua halaman di area Komting, bukan hanya halaman tertentu.
  await requireRole("komting");

  return <KomtingShell>{children}</KomtingShell>;
}

export default function KomtingLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<p role="status" className="p-6">Memuat dashboard...</p>}>
      <ProtectedKomtingShell>{children}</ProtectedKomtingShell>
    </Suspense>
  );
}
