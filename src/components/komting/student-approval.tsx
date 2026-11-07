"use client";

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

type Applicant = {
  full_name: string;
  email: string | null;
  student_number: string | null;
};

type StudentRequest = {
  id: string;
  user_id: string;
  class_id: string;
  created_at: string;
  applicant: Applicant | null;
};

type ReviewState = {
  requestId: string;
  decision: "approved" | "rejected";
  reason: string;
};

function ApprovalIcon({
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
      <circle cx="8" cy="7" r="3" />
      <path d="M2 21v-2a6 6 0 0 1 12 0v2" />
      <path d="m15 10 2 2 5-5" />
    </svg>
  );
}

function dateLabel(value: string) {
  return (
    new Intl.DateTimeFormat("id-ID", {
      timeZone: "Asia/Jakarta",
      dateStyle: "long",
      timeStyle: "short",
    }).format(new Date(value)) + " WIB"
  );
}

function initials(name: string) {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((word) => word.charAt(0))
      .join("")
      .toUpperCase() || "M"
  );
}

export default function StudentApproval() {
  const controllerRef = useRef<AbortController | null>(null);
  const mutationLock = useRef(false);

  const [requests, setRequests] = useState<StudentRequest[]>([]);
  const [className, setClassName] = useState("");

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

      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (signal.aborted) return;
      if (authError) throw authError;

      if (!user) {
        throw new Error("Sesi pengguna tidak ditemukan.");
      }

      const { data: profile, error: profileError } =
        await supabase
          .from("profiles")
          .select("role, class_id, is_active")
          .eq("id", user.id)
          .maybeSingle();

      if (signal.aborted) return;
      if (profileError) throw profileError;

      if (
        !profile ||
        profile.role !== "komting" ||
        !profile.is_active ||
        !profile.class_id
      ) {
        throw new Error(
          "Akun tidak memiliki akses sebagai Komting.",
        );
      }

      const [classResult, requestResult] = await Promise.all([
        supabase
          .from("classes")
          .select("class_code, class_name")
          .eq("id", profile.class_id)
          .maybeSingle(),

        supabase
          .from("registration_requests")
          .select("id, user_id, class_id, created_at")
          .eq("requested_role", "mahasiswa")
          .eq("status", "pending")
          .eq("class_id", profile.class_id)
          .order("created_at", { ascending: true }),
      ]);

      if (signal.aborted) return;
      if (classResult.error) throw classResult.error;
      if (requestResult.error) throw requestResult.error;

      const rows = (requestResult.data ?? []) as Omit<
        StudentRequest,
        "applicant"
      >[];

      const applicantMap = new Map<string, Applicant>();

      if (rows.length > 0) {
        const userIds = [
          ...new Set(rows.map((request) => request.user_id)),
        ];

        const { data, error: applicantError } = await supabase
          .from("profiles")
          .select("id, full_name, email, student_number")
          .in("id", userIds);

        if (signal.aborted) return;
        if (applicantError) throw applicantError;

        for (const applicant of data ?? []) {
          applicantMap.set(applicant.id, {
            full_name: applicant.full_name,
            email: applicant.email,
            student_number: applicant.student_number,
          });
        }
      }

      if (signal.aborted) return;

      const nextRequests = rows.map((request) => ({
        ...request,
        applicant: applicantMap.get(request.user_id) ?? null,
      }));

      setClassName(
        classResult.data
          ? `${classResult.data.class_code} · ${classResult.data.class_name}`
          : "Informasi kelas tidak tersedia",
      );

      setRequests(nextRequests);

      setReview((current) =>
        current &&
        nextRequests.some(
          (request) => request.id === current.requestId,
        )
          ? current
          : null,
      );
    } catch (err) {
      if (signal.aborted) return;

      console.error("Load student registrations:", err);

      setLoadError(
        getErrorMessage(
          err,
          "Gagal mengambil permohonan mahasiswa.",
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

  const filteredRequests = useMemo(() => {
    const keyword = search.trim().toLocaleLowerCase("id");

    return requests.filter((request) => {
      const text = [
        request.applicant?.full_name,
        request.applicant?.email,
        request.applicant?.student_number,
      ]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase("id");

      return !keyword || text.includes(keyword);
    });
  }, [requests, search]);

  function openReview(
    request: StudentRequest,
    decision: ReviewState["decision"],
  ) {
    if (!ready || mutationLock.current) return;

    setActionError("");
    setSuccess("");

    setReview({
      requestId: request.id,
      decision,
      reason: "",
    });
  }

  async function handleReview(
    event: FormEvent<HTMLFormElement>,
    request: StudentRequest,
  ) {
    event.preventDefault();

    if (
      !ready ||
      mutationLock.current ||
      !review ||
      review.requestId !== request.id
    ) {
      return;
    }

    const decision = review.decision;
    const reason = review.reason.trim();

    setActionError("");
    setSuccess("");

    if (decision === "rejected" && !reason) {
      setActionError("Alasan penolakan wajib diisi.");
      return;
    }

    mutationLock.current = true;
    setBusyId(request.id);

    try {
      const supabase = createClient();

      const { error } = await supabase.rpc(
        "review_registration_request",
        {
          p_request_id: request.id,
          p_decision: decision,
          p_rejection_reason:
            decision === "rejected" ? reason : null,
        },
      );

      if (error) throw error;

      const name =
        request.applicant?.full_name || "Mahasiswa";

      setSuccess(
        decision === "approved"
          ? `${name} berhasil diterima sebagai anggota kelas.`
          : `Pendaftaran ${name} berhasil ditolak.`,
      );

      setReview(null);
      await loadRequests();
    } catch (err) {
      console.error("Review registration:", err);

      setActionError(
        getErrorMessage(
          err,
          "Gagal memproses pendaftaran mahasiswa.",
        ),
      );
    } finally {
      mutationLock.current = false;
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-7">
      <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted">
            Workspace / Verifikasi Anggota
          </p>

          <h1 className="mt-2 font-heading text-2xl font-extrabold text-primary sm:text-3xl">
            Persetujuan Mahasiswa
          </h1>

          <p className="mt-2 text-sm leading-7 text-muted">
            Tinjau pendaftaran mahasiswa yang ingin bergabung
            ke kelasmu.
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
              Keputusan berhasil disimpan, tetapi daftar terbaru
              belum dapat dimuat. Tekan Muat Ulang.
            </p>
          )}
        </div>
      )}

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="flex items-start gap-4 rounded-3xl border border-slate-200/80 bg-white p-6">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-primary">
            <ApprovalIcon className="h-6 w-6" />
          </span>

          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted">
              Kelas yang Dikoordinasikan
            </p>

            <h2 className="mt-3 break-words font-heading text-lg font-extrabold text-primary">
              {ready ? className : "—"}
            </h2>

            <p className="mt-2 text-xs leading-7 text-muted">
              Hanya permohonan mahasiswa untuk kelas ini yang
              ditampilkan.
            </p>
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200/80 bg-white p-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xs font-semibold text-muted">
              Menunggu Persetujuan
            </h2>

            <span className="rounded-xl bg-amber-50 p-2 text-amber-800">
              <ApprovalIcon className="h-4 w-4" />
            </span>
          </div>

          <p className="mt-4 font-heading text-4xl font-extrabold text-primary">
            {ready ? requests.length : "—"}
          </p>

          <p className="mt-2 text-[10px] leading-6 text-muted">
            Permohonan yang belum diproses
          </p>
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200/80 bg-white p-5 sm:p-6">
        <label
          htmlFor="registration-search"
          className="mb-3 block text-xs font-bold text-primary"
        >
          Cari pendaftar
        </label>

        <div className="relative">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            aria-hidden="true"
            className="pointer-events-none absolute left-4 top-3.5 h-4 w-4 text-muted"
          >
            <circle cx="10.5" cy="10.5" r="6.5" />
            <path d="m16 16 5 5" />
          </svg>

          <input
            id="registration-search"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Cari nama, NIM, atau email..."
            className="input-field min-h-11 rounded-xl pl-11"
          />
        </div>
      </section>

      <section className="space-y-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span
              aria-hidden="true"
              className="h-6 w-1 rounded-full bg-secondary"
            />

            <h2 className="font-heading text-lg font-extrabold text-primary">
              Calon Anggota Kelas
            </h2>
          </div>

          {ready && (
            <span
              role="status"
              className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-muted"
            >
              {filteredRequests.length} pendaftar
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
              Memuat permohonan mahasiswa...
            </p>
          </div>
        ) : loadError ? (
          <p className="rounded-3xl border border-slate-200 bg-white p-10 text-center text-sm text-muted">
            Permohonan belum dapat dimuat. Silakan tekan
            Muat Ulang.
          </p>
        ) : filteredRequests.length === 0 ? (
          <div className="rounded-3xl border border-slate-200 bg-white p-12 text-center">
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-primary">
              <ApprovalIcon className="h-7 w-7" />
            </span>

            <h3 className="mt-4 text-sm font-bold text-primary">
              {search
                ? "Pendaftar tidak ditemukan"
                : "Tidak ada permohonan yang menunggu"}
            </h3>

            <p className="mt-2 text-xs leading-6 text-muted">
              {search
                ? "Coba nama, NIM, atau email yang berbeda."
                : "Permohonan mahasiswa baru akan muncul di sini."}
            </p>

            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="btn-outline mt-5 rounded-xl text-xs"
              >
                Hapus Pencarian
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {filteredRequests.map((request) => {
              const applicant = request.applicant;
              const name =
                applicant?.full_name ||
                "Informasi pendaftar tidak tersedia";

              const reviewing =
                review?.requestId === request.id;

              return (
                <article
                  key={request.id}
                  className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-sm shadow-slate-200/20"
                >
                  <div className="flex flex-col justify-between gap-4 border-b border-slate-100 p-5 sm:flex-row sm:items-start sm:p-6">
                    <div className="flex min-w-0 items-start gap-3">
                      <span
                        aria-hidden="true"
                        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-xs font-bold text-primary"
                      >
                        {initials(
                          applicant?.full_name || "Mahasiswa",
                        )}
                      </span>

                      <div className="min-w-0">
                        <h3 className="break-words font-heading text-base font-extrabold text-primary">
                          {name}
                        </h3>

                        <p className="mt-2 text-[10px] leading-6 text-muted">
                          Mendaftar{" "}
                          {dateLabel(request.created_at)}
                        </p>
                      </div>
                    </div>

                    <span className="inline-flex w-fit shrink-0 items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1.5 text-[10px] font-semibold text-amber-800">
                      <span
                        aria-hidden="true"
                        className="h-1.5 w-1.5 rounded-full bg-amber-500"
                      />
                      Menunggu Persetujuan
                    </span>
                  </div>

                  <div className="space-y-5 p-5 sm:p-6">
                    <dl className="grid gap-5 sm:grid-cols-2">
                      <div>
                        <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted">
                          Nomor Induk Mahasiswa
                        </dt>

                        <dd className="mt-2 text-sm font-bold tabular-nums text-primary">
                          {applicant?.student_number || "—"}
                        </dd>
                      </div>

                      <div className="min-w-0">
                        <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted">
                          Email
                        </dt>

                        <dd className="mt-2 break-all text-sm text-primary">
                          {applicant?.email || "—"}
                        </dd>
                      </div>
                    </dl>

                    {!applicant && (
                      <p className="rounded-xl border border-amber-200 p-4 text-xs leading-7 text-amber-800">
                        Informasi profil belum dapat ditampilkan.
                        Periksa kembali data pendaftar sebelum
                        mengambil keputusan.
                      </p>
                    )}

                    {!reviewing ? (
                      <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
                        <button
                          type="button"
                          onClick={() =>
                            openReview(request, "rejected")
                          }
                          disabled={busyId !== null || loading}
                          className="inline-flex min-h-11 items-center justify-center rounded-xl border border-red-200 px-4 py-2 text-xs font-semibold text-red-700 transition hover:bg-red-50 focus-visible:outline-2 focus-visible:outline-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Tolak Pendaftaran
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            openReview(request, "approved")
                          }
                          disabled={
                            busyId !== null ||
                            loading ||
                            !applicant
                          }
                          className="btn-primary rounded-xl text-xs"
                        >
                          Setujui Mahasiswa
                        </button>
                      </div>
                    ) : (
                      review && (
                        <form
                          onSubmit={(event) =>
                            void handleReview(event, request)
                          }
                          aria-busy={busyId === request.id}
                          className="rounded-2xl border border-slate-200 p-4 sm:p-5"
                        >
                          <h4 className="text-sm font-bold text-primary">
                            {review.decision === "approved"
                              ? "Konfirmasi Persetujuan"
                              : "Tolak Pendaftaran"}
                          </h4>

                          <p className="mt-2 text-xs leading-7 text-muted">
                            {review.decision === "approved"
                              ? `Terima ${name} sebagai anggota kelas ${className}?`
                              : "Tuliskan alasan penolakan yang akan ditampilkan kepada pendaftar."}
                          </p>

                          {review.decision === "rejected" && (
                            <div className="mt-4">
                              <label
                                htmlFor={`rejection-${request.id}`}
                                className="mb-2 block text-xs font-semibold text-primary"
                              >
                                Alasan penolakan *
                              </label>

                              <textarea
                                id={`rejection-${request.id}`}
                                value={review.reason}
                                onChange={(event) => {
                                  const value =
                                    event.target.value;

                                  setReview((current) =>
                                    current
                                      ? {
                                          ...current,
                                          reason: value,
                                        }
                                      : null,
                                  );
                                }}
                                disabled={busyId !== null}
                                placeholder="Jelaskan alasan penolakan..."
                                rows={3}
                                required
                                className="input-field resize-y rounded-xl"
                              />
                            </div>
                          )}

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
                                review.decision === "approved"
                                  ? "btn-primary rounded-xl text-xs"
                                  : "btn-danger rounded-xl text-xs"
                              }
                            >
                              {busyId === request.id
                                ? "Memproses..."
                                : review.decision === "approved"
                                  ? "Ya, Setujui"
                                  : "Konfirmasi Penolakan"}
                            </button>
                          </div>
                        </form>
                      )
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-5">
        <h2 className="text-xs font-bold text-primary">
          Periksa Data Sebelum Menyetujui
        </h2>

        <p className="mt-2 text-xs leading-7 text-muted">
          Pastikan nama dan NIM sesuai dengan anggota kelas.
          Persetujuan diproses oleh backend. Permohonan yang telah
          disetujui atau ditolak akan keluar dari daftar menunggu.
        </p>
      </section>
    </div>
  );
}