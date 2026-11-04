
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
        <div className="p-8 text-sm text-slate-500">
          Memuat formulir kebutuhan ruangan...
        </div>
      }
    >
      <StudentRoomRequestContent />
    </Suspense>
  );
}
