import { Suspense } from "react";
import { connection } from "next/server";
import StudentRequestInbox from "@/components/komting/student-requests";
import { requireRole } from "@/lib/auth/require-role";

async function StudentRequestInboxContent() {
  await connection();
  await requireRole("komting");
  return <StudentRequestInbox />;
}

export default function KomtingStudentRequestsPage() {
  return (
    <Suspense fallback={<div className="p-5 text-sm text-slate-500">Memuat pengajuan mahasiswa...</div>}>
      <StudentRequestInboxContent />
    </Suspense>
  );
}
