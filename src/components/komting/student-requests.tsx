"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getErrorMessage } from "@/lib/errors";
import { createClient } from "@/lib/supabase/client";

type RequestStatus = "pending" | "acknowledged" | "rejected" | "cancelled";

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
type StudentInfo = { id: string; full_name: string; student_number: string | null; is_active: boolean };
type RoomSummary = {
  id: string;
  room_code: string;
  room_name: string;
  building: string | null;
  floor: string | null;
  capacity: number;
};

const statusLabel: Record<RequestStatus, string> = {
  pending: "Menunggu ditinjau",
  acknowledged: "Diterima / ditindaklanjuti",
  rejected: "Ditolak",
  cancelled: "Dibatalkan Mahasiswa"
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "long",
    timeZone: "Asia/Jakarta",
  }).format(new Date(`${value}T00:00:00+07:00`));
}

function formatTime(value: string) {
  return value.slice(0, 5);
}

export default function StudentRequestInbox() {
  const [requests, setRequests] = useState<StudentRequest[]>([]);
  const [students, setStudents] = useState<StudentInfo[]>([]);
  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [filter, setFilter] = useState<"all" | RequestStatus>("pending");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const loadRequests = useCallback((signal?: AbortSignal) => {
    const request = async () => {
      const supabase = createClient();
      const [
        { data: requestData, error: requestError },
        { data: studentData, error: studentError },
        { data: roomData, error: roomError },
      ] = await Promise.all([
        supabase
          .from("student_room_requests")
          .select(
            "id, student_id, activity_title, purpose, preferred_date, preferred_start_time, preferred_end_time, preferred_room_type, preferred_room_id, participant_count, notes, status, response_note, created_at"
          )
          .order("created_at", { ascending: false }),

        supabase.rpc("get_komting_student_directory"),

        supabase
          .from("rooms")
          .select("id, room_code, room_name, building, floor, capacity")
          .eq("is_active", true),
      ]);

      if (requestError) throw requestError;
      if (studentError) throw studentError;
      if (roomError) throw roomError;

      if (signal?.aborted) return;
      setRequests((requestData ?? []) as StudentRequest[]);
      setStudents((studentData ?? []) as StudentInfo[]);
      setRooms((roomData ?? []) as RoomSummary[]);
    };
    return request().catch((err: unknown) => {
      console.error("Load student room requests:", err);
      if (!signal?.aborted) setError(getErrorMessage(err, "Gagal memuat pengajuan mahasiswa."));
    }).finally(() => {
      if (!signal?.aborted) {
        setLoading(false);
        setRefreshing(false);
      }
    });
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void loadRequests(controller.signal);
    return () => controller.abort();
  }, [loadRequests]);

  const studentMap = useMemo(() => new Map(students.map((student) => [student.id, student])), [students]);
  const pendingCount = requests.filter((request) => request.status === "pending").length;
  const filteredRequests = requests.filter((request) => filter === "all" || request.status === filter);

  async function reviewRequest(request: StudentRequest, decision: "acknowledged" | "rejected") {
    const student = studentMap.get(request.student_id);
    const studentName = student?.full_name ?? "mahasiswa ini";
    let responseNote = "";

    if (decision === "acknowledged") {
      const note = window.prompt(
        `Terima saran dari ${studentName}. Tambahkan catatan untuk mahasiswa (opsional):`,
        "",
      );
      if (note === null) return;
      responseNote = note.trim();
      if (!window.confirm(`Terima saran kebutuhan ruangan dari ${studentName} dan tandai untuk ditindaklanjuti?`)) return;
    } else {
      const note = window.prompt(`Masukkan alasan penolakan untuk ${studentName}:`);
      if (note === null) return;
      if (!note.trim()) {
        setError("Alasan penolakan wajib diisi.");
        return;
      }
      responseNote = note.trim();
      if (!window.confirm(`Tolak saran kebutuhan ruangan dari ${studentName}?`)) return;
    }

    setBusyId(request.id);
    setError("");
    setSuccess("");
    try {
      const supabase = createClient();
      const { error: rpcError } = await supabase.rpc("review_student_room_request", {
        p_request_id: request.id,
        p_decision: decision,
        p_response_note: responseNote || null,
      });
      if (rpcError) throw rpcError;

      setSuccess(
        decision === "acknowledged"
          ? "Saran diterima dan ditandai untuk ditindaklanjuti. Komting tetap perlu mengajukan booking melalui menu Ajukan Booking."
          : "Saran mahasiswa berhasil ditolak.",
      );
      setRefreshing(true);
      await loadRequests();
    } catch (err) {
      console.error("Review student room request:", err);
      setError(getErrorMessage(err, "Gagal memproses pengajuan mahasiswa."));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-medium text-slate-500">Koordinasi Kelas</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">Pengajuan Mahasiswa</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-500">
            Terima kebutuhan penggunaan ruangan yang disampaikan mahasiswa. Setelah diterima, Komting tetap mengajukan booking melalui menu Ajukan Booking.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
                      setRefreshing(true);
                      setError("");
                      void loadRequests();
                    }}
          disabled={loading || refreshing}
          className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          {refreshing ? "Memuat..." : "Muat Ulang"}
        </button>
      </div>

      {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
      {success && <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">{success}</div>}

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-amber-200 bg-white p-5">
          <p className="text-sm text-slate-500">Menunggu ditinjau</p>
          <p className="mt-1 text-3xl font-bold tabular-nums text-amber-700">{loading ? "-" : pendingCount}</p>
        </div>
        <div className="rounded-xl border border-emerald-200 bg-white p-5">
          <p className="text-sm text-slate-500">Diterima</p>
          <p className="mt-1 text-3xl font-bold tabular-nums text-emerald-700">{loading ? "-" : requests.filter((item) => item.status === "acknowledged").length}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-sm text-slate-500">Total pengajuan</p>
          <p className="mt-1 text-3xl font-bold tabular-nums text-slate-900">{loading ? "-" : requests.length}</p>
        </div>
      </div>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-semibold text-slate-900">Kotak Masuk</h2>
            <p className="mt-1 text-xs text-slate-500">Pengajuan hanya berasal dari mahasiswa di kelasmu.</p>
          </div>
          <select
            value={filter}
            onChange={(event) => setFilter(event.target.value as "all" | RequestStatus)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none focus:border-slate-500"
            aria-label="Filter status pengajuan"
          >
            <option value="pending">Menunggu ditinjau</option>
            <option value="acknowledged">Diterima</option>
            <option value="rejected">Ditolak</option>
            <option value="all">Semua status</option>
            <option value="cancelled">Dibatalkan Mahasiswa</option>
          </select>
        </div>

        {loading ? (
          <div className="p-10 text-center text-sm text-slate-500">Memuat pengajuan mahasiswa...</div>
        ) : filteredRequests.length === 0 ? (
          <div className="p-10 text-center">
            <p className="font-semibold text-slate-800">Belum ada pengajuan pada kategori ini.</p>
            <p className="mt-1 text-sm text-slate-500">Pengajuan baru dari mahasiswa akan muncul di sini.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filteredRequests.map((request) => {
              const student = studentMap.get(request.student_id);
              const preferredRoom = rooms.find(
                (room) => room.id === request.preferred_room_id
              );
              return (
                <article key={request.id} className="space-y-4 p-5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold text-slate-900">{request.activity_title}</h3>
                        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${request.status === "pending" ? "bg-amber-50 text-amber-700" : request.status === "acknowledged" ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
                          {statusLabel[request.status]}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-slate-600">
                        {student?.full_name ?? "Mahasiswa tidak ditemukan"}
                        {student?.student_number ? ` · ${student.student_number}` : ""}
                        {student && !student.is_active ? " · Akun nonaktif" : ""}
                      </p>
                    </div>
                    <p className="shrink-0 text-xs text-slate-400">
                      Dikirim {new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" }).format(new Date(request.created_at))}
                    </p>
                  </div>

                  <p className="whitespace-pre-wrap text-sm leading-6 text-slate-700">{request.purpose}</p>

                  <div className="grid gap-3 rounded-lg bg-slate-50 p-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
                    <div><p className="text-xs text-slate-400">Tanggal yang dibutuhkan</p><p className="mt-1 font-medium text-slate-800">{formatDate(request.preferred_date)}</p></div>
                    <div><p className="text-xs text-slate-400">Waktu</p><p className="mt-1 font-medium text-slate-800">{formatTime(request.preferred_start_time)}-{formatTime(request.preferred_end_time)}</p></div>
                    <div><p className="text-xs text-slate-400">Jenis ruangan</p><p className="mt-1 font-medium capitalize text-slate-800">{request.preferred_room_type === "bebas" ? "Bebas" : request.preferred_room_type}</p></div>
                    <div><p className="text-xs text-slate-400">Jumlah peserta</p><p className="mt-1 font-medium text-slate-800">{request.participant_count ?? "Belum ditentukan"}</p></div>
                  </div>
                  {/* Ruangan pilihan mahasiswa */}
<div className="rounded-lg border border-blue-100 bg-blue-50 p-4">
  <p className="text-xs font-semibold text-slate-500">
    Ruangan yang Diinginkan
  </p>

  <p className="mt-1 font-semibold text-slate-900">
    {request.preferred_room_id
      ? preferredRoom
        ? `${preferredRoom.room_code} - ${preferredRoom.room_name}`
        : "Ruangan tidak aktif atau tidak ditemukan"
      : "Tidak ada preferensi ruangan"}
  </p>

  {preferredRoom && (
    <p className="mt-1 text-xs text-slate-500">
      {preferredRoom.building || "Gedung tidak tersedia"}
      {" · "}
      Lantai {preferredRoom.floor || "-"}
      {" · "}
      Kapasitas {preferredRoom.capacity} orang
    </p>
  )}
</div>

                  {request.notes && <p className="text-sm text-slate-600"><span className="font-medium text-slate-800">Catatan:</span> {request.notes}</p>}
                  {request.response_note && <p className="rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-600"><span className="font-semibold text-slate-800">Respons Komting:</span> {request.response_note}</p>}

                  {request.status === "pending" && (
                    <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-3">
                      <button
                        type="button"
                        onClick={() => void reviewRequest(request, "rejected")}
                        disabled={busyId !== null}
                        className="rounded-lg border border-rose-200 px-4 py-2.5 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                      >
                        Tolak
                      </button>
                      <button
                        type="button"
                        onClick={() => void reviewRequest(request, "acknowledged")}
                        disabled={busyId !== null}
                        className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
                      >
                        {busyId === request.id ? "Memproses..." : "Terima & Tindaklanjuti"}
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
