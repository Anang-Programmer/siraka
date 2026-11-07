"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { createClient } from "@/lib/supabase/client";
import { getErrorMessage } from "@/lib/errors";
import { useCurrentTime } from "@/lib/hooks/use-current-time";

type RequestStatus =
  | "pending"
  | "acknowledged"
  | "rejected"
  | "cancelled";

type RoomType = "bebas" | "kelas" | "laboratorium";

type RoomRequest = {
  id: string;
  activity_title: string;
  purpose: string;
  preferred_date: string;
  preferred_start_time: string;
  preferred_end_time: string;
  preferred_room_type: RoomType;
  preferred_room_id: string | null;
  participant_count: number | null;
  notes: string | null;
  status: RequestStatus;
  response_note: string | null;
  created_at: string;
};

type Room = {
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

type FormState = {
  title: string;
  purpose: string;
  date: string;
  start: string;
  end: string;
  roomType: RoomType;
  roomId: string;
  participants: string;
  notes: string;
};

const initialForm: FormState = {
  title: "",
  purpose: "",
  date: "",
  start: "",
  end: "",
  roomType: "bebas",
  roomId: "",
  participants: "",
  notes: "",
};

const statusConfig: Record<
  RequestStatus,
  { label: string; color: string; dot: string }
> = {
  pending: {
    label: "Menunggu Komting",
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
    label: "Dibatalkan",
    color: "bg-slate-100 text-slate-600",
    dot: "bg-slate-400",
  },
};

function jakartaDate(timestamp: number) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(timestamp));

  return ["year", "month", "day"]
    .map((type) => parts.find((part) => part.type === type)?.value)
    .join("-");
}

function dateLabel(value: string) {
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    dateStyle: "long",
  }).format(new Date(`${value}T12:00:00+07:00`));
}

function dateTimeLabel(value: string) {
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function roomTypeLabel(value: RoomType) {
  if (value === "kelas") return "Ruang Kelas";
  if (value === "laboratorium") return "Laboratorium";

  return "Tidak ada preferensi";
}

function RequestIcon({
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
      <rect x="5" y="4" width="14" height="17" rx="2" />
      <path d="M9 4V2h6v2M9 10h6M9 14h6M9 18h3" />
    </svg>
  );
}

function Field({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0">
      <label
        htmlFor={id}
        className="mb-2.5 block text-xs font-semibold text-primary"
      >
        {label}
      </label>

      {children}
    </div>
  );
}

export default function StudentRoomRequest() {
  const now = useCurrentTime();

  const controllerRef = useRef<AbortController | null>(null);
  const mutationBusy = useRef(false);

  const [classInfo, setClassInfo] = useState<ClassInfo | null>(null);
  const [requests, setRequests] = useState<RoomRequest[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [form, setForm] = useState<FormState>(initialForm);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(
    null,
  );

  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [success, setSuccess] = useState("");

  const ready = !loading && !loadError && classInfo !== null;
  const busy = submitting || cancellingId !== null;
  const inputClass = "input-field min-h-11 rounded-xl";

  function update<K extends keyof FormState>(
    key: K,
    value: FormState[K],
  ) {
    setForm((current) => ({
      ...current,
      [key]: value,
    }));
  }

    const loadData = useCallback(() => {
    controllerRef.current?.abort();

    const controller = new AbortController();
    controllerRef.current = controller;

    const { signal } = controller;

    const fetchData = async () => {
      const supabase = createClient();

      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (signal.aborted) return;
      if (authError) throw authError;

      if (!user) {
        throw new Error("Sesi login tidak ditemukan.");
      }

      const { data: profile, error: profileError } =
        await supabase
          .from("profiles")
          .select("class_id, role, is_active")
          .eq("id", user.id)
          .single();

      if (signal.aborted) return;
      if (profileError) throw profileError;

      if (
        profile.role !== "mahasiswa" ||
        !profile.is_active ||
        !profile.class_id
      ) {
        throw new Error(
          "Akun belum memiliki akses atau belum terdaftar dalam kelas.",
        );
      }

      const [classResult, requestResult, roomResult] =
        await Promise.all([
          supabase
            .from("classes")
            .select("class_code, class_name")
            .eq("id", profile.class_id)
            .single(),

          supabase
            .from("student_room_requests")
            .select(
              "id, activity_title, purpose, preferred_date, preferred_start_time, preferred_end_time, preferred_room_type, preferred_room_id, participant_count, notes, status, response_note, created_at",
            )
            .order("created_at", { ascending: false }),

          supabase
            .from("rooms")
            .select(
              "id, room_code, room_name, room_type, building, floor, capacity, facilities, is_active",
            )
            .eq("is_active", true)
            .order("room_code", { ascending: true }),
        ]);

      if (signal.aborted) return;
      if (classResult.error) throw classResult.error;
      if (requestResult.error) throw requestResult.error;
      if (roomResult.error) throw roomResult.error;

      return {
        classInfo: classResult.data as ClassInfo,
        requests: (requestResult.data ?? []) as RoomRequest[],
        rooms: (roomResult.data ?? []) as Room[],
      };
    };

    return fetchData()
      .then((result) => {
        if (signal.aborted || !result) return;

        setClassInfo(result.classInfo);
        setRequests(result.requests);
        setRooms(result.rooms);
        setLoadError("");
      })
      .catch((err: unknown) => {
        if (signal.aborted) return;

        console.error("Load requests:", err);

        setLoadError(
          getErrorMessage(err, "Gagal memuat data pengajuan."),
        );
      })
      .finally(() => {
        if (!signal.aborted) {
          setLoading(false);
        }
      });
  }, []);

  useEffect(() => {
    void loadData();

    return () => {
      controllerRef.current?.abort();
    };
  }, [loadData]);

  function refreshData() {
    setLoading(true);
    setLoadError("");

    return loadData();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!ready || mutationBusy.current) return;

    setActionError("");
    setSuccess("");

    const title = form.title.trim();
    const purpose = form.purpose.trim();
    const notes = form.notes.trim();

    if (
      !title ||
      !purpose ||
      !form.date ||
      !form.start ||
      !form.end
    ) {
      setActionError("Lengkapi seluruh kolom yang wajib diisi.");
      return;
    }

    if (title.length < 3 || title.length > 120) {
      setActionError("Nama kegiatan harus 3 sampai 120 karakter.");
      return;
    }

    if (purpose.length < 5 || purpose.length > 1000) {
      setActionError(
        "Tujuan penggunaan harus 5 sampai 1000 karakter.",
      );
      return;
    }

    if (notes.length > 1000) {
      setActionError("Catatan tambahan maksimal 1000 karakter.");
      return;
    }

    const start = new Date(
      `${form.date}T${form.start}:00+07:00`,
    );

    const end = new Date(
      `${form.date}T${form.end}:00+07:00`,
    );

    if (
      !Number.isFinite(start.getTime()) ||
      !Number.isFinite(end.getTime()) ||
      jakartaDate(start.getTime()) !== form.date
    ) {
      setActionError("Tanggal atau waktu tidak valid.");
      return;
    }

    if (end.getTime() <= start.getTime()) {
      setActionError("Jam selesai harus setelah jam mulai.");
      return;
    }

    if (start.getTime() <= Date.now()) {
      setActionError(
        "Pilih tanggal dan waktu yang masih akan datang.",
      );
      return;
    }

    const participants = form.participants
      ? Number(form.participants)
      : null;

    if (
      participants !== null &&
      (!Number.isSafeInteger(participants) || participants <= 0)
    ) {
      setActionError(
        "Jumlah peserta harus berupa bilangan bulat lebih dari nol.",
      );
      return;
    }

    mutationBusy.current = true;
    setSubmitting(true);

    try {
      const supabase = createClient();

      if (form.roomId) {
        const { data: room, error: roomError } = await supabase
          .from("rooms")
          .select("is_active, room_type, capacity")
          .eq("id", form.roomId)
          .maybeSingle();

        if (roomError) throw roomError;

        if (!room?.is_active) {
          throw new Error(
            "Ruangan yang dipilih sudah tidak tersedia.",
          );
        }

        if (
          form.roomType !== "bebas" &&
          room.room_type !== form.roomType
        ) {
          throw new Error(
            "Ruangan tidak sesuai dengan jenis yang dipilih.",
          );
        }

        if (
          participants !== null &&
          participants > room.capacity
        ) {
          throw new Error(
            "Jumlah peserta melebihi kapasitas ruangan.",
          );
        }
      }

      const { error: rpcError } = await supabase.rpc(
        "submit_student_room_request",
        {
          p_activity_title: title,
          p_purpose: purpose,
          p_preferred_date: form.date,
          p_preferred_start_time: form.start,
          p_preferred_end_time: form.end,
          p_preferred_room_type: form.roomType,
          p_preferred_room_id: form.roomId || null,
          p_participant_count: participants,
          p_notes: notes || null,
        },
      );

      if (rpcError) throw rpcError;

      setForm({ ...initialForm });

      setSuccess(
        "Pengajuan berhasil dikirim. Komting akan meninjau kebutuhanmu.",
      );

      await refreshData();
    } catch (err) {
      console.error("Submit request:", err);

      setActionError(
        getErrorMessage(err, "Gagal mengirim pengajuan."),
      );
    } finally {
      mutationBusy.current = false;
      setSubmitting(false);
    }
  }

  async function handleCancel(request: RoomRequest) {
    if (!ready || mutationBusy.current) return;
    if (request.status !== "pending") return;

    const confirmed = window.confirm(
      `Batalkan pengajuan "${request.activity_title}"?`,
    );

    if (!confirmed) return;

    mutationBusy.current = true;
    setCancellingId(request.id);
    setActionError("");
    setSuccess("");

    try {
      const supabase = createClient();

      const { error: rpcError } = await supabase.rpc(
        "cancel_student_room_request",
        {
          p_request_id: request.id,
        },
      );

      if (rpcError) throw rpcError;

      setSuccess("Pengajuan berhasil dibatalkan.");

      await refreshData();
    } catch (err) {
      console.error("Cancel request:", err);

      setActionError(
        getErrorMessage(err, "Gagal membatalkan pengajuan."),
      );
    } finally {
      mutationBusy.current = false;
      setCancellingId(null);
    }
  }

  const availableRooms = rooms.filter(
    (room) =>
      room.is_active &&
      (form.roomType === "bebas" ||
        room.room_type === form.roomType),
  );

  const selectedRoom = rooms.find(
    (room) => room.id === form.roomId,
  );

  const stats = [
    {
      label: "Total Pengajuan",
      value: requests.length,
      color: "bg-slate-100 text-primary",
    },
    {
      label: "Menunggu Komting",
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
  ];

  return (
    <div className="space-y-7">
      <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted">
            Workspace / Layanan Mahasiswa
          </p>

          <h1 className="mt-2 font-heading text-2xl font-extrabold text-primary sm:text-3xl">
            Pengajuan Kebutuhan
          </h1>

          <p className="mt-2 text-sm leading-7 text-muted">
            Ceritakan rencana kegiatanmu. Komting akan membantu
            mengoordinasikan kebutuhan ruangan.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void refreshData()}
          disabled={loading || busy}
          className="btn-outline w-fit shrink-0 rounded-xl text-xs shadow-sm"
        >
          {loading ? "Memuat..." : "↻ Muat Ulang"}
        </button>
      </section>

      {loadError && (
        <div
          role="alert"
          className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm leading-7 text-red-700"
        >
          <p>{loadError}</p>

          {success && (
            <p className="mt-2">
              Aksi sebelumnya berhasil, tetapi data terbaru belum
              dapat dimuat. Tekan Muat Ulang.
            </p>
          )}
        </div>
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
        <p
          role="status"
          className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm leading-7 text-emerald-700"
        >
          {success}
        </p>
      )}

      <section
        aria-label="Ringkasan pengajuan"
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
                <RequestIcon className="h-4 w-4" />
              </span>
            </div>

            <p className="mt-4 font-heading text-4xl font-extrabold text-primary">
              {ready ? stat.value : "—"}
            </p>
          </div>
        ))}
      </section>

      <section className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-sm shadow-slate-200/20">
        <div className="flex flex-col justify-between gap-4 border-b border-slate-100 p-5 sm:flex-row sm:items-center sm:p-6">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-primary">
              <RequestIcon className="h-6 w-6" />
            </span>

            <div>
              <h2 className="font-heading text-base font-extrabold text-primary">
                Buat Pengajuan Baru
              </h2>

              <p className="mt-1 text-xs text-muted">
                Lengkapi informasi kegiatan dan kebutuhanmu.
              </p>
            </div>
          </div>

          <div className="w-fit rounded-xl border border-slate-200 px-3 py-2">
            <p className="text-[9px] font-semibold uppercase tracking-wider text-muted">
              Kelas Terdaftar
            </p>

            <p className="mt-1 text-xs font-bold text-primary">
              {loading
                ? "Memuat..."
                : ready
                  ? classInfo?.class_code
                  : "Belum tersedia"}
            </p>
          </div>
        </div>

        <form
          onSubmit={handleSubmit}
          aria-busy={submitting}
          className="p-5 sm:p-6"
        >
          <fieldset
            disabled={!ready || busy}
            className="min-w-0 space-y-7 disabled:opacity-60"
          >
            <legend className="sr-only">
              Formulir kebutuhan ruangan
            </legend>

            <section>
              <div className="mb-5 flex items-center gap-3">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-white">
                  1
                </span>

                <h3 className="text-sm font-bold text-primary">
                  Informasi Kegiatan
                </h3>
              </div>

              <div className="space-y-5">
                <Field id="request-title" label="Nama kegiatan *">
                  <input
                    id="request-title"
                    value={form.title}
                    onChange={(event) =>
                      update("title", event.target.value)
                    }
                    placeholder="Contoh: Diskusi tugas kelompok"
                    minLength={3}
                    maxLength={120}
                    required
                    className={inputClass}
                  />
                </Field>

                <Field
                  id="request-purpose"
                  label="Kebutuhan / tujuan penggunaan *"
                >
                  <textarea
                    id="request-purpose"
                    value={form.purpose}
                    onChange={(event) =>
                      update("purpose", event.target.value)
                    }
                    placeholder="Jelaskan kegiatan dan kebutuhan ruangannya..."
                    minLength={5}
                    maxLength={1000}
                    rows={4}
                    required
                    className={`${inputClass} resize-y`}
                  />
                </Field>
              </div>
            </section>

            <section className="border-t border-slate-100 pt-6">
              <div className="mb-5 flex items-center gap-3">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-white">
                  2
                </span>

                <h3 className="text-sm font-bold text-primary">
                  Waktu &amp; Peserta
                </h3>

                <span className="ml-auto text-[10px] text-muted">
                  Zona waktu WIB
                </span>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <Field id="request-date" label="Tanggal *">
                  <input
                    id="request-date"
                    type="date"
                    min={
                      now === null
                        ? undefined
                        : jakartaDate(now)
                    }
                    value={form.date}
                    onChange={(event) =>
                      update("date", event.target.value)
                    }
                    required
                    className={`${inputClass} min-w-0`}
                  />
                </Field>

                <Field id="request-start" label="Jam mulai *">
                  <input
                    id="request-start"
                    type="time"
                    step={60}
                    value={form.start}
                    onChange={(event) =>
                      update("start", event.target.value)
                    }
                    required
                    className={`${inputClass} min-w-0`}
                  />
                </Field>

                <Field id="request-end" label="Jam selesai *">
                  <input
                    id="request-end"
                    type="time"
                    step={60}
                    value={form.end}
                    onChange={(event) =>
                      update("end", event.target.value)
                    }
                    required
                    className={`${inputClass} min-w-0`}
                  />
                </Field>

                <Field
                  id="request-participants"
                  label="Jumlah peserta"
                >
                  <input
                    id="request-participants"
                    type="number"
                    min={1}
                    step={1}
                    value={form.participants}
                    onChange={(event) =>
                      update("participants", event.target.value)
                    }
                    placeholder="Opsional"
                    className={inputClass}
                  />
                </Field>
              </div>
            </section>

            <section className="border-t border-slate-100 pt-6">
              <div className="mb-5 flex items-center gap-3">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-white">
                  3
                </span>

                <h3 className="text-sm font-bold text-primary">
                  Preferensi Ruangan
                </h3>
              </div>

              <div className="grid gap-5 md:grid-cols-2">
                <Field
                  id="request-room-type"
                  label="Jenis ruangan"
                >
                  <select
                    id="request-room-type"
                    value={form.roomType}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        roomType: event.target.value as RoomType,
                        roomId: "",
                      }))
                    }
                    className={inputClass}
                  >
                    <option value="bebas">
                      Tidak ada preferensi
                    </option>
                    <option value="kelas">Ruang Kelas</option>
                    <option value="laboratorium">
                      Laboratorium
                    </option>
                  </select>
                </Field>

                <Field
                  id="request-room"
                  label="Ruangan yang diinginkan"
                >
                  <select
                    id="request-room"
                    value={form.roomId}
                    onChange={(event) =>
                      update("roomId", event.target.value)
                    }
                    aria-describedby="room-preference-help"
                    className={inputClass}
                  >
                    <option value="">
                      Biarkan Komting memilih
                    </option>

                    {availableRooms.map((room) => (
                      <option key={room.id} value={room.id}>
                        {room.room_code} - {room.room_name}
                        {" · "}
                        {room.capacity} orang
                      </option>
                    ))}
                  </select>
                </Field>
              </div>

              <p
                id="room-preference-help"
                className="mt-3 text-[11px] leading-6 text-muted"
              >
                Pilihan ruangan hanya merupakan preferensi dan
                belum menjadi reservasi.
              </p>

              {selectedRoom && (
                <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-xs font-bold text-primary">
                      {selectedRoom.room_code}
                      {" · "}
                      {selectedRoom.room_name}
                    </p>

                    <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-[10px] font-semibold text-primary">
                      {selectedRoom.capacity} orang
                    </span>
                  </div>

                  <p className="mt-2 text-xs leading-6 text-muted">
                    {[
                      selectedRoom.building,
                      selectedRoom.floor
                        ? `Lantai ${selectedRoom.floor}`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" · ") || "Lokasi belum diisi"}
                  </p>

                  {!!selectedRoom.facilities?.length && (
                    <ul className="mt-3 flex flex-wrap gap-2">
                      {selectedRoom.facilities.map(
                        (facility, index) => (
                          <li
                            key={`${facility}-${index}`}
                            className="rounded-lg border border-slate-200 px-2.5 py-1 text-[10px] text-primary"
                          >
                            {facility}
                          </li>
                        ),
                      )}
                    </ul>
                  )}
                </div>
              )}

              <div className="mt-5">
                <Field
                  id="request-notes"
                  label="Catatan tambahan"
                >
                  <textarea
                    id="request-notes"
                    value={form.notes}
                    onChange={(event) =>
                      update("notes", event.target.value)
                    }
                    placeholder="Contoh: Membutuhkan proyektor atau stopkontak..."
                    rows={3}
                    maxLength={1000}
                    className={`${inputClass} resize-y`}
                  />
                </Field>
              </div>
            </section>

            <div className="flex flex-col justify-between gap-5 border-t border-slate-100 pt-6 sm:flex-row sm:items-center">
              <p className="max-w-xl text-[11px] leading-6 text-muted">
                Kolom bertanda * wajib diisi. Pengajuan ini bukan
                booking resmi. Komting akan meninjau dan
                mengoordinasikan kebutuhanmu.
              </p>

              <button
                type="submit"
                className="btn-primary shrink-0 rounded-xl"
              >
                {submitting
                  ? "Mengirim..."
                  : "Kirim ke Komting"}

                {!submitting && (
                  <span aria-hidden="true">→</span>
                )}
              </button>
            </div>
          </fieldset>
        </form>
      </section>

      <section>
        <div className="mb-5 flex items-center justify-between gap-3">
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
            <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-muted">
              {requests.length} pengajuan
            </span>
          )}
        </div>

        {loading ? (
          <div
            role="status"
            className="rounded-3xl border border-slate-200 bg-white p-10 text-center text-sm text-muted"
          >
            Memuat riwayat pengajuan...
          </div>
        ) : loadError ? (
          <p className="rounded-3xl border border-slate-200 bg-white p-10 text-center text-sm text-muted">
            Riwayat belum dapat dimuat. Silakan tekan Muat Ulang.
          </p>
        ) : requests.length === 0 ? (
          <div className="rounded-3xl border border-slate-200 bg-white p-12 text-center">
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-primary">
              <RequestIcon className="h-7 w-7" />
            </span>

            <h3 className="mt-4 text-sm font-bold text-primary">
              Belum ada pengajuan
            </h3>

            <p className="mt-2 text-xs leading-6 text-muted">
              Mulai dengan mengisi formulir kebutuhan di atas.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {requests.map((request) => {
              const status = statusConfig[request.status];

              const preferredRoom = rooms.find(
                (room) => room.id === request.preferred_room_id,
              );

              return (
                <article
                  key={request.id}
                  className="rounded-3xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-200/20 sm:p-6"
                >
                  <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                    <div className="min-w-0">
                      <h3 className="break-words font-heading text-base font-extrabold text-primary">
                        {request.activity_title}
                      </h3>

                      <p className="mt-2 text-[11px] text-muted">
                        Dikirim{" "}
                        {dateTimeLabel(request.created_at)} WIB
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

                  <dl className="mt-5 grid gap-4 rounded-2xl border border-slate-100 p-4 sm:grid-cols-2 xl:grid-cols-4">
                    {[
                      {
                        label: "Tanggal",
                        value: dateLabel(request.preferred_date),
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
                        label: "Jumlah Peserta",
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

                  <div className="mt-5">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">
                      Ruangan yang Diinginkan
                    </p>

                    <p className="mt-2 text-xs font-semibold leading-6 text-primary">
                      {request.preferred_room_id
                        ? preferredRoom
                          ? `${preferredRoom.room_code} · ${preferredRoom.room_name}`
                          : "Ruangan tidak aktif atau tidak tersedia"
                        : "Tidak ada preferensi"}
                    </p>
                  </div>

                  <p className="mt-4 whitespace-pre-wrap break-words text-sm leading-7 text-muted">
                    {request.purpose}
                  </p>

                  {request.notes && (
                    <div className="mt-4">
                      <p className="text-xs font-bold text-primary">
                        Catatan tambahan
                      </p>

                      <p className="mt-2 whitespace-pre-wrap break-words text-xs leading-7 text-muted">
                        {request.notes}
                      </p>
                    </div>
                  )}

                  {request.response_note && (
                    <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-4">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-primary">
                        Respons Komting
                      </p>

                      <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-7 text-muted">
                        {request.response_note}
                      </p>
                    </div>
                  )}

                  {request.status === "pending" && (
                    <div className="mt-5 flex justify-end border-t border-slate-100 pt-4">
                      <button
                        type="button"
                        onClick={() =>
                          void handleCancel(request)
                        }
                        disabled={busy || loading}
                        className="inline-flex min-h-11 items-center justify-center rounded-xl border border-red-200 px-4 py-2 text-xs font-semibold text-red-700 transition hover:bg-red-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {cancellingId === request.id
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