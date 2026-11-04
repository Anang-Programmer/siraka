"use client";

import { useParams } from "next/navigation";

const sections: Record<string, string> = {
  rooms: "Manajemen Ruangan",
  schedules: "Manajemen Jadwal",
  bookings: "Manajemen Booking",
  classes: "Manajemen Kelas",
  users: "Manajemen Pengguna",
};

export default function AdminSectionPage() {
  const params = useParams<{ section: string }>();
  const title = sections[params.section];

  if (!title) {
    return <p>Halaman tidak ditemukan.</p>;
  }

  return (
    <div className="space-y-3">
      <h1 className="text-2xl font-bold text-slate-900">
        {title}
      </h1>

      <div className="rounded-xl border bg-white p-8">
        <p className="font-medium text-slate-800">
          Halaman {title}
        </p>
        <p className="mt-2 text-sm text-slate-500">
          Modul ini akan diimplementasikan pada tahap berikutnya.
        </p>
      </div>
    </div>
  );
}