"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
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

type ReviewState = {
  bookingId: string;
  decision: "approved" | "rejected";
  rejectionReason: string;
  krsNote: string;
  krsChecked: boolean;
};

const statusConfig: Record<
  BookingStatus,
  { label: string; color: string; dot: string }
> = {
  pending: {
    label: "Menunggu",
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

const typeLabels: Record<BookingType, string> = {
  krs_priority: "Prioritas KRS",
  regular: "Regular",
  instant: "Instant",
};

const filterOptions: {
  value: "all" | BookingStatus;
  label: string;
}[] = [
  { value: "pending", label: "Menunggu" },
  { value: "under_review", label: "Ditinjau" },
  { value: "approved", label: "Disetujui" },
  { value: "rejected", label: "Ditolak" },
  { value: "cancelled", label: "Dibatalkan" },
  { value: "completed", label: "Selesai" },
  { value: "all", label: "Semua" },
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

function dateLabel(value: string) {
  return (
    new Intl.DateTimeFormat("id-ID", {
      timeZone: "Asia/Jakarta",
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value)) + " WIB"
  );
}

function approvalBlock(
  booking: BookingView,
  now: number | null,
): string | null {
  if (now === null) {
    return "Menunggu waktu saat ini.";
  }

  const startsAt = Date.parse(booking.starts_at);
  const endsAt = Date.parse(booking.ends_at);

  if (
    !Number.isFinite(startsAt) ||
    !Number.isFinite(endsAt) ||
    endsAt <= startsAt
  ) {
    return "Waktu penggunaan tidak valid.";
  }

  if (startsAt <= now) {
    return "Waktu mulai sudah lewat. Booking tidak dapat disetujui.";
  }

  if (!booking.room) {
    return "Data ruangan tidak ditemukan.";
  }

  if (!booking.room.is_active) {
    return "Ruangan sedang nonaktif.";
  }

  if (
    booking.participant_count !== null &&
    booking.participant_count > booking.room.capacity
  ) {
    return `Jumlah peserta ${booking.participant_count} melebihi kapasitas ruangan ${booking.room.capacity} orang.`;
  }

  if (booking.booking_type === "krs_priority") {
    if (!booking.krs?.document_path) {
      return "Dokumen KRS tidak ditemukan.";
    }

    if (booking.krs.status === "rejected") {
      return "Dokumen KRS telah ditolak.";
    }
  }

  return null;
}

export default function BookingManagement() {
  const now = useCurrentTime();

  const controllerRef = useRef<AbortController | null>(null);
  const mutationLock = useRef(false);

  const [bookings, setBookings] = useState<BookingView[]>([]);
  const [filter, setFilter] =
    useState<"all" | BookingStatus>("pending");
  const [search, setSearch] = useState("");
  const [review, setReview] = useState<ReviewState | null>(null);

  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [documentBusyId, setDocumentBusyId] = useState<
    string | null
  >(null);

  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [success, setSuccess] = useState("");

  const loadBookings = useCallback(() => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    const { signal } = controller;

    const fetchBookings = async () => {
      const supabase = createClient();

      const { data, error: bookingError } = await supabase
        .from("bookings")
        .select(
          "id, requester_id, class_id, room_id, booking_type, title, purpose, activity_type, participant_count, starts_at, ends_at, status, rejection_reason, created_at",
        )
        .order("created_at", { ascending: false });

      if (signal.aborted) return;
      if (bookingError) throw bookingError;

      const rows = (data ?? []) as Booking[];

      if (rows.length === 0) return [] as BookingView[];

      const requesterIds = [
        ...new Set(rows.map((item) => item.requester_id)),
      ];
      const roomIds = [
        ...new Set(rows.map((item) => item.room_id)),
      ];
      const classIds = [
        ...new Set(rows.map((item) => item.class_id)),
      ];
      const bookingIds = rows.map((item) => item.id);

      const [
        profileResult,
        roomResult,
        classResult,
        krsResult,
      ] = await Promise.all([
        supabase
          .from("profiles")
          .select("id, full_name, email, student_number")
          .in("id", requesterIds),

        supabase
          .from("rooms")
          .select(
            "id, room_code, room_name, building, is_active, capacity",
          )
          .in("id", roomIds),

        supabase
          .from("classes")
          .select("id, class_code, class_name")
          .in("id", classIds),

        supabase
          .from("krs_verifications")
          .select(
            "id, booking_id, document_path, reference_code, status, notes",
          )
          .in("booking_id", bookingIds),
      ]);

      if (signal.aborted) return;
      if (profileResult.error) throw profileResult.error;
      if (roomResult.error) throw roomResult.error;
      if (classResult.error) throw classResult.error;
      if (krsResult.error) throw krsResult.error;

      const profileMap = new Map(
        ((profileResult.data ?? []) as Profile[]).map(
          (item) => [item.id, item],
        ),
      );

      const roomMap = new Map(
        ((roomResult.data ?? []) as Room[]).map(
          (item) => [item.id, item],
        ),
      );

      const classMap = new Map(
        ((classResult.data ?? []) as ClassInfo[]).map(
          (item) => [item.id, item],
        ),
      );

      const krsMap = new Map(
        ((krsResult.data ?? []) as KrsInfo[]).map(
          (item) => [item.booking_id, item],
        ),
      );

      const nextBookings = rows.map((booking) => ({
        ...booking,
        requester: profileMap.get(booking.requester_id) ?? null,
        room: roomMap.get(booking.room_id) ?? null,
        studentClass: classMap.get(booking.class_id) ?? null,
        krs: krsMap.get(booking.id) ?? null,
      }));

      return nextBookings;
    };

    return fetchBookings()
      .then((nextBookings) => {
        if (signal.aborted || !nextBookings) return;
        setBookings(nextBookings);
        setLoadError("");
        setReview((current) =>
          current && nextBookings.some(
            (booking) => booking.id === current.bookingId &&
              (booking.status === "pending" || booking.status === "under_review"),
          ) ? current : null,
        );
      })
      .catch((err: unknown) => {
        if (signal.aborted) return;
        console.error("Load Admin bookings:", err);
        setLoadError(getErrorMessage(err, "Gagal mengambil data booking."));
      })
      .finally(() => {
        if (!signal.aborted) setLoading(false);
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
      const text = [
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
        .toLocaleLowerCase("id");

      return (
        (filter === "all" || booking.status === filter) &&
        (!keyword || text.includes(keyword))
      );
    });
  }, [bookings, filter, search]);

  async function openDocument(booking: BookingView) {
    if (documentBusyId !== null) return;

    if (!booking.krs?.document_path) {
      setActionError("Dokumen KRS tidak ditemukan.");
      return;
    }

    const tab = window.open("about:blank", "_blank");

    if (!tab) {
      setActionError(
        "Browser memblokir tab baru. Izinkan pop-up lalu coba lagi.",
      );
      return;
    }

    tab.opener = null;

    setDocumentBusyId(booking.id);
    setActionError("");

    try {
      const supabase = createClient();

      const { data, error } = await supabase.storage
        .from("krs-documents")
        .createSignedUrl(booking.krs.document_path, 300);

      if (error) throw error;

      if (!data?.signedUrl) {
        throw new Error("Tautan dokumen belum tersedia.");
      }

      if (!tab.closed) {
        tab.location.href = data.signedUrl;
      }
    } catch (err) {
      tab.close();

      setActionError(
        getErrorMessage(err, "Gagal membuka dokumen KRS."),
      );
    } finally {
      setDocumentBusyId(null);
    }
  }

  function openReview(
    booking: BookingView,
    decision: ReviewState["decision"],
  ) {
    if (!ready || mutationLock.current) return;

    setActionError("");
    setSuccess("");

    if (decision === "approved") {
      const reason = approvalBlock(
        booking,
        now === null ? null : Date.now(),
      );

      if (reason) {
        setActionError(reason);
        return;
      }
    }

    setReview({
      bookingId: booking.id,
      decision,
      rejectionReason: "",
      krsNote: "",
      krsChecked: false,
    });
  }

  async function submitReview(
    event: FormEvent<HTMLFormElement>,
    booking: BookingView,
  ) {
    event.preventDefault();

    if (
      !ready ||
      mutationLock.current ||
      !review ||
      review.bookingId !== booking.id ||
      (
        booking.status !== "pending" &&
        booking.status !== "under_review"
      )
    ) {
      return;
    }

    setActionError("");
    setSuccess("");

    const decision = review.decision;
    const rejectionReason = review.rejectionReason.trim();

    if (decision === "rejected" && !rejectionReason) {
      setActionError("Alasan penolakan wajib diisi.");
      return;
    }

    if (decision === "approved") {
      const reason = approvalBlock(booking, Date.now());

      if (reason) {
        setActionError(reason);
        return;
      }

      if (
        booking.booking_type === "krs_priority" &&
        !review.krsChecked
      ) {
        setActionError(
          "Periksa dokumen KRS dan centang konfirmasi pemeriksaan.",
        );
        return;
      }
    }

    mutationLock.current = true;
    setBusyId(booking.id);

    try {
      const supabase = createClient();

      const { error } = await supabase.rpc(
        "admin_review_booking",
        {
          p_booking_id: booking.id,
          p_decision: decision,
          p_rejection_reason:
            decision === "rejected" ? rejectionReason : null,
          p_krs_note:
            decision === "approved" &&
            booking.booking_type === "krs_priority"
              ? review.krsNote.trim() || null
              : null,
        },
      );

      if (error) throw error;

      setSuccess(
        decision === "approved"
          ? `Booking "${booking.title}" berhasil disetujui.`
          : `Booking "${booking.title}" berhasil ditolak.`,
      );

      setReview(null);
      await refreshBookings();
    } catch (err) {
      console.error("Review Admin booking:", err);

      setActionError(
        getErrorMessage(err, "Gagal memproses booking."),
      );
    } finally {
      mutationLock.current = false;
      setBusyId(null);
    }
  }

  const stats = [
    {
      label: "Menunggu Keputusan",
      value: bookings.filter(
        (item) =>
          item.status === "pending" ||
          item.status === "under_review",
      ).length,
      color: "bg-amber-50 text-amber-800",
    },
    {
      label: "Perlu Verifikasi KRS",
      value: bookings.filter(
        (item) =>
          item.booking_type === "krs_priority" &&
          (
            item.status === "pending" ||
            item.status === "under_review"
          ) &&
          item.krs?.status === "pending",
      ).length,
      color: "bg-sky-50 text-sky-700",
    },
    {
      label: "Booking Disetujui",
      value: bookings.filter(
        (item) => item.status === "approved",
      ).length,
      color: "bg-emerald-50 text-emerald-700",
    },
  ];

  return (
    <div className="space-y-7">
      <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted">
            Workspace / Pengelolaan Peminjaman
          </p>

          <h1 className="mt-2 font-heading text-2xl font-extrabold text-primary sm:text-3xl">
            Persetujuan Booking
          </h1>

          <p className="mt-2 text-sm leading-7 text-muted">
            Periksa permohonan Komting dan kelola keputusan
            penggunaan ruangan.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void refreshBookings()}
          disabled={loading || busyId !== null}
          className="btn-outline w-fit shrink-0 rounded-xl text-xs shadow-sm"
        >
          {loading ? "Memuat..." : "↻ Muat Ulang"}
        </button>
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

      {success && (
        <div
          role="status"
          className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm leading-7 text-emerald-700"
        >
          <p>{success}</p>

          {loadError && (
            <p className="mt-2">
              Keputusan berhasil disimpan, tetapi daftar terbaru
              belum dapat dimuat. Tekan Muat Ulang.
            </p>
          )}
        </div>
      )}

      <section
        aria-label="Ringkasan booking"
        className="grid gap-4 sm:grid-cols-3"
      >
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="rounded-3xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-200/20 sm:p-6"
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

      <section className="space-y-5 rounded-3xl border border-slate-200/80 bg-white p-5 sm:p-6">
        <div>
          <label
            htmlFor="admin-booking-search"
            className="mb-3 block text-xs font-bold text-primary"
          >
            Cari pengajuan
          </label>

          <input
            id="admin-booking-search"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Kegiatan, Komting, NIM, ruangan, atau kelas..."
            className="input-field min-h-11 rounded-xl"
          />
        </div>

        <fieldset>
          <legend className="mb-3 text-xs font-bold text-primary">
            Status booking
          </legend>

          <div className="flex w-fit max-w-full flex-wrap gap-1 rounded-2xl bg-slate-100 p-1">
            {filterOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={filter === option.value}
                onClick={() => setFilter(option.value)}
                className={`min-h-10 rounded-xl px-3 py-2 text-[11px] font-semibold transition focus-visible:outline-2 focus-visible:outline-primary ${
                  filter === option.value
                    ? "bg-white text-primary shadow-sm"
                    : "text-muted hover:bg-white/70 hover:text-primary"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </fieldset>
      </section>

      <section className="space-y-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span
              aria-hidden="true"
              className="h-6 w-1 rounded-full bg-secondary"
            />

            <h2 className="font-heading text-lg font-extrabold text-primary">
              Daftar Pengajuan
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
          <p
            role="status"
            className="rounded-3xl border border-slate-200 bg-white p-12 text-center text-sm text-muted"
          >
            Memuat data booking...
          </p>
        ) : loadError ? (
          <p className="rounded-3xl border border-slate-200 bg-white p-10 text-center text-sm text-muted">
            Data belum dapat dimuat. Silakan tekan Muat Ulang.
          </p>
        ) : filteredBookings.length === 0 ? (
          <div className="rounded-3xl border border-slate-200 bg-white p-12 text-center">
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-primary">
              <CalendarIcon className="h-7 w-7" />
            </span>

            <h3 className="mt-4 text-sm font-bold text-primary">
              Tidak ada booking pada kategori ini
            </h3>

            <p className="mt-2 text-xs leading-6 text-muted">
              Coba status lain atau ubah kata pencarian.
            </p>
          </div>
        ) : (
          <div className="space-y-5">
            {filteredBookings.map((booking) => {
              const status = statusConfig[booking.status];

              const canReview =
                booking.status === "pending" ||
                booking.status === "under_review";

              const blocked = approvalBlock(booking, now);
              const reviewing =
                review?.bookingId === booking.id;

              return (
                <article
                  key={booking.id}
                  className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-sm shadow-slate-200/20"
                >
                  <div className="flex flex-col justify-between gap-4 border-b border-slate-100 p-5 sm:flex-row sm:items-start sm:p-6">
                    <div className="min-w-0">
                      <div className="flex flex-wrap gap-2">
                        <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-[10px] font-semibold text-primary">
                          {typeLabels[booking.booking_type]}
                        </span>

                        <span className="rounded-lg border border-slate-200 px-2.5 py-1 text-[10px] font-semibold text-muted">
                          {booking.studentClass?.class_code ||
                            "Kelas tidak tersedia"}
                        </span>
                      </div>

                      <h3 className="mt-3 break-words font-heading text-lg font-extrabold text-primary">
                        {booking.title}
                      </h3>

                      <p className="mt-2 text-[10px] leading-6 text-muted">
                        Diajukan {dateLabel(booking.created_at)}
                      </p>
                    </div>

                    <span
                      className={`inline-flex w-fit shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[10px] font-semibold ${status.color}`}
                    >
                      <span
                        aria-hidden="true"
                        className={`h-1.5 w-1.5 rounded-full ${status.dot}`}
                      />
                      {status.label}
                    </span>
                  </div>

                  <div className="space-y-5 p-5 sm:p-6">
                    <dl className="grid gap-5 md:grid-cols-2">
                      <div>
                        <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted">
                          Pengaju / Komting
                        </dt>

                        <dd className="mt-2 text-sm font-bold text-primary">
                          {booking.requester?.full_name ||
                            "Pengguna tidak ditemukan"}
                        </dd>

                        <dd className="mt-2 text-xs text-muted">
                          NIM:{" "}
                          {booking.requester?.student_number ||
                            "—"}
                        </dd>

                        <dd className="mt-1 break-all text-xs leading-6 text-muted">
                          {booking.requester?.email || "—"}
                        </dd>
                      </div>

                      <div>
                        <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted">
                          Ruangan
                        </dt>

                        <dd className="mt-2 text-sm font-bold leading-6 text-primary">
                          {booking.room
                            ? `${booking.room.room_code} · ${booking.room.room_name}`
                            : "Ruangan tidak ditemukan"}
                        </dd>

                        <dd className="mt-2 text-xs text-muted">
                          {booking.room?.building ||
                            "Gedung belum diisi"}
                        </dd>

                        {booking.room && (
                          <dd className="mt-1 text-xs leading-6 text-muted">
                            Kapasitas {booking.room.capacity} orang
                            {" · "}
                            {booking.room.is_active
                              ? "Ruangan aktif"
                              : "Ruangan nonaktif"}
                          </dd>
                        )}
                      </div>
                    </dl>

                    <dl className="grid gap-4 rounded-2xl border border-slate-200 p-4 sm:grid-cols-2 xl:grid-cols-4">
                      {[
                        {
                          label: "Mulai",
                          value: dateLabel(booking.starts_at),
                        },
                        {
                          label: "Selesai",
                          value: dateLabel(booking.ends_at),
                        },
                        {
                          label: "Peserta",
                          value:
                            booking.participant_count !== null
                              ? `${booking.participant_count} orang`
                              : "Belum tersedia",
                        },
                        {
                          label: "Jenis Kegiatan",
                          value:
                            booking.activity_type?.replace(
                              /_/g,
                              " ",
                            ) || "Kegiatan kelas",
                        },
                      ].map((item) => (
                        <div key={item.label}>
                          <dt className="text-[10px] text-muted">
                            {item.label}
                          </dt>

                          <dd className="mt-2 text-xs font-semibold leading-6 text-primary">
                            {item.value}
                          </dd>
                        </div>
                      ))}
                    </dl>

                    <div>
                      <h4 className="text-[10px] font-semibold uppercase tracking-wider text-muted">
                        Tujuan Penggunaan
                      </h4>

                      <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-7 text-muted">
                        {booking.purpose}
                      </p>
                    </div>

                    {booking.booking_type === "krs_priority" && (
                      <section className="rounded-2xl border border-slate-200 p-4 sm:p-5">
                        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                          <div>
                            <h4 className="text-sm font-bold text-primary">
                              Dokumen Prioritas KRS
                            </h4>

                            <p className="mt-2 text-xs leading-6 text-muted">
                              Referensi:{" "}
                              {booking.krs?.reference_code ||
                                "Tidak diisi"}
                            </p>

                            <p className="mt-1 text-xs leading-6 text-muted">
                              Status:{" "}
                              <span className="font-semibold text-primary">
                                {!booking.krs
                                  ? "Dokumen tidak ditemukan"
                                  : booking.krs.status === "verified"
                                    ? "Terverifikasi"
                                    : booking.krs.status === "rejected"
                                      ? "Ditolak"
                                      : "Menunggu verifikasi"}
                              </span>
                            </p>
                          </div>

                          <button
                            type="button"
                            onClick={() =>
                              void openDocument(booking)
                            }
                            disabled={
                              !booking.krs?.document_path ||
                              documentBusyId !== null
                            }
                            className="btn-outline shrink-0 rounded-xl text-xs"
                          >
                            {documentBusyId === booking.id
                              ? "Membuka..."
                              : "Lihat Dokumen KRS"}
                          </button>
                        </div>

                        {booking.krs?.notes && (
                          <p className="mt-4 whitespace-pre-wrap break-words border-t border-slate-100 pt-3 text-xs leading-7 text-muted">
                            Catatan KRS: {booking.krs.notes}
                          </p>
                        )}
                      </section>
                    )}

                    {booking.rejection_reason && (
                      <div className="rounded-2xl border border-red-200 p-4">
                        <h4 className="text-xs font-bold text-red-700">
                          Alasan Penolakan
                        </h4>

                        <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-7 text-muted">
                          {booking.rejection_reason}
                        </p>
                      </div>
                    )}

                    {canReview && blocked && (
                      <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs leading-7 text-amber-800">
                        {blocked}
                      </p>
                    )}

                    {canReview && !reviewing && (
                      <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
                        <button
                          type="button"
                          onClick={() =>
                            openReview(booking, "rejected")
                          }
                          disabled={busyId !== null || loading}
                          className="inline-flex min-h-11 items-center justify-center rounded-xl border border-red-200 px-4 py-2 text-xs font-semibold text-red-700 transition hover:bg-red-50 focus-visible:outline-2 focus-visible:outline-red-700 disabled:opacity-50"
                        >
                          Tolak Booking
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            openReview(booking, "approved")
                          }
                          disabled={
                            busyId !== null ||
                            loading ||
                            blocked !== null
                          }
                          className="btn-primary rounded-xl text-xs"
                        >
                          {booking.booking_type === "krs_priority"
                            ? "Verifikasi KRS & Setujui"
                            : "Setujui Booking"}
                        </button>
                      </div>
                    )}

                    {canReview && reviewing && review && (
                      <form
                        onSubmit={(event) =>
                          void submitReview(event, booking)
                        }
                        aria-busy={busyId === booking.id}
                        className="rounded-2xl border border-slate-200 p-4 sm:p-5"
                      >
                        <h4 className="text-sm font-bold text-primary">
                          {review.decision === "approved"
                            ? "Konfirmasi Persetujuan"
                            : "Tolak Booking"}
                        </h4>

                        <p className="mt-2 text-xs leading-7 text-muted">
                          {review.decision === "approved"
                            ? "Pastikan ruangan, waktu, dan jumlah peserta sudah sesuai sebelum menyetujui."
                            : "Tuliskan alasan penolakan yang akan ditampilkan kepada pengaju."}
                        </p>

                        {review.decision === "rejected" ? (
                          <div className="mt-4">
                            <label
                              htmlFor={`reject-${booking.id}`}
                              className="mb-2 block text-xs font-semibold text-primary"
                            >
                              Alasan penolakan *
                            </label>

                            <textarea
                              id={`reject-${booking.id}`}
                              value={review.rejectionReason}
                              onChange={(event) => {
                                const value = event.target.value;

                                setReview((current) =>
                                  current
                                    ? {
                                        ...current,
                                        rejectionReason: value,
                                      }
                                    : null,
                                );
                              }}
                              required
                              disabled={busyId !== null}
                              rows={3}
                              placeholder="Jelaskan alasan penolakan..."
                              className="input-field resize-y rounded-xl"
                            />
                          </div>
                        ) : booking.booking_type ===
                          "krs_priority" ? (
                          <div className="mt-4 space-y-4">
                            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 p-4">
                              <input
                                type="checkbox"
                                checked={review.krsChecked}
                                onChange={(event) => {
                                  const checked =
                                    event.target.checked;

                                  setReview((current) =>
                                    current
                                      ? {
                                          ...current,
                                          krsChecked: checked,
                                        }
                                      : null,
                                  );
                                }}
                                required
                                disabled={busyId !== null}
                                className="mt-1 h-4 w-4 shrink-0 accent-[#173A56]"
                              />

                              <span className="text-xs leading-7 text-primary">
                                Saya sudah memeriksa dokumen KRS
                                dan menyatakan dokumen sesuai
                                dengan pengajuan.
                              </span>
                            </label>

                            <div>
                              <label
                                htmlFor={`krs-note-${booking.id}`}
                                className="mb-2 block text-xs font-semibold text-primary"
                              >
                                Catatan verifikasi (opsional)
                              </label>

                              <textarea
                                id={`krs-note-${booking.id}`}
                                value={review.krsNote}
                                onChange={(event) => {
                                  const value =
                                    event.target.value;

                                  setReview((current) =>
                                    current
                                      ? {
                                          ...current,
                                          krsNote: value,
                                        }
                                      : null,
                                  );
                                }}
                                disabled={busyId !== null}
                                rows={2}
                                placeholder="Catatan pemeriksaan dokumen..."
                                className="input-field resize-y rounded-xl"
                              />
                            </div>
                          </div>
                        ) : null}

                        <div className="mt-5 flex flex-wrap justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setReview(null)}
                            disabled={busyId !== null}
                            className="btn-outline rounded-xl text-xs"
                          >
                            Batal
                          </button>

                          <button
                            type="submit"
                            disabled={
                              busyId !== null ||
                              (
                                review.decision === "approved" &&
                                (
                                  blocked !== null ||
                                  (
                                    booking.booking_type ===
                                      "krs_priority" &&
                                    !review.krsChecked
                                  )
                                )
                              )
                            }
                            className={
                              review.decision === "approved"
                                ? "btn-primary rounded-xl text-xs"
                                : "btn-danger rounded-xl text-xs"
                            }
                          >
                            {busyId === booking.id
                              ? "Memproses..."
                              : review.decision === "approved"
                                ? "Konfirmasi Persetujuan"
                                : "Kirim Penolakan"}
                          </button>
                        </div>
                      </form>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <p className="text-[11px] leading-7 text-muted">
        Server memvalidasi kembali status booking, waktu,
        kapasitas ruangan, dan konflik reservasi saat keputusan
        dikirim. Data diperbarui ketika halaman dibuka, dimuat
        ulang, atau keputusan berhasil disimpan.
      </p>
    </div>
  );
}