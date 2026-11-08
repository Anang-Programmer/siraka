import { Suspense } from "react";
import { connection } from "next/server";
import StudentList from "@/components/komting/student-list";
import { requireRole } from "@/lib/auth/require-role";

async function StudentListPageContent() {
  await connection();
  await requireRole("komting");
  return <StudentList />;
}

export default function KomtingStudentsPage() {
  return (
    <Suspense fallback={<div className="p-5 text-sm text-slate-500">Memuat daftar mahasiswa...</div>}>
      <StudentListPageContent />
    </Suspense>
  );
}
