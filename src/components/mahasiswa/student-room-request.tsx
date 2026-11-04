
"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { createClient } from "@/lib/supabase/client";
import { getErrorMessage } from "@/lib/errors";
import { useCurrentTime } from "@/lib/hooks/use-current-time";

type RequestStatus =
  | "pending"
  | "acknowledged"
  | "rejected"
  | "cancelled";

type RoomRequest = {
  id: string;
  activity_title: string;
  purpose: string;
  preferred_date: string;
  preferred_start_time: string;
  preferred_end_time: string;
  preferred_room_type: "kelas" | "laboratorium" | "bebas";
  preferred_room_id: string | null;
  participant_count: number | null;
  notes: string | null;
  status: RequestStatus;
  response_note: string | null;
  created_at: string;
};

type RoomOption = {
  id: string;
  room_code: string;
  room_name: string;
  room_type: "kelas" | "laboratorium";
  building: string | null;
  floor: string | null;
  capacity: number;
  facilities: string[] | null;
  is_active: boolean;
};

type ClassInfo = {
  class_code: string;
  class_name: string;
};

function getJakartaDate(now: number) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(now));

  const year = parts.find((p) => p.type === "year")?.value;
  const month = parts.find((p) => p.type === "month")?.value;
  const day = parts.find((p) => p.type === "day")?.value;

  return `${year}-${month}-${day}`;
}

function getJakartaTime() {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jakarta",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date());
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "long",
    timeZone: "Asia/Jakarta",
  }).format(new Date(`${value}T12:00:00+07:00`));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Jakarta",
  }).format(new Date(value));
}

const statusConfig: Record<
  RequestStatus,
  { label: string; style: string }
> = {
  pending: {
    label: "Menunggu Komting",
    style: "bg-amber-50 text-amber-700",
  },
  acknowledged: {
    label: "Diterima / Ditindaklanjuti",
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
};

export default function StudentRoomRequest() {
  const now = useCurrentTime();
  const loadController = useRef<AbortController | null>(null);
  const [classInfo, setClassInfo] = useState<ClassInfo | null>(null);
  const [requests, setRequests] = useState<RoomRequest[]>([]);
  const [rooms, setRooms] = useState<RoomOption[]>([]);
  const [preferredRoomId, setPreferredRoomId] = useState("");

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [busyCancelId, setBusyCancelId] = useState<string | null>(null);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [activityTitle, setActivityTitle] = useState("");
  const [purpose, setPurpose] = useState("");
  const [preferredDate, setPreferredDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [roomType, setRoomType] = useState<
    "bebas" | "kelas" | "laboratorium"
  >("bebas");
  const [participantCount, setParticipantCount] = useState("");
  const [notes, setNotes] = useState("");

  const loadData = useCallback(() => {
    loadController.current?.abort();
    const controller = new AbortController();
    loadController.current = controller;
    const { signal } = controller;
    const request = async () => {
      const supabase = createClient();

      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (signal?.aborted) return;
      if (authError) throw authError;
      if (!user) throw new Error("Sesi login tidak ditemukan.");

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("class_id, role, is_active")
        .eq("id", user.id)
        .single();

      if (signal?.aborted) return;
      if (profileError) throw profileError;

      if (
        profile.role !== "mahasiswa" ||
        !profile.is_active ||
        !profile.class_id
      ) {
        throw new Error("Akun tidak memiliki akses ke fitur ini.");
      }

      const [
        { data: classData, error: classError },
        { data: requestData, error: requestError },
        { data: roomData, error: roomError },
      ] = await Promise.all([
        supabase
          .from("classes")
          .select("class_code, class_name")
          .eq("id", profile.class_id)
          .single(),

        supabase
          .from("student_room_requests")
          .select(
            "id, activity_title, purpose, preferred_date, preferred_start_time, preferred_end_time, preferred_room_type, preferred_room_id, participant_count, notes, status, response_note, created_at"
          )
          .order("created_at", { ascending: false }),

        supabase
          .from("rooms")
          .select(
            "id, room_code, room_name, room_type, building, floor, capacity, facilities, is_active"
          )
          .eq("is_active", true)
          .order("room_code", { ascending: true }),
      ]);

      if (signal?.aborted) return;
      if (classError) throw classError;
      if (requestError) throw requestError;
      if (roomError) throw roomError;

      setClassInfo(classData as ClassInfo);
      setRequests((requestData ?? []) as RoomRequest[]);
      setRooms((roomData ?? []) as RoomOption[]);
    };
    return request().catch((err: unknown) => {
      if (signal?.aborted) return;
      console.error("Load student room requests:", err);
      setError(getErrorMessage(err, "Gagal memuat pengajuan."));
    }).finally(() => {
      if (signal?.aborted) return;
      setLoading(false);
      setRefreshing(false);
    });
  }, []);

  useEffect(() => {
    void loadData();
    return () => loadController.current?.abort();
  }, [loadData]);

  function refreshData() {
    setRefreshing(true);
    setError("");
    return loadData();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setError("");
    setSuccess("");

    if (
      !activityTitle.trim() ||
      !purpose.trim() ||
      !preferredDate ||
      !startTime ||
      !endTime
    ) {
      setError("Lengkapi seluruh informasi yang wajib diisi.");
      return;
    }

    if (endTime <= startTime) {
      setError("Jam selesai harus lebih besar dari jam mulai.");
      return;
    }

    if (activityTitle.trim().length < 3 || activityTitle.trim().length > 120) {
      setError("Nama kegiatan harus terdiri dari 3 sampai 120 karakter.");
      return;
    }

    if (purpose.trim().length < 5 || purpose.trim().length > 1000) {
      setError("Kebutuhan atau tujuan harus terdiri dari 5 sampai 1000 karakter.");
      return;
    }

    if (notes.trim().length > 1000) {
      setError("Catatan tambahan maksimal 1000 karakter.");
      return;
    }

    const today = getJakartaDate(Date.now());

    if (
      preferredDate < today ||
      (preferredDate === today && startTime <= getJakartaTime())
    ) {
      setError("Tanggal dan waktu kebutuhan harus berada di masa depan.");
      return;
    }

    if (
      participantCount &&
      (!Number.isInteger(Number(participantCount)) ||
        Number(participantCount) <= 0)
    ) {
      setError("Jumlah peserta harus berupa bilangan lebih dari nol.");
      return;
    }

    setSubmitting(true);

    try {
      const supabase = createClient();

      if (preferredRoomId) {
        const { data: room, error: roomError } = await supabase
          .from("rooms")
          .select("is_active, room_type, capacity")
          .eq("id", preferredRoomId)
          .maybeSingle();

        if (roomError) throw roomError;
        if (!room?.is_active) {
          throw new Error("Ruangan yang dipilih tidak tersedia atau sudah nonaktif.");
        }
        if (roomType !== "bebas" && room.room_type !== roomType) {
          throw new Error("Ruangan yang dipilih tidak sesuai jenis ruangan.");
        }
        if (participantCount && Number(participantCount) > room.capacity) {
          throw new Error("Jumlah peserta melebihi kapasitas ruangan yang dipilih.");
        }
      }

      const { error: rpcError } = await supabase.rpc(
        "submit_student_room_request",
        {
          p_activity_title: activityTitle.trim(),
          p_purpose: purpose.trim(),
          p_preferred_date: preferredDate,
          p_preferred_start_time: startTime,
          p_preferred_end_time: endTime,
          p_preferred_room_type: roomType,
          p_preferred_room_id: preferredRoomId || null,
          p_participant_count: participantCount
            ? Number(participantCount)
            : null,
          p_notes: notes.trim() || null,
        }
      );

      if (rpcError) throw rpcError;

      setActivityTitle("");
      setPurpose("");
      setPreferredDate("");
      setStartTime("");
      setEndTime("");
      setRoomType("bebas");
      setParticipantCount("");
      setNotes("");
      setPreferredRoomId("");

      setSuccess(
        "Kebutuhan ruangan berhasil dikirim kepada Komting."
      );

      await refreshData();
    } catch (err) {
      console.error("Submit student room request:", err);
      setError(getErrorMessage(err, "Gagal mengirim pengajuan."));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCancel(request: RoomRequest) {
    const confirmed = window.confirm(
      `Batalkan pengajuan "${request.activity_title}"?`
    );

    if (!confirmed) return;

    setBusyCancelId(request.id);
    setError("");
    setSuccess("");

    try {
      const supabase = createClient();

      const { error: rpcError } = await supabase.rpc(
        "cancel_student_room_request",
        {
          p_request_id: request.id,
        }
      );

      if (rpcError) throw rpcError;

      setSuccess("Pengajuan berhasil dibatalkan.");
      await refreshData();
    } catch (err) {
      console.error("Cancel student request:", err);
      setError(getErrorMessage(err, "Gagal membatalkan pengajuan."));
    } finally {
      setBusyCancelId(null);
    }
  }

  const pendingCount = requests.filter(
    (item) => item.status === "pending"
  ).length;

  const acknowledgedCount = requests.filter(
    (item) => item.status === "acknowledged"
  ).length;

  const availableRoomOptions = rooms.filter(
    (room) =>
      room.is_active && (roomType === "bebas" || room.room_type === roomType)
  );

  const selectedRoom = rooms.find(
    (room) => room.id === preferredRoomId
  );

  return (
    <div className="mx-auto max-w-5xl space-y-7 pb-10">
      {/* Header */}
      <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-medium text-slate-500">
            Layanan Mahasiswa
          </p>

          <h1 className="mt-1 text-2xl font-bold text-slate-900">
            Pengajuan Kebutuhan Ruangan
          </h1>

          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
            Sampaikan kebutuhan ruang kelas atau laboratorium kepada
            Komting untuk dikoordinasikan.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void refreshData()}
          disabled={loading || refreshing}
          className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          {refreshing ? "Memuat..." : "Muat Ulang"}
        </button>
      </section>

      {/* Class Information */}
      {classInfo && (
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Kelas Terdaftar
          </p>

          <p className="mt-1 font-semibold text-slate-900">
            {classInfo.class_code} - {classInfo.class_name}
          </p>
        </section>
      )}

      {/* Notifications */}
      {error && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700"
        >
          {error}
        </div>
      )}

      {success && (
        <div
          role="status"
          className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700"
        >
          {success}
        </div>
      )}

      {/* Summary */}
      <section className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-sm text-slate-500">Total Pengajuan</p>
          <p className="mt-2 text-3xl font-bold text-slate-900">
            {loading ? "-" : requests.length}
          </p>
        </div>

        <div className="rounded-xl border border-amber-200 bg-white p-5">
          <p className="text-sm text-slate-500">Menunggu Komting</p>
          <p className="mt-2 text-3xl font-bold text-amber-700">
            {loading ? "-" : pendingCount}
          </p>
        </div>

        <div className="rounded-xl border border-emerald-200 bg-white p-5">
          <p className="text-sm text-slate-500">Diterima</p>
          <p className="mt-2 text-3xl font-bold text-emerald-700">
            {loading ? "-" : acknowledgedCount}
          </p>
        </div>
      </section>

      {/* Form */}
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-100 p-5">
          <h2 className="font-semibold text-slate-900">
            Form Kebutuhan Ruangan
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Isi informasi kegiatan yang membutuhkan ruangan.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5 p-5">
          <div>
            <label
              htmlFor="activity-title"
              className="mb-1.5 block text-sm font-medium text-slate-700"
            >
              Nama kegiatan *
            </label>

            <input
              id="activity-title"
              required
              minLength={3}
              maxLength={120}
              value={activityTitle}
              onChange={(e) => setActivityTitle(e.target.value)}
              placeholder="Contoh: Diskusi tugas kelompok"
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
            />
          </div>

          <div>
            <label
              htmlFor="purpose"
              className="mb-1.5 block text-sm font-medium text-slate-700"
            >
              Kebutuhan / tujuan penggunaan *
            </label>

            <textarea
              id="purpose"
              required
              minLength={5}
              maxLength={1000}
              rows={3}
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              placeholder="Jelaskan kegiatan dan kebutuhan ruangannya..."
              className="w-full resize-y rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label
                htmlFor="preferred-date"
                className="mb-1.5 block text-sm font-medium text-slate-700"
              >
                Tanggal *
              </label>

              <input
                id="preferred-date"
                type="date"
                required
                min={now === null ? undefined : getJakartaDate(now)}
                value={preferredDate}
                onChange={(e) => setPreferredDate(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-slate-500"
              />
            </div>

            <div>
              <label
                htmlFor="start-time"
                className="mb-1.5 block text-sm font-medium text-slate-700"
              >
                Jam mulai *
              </label>

              <input
                id="start-time"
                type="time"
                required
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-slate-500"
              />
            </div>

            <div>
              <label
                htmlFor="end-time"
                className="mb-1.5 block text-sm font-medium text-slate-700"
              >
                Jam selesai *
              </label>

              <input
                id="end-time"
                type="time"
                required
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-slate-500"
              />
            </div>

            <div>
              <label
                htmlFor="participant-count"
                className="mb-1.5 block text-sm font-medium text-slate-700"
              >
                Jumlah peserta
              </label>

              <input
                id="participant-count"
                type="number"
                min={1}
                step={1}
                value={participantCount}
                onChange={(e) => setParticipantCount(e.target.value)}
                placeholder="Opsional"
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-slate-500"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="room-type"
              className="mb-1.5 block text-sm font-medium text-slate-700"
            >
              Jenis ruangan yang dibutuhkan
            </label>

            <select
              id="room-type"
              value={roomType}
              onChange={(e) => {
                setRoomType(e.target.value as "bebas" | "kelas" | "laboratorium");
                setPreferredRoomId("");
              }}
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-slate-500 sm:max-w-sm"
            >
              <option value="bebas">Tidak ada preferensi</option>
              <option value="kelas">Ruang kelas</option>
              <option value="laboratorium">Laboratorium</option>
            </select>
          </div>

          <div>
            <label
              htmlFor="preferred-room"
              className="mb-1.5 block text-sm font-medium text-slate-700"
            >
              Pilih Ruangan yang Diinginkan
            </label>

            <select
              id="preferred-room"
              value={preferredRoomId}
              onChange={(event) =>
                setPreferredRoomId(event.target.value)
              }
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
            >
              <option value="">
                Tidak ada preferensi - biarkan Komting memilih
              </option>

              {availableRoomOptions.map((room) => (
                <option key={room.id} value={room.id}>
                  {room.room_code} - {room.room_name}
                  {" · "}
                  {room.room_type === "kelas" ? "Kelas" : "Laboratorium"}
                  {" · "}
                  {room.capacity} orang
                </option>
              ))}
            </select>

            <p className="mt-1.5 text-xs text-slate-500">
              Hanya menampilkan ruangan aktif sesuai jenis ruangan yang dipilih.
              Pilihan ini merupakan preferensi, bukan booking.
            </p>

            {selectedRoom && (
              <div className="mt-3 rounded-lg border border-blue-100 bg-blue-50 p-4">
                <p className="font-semibold text-slate-800">
                  {selectedRoom.room_code} - {selectedRoom.room_name}
                </p>

                <div className="mt-2 space-y-1 text-sm text-slate-600">
                  <p>
                    Gedung: {selectedRoom.building || "-"}
                  </p>
                  <p>
                    Lantai: {selectedRoom.floor || "-"}
                  </p>
                  <p>
                    Kapasitas: {selectedRoom.capacity} orang
                  </p>
                </div>

                {selectedRoom.facilities?.length ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {selectedRoom.facilities.map((facility, index) => (
                      <span
                        key={`${facility}-${index}`}
                        className="rounded-md bg-white px-2 py-1 text-xs text-slate-600"
                      >
                        {facility}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            )}
          </div>

          <div>
            <label
              htmlFor="notes"
              className="mb-1.5 block text-sm font-medium text-slate-700"
            >
              Catatan tambahan
            </label>

            <textarea
              id="notes"
              rows={2}
              maxLength={1000}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Contoh: Membutuhkan proyektor atau stopkontak..."
              className="w-full resize-y rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-slate-500"
            />
          </div>

          <div className="flex flex-col gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
            <p className="max-w-xl text-xs leading-5 text-slate-500">
              Pengajuan ini merupakan saran kebutuhan, bukan booking
              resmi. Komting akan meninjau dan mengoordinasikannya.
            </p>

            <button
              type="submit"
              disabled={submitting || loading}
              className="rounded-lg bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? "Mengirim..." : "Kirim ke Komting"}
            </button>
          </div>
        </form>
      </section>

      {/* Request History */}
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-100 p-5">
          <h2 className="font-semibold text-slate-900">
            Riwayat Pengajuan
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Pantau tanggapan Komting terhadap kebutuhan ruanganmu.
          </p>
        </div>

        {loading ? (
          <div className="p-10 text-center text-sm text-slate-500">
            Memuat riwayat pengajuan...
          </div>
        ) : requests.length === 0 ? (
          <div className="p-10 text-center">
            <p className="font-semibold text-slate-800">
              Belum ada pengajuan.
            </p>
            <p className="mt-1 text-sm text-slate-500">
              Pengajuan yang kamu kirim akan muncul di sini.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {requests.map((request) => {
              const status = statusConfig[request.status];

              const preferredRoom = rooms.find(
                (room) => room.id === request.preferred_room_id
              );

              return (
                <article key={request.id} className="space-y-4 p-5">
                  <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                    <div className="min-w-0">
                      <h3 className="font-semibold text-slate-900">
                        {request.activity_title}
                      </h3>

                      <p className="mt-1 text-xs text-slate-400">
                        Dikirim {formatDateTime(request.created_at)}
                      </p>
                    </div>

                    <span
                      className={`w-fit rounded-full px-3 py-1.5 text-xs font-semibold ${status.style}`}
                    >
                      {status.label}
                    </span>
                  </div>

                  <div className="grid gap-3 rounded-lg bg-slate-50 p-4 sm:grid-cols-2 lg:grid-cols-4">
                    <div>
                      <p className="text-xs text-slate-400">Tanggal</p>
                      <p className="mt-1 text-sm font-medium text-slate-800">
                        {formatDate(request.preferred_date)}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs text-slate-400">Waktu</p>
                      <p className="mt-1 text-sm font-medium text-slate-800">
                        {request.preferred_start_time.slice(0, 5)}
                        {" - "}
                        {request.preferred_end_time.slice(0, 5)}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs text-slate-400">
                        Jenis ruangan
                      </p>
                      <p className="mt-1 text-sm font-medium capitalize text-slate-800">
                        {request.preferred_room_type === "bebas"
                          ? "Bebas"
                          : request.preferred_room_type}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs text-slate-400">
                        Jumlah peserta
                      </p>
                      <p className="mt-1 text-sm font-medium text-slate-800">
                        {request.participant_count ?? "Belum ditentukan"}
                      </p>
                    </div>
                  </div>

                  {/* Ruangan yang diinginkan */}
                  <div className="rounded-lg bg-slate-50 p-3">
                    <p className="text-xs text-slate-400">
                      Ruangan yang diinginkan
                    </p>

                    <p className="mt-1 text-sm font-medium text-slate-800">
                      {request.preferred_room_id
                        ? preferredRoom
                          ? `${preferredRoom.room_code} - ${preferredRoom.room_name}`
                          : "Ruangan tidak aktif atau tidak tersedia"
                        : "Tidak ada preferensi"}
                    </p>
                  </div>

                  <p className="whitespace-pre-wrap text-sm leading-6 text-slate-600">
                    {request.purpose}
                  </p>

                  {request.notes && (
                    <p className="text-sm text-slate-500">
                      <span className="font-medium text-slate-800">
                        Catatan:
                      </span>{" "}
                      {request.notes}
                    </p>
                  )}

                  {request.response_note && (
                    <div className="rounded-lg border border-slate-200 bg-white p-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                        Respons Komting
                      </p>
                      <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">
                        {request.response_note}
                      </p>
                    </div>
                  )}

                  {request.status === "pending" && (
                    <div className="flex justify-end border-t border-slate-100 pt-3">
                      <button
                        type="button"
                        onClick={() => void handleCancel(request)}
                        disabled={busyCancelId !== null}
                        className="rounded-lg border border-red-200 px-4 py-2.5 text-sm font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-50"
                      >
                        {busyCancelId === request.id
                          ? "Membatalkan..."
                          : "Batalkan Pengajuan"}
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
