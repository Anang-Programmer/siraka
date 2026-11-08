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

type Applicant = {
  id: string;
  full_name: string;
  email: string | null;
  student_number: string | null;
};

type ClassInfo = {
  id: string;
  class_code: string;
  class_name: string;
  study_program: string;
};

type RegistrationRow = {
  id: string;
  user_id: string;
  class_id: string;
  created_at: string;
};

type RegistrationRequest = RegistrationRow & {
  applicant: Applicant | null;
  selectedClass: ClassInfo | null;
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

function ClassIcon({
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
      <rect x="3" y="3" width="7" height="7" rx="2" />
      <rect x="14" y="3" width="7" height="7" rx="2" />
      <rect x="3" y="14" width="7" height="7" rx="2" />
      <rect x="14" y="14" width="7" height="7" rx="2" />
    </svg>
  );
}

function formatDate(value: string) {
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
      .toUpperCase() || "K"
  );
}

export default function KomtingApproval() {
  const controllerRef = useRef<AbortController | null>(null);
  const mutationLock = useRef(false);

  const [requests, setRequests] =
    useState<RegistrationRequest[]>([]);

  const [search, setSearch] = useState("");
  const [classFilter, setClassFilter] = useState("all");
  const [review, setReview] = useState<ReviewState | null>(null);

  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [success, setSuccess] = useState("");

    const loadRequests = useCallback(() => {
    controllerRef.current?.abort();

    const controller = new AbortController();
    controllerRef.current = controller;

    const { signal } = controller;

    const fetchRequests = async () => {
      const supabase = createClient();

      const { data, error: requestError } = await supabase
        .from("registration_requests")
        .select("id, user_id, class_id, created_at")
        .eq("requested_role", "komting")
        .eq("status", "pending")
        .order("created_at", { ascending: true });

      if (signal.aborted) return;
      if (requestError) throw requestError;

      const rows = (data ?? []) as RegistrationRow[];

      if (rows.length === 0) {
        return [] as RegistrationRequest[];
      }

      const userIds = [
        ...new Set(rows.map((item) => item.user_id)),
      ];

      const classIds = [
        ...new Set(rows.map((item) => item.class_id)),
      ];

      const [profileResult, classResult] = await Promise.all([
        supabase
          .from("profiles")
          .select("id, full_name, email, student_number")
          .in("id", userIds),

        supabase
          .from("classes")
          .select("id, class_code, class_name, study_program")
          .in("id", classIds),
      ]);

      if (signal.aborted) return;
      if (profileResult.error) throw profileResult.error;
      if (classResult.error) throw classResult.error;

      const profileMap = new Map(
        ((profileResult.data ?? []) as Applicant[]).map(
          (profile) => [profile.id, profile],
        ),
      );

      const classMap = new Map(
        ((classResult.data ?? []) as ClassInfo[]).map(
          (item) => [item.id, item],
        ),
      );

      return rows.map((item) => ({
        ...item,
        applicant: profileMap.get(item.user_id) ?? null,
        selectedClass: classMap.get(item.class_id) ?? null,
      }));
    };

    return fetchRequests()
      .then((result) => {
        if (signal.aborted || !result) return;

        setRequests(result);
        setLoadError("");

        setReview((current) =>
          current &&
          result.some(
            (request) => request.id === current.requestId,
          )
            ? current
            : null,
        );
      })
      .catch((err: unknown) => {
        if (signal.aborted) return;

        console.error("Load Komting registrations:", err);

        setLoadError(
          getErrorMessage(
            err,
            "Gagal mengambil permohonan Komting.",
          ),
        );
      })
      .finally(() => {
        if (!signal.aborted) {
          setLoading(false);
        }
      });
  }, []);

  function refreshRequests() {
    setLoading(true);
    setLoadError("");

    return loadRequests();
  }

  useEffect(() => {
    void loadRequests();

    return () => {
      controllerRef.current?.abort();
    };
  }, [loadRequests]);

  const ready = !loading && !loadError;

  const classOptions = useMemo(() => {
    const map = new Map<string, ClassInfo>();

    for (const request of requests) {
      if (request.selectedClass) {
        map.set(
          request.selectedClass.id,
          request.selectedClass,
        );
      }
    }

    return [...map.values()].sort((a, b) =>
      a.class_code.localeCompare(b.class_code, "id"),
    );
  }, [requests]);

  const filteredRequests = useMemo(() => {
    const keyword = search.trim().toLocaleLowerCase("id");

    return requests.filter((request) => {
      const matchesClass =
        classFilter === "all" ||
        request.class_id === classFilter;

      const text = [
        request.applicant?.full_name,
        request.applicant?.email,
        request.applicant?.student_number,
        request.selectedClass?.class_code,
        request.selectedClass?.class_name,
        request.selectedClass?.study_program,
      ]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase("id");

      return (
        matchesClass &&
        (!keyword || text.includes(keyword))
      );
    });
  }, [requests, search, classFilter]);

  const requestedClassCount = useMemo(
    () => new Set(requests.map((request) => request.class_id)).size,
    [requests],
  );

  function openReview(
    request: RegistrationRequest,
    decision: ReviewState["decision"],
  ) {
    if (!ready || mutationLock.current) return;

    setActionError("");
    setSuccess("");

    if (
      decision === "approved" &&
      (!request.applicant || !request.selectedClass)
    ) {
      setActionError(
        "Identitas pendaftar dan informasi kelas harus tersedia sebelum persetujuan.",
      );
      return;
    }

    setReview({
      requestId: request.id,
      decision,
      reason: "",
    });
  }

  async function handleReview(
    event: FormEvent<HTMLFormElement>,
    request: RegistrationRequest,
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

    setActionError("");
    setSuccess("");

    const decision = review.decision;
    const reason = review.reason.trim();

    if (decision === "rejected" && !reason) {
      setActionError("Alasan penolakan wajib diisi.");
      return;
    }

    if (
      decision === "approved" &&
      (!request.applicant || !request.selectedClass)
    ) {
      setActionError(
        "Informasi pendaftar atau kelas belum tersedia.",
      );
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
        request.applicant?.full_name || "Pendaftar";

      setSuccess(
        decision === "approved"
          ? `${name} berhasil disetujui sebagai Komting.`
          : `Permohonan ${name} berhasil ditolak.`,
      );

      setReview(null);
      await refreshRequests();
    } catch (err) {
      console.error("Review Komting registration:", err);

      setActionError(
        getErrorMessage(
          err,
          "Gagal memproses permohonan Komting.",
        ),
      );
    } finally {
      mutationLock.current = false;
      setBusyId(null);
    }
  }

  function resetFilters() {
    setSearch("");
    setClassFilter("all");
  }

  return (
    <div className="space-y-5">
      <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wide text-muted">
            Workspace / Verifikasi Pengguna
          </p>

          <h1 className="mt-2 font-heading text-2xl font-bold text-primary sm:text-2xl">
            Persetujuan Komting
          </h1>

          <p className="mt-2 text-sm leading-7 text-muted">
            Periksa identitas pendaftar dan kelas yang akan
            dikoordinasikan.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void refreshRequests()}
          disabled={loading || busyId !== null}
          className="btn-outline w-fit shrink-0 rounded-md text-xs shadow-none"
        >
          {loading ? "Memuat..." : "↻ Muat Ulang"}
        </button>
      </section>

      {loadError && (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm leading-7 text-red-700"
        >
          {loadError}
        </p>
      )}

      {actionError && (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm leading-7 text-red-700"
        >
          {actionError}
        </p>
      )}

      {success && (
        <div
          role="status"
          className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm leading-7 text-emerald-700"
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
        aria-label="Ringkasan permohonan Komting"
        className="grid gap-4 sm:grid-cols-2"
      >
        <div className="rounded-lg border border-slate-200/80 bg-white p-4 shadow-none shadow-slate-200/20 sm:p-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xs font-semibold text-muted">
              Menunggu Persetujuan
            </h2>

            <span className="rounded-md bg-amber-50 p-2 text-amber-800">
              <ApprovalIcon className="h-4 w-4" />
            </span>
          </div>

          <p className="mt-4 font-heading text-3xl font-bold text-primary">
            {ready ? requests.length : "—"}
          </p>

          <p className="mt-2 text-[10px] leading-6 text-muted">
            Permohonan Komting yang belum diproses
          </p>
        </div>

        <div className="rounded-lg border border-slate-200/80 bg-white p-4 shadow-none shadow-slate-200/20 sm:p-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xs font-semibold text-muted">
              Kelas dalam Permohonan
            </h2>

            <span className="rounded-md bg-sky-50 p-2 text-sky-700">
              <ClassIcon className="h-4 w-4" />
            </span>
          </div>

          <p className="mt-4 font-heading text-3xl font-bold text-primary">
            {ready ? requestedClassCount : "—"}
          </p>

          <p className="mt-2 text-[10px] leading-6 text-muted">
            Jumlah kelas berbeda yang dipilih pendaftar
          </p>
        </div>
      </section>

      <section className="rounded-lg border border-slate-200/80 bg-white p-4 sm:p-4">
        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_240px]">
          <div>
            <label
              htmlFor="komting-search"
              className="mb-3 block text-xs font-bold text-primary"
            >
              Cari pendaftar
            </label>

            <input
              id="komting-search"
              type="search"
              value={search}
              onChange={(event) =>
                setSearch(event.target.value)
              }
              placeholder="Nama, NIM, email, atau kelas..."
              className="input-field min-h-11 rounded-md"
            />
          </div>

          <div>
            <label
              htmlFor="komting-class-filter"
              className="mb-3 block text-xs font-bold text-primary"
            >
              Kelas yang dipilih
            </label>

            <select
              id="komting-class-filter"
              value={classFilter}
              onChange={(event) =>
                setClassFilter(event.target.value)
              }
              className="input-field min-h-11 rounded-md"
            >
              <option value="all">Semua Kelas</option>

              {classOptions.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.class_code} - {item.class_name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {(search || classFilter !== "all") && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
            <p className="text-xs text-muted">
              {ready
                ? `${filteredRequests.length} permohonan sesuai filter`
                : "Hasil belum tersedia"}
            </p>

            <button
              type="button"
              onClick={resetFilters}
              className="rounded-md text-xs font-bold text-primary hover:underline focus-visible:outline-2 focus-visible:outline-primary"
            >
              Reset Filter
            </button>
          </div>
        )}
      </section>

      <section className="space-y-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span
              aria-hidden="true"
              className="h-6 w-1 rounded-full bg-secondary"
            />

            <h2 className="font-heading text-lg font-bold text-primary">
              Calon Komting
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
            className="rounded-lg border border-slate-200 bg-white p-12 text-center"
          >
            <div
              aria-hidden="true"
              className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-slate-100 border-t-primary"
            />

            <p className="mt-4 text-sm text-muted">
              Memuat permohonan Komting...
            </p>
          </div>
        ) : loadError ? (
          <p className="rounded-lg border border-slate-200 bg-white p-10 text-center text-sm text-muted">
            Permohonan belum dapat dimuat. Silakan tekan
            Muat Ulang.
          </p>
        ) : filteredRequests.length === 0 ? (
          <div className="rounded-lg border border-slate-200 bg-white p-12 text-center">
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-lg bg-slate-100 text-primary">
              <ApprovalIcon className="h-7 w-7" />
            </span>

            <h3 className="mt-4 text-sm font-bold text-primary">
              {requests.length === 0
                ? "Tidak ada permohonan yang menunggu"
                : "Pendaftar tidak ditemukan"}
            </h3>

            <p className="mt-2 text-xs leading-6 text-muted">
              {requests.length === 0
                ? "Permohonan Komting baru akan muncul di halaman ini."
                : "Coba ubah kata kunci atau filter kelas."}
            </p>

            {(search || classFilter !== "all") && (
              <button
                type="button"
                onClick={resetFilters}
                className="btn-outline mt-5 rounded-md text-xs"
              >
                Reset Filter
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {filteredRequests.map((request) => {
              const applicant = request.applicant;
              const selectedClass = request.selectedClass;
              const name =
                applicant?.full_name ||
                "Informasi pendaftar tidak tersedia";

              const reviewing =
                review?.requestId === request.id;

              const canApprove =
                applicant !== null &&
                selectedClass !== null;

              return (
                <article
                  key={request.id}
                  className="overflow-hidden rounded-lg border border-slate-200/80 bg-white shadow-none shadow-slate-200/20"
                >
                  <div className="flex flex-col justify-between gap-4 border-b border-slate-100 p-4 sm:flex-row sm:items-start sm:p-4">
                    <div className="flex min-w-0 items-start gap-3">
                      <span
                        aria-hidden="true"
                        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-xs font-bold text-primary"
                      >
                        {initials(
                          applicant?.full_name || "Komting",
                        )}
                      </span>

                      <div className="min-w-0">
                        <h3 className="break-words font-heading text-base font-bold text-primary">
                          {name}
                        </h3>

                        <p className="mt-2 text-[10px] leading-6 text-muted">
                          Mendaftar{" "}
                          {formatDate(request.created_at)}
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

                  <div className="space-y-5 p-4 sm:p-4">
                    <dl className="grid gap-3 sm:grid-cols-2">
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

                    <section className="flex items-start gap-3 rounded-lg border border-slate-200 p-4">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-slate-100 text-primary">
                        <ClassIcon />
                      </span>

                      <div className="min-w-0">
                        <h4 className="text-[10px] font-semibold uppercase tracking-wider text-muted">
                          Kelas yang Dipilih
                        </h4>

                        <p className="mt-2 break-words text-sm font-bold leading-7 text-primary">
                          {selectedClass
                            ? `${selectedClass.class_code} · ${selectedClass.class_name}`
                            : "Informasi kelas tidak tersedia"}
                        </p>

                        {selectedClass && (
                          <p className="mt-1 text-xs leading-6 text-muted">
                            {selectedClass.study_program}
                          </p>
                        )}
                      </div>
                    </section>

                    {!canApprove && (
                      <p className="rounded-md border border-amber-200 p-4 text-xs leading-7 text-amber-800">
                        Identitas pendaftar atau informasi kelas
                        belum tersedia. Periksa kembali data
                        sebelum menyetujui permohonan.
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
                          className="inline-flex min-h-11 items-center justify-center rounded-md border border-red-200 px-4 py-2 text-xs font-semibold text-red-700 transition hover:bg-red-50 focus-visible:outline-2 focus-visible:outline-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Tolak Permohonan
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            openReview(request, "approved")
                          }
                          disabled={
                            busyId !== null ||
                            loading ||
                            !canApprove
                          }
                          className="btn-primary rounded-md text-xs"
                        >
                          Setujui Komting
                        </button>
                      </div>
                    ) : (
                      review && (
                        <form
                          onSubmit={(event) =>
                            void handleReview(event, request)
                          }
                          aria-busy={busyId === request.id}
                          className="rounded-lg border border-slate-200 p-4 sm:p-4"
                        >
                          <h4 className="text-sm font-bold text-primary">
                            {review.decision === "approved"
                              ? "Konfirmasi Persetujuan"
                              : "Tolak Permohonan"}
                          </h4>

                          <p className="mt-2 text-xs leading-7 text-muted">
                            {review.decision === "approved"
                              ? `Setujui ${name} sebagai Komting ${
                                  selectedClass?.class_code ||
                                  "kelas yang dipilih"
                                }?`
                              : "Tuliskan alasan penolakan yang akan ditampilkan kepada pendaftar."}
                          </p>

                          {review.decision === "rejected" && (
                            <div className="mt-4">
                              <label
                                htmlFor={`komting-reason-${request.id}`}
                                className="mb-2 block text-xs font-semibold text-primary"
                              >
                                Alasan penolakan *
                              </label>

                              <textarea
                                id={`komting-reason-${request.id}`}
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
                                required
                                rows={3}
                                placeholder="Jelaskan alasan penolakan..."
                                className="input-field resize-y rounded-md"
                              />
                            </div>
                          )}

                          <div className="mt-5 flex flex-wrap justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => setReview(null)}
                              disabled={busyId !== null}
                              className="btn-outline rounded-md text-xs"
                            >
                              Batal
                            </button>

                            <button
                              type="submit"
                              disabled={
                                busyId !== null ||
                                (
                                  review.decision ===
                                    "approved" &&
                                  !canApprove
                                )
                              }
                              className={
                                review.decision === "approved"
                                  ? "btn-primary rounded-md text-xs"
                                  : "btn-danger rounded-md text-xs"
                              }
                            >
                              {busyId === request.id
                                ? "Memproses..."
                                : review.decision === "approved"
                                  ? "Ya, Setujui Komting"
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

      <section className="rounded-lg border border-dashed border-slate-300 bg-white p-4">
        <h2 className="text-xs font-bold text-primary">
          Periksa Identitas dan Kelas
        </h2>

        <p className="mt-2 text-xs leading-7 text-muted">
          Pastikan pendaftar merupakan Komting yang sesuai dengan
          kelas pilihannya. Server memvalidasi kembali permohonan
          saat keputusan dikirim. Permohonan yang telah diproses
          akan keluar dari daftar menunggu.
        </p>
      </section>
    </div>
  );
}