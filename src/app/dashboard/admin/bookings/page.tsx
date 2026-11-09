
import { Suspense } from "react";
import { connection } from "next/server";
import { requireRole } from "@/lib/auth/require-role";
import BookingManagement from "@/components/admin/booking-management";

async function BookingPageContent() {
  await connection();
  await requireRole("admin");
  return <BookingManagement />;
}

export default function AdminBookingsPage() {
  return (
    <Suspense
      fallback={
        <div className="p-5 text-sm text-slate-500">
          Memuat halaman persetujuan booking...
        </div>
      }
    >
      <BookingPageContent />
    </Suspense>
  );
}
