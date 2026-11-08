
import { Suspense } from "react";
import { connection } from "next/server";
import { requireRole } from "@/lib/auth/require-role";
import StudentApproval from "@/components/komting/student-approval";

async function StudentApprovalPageContent() {
  await connection();
  await requireRole("komting");

  return <StudentApproval />;
}

export default function StudentApprovalPage() {
  return (
    <Suspense
      fallback={
        <div className="p-5 text-sm text-slate-500">
          Memuat halaman persetujuan...
        </div>
      }
    >
      <StudentApprovalPageContent />
    </Suspense>
  );
}
