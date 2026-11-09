import { Suspense } from "react";
import { connection } from "next/server";
import StudentRoomRequest from "@/components/mahasiswa/student-room-request";
import { requireRole } from "@/lib/auth/require-role";

async function StudentRoomRequestContent() {
  await connection();
  await requireRole("mahasiswa");

  return <StudentRoomRequest />;
}

export default function StudentRoomRequestsPage() {
  return (
    <Suspense
      fallback={
        <p
          role="status"
          className="rounded-md border border-slate-200 bg-white p-5 text-center text-sm text-muted"
        >
          Memuat formulir kebutuhan ruangan...
        </p>
      }
    >
      <StudentRoomRequestContent />
    </Suspense>
  );
}