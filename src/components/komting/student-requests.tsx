"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { getErrorMessage } from "@/lib/errors";
import { createClient } from "@/lib/supabase/client";

type RequestStatus =
  | "pending"
  | "acknowledged"
  | "rejected"
  | "cancelled";

type Decision = "acknowledged" | "rejected";

type StudentRequest = {
  id: string;
  student_id: string;
  activity_title: string;
  purpose: string;
  preferred_date: string;
  preferred_start_time: string;
  preferred_end_time: string;
  preferred_room_type: "kelas" | "laboratorium" | "bebas";
  participant_count: number | null;
  notes: string | null;
  preferred_room_id: string | null;
  status: RequestStatus;
  response_note: string | null;
  created_at: string;
};

type Student = {
  id: string;
  full_name: string;
  student_number: string | null;
  is_active: boolean;
};

type Room = {
  id: string;
  room_code: string;
  room_name: string;
  building: string | null;
  floor: string | null;
  capacity: number;
};

type ReviewState = {
  requestId: string;
  decision: Decision;
  note: string;
};

const statusConfig: Record<
  RequestStatus,
  { label: string; color: string; dot: string }
> = {
  pending: {
    label: "Menunggu Ditinjau",
    color: "bg-amber-50 text-amber-800",
    dot: "bg-amber-500",
  },
  acknowledged: {
    label: "Diterima / Ditindaklanjuti",
    color: "bg-emerald-50 text-emerald-700",
    dot: "bg-emerald-500",
  },
  rejected: {
    label: "Ditolak",
    color: "bg-red-50 text-red-700",
    dot: "bg-red-500",
  },
  cancelled: {
    label: "Dibatalkan Mahasiswa",
    color: "bg-slate-100 text-slate-600",
    dot: "bg-slate-400",
  },
};

const filterOptions: {
  value: "all" | RequestStatus;
  label: string;
}[] = [
  { value: "pending", label: "Menunggu" },
  { value: "acknowledged", label: "Diterima" },
  { value: "rejected", label: "Ditolak" },
  { value: "cancelled", label: "Dibatalkan" },
  { value: "all", label: "Semua" },
];

function InboxIcon({
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
      <path d="M4 4h16l2 11v4H2v-4L4 4Z" />
      <path d="M2 15h6l2 2h4l2-2h6" />
    </svg>
  );
}

function dateLabel(value: string) {
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    dateStyle: "long",
  }).format(new Date(`${value}T12:00:00+07:00`));
}

function dateTimeLabel(value: string) {
  return (
    new Intl.DateTimeFormat("id-ID", {
      timeZone: "Asia/Jakarta",
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value)) + " WIB"
  );
}

function roomTypeLabel(
  value: StudentRequest["preferred_room_type"],
) {
  if (value === "kelas") return "Ruang Kelas";
  if (value === "laboratorium") return "Laboratorium";

  return "Tidak ada preferensi";
}

export default function StudentRequestInbox() {
  const controllerRef = useRef<AbortController | null>(null);
  const mutationLock = useRef(false);

  const [requests, setRequests] = useState<StudentRequest[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);

  const [filter, setFilter] =
    useState<"all" | RequestStatus>("pending");
  const [search, setSearch] = useState("");
  const [review, setReview] = useState<ReviewState | null>(null);

  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [success, setSuccess] = useState("");

  const loadRequests = useCallback(async () => {
    controllerRef.current?.abort();

    const controller = new AbortController();
    controllerRef.current = controller;

    const { signal } = controller;

    setLoading(true);
    setLoadError("");

    try {
      const supabase = createClient();

      const [requestResult, studentResult, roomResult] =
        await Promise.all([
          supabase
            .from("student_room_requests")
            .select(
              "id, student_id, activity_title, purpose, preferred_date, preferred_start_time, preferred_end_time, preferred_room_type, preferred_room_id, participant_count, notes, status, response_note, created_at",
            )
            .order("created_at", { ascending: false }),

          supabase.rpc("get_komting_student_directory"),

          supabase
            .from("rooms")
            .select(
              "id, room_code, room_name, building, floor, capacity",
            )
            .eq("is_active", true),
        ]);

      if (signal.aborted) return;
      if (requestResult.error) throw requestResult.error;
      if (studentResult.error) throw studentResult.error;
      if (roomResult.error) throw roomResult.error;

      const nextRequests =
        (requestResult.data ?? []) as StudentRequest[];

      setRequests(nextRequests);
      setStudents((studentResult.data ?? []) as Student[]);
      setRooms((roomResult.data ?? []) as Room[]);

      setReview((current) =>
        current &&
        nextRequests.some(
          (request) =>
            request.id === current.requestId &&
            request.status === "pending",
        )
          ? current
          : null,
      );
    } catch (err) {
      if (signal.aborted) return;

      console.error("Load student requests:", err);

      setLoadError(
        getErrorMessage(
          err,
          "Gagal memuat pengajuan mahasiswa.",
        ),
      );
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRequests();

    return () => {
      controllerRef.current?.abort();
    };
  }, [loadRequests]);

  const ready = !loading && !loadError;

  const studentMap = useMemo(
    () => new Map(students.map((student) => [student.id, student])),
    [students],
  );

  const filteredRequests = useMemo(() => {
    const keyword = search.trim().toLocaleLowerCase("id");

    return requests.filter((request) => {
      const student = studentMap.get(request.student_id);

      const text = [
        request.activity_title,
        request.purpose,
        student?.full_name,
        student?.student_number,
      ]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase("id");

      return (
        (filter === "all" || request.status === filter) &&
        (!keyword || text.includes(keyword))
      );
    });
  }, [requests, studentMap, filter, search]);

  function openReview(
    request: StudentRequest,
    decision: Decision,
  ) {
    if (!ready || mutationLock.current) return;

    setActionError("");
    setSuccess("");

    setReview({
      requestId: request.id,
      decision,
      note: "",
    });
  }

  async function submitReview(
    event: FormEvent<HTMLFormElement>,
    request: StudentRequest,
  ) {
    event.preventDefault();

    if (
      !ready ||
      mutationLock.current ||
      !review ||
      review.requestId !== request.id ||
      request.status !== "pending"
    ) {
      return;
    }

    const decision = review.decision;
    const note = review.note.trim();

    setActionError("");
    setSuccess("");

    if (decision === "rejected" && !note) {
      setActionError("Alasan penolakan wajib diisi.");
      return;
    }

    mutationLock.current = true;
    setBusyId(request.id);

    try {
      const supabase = createClient();

      const { error } = await supabase.rpc(
        "review_student_room_request",
        {
          p_request_id: request.id,
          p_decision: decision,
          p_response_note: note || null,
        },
      );

      if (error) throw error;

      setReview(null);

      setSuccess(
        decision === "acknowledged"
          ? "Pengajuan diterima untuk ditindaklanjuti. Reservasi belum dibuat; ajukan booking melalui menu Ajukan Booking."
          : "Pengajuan berhasil ditolak. Alasan penolakan telah dikirim kepada mahasiswa.",
      );

      await loadRequests();
    } catch (err) {
      console.error("Review student request:", err);

      setActionError(
        getErrorMessage(
          err,
          "Gagal memproses pengajuan mahasiswa.",
        ),
      );
    } finally {
      mutationLock.current = false;
      setBusyId(null);
    }
  }

  const stats = [
    {
      label: "Menunggu Ditinjau",
      value: requests.filter(
        (request) => request.status === "pending",
      ).length,
      color: "bg-amber-50 text-amber-800",
    },
    {
      label: "Diterima",
      value: requests.filter(
        (request) => request.status === "acknowledged",
      ).length,
      color: "bg-emerald-50 text-emerald-700",
    },
    {
      label: "Total Pengajuan",
      value: requests.length,
      color: "bg-slate-100 text-primary",
    },
  ];

  return (
    <div className="space-y-7">
      <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted">
            Workspace / Koordinasi Kelas
          </p>

          <h1 className="mt-2 font-heading text-2xl font-extrabold text-primary sm:text-3xl">
            Pengajuan Mahasiswa
          </h1>

          <p className="mt-2 max-w-2xl text-sm leading-7 text-muted">
            Tinjau kebutuhan ruangan dan berikan tanggapan kepada
            anggota kelasmu.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void loadRequests()}
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
              Tanggapan berhasil disimpan, tetapi daftar terbaru
              belum dapat dimuat. Tekan Muat Ulang.
            </p>
          )}
        </div>
      )}

      <section
        aria-label="Ringkasan pengajuan mahasiswa"
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
                <InboxIcon className="h-4 w-4" />
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
            htmlFor="student-request-search"
            className="mb-3 block text-xs font-bold text-primary"
          >
            Cari pengajuan
          </label>

          <input
            id="student-request-search"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Cari kegiatan, nama mahasiswa, atau NIM..."
            className="input-field min-h-11 rounded-xl"
          />
        </div>

        <fieldset>
          <legend className="mb-3 text-xs font-bold text-primary">
            Status pengajuan
          </legend>

          <div className="flex w-fit max-w-full flex-wrap gap-1 rounded-2xl bg-slate-100 p-1">
            {filterOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={filter === option.value}
                onClick={() => {
                  setFilter(option.value);

                  if (!mutationLock.current) {
                    setReview(null);
                  }
                }}
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
              Kotak Masuk
            </h2>
          </div>

          {ready && (
            <span
              role="status"
              className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-muted"
            >
              {filteredRequests.length} pengajuan
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
              Memuat pengajuan mahasiswa...
            </p>
          </div>
        ) : loadError ? (
          <p className="rounded-3xl border border-slate-200 bg-white p-10 text-center text-sm text-muted">
            Daftar belum dapat dimuat. Silakan tekan Muat Ulang.
          </p>
        ) : filteredRequests.length === 0 ? (
          <div className="rounded-3xl border border-slate-200 bg-white p-12 text-center">
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-primary">
              <InboxIcon className="h-7 w-7" />
            </span>

            <h3 className="mt-4 text-sm font-bold text-primary">
              Tidak ada pengajuan pada kategori ini
            </h3>

            <p className="mt-2 text-xs leading-6 text-muted">
              Coba kategori lain atau ubah kata kunci pencarian.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredRequests.map((request) => {
              const student = studentMap.get(request.student_id);
              const room = rooms.find(
                (item) => item.id === request.preferred_room_id,
              );

              const status = statusConfig[request.status];

              const reviewing =
                review?.requestId === request.id;

              const initials = (
                student?.full_name || "Mahasiswa"
              )
                .trim()
                .split(/\s+/)
                .slice(0, 2)
                .map((word) => word.charAt(0))
                .join("")
                .toUpperCase();

              return (
                <article
                  key={request.id}
                  className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-sm shadow-slate-200/20"
                >
                  <div className="flex flex-col justify-between gap-4 border-b border-slate-100 p-5 sm:flex-row sm:items-start sm:p-6">
                    <div className="flex min-w-0 items-start gap-3">
                      <div
                        aria-hidden="true"
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-xs font-bold text-primary"
                      >
                        {initials}
                      </div>

                      <div className="min-w-0">
                        <h3 className="break-words font-heading text-base font-extrabold text-primary">
                          {request.activity_title}
                        </h3>

                        <p className="mt-2 text-xs leading-6 text-muted">
                          {student?.full_name ||
                            "Informasi mahasiswa tidak tersedia"}
                          {student?.student_number
                            ? ` · ${student.student_number}`
                            : ""}
                        </p>

                        {student && !student.is_active && (
                          <p className="mt-1 text-[10px] text-amber-800">
                            Akun mahasiswa sedang nonaktif
                          </p>
                        )}
                      </div>
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
                    <p className="text-[10px] text-muted">
                      Dikirim {dateTimeLabel(request.created_at)}
                    </p>

                    <p className="whitespace-pre-wrap break-words text-sm leading-7 text-muted">
                      {request.purpose}
                    </p>

                    <dl className="grid gap-4 rounded-2xl border border-slate-200 p-4 sm:grid-cols-2 xl:grid-cols-4">
                      {[
                        {
                          label: "Tanggal",
                          value: dateLabel(
                            request.preferred_date,
                          ),
                        },
                        {
                          label: "Waktu",
                          value: `${request.preferred_start_time.slice(
                            0,
                            5,
                          )} - ${request.preferred_end_time.slice(
                            0,
                            5,
                          )} WIB`,
                        },
                        {
                          label: "Jenis Ruangan",
                          value: roomTypeLabel(
                            request.preferred_room_type,
                          ),
                        },
                        {
                          label: "Peserta",
                          value:
                            request.participant_count !== null
                              ? `${request.participant_count} orang`
                              : "Belum ditentukan",
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
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">
                        Ruangan yang Diinginkan
                      </p>

                      <p className="mt-2 text-xs font-bold leading-6 text-primary">
                        {request.preferred_room_id
                          ? room
                            ? `${room.room_code} · ${room.room_name}`
                            : "Ruangan tidak aktif atau tidak tersedia"
                          : "Tidak ada preferensi ruangan"}
                      </p>

                      {room && (
                        <p className="mt-2 text-xs leading-6 text-muted">
                          {[
                            room.building,
                            room.floor
                              ? `Lantai ${room.floor}`
                              : null,
                            `Kapasitas ${room.capacity} orang`,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      )}
                    </div>

                    {request.notes && (
                      <div>
                        <p className="text-xs font-bold text-primary">
                          Catatan Mahasiswa
                        </p>

                        <p className="mt-2 whitespace-pre-wrap break-words text-xs leading-7 text-muted">
                          {request.notes}
                        </p>
                      </div>
                    )}

                    {request.response_note && (
                      <div className="rounded-2xl border border-slate-200 p-4">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-primary">
                          Respons Komting
                        </p>

                        <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-7 text-muted">
                          {request.response_note}
                        </p>
                      </div>
                    )}

                    {request.status === "acknowledged" && (
                      <div className="flex flex-col justify-between gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-center">
                        <p className="max-w-lg text-[11px] leading-6 text-muted">
                          Diterima untuk ditindaklanjuti.
                          Pengajuan ini belum menjadi booking.
                        </p>

                        <Link
                          href="/dashboard/komting/bookings/new"
                          className="btn-outline shrink-0 rounded-xl text-xs"
                        >
                          Ajukan Booking →
                        </Link>
                      </div>
                    )}

                    {request.status === "pending" &&
                      !reviewing && (
                        <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
                          <button
                            type="button"
                            onClick={() =>
                              openReview(request, "rejected")
                            }
                            disabled={busyId !== null || loading}
                            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-red-200 px-4 py-2 text-xs font-semibold text-red-700 transition hover:bg-red-50 focus-visible:outline-2 focus-visible:outline-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            Tolak
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              openReview(
                                request,
                                "acknowledged",
                              )
                            }
                            disabled={busyId !== null || loading}
                            className="btn-primary rounded-xl text-xs"
                          >
                            Terima &amp; Tindaklanjuti
                          </button>
                        </div>
                      )}

                    {request.status === "pending" &&
                      reviewing &&
                      review && (
                        <form
                          onSubmit={(event) =>
                            void submitReview(event, request)
                          }
                          aria-busy={busyId === request.id}
                          className="rounded-2xl border border-slate-200 p-4 sm:p-5"
                        >
                          <h4 className="text-sm font-bold text-primary">
                            {review.decision === "rejected"
                              ? "Tolak Pengajuan"
                              : "Terima Pengajuan"}
                          </h4>

                          <p className="mt-2 text-xs leading-6 text-muted">
                            {review.decision === "rejected"
                              ? "Tuliskan alasan yang akan disampaikan kepada mahasiswa."
                              : "Tambahkan tanggapan jika diperlukan. Booking tetap perlu diajukan secara terpisah."}
                          </p>

                          <label
                            htmlFor={`review-note-${request.id}`}
                            className="mb-2 mt-4 block text-xs font-semibold text-primary"
                          >
                            {review.decision === "rejected"
                              ? "Alasan penolakan *"
                              : "Catatan untuk mahasiswa"}
                          </label>

                          <textarea
                            id={`review-note-${request.id}`}
                            value={review.note}
                            onChange={(event) => {
                              const value = event.target.value;

                              setReview((current) =>
                                current
                                  ? { ...current, note: value }
                                  : null,
                              );
                            }}
                            required={
                              review.decision === "rejected"
                            }
                            disabled={busyId !== null}
                            rows={3}
                            placeholder={
                              review.decision === "rejected"
                                ? "Jelaskan alasan penolakan..."
                                : "Contoh: Akan dikoordinasikan dengan jadwal kelas."
                            }
                            className="input-field resize-y rounded-xl"
                          />

                          <div className="mt-4 flex flex-wrap justify-end gap-2">
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
                              disabled={busyId !== null}
                              className={
                                review.decision === "rejected"
                                  ? "btn-danger rounded-xl text-xs"
                                  : "btn-primary rounded-xl text-xs"
                              }
                            >
                              {busyId === request.id
                                ? "Menyimpan..."
                                : review.decision === "rejected"
                                  ? "Kirim Penolakan"
                                  : "Konfirmasi Penerimaan"}
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
    </div>
  );
}