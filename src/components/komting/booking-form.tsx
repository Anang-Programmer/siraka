"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import Link from "next/link";
import { getErrorMessage } from "@/lib/errors";
import { createClient } from "@/lib/supabase/client";

type Room = {
  id: string;
  room_code: string;
  room_name: string;
  room_type: "kelas" | "laboratorium";
  building: string | null;
  floor: string | null;
  capacity: number;
  facilities: string[];
};

type BookingResult = {
  bookingType: string;
  status: string;
};

type FormState = {
  roomId: string;
  title: string;
  purpose: string;
  activityType: string;
  participantCount: string;
  startsAt: string;
  endsAt: string;
  isKrsPriority: boolean;
  referenceCode: string;
};

const initialForm: FormState = {
  roomId: "",
  title: "",
  purpose: "",
  activityType: "kegiatan_akademik",
  participantCount: "",
  startsAt: "",
  endsAt: "",
  isKrsPriority: false,
  referenceCode: "",
};

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

function SectionTitle({
  number,
  title,
  description,
}: {
  number: number;
  title: string;
  description?: string;
}) {
  return (
    <div className="mb-5 flex items-start gap-3">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-white">
        {number}
      </span>

      <div>
        <h2 className="pt-1 text-sm font-bold text-primary">
          {title}
        </h2>

        {description && (
          <p className="mt-2 text-xs leading-6 text-muted">
            {description}
          </p>
        )}
      </div>
    </div>
  );
}

function BuildingIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="h-6 w-6"
    >
      <path d="M4 21V5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v16" />
      <path d="M15 9h4a1 1 0 0 1 1 1v11M2 21h20" />
      <path d="M8 8h3M8 12h3M8 16h3" />
    </svg>
  );
}

function bookingTypeLabel(type: string) {
  if (type === "instant") return "Instant";
  if (type === "regular") return "Regular";
  if (type === "krs_priority") return "Prioritas KRS";

  return type;
}

function bookingStatusLabel(status: string) {
  if (status === "approved") return "Disetujui";
  if (status === "pending") return "Menunggu persetujuan Admin";
  if (status === "under_review") return "Sedang ditinjau Admin";

  return status.replace(/_/g, " ");
}

function bookingError(message: string) {
  const text = message.toLowerCase();

  if (
    text.includes("room_reservations_no_overlap") ||
    text.includes("conflicting key value") ||
    text.includes("exclusion constraint") ||
    text.includes("conflicts with an existing reservation") ||
    text.includes("booking conflicts")
  ) {
    return "Ruangan sudah digunakan pada rentang waktu tersebut. Pilih waktu atau ruangan lain.";
  }

  if (
    text.includes("booking start time must be in the future") ||
    text.includes("booking start time has passed") ||
    text.includes("booking has expired") ||
    text.includes("booking has already ended")
  ) {
    return "Waktu mulai sudah lewat. Pilih waktu yang masih akan datang.";
  }

  if (text.includes("participant count exceeds room capacity")) {
    return "Jumlah peserta melebihi kapasitas ruangan.";
  }

  if (text.includes("room does not exist or is inactive")) {
    return "Ruangan tidak tersedia atau sudah dinonaktifkan.";
  }

  if (text.includes("end time must be later than start time")) {
    return "Waktu selesai harus setelah waktu mulai.";
  }

  if (text.includes("krs document is required")) {
    return "Dokumen KRS wajib diunggah untuk booking prioritas KRS.";
  }

  return message || "Booking gagal dikirim. Silakan coba lagi.";
}

function formatDateTime(value: string) {
  if (!value) return "Belum ditentukan";

  const date = new Date(`${value}+07:00`);

  if (!Number.isFinite(date.getTime())) {
    return "Waktu belum valid";
  }

  return (
    new Intl.DateTimeFormat("id-ID", {
      timeZone: "Asia/Jakarta",
      dateStyle: "medium",
      timeStyle: "short",
    }).format(date) + " WIB"
  );
}

export default function BookingForm() {
  const controllerRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const submitLock = useRef(false);

  const [rooms, setRooms] = useState<Room[]>([]);
  const [roomsLoading, setRoomsLoading] = useState(true);
  const [roomsError, setRoomsError] = useState("");

  const [form, setForm] = useState<FormState>(initialForm);
  const [krsFile, setKrsFile] = useState<File | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [result, setResult] = useState<BookingResult | null>(
    null,
  );

  const inputClass = "input-field min-h-11 rounded-xl";

  const selectedRoom = rooms.find(
    (room) => room.id === form.roomId,
  );

  const loadRooms = useCallback(async () => {
    controllerRef.current?.abort();

    const controller = new AbortController();
    controllerRef.current = controller;

    const { signal } = controller;

    setRoomsLoading(true);
    setRoomsError("");

    try {
      const supabase = createClient();

      const { data, error: queryError } = await supabase
        .from("rooms")
        .select(
          "id, room_code, room_name, room_type, building, floor, capacity, facilities",
        )
        .eq("is_active", true)
        .order("room_code", { ascending: true });

      if (signal.aborted) return;
      if (queryError) throw queryError;

      setRooms(
        ((data ?? []) as Room[]).map((room) => ({
          ...room,
          facilities: Array.isArray(room.facilities)
            ? room.facilities
            : [],
        })),
      );
    } catch (err) {
      if (signal.aborted) return;

      console.error("Load rooms:", err);

      setRoomsError(
        getErrorMessage(err, "Gagal mengambil data ruangan."),
      );
    } finally {
      if (!signal.aborted) setRoomsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRooms();

    return () => {
      controllerRef.current?.abort();
    };
  }, [loadRooms]);

  function update<K extends keyof FormState>(
    key: K,
    value: FormState[K],
  ) {
    setForm((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function handleFileChange(file: File | null) {
    setError("");
    setKrsFile(null);

    if (!file) return;

    const allowedTypes = [
      "application/pdf",
      "image/png",
      "image/jpeg",
    ];

    let message = "";

    if (!allowedTypes.includes(file.type)) {
      message = "Format dokumen harus PDF, PNG, atau JPG/JPEG.";
    } else if (file.size > 5 * 1024 * 1024) {
      message = "Ukuran dokumen maksimal 5 MB.";
    } else if (file.size === 0) {
      message = "Dokumen kosong. Silakan pilih berkas lain.";
    }

    if (message) {
      setError(message);

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }

      return;
    }

    setKrsFile(file);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (
      submitLock.current ||
      roomsLoading ||
      roomsError
    ) {
      return;
    }

    setError("");
    setSuccess("");
    setResult(null);

    const participants = Number(form.participantCount);
    const startsAt = new Date(`${form.startsAt}+07:00`);
    const endsAt = new Date(`${form.endsAt}+07:00`);

    if (!selectedRoom) {
      setError("Silakan pilih ruangan.");
      return;
    }

    if (!form.title.trim() || !form.purpose.trim()) {
      setError("Nama kegiatan dan tujuan peminjaman wajib diisi.");
      return;
    }

    if (
      !form.startsAt ||
      !form.endsAt ||
      !Number.isFinite(startsAt.getTime()) ||
      !Number.isFinite(endsAt.getTime())
    ) {
      setError("Isi tanggal dan waktu penggunaan yang valid.");
      return;
    }

    if (startsAt.getTime() <= Date.now()) {
      setError(
        "Waktu mulai harus berada di masa depan. Server akan memvalidasi kembali waktu pengajuan.",
      );
      return;
    }

    if (endsAt.getTime() <= startsAt.getTime()) {
      setError("Waktu selesai harus setelah waktu mulai.");
      return;
    }

    if (!Number.isSafeInteger(participants) || participants < 1) {
      setError("Jumlah peserta harus bilangan bulat minimal 1.");
      return;
    }

    if (participants > selectedRoom.capacity) {
      setError(
        `Kapasitas ruangan ini maksimal ${selectedRoom.capacity} orang.`,
      );
      return;
    }

    if (form.isKrsPriority && !krsFile) {
      setError(
        "Unggah dokumen KRS untuk pengajuan prioritas KRS.",
      );
      return;
    }

    submitLock.current = true;
    setSubmitting(true);

    let uploadedPath: string | null = null;
    let rpcRejected = false;
    let bookingCreated = false;

    try {
      const supabase = createClient();
      const bookingId = crypto.randomUUID();

      if (form.isKrsPriority && krsFile) {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError) throw userError;

        if (!user) {
          throw new Error(
            "Sesi login tidak ditemukan. Silakan login ulang.",
          );
        }

        const safeName =
          krsFile.name.trim().replace(/[^a-zA-Z0-9._-]/g, "_") ||
          "dokumen-krs";

        const path = `${user.id}/${bookingId}/${safeName}`;

        const { error: uploadError } = await supabase.storage
          .from("krs-documents")
          .upload(path, krsFile, {
            cacheControl: "3600",
            contentType: krsFile.type,
            upsert: false,
          });

        if (uploadError) throw uploadError;

        uploadedPath = path;
      }

      const { error: submitError } = await supabase.rpc(
        "submit_booking",
        {
          p_booking_id: bookingId,
          p_room_id: form.roomId,
          p_title: form.title.trim(),
          p_purpose: form.purpose.trim(),
          p_starts_at: startsAt.toISOString(),
          p_ends_at: endsAt.toISOString(),
          p_activity_type: form.activityType,
          p_participant_count: participants,
          p_is_krs_priority: form.isKrsPriority,
          p_krs_document_path: uploadedPath,
          p_reference_code: form.isKrsPriority
            ? form.referenceCode.trim() || null
            : null,
        },
      );

      if (submitError) {
        // Hapus unggahan hanya jika server jelas menolak RPC.
        rpcRejected =
          typeof submitError.code === "string" &&
          /^[0-9A-Z]{5}$/.test(submitError.code);

        throw submitError;
      }

      bookingCreated = true;

      setSuccess("Booking berhasil diajukan.");
      setForm({ ...initialForm });
      setKrsFile(null);

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }

      try {
        const { data, error: resultError } = await supabase
          .from("bookings")
          .select("booking_type, status")
          .eq("id", bookingId)
          .single();

        if (resultError) throw resultError;

        setResult({
          bookingType: data.booking_type,
          status: data.status,
        });
      } catch (detailError) {
        console.warn(
          "Booking berhasil, detail belum dapat dimuat:",
          detailError,
        );

        setSuccess(
          "Booking berhasil diajukan. Detail status belum dapat dimuat; periksa halaman Status Booking.",
        );
      }
    } catch (err) {
      console.error("Submit booking:", err);

      if (uploadedPath && rpcRejected && !bookingCreated) {
        try {
          const supabase = createClient();

          const { error: cleanupError } = await supabase.storage
            .from("krs-documents")
            .remove([uploadedPath]);

          if (cleanupError) {
            console.error("KRS cleanup:", cleanupError);
          }
        } catch (cleanupError) {
          console.error("KRS cleanup:", cleanupError);
        }
      }

      setError(
        bookingError(
          getErrorMessage(
            err,
            "Booking belum dapat dikonfirmasi. Periksa Status Booking sebelum mengirim ulang.",
          ),
        ),
      );
    } finally {
      submitLock.current = false;
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-7">
      <section>
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted">
          Workspace / Reservasi Ruangan
        </p>

        <h1 className="mt-2 font-heading text-2xl font-extrabold text-primary sm:text-3xl">
          Ajukan Booking
        </h1>

        <p className="mt-2 text-sm leading-7 text-muted">
          Pilih ruangan, lengkapi kegiatan, dan tentukan waktu
          penggunaan untuk kelasmu.
        </p>
      </section>

      {error && (
        <p
          role="alert"
          className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm leading-7 text-red-700"
        >
          {error}
        </p>
      )}

      {success && (
        <section
          role="status"
          className="rounded-2xl border border-emerald-200 bg-white p-5"
        >
          <h2 className="text-sm font-bold text-emerald-700">
            {success}
          </h2>

          {result && (
            <dl className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <dt className="text-xs text-muted">
                  Jenis Booking
                </dt>
                <dd className="mt-1 text-sm font-semibold text-primary">
                  {bookingTypeLabel(result.bookingType)}
                </dd>
              </div>

              <div>
                <dt className="text-xs text-muted">
                  Status
                </dt>
                <dd className="mt-1 text-sm font-semibold text-primary">
                  {bookingStatusLabel(result.status)}
                </dd>
              </div>
            </dl>
          )}

          <Link
            href="/dashboard/komting/bookings"
            className="mt-4 inline-flex rounded-md text-xs font-bold text-primary hover:underline focus-visible:outline-2 focus-visible:outline-primary"
          >
            Buka Status Booking →
          </Link>
        </section>
      )}

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
        <form
          onSubmit={handleSubmit}
          aria-busy={submitting}
          className="min-w-0 rounded-3xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-200/20 sm:p-6"
        >
          <fieldset
            disabled={submitting}
            className="min-w-0 space-y-7 disabled:opacity-60"
          >
            <legend className="sr-only">
              Formulir booking ruangan
            </legend>

            <section>
              <SectionTitle
                number={1}
                title="Pilih Ruangan"
                description="Ruangan yang ditampilkan merupakan ruangan aktif."
              />

              <Field id="booking-room" label="Ruangan *">
                <select
                  id="booking-room"
                  value={form.roomId}
                  onChange={(event) =>
                    update("roomId", event.target.value)
                  }
                  disabled={
                    roomsLoading ||
                    Boolean(roomsError) ||
                    rooms.length === 0
                  }
                  required
                  className={inputClass}
                >
                  <option value="">
                    {roomsLoading
                      ? "Memuat ruangan..."
                      : rooms.length === 0
                        ? "Tidak ada ruangan aktif"
                        : "Pilih ruangan"}
                  </option>

                  {rooms.map((room) => (
                    <option key={room.id} value={room.id}>
                      {room.room_code} - {room.room_name}
                      {" · "}
                      {room.capacity} orang
                    </option>
                  ))}
                </select>
              </Field>

              {roomsError && (
                <div
                  role="alert"
                  className="mt-3 text-xs leading-6 text-red-700"
                >
                  <p>{roomsError}</p>

                  <button
                    type="button"
                    onClick={() => void loadRooms()}
                    className="mt-2 rounded-md font-bold underline focus-visible:outline-2 focus-visible:outline-red-700"
                  >
                    Coba muat ulang
                  </button>
                </div>
              )}
            </section>

            <section className="border-t border-slate-100 pt-6">
              <SectionTitle
                number={2}
                title="Detail Kegiatan"
              />

              <div className="space-y-5">
                <div className="grid gap-5 md:grid-cols-2">
                  <Field
                    id="booking-title"
                    label="Nama kegiatan *"
                  >
                    <input
                      id="booking-title"
                      value={form.title}
                      onChange={(event) =>
                        update("title", event.target.value)
                      }
                      placeholder="Contoh: Diskusi Kelompok PTIK"
                      maxLength={150}
                      required
                      className={inputClass}
                    />
                  </Field>

                  <Field
                    id="booking-activity"
                    label="Jenis kegiatan"
                  >
                    <select
                      id="booking-activity"
                      value={form.activityType}
                      onChange={(event) =>
                        update("activityType", event.target.value)
                      }
                      className={inputClass}
                    >
                      <option value="kegiatan_akademik">
                        Kegiatan Akademik
                      </option>
                      <option value="praktikum">
                        Praktikum
                      </option>
                      <option value="diskusi">
                        Diskusi
                      </option>
                      <option value="kegiatan_lain">
                        Kegiatan Lainnya
                      </option>
                    </select>
                  </Field>
                </div>

                <Field
                  id="booking-purpose"
                  label="Tujuan peminjaman *"
                >
                  <textarea
                    id="booking-purpose"
                    value={form.purpose}
                    onChange={(event) =>
                      update("purpose", event.target.value)
                    }
                    placeholder="Jelaskan tujuan penggunaan ruangan..."
                    rows={4}
                    maxLength={1000}
                    required
                    className={`${inputClass} resize-y`}
                  />
                </Field>

                <Field
                  id="booking-participants"
                  label="Jumlah peserta *"
                >
                  <input
                    id="booking-participants"
                    type="number"
                    min={1}
                    step={1}
                    max={selectedRoom?.capacity}
                    value={form.participantCount}
                    onChange={(event) =>
                      update(
                        "participantCount",
                        event.target.value,
                      )
                    }
                    placeholder="Masukkan jumlah peserta"
                    required
                    className={inputClass}
                  />
                </Field>

                <p className="text-[11px] leading-6 text-muted">
                  Jumlah peserta tidak boleh melebihi kapasitas
                  ruangan.
                </p>
              </div>
            </section>

            <section className="border-t border-slate-100 pt-6">
              <SectionTitle
                number={3}
                title="Waktu Penggunaan"
                description="Semua waktu menggunakan WIB, terlepas dari zona waktu perangkat."
              />

              <div className="grid gap-5 md:grid-cols-2">
                <Field
                  id="booking-start"
                  label="Mulai (WIB) *"
                >
                  <input
                    id="booking-start"
                    type="datetime-local"
                    step={60}
                    value={form.startsAt}
                    onChange={(event) =>
                      update("startsAt", event.target.value)
                    }
                    required
                    className={`${inputClass} min-w-0`}
                  />
                </Field>

                <Field
                  id="booking-end"
                  label="Selesai (WIB) *"
                >
                  <input
                    id="booking-end"
                    type="datetime-local"
                    step={60}
                    value={form.endsAt}
                    onChange={(event) =>
                      update("endsAt", event.target.value)
                    }
                    required
                    className={`${inputClass} min-w-0`}
                  />
                </Field>
              </div>
            </section>

            <section className="border-t border-slate-100 pt-6">
              <SectionTitle
                number={4}
                title="Prioritas KRS"
                description="Aktifkan jika pengajuan sesuai data KRS dan membutuhkan verifikasi dokumen."
              />

              <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 p-4">
                <input
                  type="checkbox"
                  checked={form.isKrsPriority}
                  onChange={(event) => {
                    update("isKrsPriority", event.target.checked);
                    setError("");

                    if (!event.target.checked) {
                      setKrsFile(null);

                      if (fileInputRef.current) {
                        fileInputRef.current.value = "";
                      }
                    }
                  }}
                  className="mt-1 h-4 w-4 shrink-0 accent-[#173A56]"
                />

                <span>
                  <span className="block text-xs font-bold text-primary">
                    Ajukan sebagai prioritas KRS
                  </span>

                  <span className="mt-2 block text-[11px] leading-6 text-muted">
                    Dokumen akan diverifikasi Admin. Prioritas KRS
                    tetap memerlukan proses persetujuan.
                  </span>
                </span>
              </label>

              {form.isKrsPriority && (
                <div className="mt-4 space-y-5 rounded-2xl border border-slate-200 p-4">
                  <Field
                    id="krs-document"
                    label="Dokumen KRS *"
                  >
                    <input
                      ref={fileInputRef}
                      id="krs-document"
                      type="file"
                      accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
                      onChange={(event) =>
                        handleFileChange(
                          event.target.files?.[0] ?? null,
                        )
                      }
                      required
                      className="block w-full text-xs text-muted file:mr-3 file:rounded-xl file:border-0 file:bg-slate-100 file:px-4 file:py-3 file:text-xs file:font-semibold file:text-primary"
                    />
                  </Field>

                  <p className="text-[11px] leading-6 text-muted">
                    PDF, PNG, atau JPG/JPEG. Maksimal 5 MB.
                    {krsFile && (
                      <span className="mt-1 block break-all font-semibold text-primary">
                        Dipilih: {krsFile.name}
                      </span>
                    )}
                  </p>

                  <Field
                    id="krs-reference"
                    label="Kode referensi KRS (opsional)"
                  >
                    <input
                      id="krs-reference"
                      value={form.referenceCode}
                      onChange={(event) =>
                        update("referenceCode", event.target.value)
                      }
                      placeholder="Masukkan kode jika tersedia"
                      maxLength={100}
                      className={inputClass}
                    />
                  </Field>
                </div>
              )}
            </section>

            <div className="flex flex-col justify-between gap-4 border-t border-slate-100 pt-6 sm:flex-row sm:items-center">
              <p className="max-w-md text-[11px] leading-6 text-muted">
                Kolom bertanda * wajib diisi. Jenis booking dan
                status persetujuan ditentukan oleh database.
              </p>

              <button
                type="submit"
                disabled={
                  submitting ||
                  roomsLoading ||
                  Boolean(roomsError) ||
                  rooms.length === 0
                }
                className="btn-primary shrink-0 rounded-xl"
              >
                {submitting
                  ? "Mengirim..."
                  : "Ajukan Booking"}

                {!submitting && (
                  <span aria-hidden="true">→</span>
                )}
              </button>
            </div>
          </fieldset>
        </form>

        <aside
          aria-label="Ringkasan booking"
          className="space-y-4 xl:sticky xl:top-28"
        >
          <section className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-sm">
            <div className="bg-[#173A56] p-5 text-white">
              <span className="inline-flex rounded-xl bg-white/10 p-2.5 text-cyan-100">
                <BuildingIcon />
              </span>

              <h2 className="mt-4 font-heading text-base font-extrabold">
                Ringkasan Booking
              </h2>

              <p className="mt-2 text-[11px] leading-6 text-slate-300">
                Periksa kembali sebelum mengirim pengajuan.
              </p>
            </div>

            <div className="space-y-5 p-5">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">
                  Ruangan
                </p>

                <p className="mt-2 break-words text-sm font-bold text-primary">
                  {selectedRoom?.room_name ||
                    "Belum memilih ruangan"}
                </p>

                {selectedRoom && (
                  <>
                    <p className="mt-2 text-xs text-muted">
                      {selectedRoom.room_code}
                    </p>

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

                    <span className="mt-3 inline-flex rounded-lg bg-slate-100 px-3 py-1.5 text-[10px] font-semibold text-primary">
                      Kapasitas {selectedRoom.capacity} orang
                    </span>
                  </>
                )}
              </div>

              <dl className="space-y-4 border-t border-slate-100 pt-4">
                <div>
                  <dt className="text-[10px] text-muted">
                    Kegiatan
                  </dt>
                  <dd className="mt-1 break-words text-xs font-semibold leading-6 text-primary">
                    {form.title.trim() || "Belum diisi"}
                  </dd>
                </div>

                <div>
                  <dt className="text-[10px] text-muted">
                    Jumlah Peserta
                  </dt>
                  <dd className="mt-1 text-xs font-semibold text-primary">
                    {form.participantCount
                      ? `${form.participantCount} orang`
                      : "Belum diisi"}
                  </dd>
                </div>

                <div>
                  <dt className="text-[10px] text-muted">
                    Mulai
                  </dt>
                  <dd className="mt-1 text-xs font-semibold leading-6 text-primary">
                    {formatDateTime(form.startsAt)}
                  </dd>
                </div>

                <div>
                  <dt className="text-[10px] text-muted">
                    Selesai
                  </dt>
                  <dd className="mt-1 text-xs font-semibold leading-6 text-primary">
                    {formatDateTime(form.endsAt)}
                  </dd>
                </div>

                <div>
                  <dt className="text-[10px] text-muted">
                    Prioritas KRS
                  </dt>
                  <dd className="mt-1 text-xs font-semibold text-primary">
                    {form.isKrsPriority
                      ? "Diajukan untuk verifikasi"
                      : "Tidak diajukan"}
                  </dd>
                </div>
              </dl>

              {!!selectedRoom?.facilities.length && (
                <div className="border-t border-slate-100 pt-4">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">
                    Fasilitas
                  </p>

                  <ul className="mt-3 flex flex-wrap gap-2">
                    {selectedRoom.facilities.map(
                      (facility, index) => (
                        <li
                          key={`${facility}-${index}`}
                          className="max-w-full break-words rounded-lg border border-slate-200 px-2.5 py-1 text-[10px] text-primary"
                        >
                          {facility}
                        </li>
                      ),
                    )}
                  </ul>
                </div>
              )}
            </div>
          </section>

          <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-4">
            <h2 className="text-xs font-bold text-primary">
              Tentang Jenis Booking
            </h2>

            <p className="mt-2 text-[11px] leading-6 text-muted">
              Klasifikasi Instant atau Regular mengikuti waktu
              server saat pengajuan diproses. Prioritas KRS
              membutuhkan dokumen dan verifikasi Admin.
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}