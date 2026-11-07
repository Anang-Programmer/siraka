"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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

type Room = {
  id: string;
  room_code: string;
  room_name: string;
  building: string | null;
  floor: string | null;
};

type Booking = BookingRow & {
  room: Room | null;
};

type StatusFilter = "semua" | BookingStatus;

const statusConfig: Record<
  BookingStatus,
  { label: string; color: string; dot: string }
> = {
  pending: {
    label: "Menunggu Admin",
    color: "bg-amber-50 text-amber-800",
    dot: "bg-amber-500",
  },
  under_review: {
    label: "Sedang Ditinjau",
    color: "bg-sky-50 text-sky-700",
    dot: "bg-sky-500",
  },
  approved: {
    label: "Disetujui",
    color: "bg-emerald-50 text-emerald-700",
    dot: "bg-emerald-500",
  },
  rejected: {
    label: "Ditolak",
    color: "bg-red-50 text-red-700",
    dot: "bg-red-500",
  },
  cancelled: {
    label: "Dibatalkan",
    color: "bg-slate-100 text-slate-600",
    dot: "bg-slate-400",
  },
  completed: {
    label: "Selesai",
    color: "bg-violet-50 text-violet-700",
    dot: "bg-violet-500",
  },
};

const bookingTypeLabel: Record<BookingType, string> = {
  instant: "Instant",
  regular: "Regular",
  krs_priority: "Prioritas KRS",
};

const filterOptions: {
  value: StatusFilter;
  label: string;
}[] = [
  { value: "semua", label: "Semua" },
  { value: "pending", label: "Menunggu" },
  { value: "under_review", label: "Ditinjau" },
  { value: "approved", label: "Disetujui" },
  { value: "completed", label: "Selesai" },
  { value: "rejected", label: "Ditolak" },
  { value: "cancelled", label: "Dibatalkan" },
];

function CalendarIcon({
  className = "h-5 w-5",
}: {
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <rect x="3" y="5" width="18" height="16" rx="3" />
      <path d="M7 3v4M17 3v4M3 11h18M8 15h2M14 15h2" />
    </svg>
  );
}

function formatDateTime(value: string) {
  return (
    new Intl.DateTimeFormat("id-ID", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Asia/Jakarta",
    }).format(new Date(value)) + " WIB"
  );
}

function bookingError(message: string) {
  const text = message.toLowerCase();

  if (
    text.includes("booking start time has passed") ||
    text.includes("booking has expired") ||
    text.includes("booking has already ended")
  ) {
    return "Waktu booking sudah lewat atau penggunaan sudah berakhir. Muat ulang untuk melihat status terbaru.";
  }

  if (
    text.includes(
      "booking not found, not active, or cannot be ended early",
    )
  ) {
    return "Booking belum dimulai atau sudah tidak aktif. Muat ulang untuk melihat status terbaru.";
  }

  if (
    text.includes("end_booking_early") ||
    text.includes("sudah mulai")
  ) {
    return "Booking sudah dimulai. Gunakan Akhiri Lebih Awal jika penggunaan sedang berlangsung.";
  }

  if (
    text.includes("room_reservations_no_overlap") ||
    text.includes("conflicting key value") ||
    text.includes("exclusion constraint") ||
    text.includes("conflicts with an existing reservation") ||
    text.includes("booking conflicts")
  ) {
    return "Jadwal berbenturan dengan reservasi lain. Muat ulang untuk melihat status terbaru.";
  }

  if (
    text.includes("booking not found or cannot be cancelled")
  ) {
    return "Booking tidak ditemukan atau tidak dapat dibatalkan pada status saat ini.";
  }

  return message || "Permintaan belum dapat diproses.";
}

export default function BookingHistory() {
  const now = useCurrentTime();

  const controllerRef = useRef<AbortController | null>(null);
  const mutationLock = useRef(false);

  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] =
    useState<StatusFilter>("semua");

    const loadBookings = useCallback(() => {
    controllerRef.current?.abort();

    const controller = new AbortController();
    controllerRef.current = controller;

    const { signal } = controller;

    const fetchBookings = async () => {
      const supabase = createClient();

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (signal.aborted) return;
      if (userError) throw userError;

      if (!user) {
        throw new Error(
          "Sesi login tidak ditemukan. Silakan login ulang.",
        );
      }

      const { data, error: queryError } = await supabase
        .from("bookings")
        .select(
          "id, room_id, booking_type, title, purpose, activity_type, participant_count, starts_at, ends_at, actual_ended_at, status, rejection_reason, cancellation_reason, created_at",
        )
        .eq("requester_id", user.id)
        .order("created_at", { ascending: false });

      if (signal.aborted) return;
      if (queryError) throw queryError;

      const rows = (data ?? []) as BookingRow[];

      const roomIds = [
        ...new Set(rows.map((booking) => booking.room_id)),
      ];

      const roomMap = new Map<string, Room>();

      if (roomIds.length > 0) {
        const { data: roomData, error: roomError } =
          await supabase
            .from("rooms")
            .select("id, room_code, room_name, building, floor")
            .in("id", roomIds);

        if (signal.aborted) return;
        if (roomError) throw roomError;

        for (const room of (roomData ?? []) as Room[]) {
          roomMap.set(room.id, room);
        }
      }

      if (signal.aborted) return;

      return rows.map((booking) => ({
        ...booking,
        room: roomMap.get(booking.room_id) ?? null,
      }));
    };

    return fetchBookings()
      .then((result) => {
        if (signal.aborted || !result) return;

        setBookings(result);
        setLoadError("");
      })
      .catch((err: unknown) => {
        if (signal.aborted) return;

        console.error("Load bookings:", err);

        setLoadError(
          bookingError(
            getErrorMessage(err, "Gagal memuat data booking."),
          ),
        );
      })
      .finally(() => {
        if (!signal.aborted) {
          setLoading(false);
        }
      });
  }, []);

  function refreshBookings() {
    setLoading(true);
    setLoadError("");

    return loadBookings();
  }

  useEffect(() => {
    void loadBookings();

    return () => {
      controllerRef.current?.abort();
    };
  }, [loadBookings]);

  const ready = !loading && !loadError;

  const filteredBookings = useMemo(() => {
    const keyword = search.trim().toLocaleLowerCase("id");

    return bookings.filter((booking) => {
      const matchesStatus =
        statusFilter === "semua" ||
        booking.status === statusFilter;

      const text = [
        booking.title,
        booking.purpose,
        booking.activity_type,
        booking.room?.room_code,
        booking.room?.room_name,
        booking.room?.building,
      ]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase("id");

      return (
        matchesStatus &&
        (!keyword || text.includes(keyword))
      );
    });
  }, [bookings, search, statusFilter]);

  const stats = [
    {
      label: "Total Pengajuan",
      value: bookings.length,
      color: "bg-slate-100 text-primary",
    },
    {
      label: "Menunggu Proses",
      value: bookings.filter(
        (booking) =>
          booking.status === "pending" ||
          booking.status === "under_review",
      ).length,
      color: "bg-amber-50 text-amber-800",
    },
    {
      label: "Disetujui",
      value: bookings.filter(
        (booking) => booking.status === "approved",
      ).length,
      color: "bg-emerald-50 text-emerald-700",
    },
    {
      label: "Selesai",
      value: bookings.filter(
        (booking) => booking.status === "completed",
      ).length,
      color: "bg-violet-50 text-violet-700",
    },
  ];

  async function handleCancel(booking: Booking) {
    if (mutationLock.current || !ready) return;

    const reason = window.prompt(
      "Alasan pembatalan (opsional):",
      "",
    );

    if (reason === null) return;

    const confirmed = window.confirm(
      `Batalkan booking "${booking.title}"?`,
    );

    if (!confirmed) return;

    mutationLock.current = true;
    setBusyId(booking.id);
    setActionError("");
    setNotice("");

    try {
      const supabase = createClient();

      const { error } = await supabase.rpc("cancel_booking", {
        p_booking_id: booking.id,
        p_reason: reason.trim() || null,
      });

      if (error) throw error;

      setNotice(
        "Booking berhasil dibatalkan. Reservasi ruangan sudah dilepas.",
      );

      await refreshBookings();
    } catch (err) {
      console.error("Cancel booking:", err);

      setActionError(
        bookingError(
          getErrorMessage(err, "Gagal membatalkan booking."),
        ),
      );
    } finally {
      mutationLock.current = false;
      setBusyId(null);
    }
  }

  async function handleEndEarly(booking: Booking) {
    if (mutationLock.current || !ready) return;

    const confirmed = window.confirm(
      `Akhiri penggunaan "${booking.title}" sekarang? Waktu selesai aktual akan dicatat oleh server.`,
    );

    if (!confirmed) return;

    mutationLock.current = true;
    setBusyId(booking.id);
    setActionError("");
    setNotice("");

    try {
      const supabase = createClient();

      const { error } = await supabase.rpc(
        "end_booking_early",
        {
          p_booking_id: booking.id,
        },
      );

      if (error) throw error;

      setNotice(
        "Penggunaan berhasil diakhiri. Sisa waktu ruangan sudah dilepas.",
      );

      await loadBookings();
    } catch (err) {
      console.error("End booking early:", err);

      setActionError(
        bookingError(
          getErrorMessage(
            err,
            "Gagal mengakhiri penggunaan ruangan.",
          ),
        ),
      );
    } finally {
      mutationLock.current = false;
      setBusyId(null);
    }
  }

  function resetFilters() {
    setSearch("");
    setStatusFilter("semua");
  }

  return (
    <div className="space-y-7">
      <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted">
            Workspace / Reservasi Ruangan
          </p>

          <h1 className="mt-2 font-heading text-2xl font-extrabold text-primary sm:text-3xl">
            Status Booking
          </h1>

          <p className="mt-2 text-sm leading-7 text-muted">
            Pantau pengajuan, keputusan Admin, dan penggunaan
            ruangan kelasmu.
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void refreshBookings()}
            disabled={loading || busyId !== null}
            className="btn-outline rounded-xl text-xs shadow-sm"
          >
            {loading ? "Memuat..." : "↻ Muat Ulang"}
          </button>

          <Link
            href="/dashboard/komting/bookings/new"
            className="btn-primary rounded-xl text-xs"
          >
            Ajukan Booking
            <span aria-hidden="true">+</span>
          </Link>
        </div>
      </section>

      <section
        aria-label="Ringkasan booking"
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="rounded-3xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-200/20"
          >
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-xs font-semibold text-muted">
                {stat.label}
              </h2>

              <span className={`rounded-xl p-2 ${stat.color}`}>
                <CalendarIcon className="h-4 w-4" />
              </span>
            </div>

            <p className="mt-4 font-heading text-4xl font-extrabold text-primary">
              {ready ? stat.value : "—"}
            </p>
          </div>
        ))}
      </section>

      {loadError && (
        <p
          role="alert"
          className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm leading-7 text-red-700"
        >
          {loadError}
        </p>
      )}

      {actionError && (
        <p
          role="alert"
          className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm leading-7 text-red-700"
        >
          {actionError}
        </p>
      )}

      {notice && (
        <div
          role="status"
          className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm leading-7 text-emerald-700"
        >
          <p>{notice}</p>

          {loadError && (
            <p className="mt-2">
              Aksi berhasil, tetapi daftar terbaru belum dapat
              dimuat. Tekan Muat Ulang.
            </p>
          )}
        </div>
      )}

      <section className="space-y-5 rounded-3xl border border-slate-200/80 bg-white p-5 sm:p-6">
        <div>
          <label
            htmlFor="booking-search"
            className="mb-3 block text-xs font-bold text-primary"
          >
            Cari booking
          </label>

          <input
            id="booking-search"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Cari kegiatan, kode ruangan, atau gedung..."
            className="input-field min-h-11 rounded-xl"
          />
        </div>

        <fieldset className="min-w-0">
          <legend className="mb-3 text-xs font-bold text-primary">
            Status pengajuan
          </legend>

          <div className="flex w-fit max-w-full flex-wrap gap-1 rounded-2xl bg-slate-100 p-1">
            {filterOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={statusFilter === option.value}
                onClick={() => setStatusFilter(option.value)}
                className={`min-h-10 rounded-xl px-3 py-2 text-[11px] font-semibold transition focus-visible:outline-2 focus-visible:outline-primary ${
                  statusFilter === option.value
                    ? "bg-white text-primary shadow-sm"
                    : "text-muted hover:bg-white/70 hover:text-primary"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </fieldset>

        {(search || statusFilter !== "semua") && (
          <button
            type="button"
            onClick={resetFilters}
            className="rounded-md text-xs font-bold text-primary hover:underline focus-visible:outline-2 focus-visible:outline-primary"
          >
            Reset filter
          </button>
        )}
      </section>

      <section className="space-y-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span
              aria-hidden="true"
              className="h-6 w-1 rounded-full bg-secondary"
            />

            <h2 className="font-heading text-lg font-extrabold text-primary">
              Riwayat Pengajuan
            </h2>
          </div>

          {ready && (
            <span
              role="status"
              className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-muted"
            >
              {filteredBookings.length} booking
            </span>
          )}
        </div>

        {loading ? (
          <div
            role="status"
            className="rounded-3xl border border-slate-200 bg-white p-12 text-center"
          >
            <div
              aria-hidden="true"
              className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-slate-100 border-t-primary"
            />

            <p className="mt-4 text-sm text-muted">
              Memuat data booking...
            </p>
          </div>
        ) : loadError ? (
          <p className="rounded-3xl border border-slate-200 bg-white p-10 text-center text-sm text-muted">
            Daftar belum dapat dimuat. Silakan tekan Muat Ulang.
          </p>
        ) : filteredBookings.length === 0 ? (
          <div className="rounded-3xl border border-slate-200 bg-white p-12 text-center">
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-primary">
              <CalendarIcon className="h-7 w-7" />
            </span>

            <h3 className="mt-4 text-sm font-bold text-primary">
              {bookings.length === 0
                ? "Belum ada booking"
                : "Booking tidak ditemukan"}
            </h3>

            <p className="mt-2 text-xs leading-6 text-muted">
              {bookings.length === 0
                ? "Pengajuan ruangan yang kamu buat akan muncul di sini."
                : "Coba ubah kata kunci atau filter status."}
            </p>

            {bookings.length === 0 ? (
              <Link
                href="/dashboard/komting/bookings/new"
                className="btn-primary mt-5 rounded-xl text-xs"
              >
                Buat Booking Pertama
              </Link>
            ) : (
              <button
                type="button"
                onClick={resetFilters}
                className="btn-outline mt-5 rounded-xl text-xs"
              >
                Reset Filter
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {filteredBookings.map((booking) => {
              const status = statusConfig[booking.status];

              const startsAt = Date.parse(booking.starts_at);
              const endsAt = Date.parse(booking.ends_at);

              const canCancel =
                now !== null &&
                (
                  booking.status === "pending" ||
                  booking.status === "under_review" ||
                  booking.status === "approved"
                ) &&
                startsAt > now &&
                !booking.actual_ended_at;

              const canEndEarly =
                now !== null &&
                booking.status === "approved" &&
                startsAt <= now &&
                endsAt > now &&
                !booking.actual_ended_at;

              return (
                <article
                  key={booking.id}
                  className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-sm shadow-slate-200/20"
                >
                  <div className="flex flex-col justify-between gap-4 border-b border-slate-100 p-5 sm:flex-row sm:items-start sm:p-6">
                    <div className="flex min-w-0 items-start gap-3">
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-primary">
                        <CalendarIcon />
                      </span>

                      <div className="min-w-0">
                        <h3 className="break-words font-heading text-base font-extrabold text-primary">
                          {booking.title}
                        </h3>

                        <p className="mt-2 text-[10px] leading-6 text-muted">
                          Diajukan{" "}
                          {formatDateTime(booking.created_at)}
                        </p>
                      </div>
                    </div>

                    <div className="flex shrink-0 flex-wrap gap-2">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[10px] font-semibold ${status.color}`}
                      >
                        <span
                          aria-hidden="true"
                          className={`h-1.5 w-1.5 rounded-full ${status.dot}`}
                        />

                        {status.label}
                      </span>

                      <span className="rounded-full border border-slate-200 px-3 py-1.5 text-[10px] font-semibold text-muted">
                        {bookingTypeLabel[booking.booking_type]}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-5 p-5 sm:p-6">
                    <dl className="grid gap-5 md:grid-cols-3">
                      <div>
                        <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted">
                          Ruangan
                        </dt>

                        <dd className="mt-2 text-sm font-bold leading-6 text-primary">
                          {booking.room
                            ? `${booking.room.room_code} · ${booking.room.room_name}`
                            : "Detail ruangan tidak tersedia"}
                        </dd>

                        <dd className="mt-2 text-xs leading-6 text-muted">
                          {booking.room
                            ? [
                                booking.room.building,
                                booking.room.floor
                                  ? `Lantai ${booking.room.floor}`
                                  : null,
                              ]
                                .filter(Boolean)
                                .join(" · ") ||
                              "Lokasi belum diisi"
                            : "Ruangan mungkin nonaktif atau tidak dapat diakses."}
                        </dd>
                      </div>

                      <div>
                        <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted">
                          Waktu Penggunaan
                        </dt>

                        <dd className="mt-2 text-xs font-semibold leading-6 text-primary">
                          {formatDateTime(booking.starts_at)}
                        </dd>

                        <dd className="mt-1 text-xs leading-6 text-muted">
                          s.d. {formatDateTime(booking.ends_at)}
                        </dd>
                      </div>

                      <div>
                        <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted">
                          Peserta &amp; Kegiatan
                        </dt>

                        <dd className="mt-2 text-sm font-bold text-primary">
                          {booking.participant_count !== null
                            ? `${booking.participant_count} peserta`
                            : "Jumlah belum tersedia"}
                        </dd>

                        <dd className="mt-2 text-xs capitalize leading-6 text-muted">
                          {booking.activity_type?.replace(
                            /_/g,
                            " ",
                          ) || "Kegiatan kelas"}
                        </dd>
                      </div>
                    </dl>

                    {booking.purpose && (
                      <div className="border-t border-slate-100 pt-4">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">
                          Tujuan Penggunaan
                        </p>

                        <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-7 text-muted">
                          {booking.purpose}
                        </p>
                      </div>
                    )}

                    {canEndEarly && (
                      <p className="rounded-xl bg-emerald-50 px-4 py-3 text-xs font-semibold leading-6 text-emerald-700">
                        Penggunaan sedang berlangsung.
                      </p>
                    )}

                    {booking.rejection_reason && (
                      <div className="rounded-xl border border-red-200 p-4">
                        <p className="text-xs font-bold text-red-700">
                          Alasan Penolakan
                        </p>

                        <p className="mt-2 whitespace-pre-wrap break-words text-xs leading-7 text-muted">
                          {booking.rejection_reason}
                        </p>
                      </div>
                    )}

                    {booking.cancellation_reason && (
                      <div className="rounded-xl border border-slate-200 p-4">
                        <p className="text-xs font-bold text-primary">
                          Alasan Pembatalan
                        </p>

                        <p className="mt-2 whitespace-pre-wrap break-words text-xs leading-7 text-muted">
                          {booking.cancellation_reason}
                        </p>
                      </div>
                    )}

                    {booking.actual_ended_at && (
                      <p className="text-xs leading-6 text-muted">
                        Selesai aktual:{" "}
                        <span className="font-semibold text-primary">
                          {formatDateTime(
                            booking.actual_ended_at,
                          )}
                        </span>
                      </p>
                    )}

                    {(canCancel || canEndEarly) && (
                      <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
                        {canCancel && (
                          <button
                            type="button"
                            onClick={() =>
                              void handleCancel(booking)
                            }
                            disabled={
                              busyId !== null || loading
                            }
                            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-red-200 px-4 py-2 text-xs font-semibold text-red-700 transition hover:bg-red-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {busyId === booking.id
                              ? "Memproses..."
                              : "Batalkan Booking"}
                          </button>
                        )}

                        {canEndEarly && (
                          <button
                            type="button"
                            onClick={() =>
                              void handleEndEarly(booking)
                            }
                            disabled={
                              busyId !== null || loading
                            }
                            className="btn-primary rounded-xl text-xs"
                          >
                            {busyId === booking.id
                              ? "Memproses..."
                              : "Akhiri Lebih Awal"}
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

      <p className="text-[11px] leading-7 text-muted">
        Data diperbarui ketika halaman dibuka, tombol Muat Ulang
        ditekan, atau aksi berhasil diproses. Indikator penggunaan
        mengikuti jam perangkat dalam zona WIB. Server tetap
        menentukan apakah pembatalan atau pengakhiran penggunaan
        dapat dilakukan.
      </p>
    </div>
  );
}