
"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getErrorMessage } from "@/lib/errors";

type RegistrationRequest = {
    id: string;
    user_id: string;
    class_id: string;
    created_at: string;
    applicant: {
        full_name: string;
        email: string | null;
        student_number: string | null;
    } | null;
    selectedClass: {
        class_code: string;
        class_name: string;
        study_program: string;
    } | null;
};

function formatDate(value: string) {
    return new Intl.DateTimeFormat("id-ID", {
        dateStyle: "long",
        timeStyle: "short",
    }).format(new Date(value));
}

export default function KomtingApproval() {
    const [requests, setRequests] = useState<RegistrationRequest[]>([]);
    const [loading, setLoading] = useState(true);
    const [busyId, setBusyId] = useState<string | null>(null);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");

    const loadRequests = useCallback((signal?: AbortSignal) => {
        const request = async () => {
            const supabase = createClient();

            // Ambil permohonan Komting yang masih pending.
            const { data: requestData, error: requestError } = await supabase
                .from("registration_requests")
                .select("id, user_id, class_id, created_at")
                .eq("requested_role", "komting")
                .eq("status", "pending")
                .order("created_at", { ascending: true });

            if (signal?.aborted) return;
            if (requestError) throw requestError;

            if (!requestData || requestData.length === 0) {
                setRequests([]);
                return;
            }

            const userIds = [...new Set(requestData.map((item) => item.user_id))];
            const classIds = [...new Set(requestData.map((item) => item.class_id))];

            // Ambil identitas pendaftar.
            const { data: profiles, error: profileError } = await supabase
                .from("profiles")
                .select("id, full_name, email, student_number")
                .in("id", userIds);

            if (signal?.aborted) return;
            if (profileError) throw profileError;

            // Ambil informasi kelas.
            const { data: classes, error: classError } = await supabase
                .from("classes")
                .select("id, class_code, class_name, study_program")
                .in("id", classIds);

            if (signal?.aborted) return;
            if (classError) throw classError;

            const profileMap = new Map(
                (profiles ?? []).map((profile) => [profile.id, profile])
            );

            const classMap = new Map(
                (classes ?? []).map((item) => [item.id, item])
            );

            const formattedRequests = requestData.map((item) => ({
                ...item,
                applicant: profileMap.get(item.user_id) ?? null,
                selectedClass: classMap.get(item.class_id) ?? null,
            }));

            setRequests(formattedRequests);
        };

        return request().catch((err: unknown) => {
            if (!signal?.aborted) {
                console.error("Load Komting requests:", err);
                setError(getErrorMessage(err, "Gagal mengambil permohonan Komting."));
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

    async function refreshRequests() {
        setLoading(true);
        setError("");
        await loadRequests();
    }

    async function handleReview(
        request: RegistrationRequest,
        decision: "approved" | "rejected"
    ) {
        let rejectionReason: string | null = null;

        if (decision === "approved") {
            const confirmed = window.confirm(
                `Setujui ${request.applicant?.full_name} sebagai Komting ${request.selectedClass?.class_code}?`
            );

            if (!confirmed) return;
        }

        if (decision === "rejected") {
            const reason = window.prompt(
                "Masukkan alasan penolakan permohonan:"
            );

            if (reason === null) return;

            if (!reason.trim()) {
                setError("Alasan penolakan wajib diisi.");
                return;
            }

            rejectionReason = reason.trim();

            if (
                !window.confirm(
                    `Tolak permohonan ${request.applicant?.full_name}?`
                )
            ) {
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
                    ? `${request.applicant?.full_name} berhasil disetujui sebagai Komting.`
                    : `Permohonan ${request.applicant?.full_name} berhasil ditolak.`
            );

            await refreshRequests();
        } catch (err) {
            console.error("Review registration:", err);

            setError(
                getErrorMessage(err, "Gagal memproses permohonan.")
            );
        } finally {
            setBusyId(null);
        }
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">
                        Persetujuan Komting
                    </h1>
                    <p className="mt-1 text-sm text-slate-500">
                        Periksa permohonan pengguna yang ingin menjadi Komting.
                    </p>
                </div>

                <button
                    onClick={() => void refreshRequests()}
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
                    Permohonan Menunggu Persetujuan
                </p>

                <p className="mt-2 text-3xl font-bold text-slate-900">
                    {loading ? "..." : requests.length}
                </p>
            </div>

            <div className="rounded-xl border bg-white">
                <div className="border-b p-5">
                    <h2 className="font-semibold text-slate-900">
                        Daftar Calon Komting
                    </h2>
                    <p className="mt-1 text-xs text-slate-500">
                        Hanya permohonan Komting dengan status Pending yang ditampilkan.
                    </p>
                </div>

                {loading ? (
                    <div className="p-10 text-center text-sm text-slate-400">
                        Memuat permohonan...
                    </div>
                ) : requests.length === 0 ? (
                    <div className="p-10 text-center">
                        <p className="font-medium text-slate-700">
                            Belum ada permohonan Komting.
                        </p>
                        <p className="mt-2 text-sm text-slate-400">
                            Permohonan baru akan muncul di halaman ini.
                        </p>
                    </div>
                ) : (
                    <div className="divide-y">
                        {requests.map((request) => (
                            <div
                                key={request.id}
                                className="flex flex-col justify-between gap-5 p-5 lg:flex-row lg:items-center"
                            >
                                <div className="min-w-0 flex-1 space-y-3">
                                    <div>
                                        <div className="flex flex-wrap items-center gap-2">
                                            <h3 className="font-semibold text-slate-900">
                                                {request.applicant?.full_name ?? "Pengguna tidak ditemukan"}
                                            </h3>

                                            <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-700">
                                                Menunggu
                                            </span>
                                        </div>

                                        <p className="mt-1 break-all text-sm text-slate-500">
                                            {request.applicant?.email ?? "-"}
                                        </p>

                                        <p className="mt-1 text-sm text-slate-500">
                                            NIM: {request.applicant?.student_number ?? "-"}
                                        </p>
                                    </div>

                                    <div className="grid gap-3 sm:grid-cols-2">
                                        <div>
                                            <p className="text-xs text-slate-400">
                                                Kelas yang dipilih
                                            </p>
                                            <p className="mt-1 text-sm font-semibold text-slate-800">
                                                {request.selectedClass?.class_code ?? "-"}
                                                {" - "}
                                                {request.selectedClass?.class_name ?? ""}
                                            </p>
                                            <p className="text-xs text-slate-500">
                                                {request.selectedClass?.study_program ?? ""}
                                            </p>
                                        </div>

                                        <div>
                                            <p className="text-xs text-slate-400">
                                                Waktu pendaftaran
                                            </p>
                                            <p className="mt-1 text-sm text-slate-700">
                                                {formatDate(request.created_at)}
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex gap-2 lg:flex-col">
                                    <button
                                        onClick={() => handleReview(request, "approved")}
                                        disabled={busyId !== null}
                                        className="flex-1 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
                                    >
                                        {busyId === request.id
                                            ? "Memproses..."
                                            : "Setujui"}
                                    </button>

                                    <button
                                        onClick={() => handleReview(request, "rejected")}
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
