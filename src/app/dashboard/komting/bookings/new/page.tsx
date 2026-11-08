import { Suspense } from "react";
import { connection } from "next/server";
import BookingForm from "@/components/komting/booking-form";
import { requireRole } from "@/lib/auth/require-role";

async function BookingPageContent() {
  await connection();
  await requireRole("komting");
  return <BookingForm />;
}

export default function KomtingBookingPage() {
  return (
    <Suspense
      fallback={
        <div className="p-5 text-sm text-slate-500">Memuat halaman booking...</div>
      }
    >
      <BookingPageContent />
    </Suspense>
  );
}
