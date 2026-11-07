
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getErrorMessage } from "@/lib/errors";
import { useCurrentTime } from "@/lib/hooks/use-current-time";

type BookingStatus =
  | "pending"
  | "under_review"
  | "approved"
  | "rejected"
  | "cancelled"
  | "completed";

type BookingType = "krs_priority" | "regular" | "instant";

type Booking = {
  id: string;
  requester_id: string;
  class_id: string;
  room_id: string;
  booking_type: BookingType;
  title: string;
  purpose: string;
  activity_type: string | null;
  participant_count: number | null;
  starts_at: string;
  ends_at: string;
  status: BookingStatus;
  rejection_reason: string | null;
  created_at: string;
};

type Profile = {
  id: string;
  full_name: string;
  email: string | null;
  student_number: string | null;
};

type Room = {
  id: string;
  room_code: string;
  room_name: string;
  building: string | null;
  is_active: boolean;
  capacity: number;
};

type ClassInfo = {
  id: string;
  class_code: string;
  class_name: string;
};

type KrsInfo = {
  id: string;
  booking_id: string;
  document_path: string;
  reference_code: string | null;
  status: "pending" | "verified" | "rejected";
  notes: string | null;
};

type BookingView = Booking & {
  requester: Profile | null;
  room: Room | null;
  studentClass: ClassInfo | null;
  krs: KrsInfo | null;
};

type StatusFilter = "all" | BookingStatus;

const statusConfig: Record<
  BookingStatus,
  { label: string; style: string }
> = {
  pending: {
    label: "Menunggu",
    style: "bg-amber-50 text-amber-700",
  },
  under_review: {
    label: "Sedang Ditinjau",
    style: "bg-blue-50 text-blue-700",
  },
  approved: {
    label: "Disetujui",
    style: "bg-emerald-50 text-emerald-700",
  },
  rejected: {
    label: "Ditolak",
    style: "bg-rose-50 text-rose-700",
  },
  cancelled: {
    label: "Dibatalkan",
    style: "bg-slate-100 text-slate-600",
  },
  completed: {
    label: "Selesai",
    style: "bg-violet-50 text-violet-700",
  },
};

const bookingTypeLabel: Record<BookingType, string> = {
  krs_priority: "Prioritas KRS",
  regular: "Booking Biasa",
  instant: "Instant Booking",
};

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Jakarta",
  }).format(new Date(value));
}

function getApprovalBlockReason(booking: BookingView, now: number | null): string | null {
  if (now === null) return "Menunggu waktu saat ini sebelum booking dapat disetujui.";

  const startsAt = new Date(booking.starts_at).getTime();
  if (!Number.isFinite(startsAt)) return "Waktu mulai booking tidak valid.";
  if (startsAt <= now) return "Waktu mulai booking sudah lewat. Booking hanya dapat ditolak.";
  if (!booking.room) return "Ruangan tidak ditemukan. Booking tidak dapat disetujui.";
  if (!booking.room.is_active) return "Ruangan sedang nonaktif. Booking tidak dapat disetujui.";
  if (booking.participant_count !== null && booking.participant_count > booking.room.capacity) {
    return `Jumlah peserta (${booking.participant_count}) melebihi kapasitas ruangan (${booking.room.capacity}).`;
  }
  if (booking.booking_type === "krs_priority") {
    if (!booking.krs) return "Dokumen KRS tidak ditemukan. Booking tidak dapat disetujui.";
    if (booking.krs.status === "rejected") return "Dokumen KRS sudah ditolak dan booking tidak dapat disetujui.";
  }
  return null;
}

export default function BookingManagement() {
  const now = useCurrentTime();
  const [bookings, setBookings] = useState<BookingView[]>([]);
  const [filter, setFilter] = useState<StatusFilter>("pending");
  const [search, setSearch] = useState("");

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const loadBookings = useCallback((signal?: AbortSignal) => {
    const request = async () => {
      const supabase = createClient();

      const { data: bookingData, error: bookingError } = await supabase
        .from("bookings")
        .select(
          "id, requester_id, class_id, room_id, booking_type, title, purpose, activity_type, participant_count, starts_at, ends_at, status, rejection_reason, created_at"
        )
        .order("created_at", { ascending: false });

      if (signal?.aborted) return;
      if (bookingError) throw bookingError;

      if (!bookingData?.length) {
        setBookings([]);
        return;
      }

      const requesterIds = [...new Set(bookingData.map((b) => b.requester_id))];
      const roomIds = [...new Set(bookingData.map((b) => b.room_id))];
      const classIds = [...new Set(bookingData.map((b) => b.class_id))];
      const bookingIds = bookingData.map((b) => b.id);

      const [
        { data: profileData, error: profileError },
        { data: roomData, error: roomError },
        { data: classData, error: classError },
        { data: krsData, error: krsError },
      ] = await Promise.all([
        supabase
          .from("profiles")
          .select("id, full_name, email, student_number")
          .in("id", requesterIds),

        supabase
          .from("rooms")
          .select("id, room_code, room_name, building, is_active, capacity")
          .in("id", roomIds),

        supabase
          .from("classes")
          .select("id, class_code, class_name")
          .in("id", classIds),

        supabase
          .from("krs_verifications")
          .select("id, booking_id, document_path, reference_code, status, notes")
          .in("booking_id", bookingIds),
      ]);

      if (signal?.aborted) return;
      if (profileError) throw profileError;
      if (roomError) throw roomError;
      if (classError) throw classError;
      if (krsError) throw krsError;

      const profileMap = new Map(
        (profileData ?? []).map((item) => [item.id, item as Profile])
      );

      const roomMap = new Map(
        (roomData ?? []).map((item) => [item.id, item as Room])
      );

      const classMap = new Map(
        (classData ?? []).map((item) => [item.id, item as ClassInfo])
      );

      const krsMap = new Map(
        (krsData ?? []).map((item) => [
          item.booking_id,
          item as KrsInfo,
        ])
      );

      const formatted = bookingData.map((booking) => ({
        ...(booking as Booking),
        requester: profileMap.get(booking.requester_id) ?? null,
        room: roomMap.get(booking.room_id) ?? null,
        studentClass: classMap.get(booking.class_id) ?? null,
        krs: krsMap.get(booking.id) ?? null,
      }));

      setBookings(formatted);
    };

    return request().catch((err: unknown) => {
      if (!signal?.aborted) {
        console.error("Load admin bookings:", err);
        setError(getErrorMessage(err, "Gagal mengambil data booking."));
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

  async function refreshBookings() {
    setRefreshing(true);
    setError("");
    await loadBookings();
  }

  const filteredBookings = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    return bookings.filter((booking) => {
      const matchesStatus =
        filter === "all" || booking.status === filter;

      const searchable = [
        booking.title,
        booking.purpose,
        booking.requester?.full_name,
        booking.requester?.email,
        booking.requester?.student_number,
        booking.room?.room_code,
        booking.room?.room_name,
        booking.studentClass?.class_code,
        booking.studentClass?.class_name,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return matchesStatus &&
        (!keyword || searchable.includes(keyword));
    });
  }, [bookings, filter, search]);

  async function openKrsDocument(booking: BookingView) {
    if (!booking.krs?.document_path) {
      setError("Dokumen KRS tidak ditemukan.");
      return;
    }

    const newWindow = window.open("about:blank", "_blank");

    if (!newWindow) {
      setError("Browser memblokir tab baru. Izinkan pop-up lalu coba lagi.");
      return;
    }

    try {
      setError("");

      const supabase = createClient();

      const { data, error: storageError } = await supabase.storage
        .from("krs-documents")
        .createSignedUrl(booking.krs.document_path, 300);

      if (storageError) throw storageError;

      newWindow.location.href = data.signedUrl;
    } catch (err) {
      newWindow.close();

      setError(
        getErrorMessage(err, "Gagal membuka dokumen KRS.")
      );
    }
  }

  async function reviewBooking(
    booking: BookingView,
    decision: "approved" | "rejected"
  ) {
    if (busyId !== null) return;
    if (decision === "approved") {
      const reason = getApprovalBlockReason(booking, now === null ? null : Date.now());
      if (reason) {
        setError(reason);
        return;
      }
    }

    let rejectionReason: string | null = null;
    let krsNote: string | null = null;

    if (decision === "rejected") {
      const reason = window.prompt(
        `Alasan penolakan booking "${booking.title}":`
      );

      if (reason === null) return;

      if (!reason.trim()) {
        setError("Alasan penolakan wajib diisi.");
        return;
      }

      rejectionReason = reason.trim();

      if (!window.confirm("Yakin ingin menolak booking ini?")) return;
    } else {
      if (booking.booking_type === "krs_priority") {
        const note = window.prompt(
          "Catatan verifikasi KRS (opsional):",
          "Dokumen KRS telah diperiksa."
        );

        if (note === null) return;
        krsNote = note.trim() || null;
      }

      if (!window.confirm("Setujui booking ini?")) return;

      // Dialog konfirmasi dapat tetap terbuka hingga waktu mulai terlewati.
      const reason = getApprovalBlockReason(booking, now === null ? null : Date.now());
      if (reason) {
        setError(reason);
        return;
      }
    }

    setBusyId(booking.id);
    setError("");
    setSuccess("");

    try {
      const supabase = createClient();

      const { error: rpcError } = await supabase.rpc(
        "admin_review_booking",
        {
          p_booking_id: booking.id,
          p_decision: decision,
          p_rejection_reason: rejectionReason,
          p_krs_note: krsNote,
        }
      );

      if (rpcError) throw rpcError;

      setSuccess(
        decision === "approved"
          ? `Booking "${booking.title}" berhasil disetujui.`
          : `Booking "${booking.title}" berhasil ditolak.`
      );

      await refreshBookings();
    } catch (err) {
      console.error("Review booking:", err);

      setError(
        getErrorMessage(err, "Gagal memproses booking.")
      );
    } finally {
      setBusyId(null);
    }
  }

  const pendingCount = bookings.filter(
    (item) => item.status === "pending" ||
      item.status === "under_review"
  ).length;

  const approvedCount = bookings.filter(
    (item) => item.status === "approved"
  ).length;

  const krsPendingCount = bookings.filter(
    (item) =>
      item.booking_type === "krs_priority" &&
      item.status === "pending" &&
      item.krs?.status === "pending"
  ).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <section className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-medium text-slate-500">
            Pengelolaan Peminjaman
          </p>

          <h1 className="mt-1 text-2xl font-bold text-slate-900">
            Persetujuan Booking
          </h1>

          <p className="mt-2 text-sm text-slate-500">
            Periksa permohonan penggunaan ruang kelas dan laboratorium dari Komting.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void refreshBookings()}
          disabled={loading || refreshing}
          className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          {refreshing ? "Memuat..." : "Muat Ulang"}
        </button>
      </section>

      {/* Notifications */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {success && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
          {success}
        </div>
      )}

      {/* Summary */}
      <section className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-amber-200 bg-white p-5">
          <p className="text-sm text-slate-500">Menunggu Keputusan</p>
          <p className="mt-2 text-3xl font-bold text-amber-700">
            {loading ? "-" : pendingCount}
          </p>
        </div>

        <div className="rounded-xl border border-blue-200 bg-white p-5">
          <p className="text-sm text-slate-500">Perlu Verifikasi KRS</p>
          <p className="mt-2 text-3xl font-bold text-blue-700">
            {loading ? "-" : krsPendingCount}
          </p>
        </div>

        <div className="rounded-xl border border-emerald-200 bg-white p-5">
          <p className="text-sm text-slate-500">Booking Disetujui</p>
          <p className="mt-2 text-3xl font-bold text-emerald-700">
            {loading ? "-" : approvedCount}
          </p>
        </div>
      </section>

      {/* Filters */}
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="grid gap-4 lg:grid-cols-2">
          <div>
            <label
              htmlFor="booking-search"
              className="mb-2 block text-sm font-semibold text-slate-700"
            >
              Cari Booking
            </label>

            <input
              id="booking-search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Judul, Komting, NIM, ruangan, atau kelas..."
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-slate-500 focus:bg-white"
            />
          </div>

          <div>
            <label
              htmlFor="booking-filter"
              className="mb-2 block text-sm font-semibold text-slate-700"
            >
              Filter Status
            </label>

            <select
              id="booking-filter"
              value={filter}
              onChange={(event) =>
                setFilter(event.target.value as StatusFilter)
              }
              className="w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-slate-500"
            >
              <option value="pending">Menunggu</option>
              <option value="under_review">Sedang Ditinjau</option>
              <option value="approved">Disetujui</option>
              <option value="rejected">Ditolak</option>
              <option value="cancelled">Dibatalkan</option>
              <option value="completed">Selesai</option>
              <option value="all">Semua Status</option>
            </select>
          </div>
        </div>
      </section>

      {/* Booking list */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-slate-900">
              Daftar Pengajuan Booking
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Pengajuan dari Komting seluruh kelas.
            </p>
          </div>

          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
            {loading ? "..." : filteredBookings.length} data
          </span>
        </div>

        {loading ? (
          <div className="rounded-xl border bg-white p-10 text-center text-sm text-slate-500">
            Memuat data booking...
          </div>
        ) : filteredBookings.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-12 text-center">
            <p className="text-3xl">📋</p>
            <h3 className="mt-3 font-semibold text-slate-800">
              Tidak ada booking ditemukan
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              Pengajuan yang sesuai filter akan muncul di sini.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredBookings.map((booking) => {
              const status = statusConfig[booking.status];
              const approvalBlockReason = getApprovalBlockReason(booking, now);
              const canReview =
                booking.status === "pending" ||
                booking.status === "under_review";

              return (
                <article
                  key={booking.id}
                  className="space-y-4 rounded-xl border border-slate-200 bg-white p-5"
                >
                  {/* Title and status */}
                  <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-lg font-bold text-slate-900">
                          {booking.title}
                        </h3>

                        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${status.style}`}>
                          {status.label}
                        </span>
                      </div>

                      <p className="mt-1 text-sm text-slate-500">
                        {bookingTypeLabel[booking.booking_type]}
                        {" · "}
                        Diajukan {formatDateTime(booking.created_at)}
                      </p>
                    </div>

                    <span className="w-fit rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-700">
                      {booking.studentClass?.class_code ?? "Kelas -"}
                    </span>
                  </div>

                  {/* Requester */}
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <p className="text-xs text-slate-400">
                        Pengaju / Komting
                      </p>
                      <p className="mt-1 font-semibold text-slate-800">
                        {booking.requester?.full_name ?? "Pengguna tidak ditemukan"}
                      </p>
                      <p className="text-sm text-slate-500">
                        NIM: {booking.requester?.student_number ?? "-"}
                      </p>
                      <p className="text-sm text-slate-500">
                        {booking.requester?.email ?? "-"}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs text-slate-400">
                        Ruangan
                      </p>
                      <p className="mt-1 font-semibold text-slate-800">
                        {booking.room
                          ? `${booking.room.room_code} - ${booking.room.room_name}`
                          : "Ruangan tidak ditemukan"}
                      </p>
                      <p className="text-sm text-slate-500">
                        {booking.room?.building ?? "Gedung -"}
                      </p>
                    </div>
                  </div>

                  {/* Booking details */}
                  <div className="grid gap-3 rounded-lg bg-slate-50 p-4 sm:grid-cols-2 lg:grid-cols-4">
                    <div>
                      <p className="text-xs text-slate-400">Mulai</p>
                      <p className="mt-1 text-sm font-semibold text-slate-800">
                        {formatDateTime(booking.starts_at)}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs text-slate-400">Selesai</p>
                      <p className="mt-1 text-sm font-semibold text-slate-800">
                        {formatDateTime(booking.ends_at)}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs text-slate-400">Jumlah Peserta</p>
                      <p className="mt-1 text-sm font-semibold text-slate-800">
                        {booking.participant_count ?? "-"}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs text-slate-400">Jenis Kegiatan</p>
                      <p className="mt-1 text-sm font-semibold text-slate-800">
                        {booking.activity_type ?? "-"}
                      </p>
                    </div>
                  </div>

                  <div>
                    <p className="text-xs font-semibold text-slate-400">
                      Tujuan Penggunaan
                    </p>
                    <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                      {booking.purpose}
                    </p>
                  </div>

                  {/* KRS verification */}
                  {booking.booking_type === "krs_priority" && (
                    <div className="rounded-lg border border-blue-100 bg-blue-50 p-4">
                      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                        <div>
                          <p className="font-semibold text-slate-800">
                            Dokumen Prioritas KRS
                          </p>
                          <p className="mt-1 text-sm text-slate-600">
                            Referensi: {booking.krs?.reference_code ?? "-"}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            Status KRS:{" "}
                            {booking.krs?.status === "verified"
                              ? "Terverifikasi"
                              : booking.krs?.status === "rejected"
                                ? "Ditolak"
                                : booking.krs
                                  ? "Menunggu Verifikasi"
                                  : "Dokumen tidak ditemukan"}
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={() => void openKrsDocument(booking)}
                          disabled={!booking.krs?.document_path}
                          className="rounded-lg border border-blue-200 bg-white px-4 py-2.5 text-sm font-semibold text-blue-700 hover:bg-blue-100 disabled:opacity-50"
                        >
                          Lihat Dokumen KRS
                        </button>
                      </div>

                      {booking.krs?.notes && (
                        <p className="mt-3 text-sm text-slate-600">
                          Catatan KRS: {booking.krs.notes}
                        </p>
                      )}
                    </div>
                  )}

                  {booking.rejection_reason && (
                    <div className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">
                      Alasan penolakan: {booking.rejection_reason}
                    </div>
                  )}

                  {canReview && approvalBlockReason && (
                    <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                      {approvalBlockReason}
                    </p>
                  )}

                  {/* Actions */}
                  {canReview && (
                    <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
                      <button
                        type="button"
                        onClick={() => void reviewBooking(booking, "rejected")}
                        disabled={busyId !== null}
                        className="rounded-lg border border-rose-200 px-4 py-2.5 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                      >
                        {busyId === booking.id ? "Memproses..." : "Tolak"}
                      </button>

                      <button
                        type="button"
                        onClick={() => void reviewBooking(booking, "approved")}
                        disabled={busyId !== null || approvalBlockReason !== null}
                        className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {busyId === booking.id
                          ? "Memproses..."
                          : booking.booking_type === "krs_priority"
                            ? "Verifikasi KRS & Setujui"
                            : "Setujui Booking"}
                      </button>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
