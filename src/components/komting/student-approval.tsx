
"use client";

import { useCallback, useEffect, useState } from "react";
import { getErrorMessage } from "@/lib/errors";
import { createClient } from "@/lib/supabase/client";

type StudentRequest = {
  id: string;
  user_id: string;
  class_id: string;
  created_at: string;
  applicant: {
    full_name: string;
    email: string | null;
    student_number: string | null;
  } | null;
};

export default function StudentApproval() {
  const [requests, setRequests] = useState<StudentRequest[]>([]);
  const [className, setClassName] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const loadRequests = useCallback((signal?: AbortSignal) => {
    const request = async () => {
      const supabase = createClient();

      // Identifikasi Komting yang sedang login.
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError) throw authError;
      if (!user) {
        throw new Error("Sesi pengguna tidak ditemukan.");
      }

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("id, full_name, role, class_id, is_active")
        .eq("id", user.id)
        .maybeSingle();

      if (profileError) throw profileError;

      if (
        !profile ||
        profile.role !== "komting" ||
        !profile.is_active ||
        !profile.class_id
      ) {
        throw new Error("Akun tidak memiliki akses sebagai Komting.");
      }

      // Ambil informasi kelas Komting.
      const { data: classData, error: classError } = await supabase
        .from("classes")
        .select("class_code, class_name")
        .eq("id", profile.class_id)
        .maybeSingle();

      if (classError) throw classError;

      if (signal?.aborted) return;
      if (classData) {
        setClassName(
          `${classData.class_code} - ${classData.class_name}`
        );
      }

      // Ambil mahasiswa Pending dari kelas Komting yang login.
      const { data: requestData, error: requestError } = await supabase
        .from("registration_requests")
        .select("id, user_id, class_id, created_at")
        .eq("requested_role", "mahasiswa")
        .eq("status", "pending")
        .eq("class_id", profile.class_id)
        .order("created_at", { ascending: true });

      if (requestError) throw requestError;

      if (signal?.aborted) return;
      if (!requestData || requestData.length === 0) {
        setRequests([]);
        return;
      }

      // Ambil informasi pendaftar.
      const userIds = [
        ...new Set(requestData.map((item) => item.user_id)),
      ];

      const { data: students, error: studentError } = await supabase
        .from("profiles")
        .select("id, full_name, email, student_number")
        .in("id", userIds);

      if (studentError) throw studentError;

      const studentMap = new Map(
        (students ?? []).map((student) => [
          student.id,
          {
            full_name: student.full_name,
            email: student.email,
            student_number: student.student_number,
          },
        ])
      );

      if (signal?.aborted) return;
      setRequests(
        requestData.map((item) => ({
          ...item,
          applicant: studentMap.get(item.user_id) ?? null,
        }))
      );
    };
    return request().catch((err: unknown) => {
      console.error("Load student requests:", err);

      if (!signal?.aborted) {
        setError(getErrorMessage(err, "Gagal mengambil permohonan mahasiswa."));
      }
    }).finally(() => {
      if (!signal?.aborted) setLoading(false);
    });
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void loadRequests(controller.signal);
    return () => controller.abort();
  }, [loadRequests]);

  async function handleReview(
    request: StudentRequest,
    decision: "approved" | "rejected"
  ) {
    let rejectionReason: string | null = null;

    if (decision === "approved") {
      const confirmed = window.confirm(
        `Terima ${request.applicant?.full_name} sebagai anggota kelas ${className}?`
      );

      if (!confirmed) return;
    }

    if (decision === "rejected") {
      const reason = window.prompt(
        "Masukkan alasan penolakan pendaftaran:"
      );

      if (reason === null) return;

      if (!reason.trim()) {
        setError("Alasan penolakan wajib diisi.");
        return;
      }

      rejectionReason = reason.trim();

      if (!window.confirm("Tolak pendaftaran mahasiswa ini?")) {
        return;
      }
    }

    setBusyId(request.id);
    setError("");
    setSuccess("");

    try {
      const supabase = createClient();

      const { error } = await supabase.rpc(
        "review_registration_request",
        {
          p_request_id: request.id,
          p_decision: decision,
          p_rejection_reason: rejectionReason,
        }
      );

      if (error) throw error;

      setSuccess(
        decision === "approved"
          ? `${request.applicant?.full_name} berhasil diterima sebagai mahasiswa.`
          : `Pendaftaran ${request.applicant?.full_name} berhasil ditolak.`
      );

      setLoading(true);
      await loadRequests();
    } catch (err) {
      console.error("Review student:", err);

      setError(getErrorMessage(err, "Gagal memproses pendaftaran."));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Persetujuan Mahasiswa
          </h1>

          <p className="mt-1 text-sm text-slate-500">
            Kelola permohonan mahasiswa yang ingin bergabung ke kelas Anda.
          </p>

          {className && (
            <p className="mt-2 text-sm font-semibold text-slate-800">
              Kelas: {className}
            </p>
          )}
        </div>

        <button
          onClick={() => {
                      setLoading(true);
                      setError("");
                      void loadRequests();
                    }}
          disabled={loading}
          className="rounded-lg border bg-white px-4 py-2.5 text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
        >
          {loading ? "Memuat..." : "Muat Ulang"}
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {success && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-700">
          {success}
        </div>
      )}

      <div className="rounded-xl border bg-white p-5">
        <p className="text-sm text-slate-500">
          Menunggu Persetujuan
        </p>

        <p className="mt-2 text-3xl font-bold text-slate-900">
          {loading ? "..." : requests.length}
        </p>
      </div>

      <div className="rounded-xl border bg-white">
        <div className="border-b p-5">
          <h2 className="font-semibold text-slate-900">
            Daftar Calon Mahasiswa
          </h2>

          <p className="mt-1 text-xs text-slate-500">
            Permohonan yang memilih kelas Anda dan belum diproses.
          </p>
        </div>

        {loading ? (
          <div className="p-10 text-center text-sm text-slate-400">
            Memuat permohonan...
          </div>
        ) : requests.length === 0 ? (
          <div className="p-10 text-center">
            <p className="font-medium text-slate-700">
              Belum ada permohonan mahasiswa.
            </p>

            <p className="mt-2 text-sm text-slate-400">
              Pendaftar baru akan muncul di sini.
            </p>
          </div>
        ) : (
          <div className="divide-y">
            {requests.map((request) => (
              <div
                key={request.id}
                className="flex flex-col justify-between gap-5 p-5 lg:flex-row lg:items-center"
              >
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold text-slate-900">
                      {request.applicant?.full_name ??
                        "Pengguna tidak ditemukan"}
                    </h3>

                    <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-700">
                      Pending
                    </span>
                  </div>

                  <div className="space-y-1 text-sm text-slate-500">
                    <p>
                      Email: {request.applicant?.email ?? "-"}
                    </p>

                    <p>
                      NIM: {request.applicant?.student_number ?? "-"}
                    </p>

                    <p>
                      Mendaftar:{" "}
                      {new Intl.DateTimeFormat("id-ID", {
                        dateStyle: "long",
                        timeStyle: "short",
                      }).format(new Date(request.created_at))}
                    </p>
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() =>
                      handleReview(request, "approved")
                    }
                    disabled={busyId !== null}
                    className="flex-1 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
                  >
                    {busyId === request.id
                      ? "Memproses..."
                      : "Setujui"}
                  </button>

                  <button
                    onClick={() =>
                      handleReview(request, "rejected")
                    }
                    disabled={busyId !== null}
                    className="flex-1 rounded-lg border border-red-200 px-4 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                  >
                    Tolak
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
