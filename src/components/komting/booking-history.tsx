"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getErrorMessage } from "@/lib/errors";
import { useCurrentTime } from "@/lib/hooks/use-current-time";
import { createClient } from "@/lib/supabase/client";

type BookingStatus =
  | "pending"
  | "under_review"
  | "approved"
  | "rejected"
  | "cancelled"
  | "completed";

type BookingType = "instant" | "regular" | "krs_priority";

type BookingRow = {
  id: string;
  room_id: string;
  booking_type: BookingType;
  title: string;
  purpose: string;
  activity_type: string | null;
  participant_count: number | null;
  starts_at: string;
  ends_at: string;
  actual_ended_at: string | null;
  status: BookingStatus;
  rejection_reason: string | null;
  cancellation_reason: string | null;
  created_at: string;
};

type RoomSummary = {
  id: string;
  room_code: string;
  room_name: string;
  building: string | null;
  floor: string | null;
};

type BookingWithRoom = BookingRow & { room: RoomSummary | null };

const statusMeta: Record<BookingStatus, { label: string; className: string }> = {
  pending: {
    label: "Menunggu Admin",
    className: "bg-amber-50 text-amber-700 ring-amber-200",
  },
  under_review: {
    label: "Sedang Ditinjau",
    className: "bg-blue-50 text-blue-700 ring-blue-200",
  },
  approved: {
    label: "Disetujui",
    className: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  },
  rejected: {
    label: "Ditolak",
    className: "bg-red-50 text-red-700 ring-red-200",
  },
  cancelled: {
    label: "Dibatalkan",
    className: "bg-slate-100 text-slate-600 ring-slate-200",
  },
  completed: {
    label: "Selesai",
    className: "bg-violet-50 text-violet-700 ring-violet-200",
  },
};

const bookingTypeLabel: Record<BookingType, string> = {
  instant: "Instant",
  regular: "Regular",
  krs_priority: "Prioritas KRS",
};

function formatDateTime(value: string) {
  return `${new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Jakarta",
  }).format(new Date(value))} WIB`;
}

function getBookingErrorMessage(message: string) {
  const normalized = message.toLowerCase();
  if (
    normalized.includes("booking start time has passed") ||
    normalized.includes("booking has expired") ||
    normalized.includes("booking has already ended")
  ) {
    return "Waktu mulai booking sudah lewat atau booking sudah berakhir. Muat ulang untuk melihat status terbaru.";
  }
  if (normalized.includes("booking not found, not active, or cannot be ended early")) {
    return "Booking tidak ditemukan, belum dimulai, atau sudah tidak aktif. Muat ulang untuk melihat status terbaru.";
  }
  if (normalized.includes("end_booking_early") || normalized.includes("sudah mulai")) {
    return "Booking tidak dapat dibatalkan. Jika penggunaan sedang berlangsung, gunakan Akhiri Penggunaan Lebih Awal; jika tidak, muat ulang status booking.";
  }
  if (
    normalized.includes("room_reservations_no_overlap") ||
    normalized.includes("conflicting key value") ||
    normalized.includes("exclusion constraint") ||
    normalized.includes("conflicts with an existing reservation") ||
    normalized.includes("booking conflicts")
  ) {
    return "Jadwal booking berbenturan dengan reservasi lain. Muat ulang untuk melihat status terbaru.";
  }
  if (normalized.includes("booking not found or cannot be cancelled")) {
    return "Booking tidak ditemukan atau statusnya tidak dapat dibatalkan.";
  }
  return message || "Permintaan tidak dapat diproses.";
}

export default function BookingHistory() {
  const [bookings, setBookings] = useState<BookingWithRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadBookings = useCallback((signal?: AbortSignal) => {
    const request = async () => {
      const supabase = createClient();
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;
      if (!userData.user) throw new Error("Sesi login tidak ditemukan. Silakan login ulang.");

      const { data: bookingData, error: bookingError } = await supabase
        .from("bookings")
        .select(
          "id, room_id, booking_type, title, purpose, activity_type, participant_count, starts_at, ends_at, actual_ended_at, status, rejection_reason, cancellation_reason, created_at",
        )
        .eq("requester_id", userData.user.id)
        .order("created_at", { ascending: false });

      if (bookingError) throw bookingError;

      const rows = (bookingData ?? []) as BookingRow[];
      const roomIds = [...new Set(rows.map((booking) => booking.room_id))];
      let roomMap = new Map<string, RoomSummary>();

      if (roomIds.length > 0) {
        const { data: roomData, error: roomError } = await supabase
          .from("rooms")
          .select("id, room_code, room_name, building, floor")
          .in("id", roomIds);

        if (roomError) throw roomError;
        roomMap = new Map(
          ((roomData ?? []) as RoomSummary[]).map((room) => [room.id, room]),
        );
      }

      if (signal?.aborted) return;
      setBookings(
        rows.map((booking) => ({
          ...booking,
          room: roomMap.get(booking.room_id) ?? null,
        })),
      );
    };
    return request().catch((err: unknown) => {
      console.error("Load Komting bookings:", err);
      if (!signal?.aborted) {
        setError(getBookingErrorMessage(getErrorMessage(err, "Gagal memuat data booking.")));
      }
    }).finally(() => {
      if (!signal?.aborted) {
        setLoading(false);
        setRefreshing(false);
      }
    });
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void loadBookings(controller.signal);
    return () => controller.abort();
  }, [loadBookings]);

  const counts = useMemo(() => {
    return {
      total: bookings.length,
      pending: bookings.filter((item) => item.status === "pending" || item.status === "under_review").length,
      approved: bookings.filter((item) => item.status === "approved").length,
      finished: bookings.filter((item) => item.status === "completed").length,
    };
  }, [bookings]);

  async function handleCancel(booking: BookingWithRoom) {
    const reason = window.prompt("Alasan pembatalan (opsional):", "");
    if (reason === null) return;

    const confirmed = window.confirm(
      `Batalkan booking \"${booking.title}\"? ${booking.room?.room_code ?? ""}`,
    );
    if (!confirmed) return;

    setBusyId(booking.id);
    setError("");
    setNotice("");

    try {
      const supabase = createClient();
      const { error: cancelError } = await supabase.rpc("cancel_booking", {
        p_booking_id: booking.id,
        p_reason: reason.trim() || null,
      });
      if (cancelError) throw cancelError;

      setNotice("Booking berhasil dibatalkan. Reservasi ruangan sudah dilepas.");
      setRefreshing(true);
      await loadBookings();
    } catch (err) {
      console.error("Cancel booking:", err);
      setError(
        getBookingErrorMessage(getErrorMessage(err, "Gagal membatalkan booking.")),
      );
    } finally {
      setBusyId(null);
    }
  }

  async function handleEndEarly(booking: BookingWithRoom) {
    const confirmed = window.confirm(
      `Akhiri penggunaan ruangan \"${booking.room?.room_code ?? ""}\" sekarang? Waktu selesai aktual akan dicatat oleh server.`,
    );
    if (!confirmed) return;

    setBusyId(booking.id);
    setError("");
    setNotice("");

    try {
      const supabase = createClient();
      const { error: endError } = await supabase.rpc("end_booking_early", {
        p_booking_id: booking.id,
      });
      if (endError) throw endError;

      setNotice("Penggunaan berhasil diakhiri. Sisa waktu ruangan sudah dilepas.");
      setRefreshing(true);
      await loadBookings();
    } catch (err) {
      console.error("End booking early:", err);
      setError(getBookingErrorMessage(getErrorMessage(err, "Gagal mengakhiri penggunaan ruangan.")));
    } finally {
      setBusyId(null);
    }
  }

  const now = useCurrentTime();

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-medium text-slate-500">Komting</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">Status Booking</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-500">
            Pantau pengajuan ruangan, lihat keputusan Admin, atau batalkan booking jika jadwal kelas berubah.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
                          setRefreshing(true);
                          setError("");
                          void loadBookings();
                        }}
            disabled={loading || refreshing}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {refreshing ? "Memuat..." : "Muat Ulang"}
          </button>
          <Link
            href="/dashboard/komting/bookings/new"
            className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-700"
          >
            Ajukan Booking
          </Link>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Total Pengajuan", value: counts.total },
          { label: "Menunggu Proses", value: counts.pending },
          { label: "Disetujui", value: counts.approved },
          { label: "Selesai", value: counts.finished },
        ].map((item) => (
          <div key={item.label} className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-sm text-slate-500">{item.label}</p>
            <p className="mt-2 text-2xl font-bold tabular-nums text-slate-900">
              {loading ? "-" : item.value}
            </p>
          </div>
        ))}
      </div>

      {error && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {getBookingErrorMessage(error)}
        </div>
      )}
      {notice && (
        <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          {notice}
        </div>
      )}

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="font-semibold text-slate-900">Riwayat Pengajuan</h2>
          <p className="mt-1 text-xs text-slate-500">
            Data diperbarui saat halaman dibuka atau tombol Muat Ulang ditekan. Tidak ada polling berkala.
          </p>
        </div>

        {loading ? (
          <div className="p-10 text-center text-sm text-slate-500">Memuat booking...</div>
        ) : bookings.length === 0 ? (
          <div className="p-10 text-center">
            <p className="font-semibold text-slate-800">Belum ada booking.</p>
            <p className="mt-1 text-sm text-slate-500">Pengajuan ruangan yang kamu buat akan muncul di sini.</p>
            <Link href="/dashboard/komting/bookings/new" className="mt-4 inline-flex rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-700">
              Buat Booking Pertama
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {bookings.map((booking) => {
              const status = statusMeta[booking.status];
              const startsMs = new Date(booking.starts_at).getTime();
              const endsMs = new Date(booking.ends_at).getTime();
              const canCancel =
                now !== null && (
                  booking.status === "pending" ||
                  booking.status === "under_review" ||
                  (booking.status === "approved" && startsMs > now)
                );
              const canEndEarly =
                now !== null && booking.status === "approved" && startsMs <= now && endsMs > now;

              return (
                <article key={booking.id} className="p-5 sm:p-6">
                  <div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-start">
                    <div className="min-w-0 flex-1 space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-base font-semibold text-slate-900">{booking.title}</h3>
                        <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${status.className}`}>
                          {status.label}
                        </span>
                        <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                          {bookingTypeLabel[booking.booking_type]}
                        </span>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                        <div>
                          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Ruangan</p>
                          <p className="mt-1 text-sm font-semibold text-slate-800">
                            {booking.room?.room_code ?? "Detail ruangan tidak tersedia"}
                            {booking.room?.room_name ? ` - ${booking.room.room_name}` : ""}
                          </p>
                          <p className="mt-0.5 text-xs text-slate-500">
                            {booking.room
                                                          ? [booking.room.building, booking.room.floor ? `Lantai ${booking.room.floor}` : null].filter(Boolean).join(" · ")
                                                          : "Ruangan mungkin nonaktif atau tidak dapat diakses oleh akun ini."}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Waktu Penggunaan</p>
                          <p className="mt-1 text-sm text-slate-700">{formatDateTime(booking.starts_at)}</p>
                          <p className="text-sm text-slate-700">s.d. {formatDateTime(booking.ends_at)}</p>
                        </div>
                        <div>
                          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Detail</p>
                          <p className="mt-1 text-sm text-slate-700">
                            {booking.participant_count ?? "-"} peserta
                            {booking.activity_type ? ` · ${booking.activity_type.replaceAll("_", " ")}` : ""}
                          </p>
                          <p className="text-xs text-slate-500">Diajukan {formatDateTime(booking.created_at)}</p>
                        </div>
                      </div>

                      {booking.purpose && <p className="text-sm leading-6 text-slate-600">{booking.purpose}</p>}
                      {booking.rejection_reason && (
                        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                          <span className="font-semibold">Alasan ditolak: </span>{booking.rejection_reason}
                        </p>
                      )}
                      {booking.cancellation_reason && (
                        <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
                          <span className="font-semibold">Alasan pembatalan: </span>{booking.cancellation_reason}
                        </p>
                      )}
                      {booking.actual_ended_at && (
                        <p className="text-xs text-slate-500">Selesai aktual: {formatDateTime(booking.actual_ended_at)}</p>
                      )}
                    </div>

                    {(canCancel || canEndEarly) && (
                      <div className="flex shrink-0 flex-col gap-2 sm:flex-row xl:w-52 xl:flex-col">
                        {canCancel && (
                          <button
                            type="button"
                            onClick={() => void handleCancel(booking)}
                            disabled={busyId !== null}
                            className="rounded-lg border border-red-200 px-4 py-2.5 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
                          >
                            {busyId === booking.id ? "Memproses..." : "Batalkan Booking"}
                          </button>
                        )}
                        {canEndEarly && (
                          <button
                            type="button"
                            onClick={() => void handleEndEarly(booking)}
                            disabled={busyId !== null}
                            className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
                          >
                            {busyId === booking.id ? "Memproses..." : "Akhiri Lebih Awal"}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
