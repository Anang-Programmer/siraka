
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { getErrorMessage } from "@/lib/errors";

type MetricData = {
  rooms: number;
  classes: number;
  users: number;
  pending: number;
  approved: number;
  schedules: number;
};

type Booking = {
  id: string;
  title: string;
  booking_type: string;
  status: string;
  starts_at: string;
  created_at: string;
};

const initialMetrics: MetricData = {
  rooms: 0,
  classes: 0,
  users: 0,
  pending: 0,
  approved: 0,
  schedules: 0,
};

const bookingTypeLabels: Record<string, string> = {
  krs_priority: "Prioritas KRS",
  regular: "Booking Biasa",
  instant: "Instant Booking",
};

const statusClasses: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700",
  under_review: "bg-blue-100 text-blue-700",
  approved: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
  cancelled: "bg-slate-100 text-slate-600",
  completed: "bg-slate-100 text-slate-600",
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default function AdminOverview() {
  const [metrics, setMetrics] = useState(initialMetrics);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;

    async function loadDashboard() {
      try {
        const supabase = createClient();

        const [
          rooms,
          classes,
          users,
          pending,
          approved,
          schedules,
          latestBookings,
        ] = await Promise.all([
          supabase.from("rooms").select("id", {
            count: "exact",
            head: true,
          }),

          supabase.from("classes").select("id", {
            count: "exact",
            head: true,
          }),

          supabase.from("profiles").select("id", {
            count: "exact",
            head: true,
          }),

          supabase
            .from("bookings")
            .select("id", { count: "exact", head: true })
            .eq("status", "pending"),

          supabase
            .from("bookings")
            .select("id", { count: "exact", head: true })
            .eq("status", "approved"),

          supabase
            .from("room_schedules")
            .select("id", { count: "exact", head: true })
            .eq("status", "active"),

          supabase
            .from("bookings")
            .select(
              "id, title, booking_type, status, starts_at, created_at"
            )
            .order("created_at", { ascending: false })
            .limit(5),
        ]);

        const results = [
          rooms,
          classes,
          users,
          pending,
          approved,
          schedules,
          latestBookings,
        ];

        const failed = results.find((result) => result.error);

        if (failed?.error) {
          throw failed.error;
        }

        if (!mounted) return;

        setMetrics({
          rooms: rooms.count ?? 0,
          classes: classes.count ?? 0,
          users: users.count ?? 0,
          pending: pending.count ?? 0,
          approved: approved.count ?? 0,
          schedules: schedules.count ?? 0,
        });

        setBookings((latestBookings.data ?? []) as Booking[]);
      } catch (err) {
        console.error("Dashboard query:", err);

        if (mounted) {
          setError(getErrorMessage(err, "Gagal mengambil data dashboard dari Supabase."));
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    loadDashboard();

    return () => {
      mounted = false;
    };
  }, []);

  const cards = [
    { label: "Total Ruangan", value: metrics.rooms, href: "/dashboard/admin/rooms" },
    { label: "Total Kelas", value: metrics.classes, href: "/dashboard/admin/classes" },
    { label: "Total Pengguna", value: metrics.users, href: "/dashboard/admin/users" },
    { label: "Pengajuan Pending", value: metrics.pending, href: "/dashboard/admin/bookings" },
    { label: "Booking Disetujui", value: metrics.approved, href: "/dashboard/admin/bookings" },
    { label: "Jadwal Aktif", value: metrics.schedules },
  ];

  return (
    <div className="space-y-8">
      <section>
        <h1 className="text-2xl font-bold text-slate-900">
          Dashboard
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Ringkasan pengelolaan ruangan dan peminjaman SIRAKA.
        </p>
      </section>

      {error && (
        <div className="flex items-center justify-between rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
          <button
            onClick={() => window.location.reload()}
            className="font-semibold underline"
          >
            Muat ulang
          </button>
        </div>
      )}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map((card) => {
          const content = (
            <>
              <p className="text-sm text-slate-500">{card.label}</p>
              <p className="mt-3 text-3xl font-bold text-slate-900">
                {loading ? "..." : card.value}
              </p>
            </>
          );

          return card.href ? (
            <Link
              href={card.href}
              key={card.label}
              className="rounded-xl border bg-white p-5 transition hover:border-slate-400"
            >
              {content}
            </Link>
          ) : (
            <div key={card.label} className="rounded-xl border bg-white p-5">
              {content}
            </div>
          );
        })}
      </section>

      <section className="rounded-xl border bg-white">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <div>
            <h2 className="font-semibold text-slate-900">
              Pengajuan Terbaru
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Lima pengajuan peminjaman terakhir.
            </p>
          </div>

          <Link
            href="/dashboard/admin/bookings"
            className="text-sm font-medium text-blue-700 hover:underline"
          >
            Lihat semua
          </Link>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-5 py-3 font-medium">Pengajuan</th>
                <th className="px-5 py-3 font-medium">Jenis</th>
                <th className="px-5 py-3 font-medium">Waktu Penggunaan</th>
                <th className="px-5 py-3 font-medium">Status</th>
              </tr>
            </thead>

            <tbody className="divide-y">
              {loading ? (
                <tr>
                  <td colSpan={4} className="px-5 py-8 text-center text-slate-400">
                    Memuat data...
                  </td>
                </tr>
              ) : bookings.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-5 py-8 text-center text-slate-400">
                    Belum ada pengajuan peminjaman.
                  </td>
                </tr>
              ) : (
                bookings.map((booking) => (
                  <tr key={booking.id}>
                    <td className="px-5 py-4 font-medium text-slate-800">
                      {booking.title}
                    </td>

                    <td className="whitespace-nowrap px-5 py-4 text-slate-600">
                      {bookingTypeLabels[booking.booking_type] ?? booking.booking_type}
                    </td>

                    <td className="whitespace-nowrap px-5 py-4 text-slate-600">
                      {formatDate(booking.starts_at)}
                    </td>

                    <td className="px-5 py-4">
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-medium ${
                          statusClasses[booking.status] ??
                          "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {booking.status}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
