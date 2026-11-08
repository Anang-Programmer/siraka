import { Suspense } from "react";
import { connection } from "next/server";
import BookingHistory from "@/components/komting/booking-history";
import { requireRole } from "@/lib/auth/require-role";

async function BookingHistoryPageContent() {
  await connection();
  await requireRole("komting");
  return <BookingHistory />;
}

export default function KomtingBookingsPage() {
  return (
    <Suspense fallback={<div className="p-5 text-sm text-slate-500">Memuat status booking...</div>}>
      <BookingHistoryPageContent />
    </Suspense>
  );
}
