"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
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
  bookingType: "instant" | "regular" | "krs_priority";
  status: "pending" | "approved";
};

type BookingFormState = {
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

const initialForm: BookingFormState = {
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

const inputClassName =
  "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200";

function getBookingErrorMessage(message: string) {
  const normalized = message.toLowerCase();

  if (
    normalized.includes("room_reservations_no_overlap") ||
    normalized.includes("conflicting key value") ||
    normalized.includes("exclusion constraint") ||
    normalized.includes("conflicts with an existing reservation") ||
    normalized.includes("booking conflicts")
  ) {
    return "Ruangan sudah digunakan pada rentang waktu tersebut. Silakan pilih waktu atau ruangan lain.";
  }

  if (
    normalized.includes("booking start time must be in the future") ||
    normalized.includes("booking start time has passed") ||
    normalized.includes("booking has expired") ||
    normalized.includes("booking has already ended")
  ) {
    return "Waktu mulai sudah lewat. Pilih waktu yang masih akan datang.";
  }

  if (normalized.includes("participant count exceeds room capacity")) {
    return "Jumlah peserta melebihi kapasitas ruangan.";
  }

  if (normalized.includes("room does not exist or is inactive")) {
    return "Ruangan tidak tersedia atau sudah dinonaktifkan.";
  }

  if (normalized.includes("end time must be later than start time")) {
    return "Jam selesai harus lebih besar daripada jam mulai.";
  }

  if (normalized.includes("krs document is required")) {
    return "Dokumen KRS wajib diunggah untuk booking prioritas KRS.";
  }

  return message || "Booking gagal dikirim. Silakan coba lagi.";
}

function bookingTypeLabel(type: BookingResult["bookingType"]) {
  if (type === "instant") return "Instant";
  if (type === "krs_priority") return "Prioritas KRS";
  return "Regular";
}

export default function BookingForm() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [roomsLoading, setRoomsLoading] = useState(true);
  const [roomsError, setRoomsError] = useState("");
  const [form, setForm] = useState<BookingFormState>(initialForm);
  const [krsFile, setKrsFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [result, setResult] = useState<BookingResult | null>(null);

  const loadRooms = useCallback((signal?: AbortSignal) => {
    const request = async () => {
      const supabase = createClient();
      const { data, error: queryError } = await supabase
        .from("rooms")
        .select(
          "id, room_code, room_name, room_type, building, floor, capacity, facilities",
        )
        .eq("is_active", true)
        .order("room_code", { ascending: true });

      if (queryError) throw queryError;
      if (signal?.aborted) return;
      setRooms((data ?? []) as Room[]);
    };
    return request().catch((err: unknown) => {
      console.error("Load rooms:", err);
      if (!signal?.aborted) setRoomsError(getErrorMessage(err, "Gagal mengambil data ruangan."));
    }).finally(() => {
      if (!signal?.aborted) setRoomsLoading(false);
    });
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void loadRooms(controller.signal);
    return () => controller.abort();
  }, [loadRooms]);

  function updateField<K extends keyof BookingFormState>(
    key: K,
    value: BookingFormState[K],
  ) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function handleKrsFileChange(file: File | null) {
    setError("");

    if (!file) {
      setKrsFile(null);
      return;
    }

    const allowedTypes = ["application/pdf", "image/png", "image/jpeg"];
    if (!allowedTypes.includes(file.type)) {
      setKrsFile(null);
      setError("Format dokumen KRS harus PDF, PNG, atau JPG/JPEG.");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setKrsFile(null);
      setError("Ukuran dokumen KRS maksimal 5 MB.");
      return;
    }

    setKrsFile(file);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    setError("");
    setSuccessMessage("");
    setResult(null);

    const selectedRoom = rooms.find((room) => room.id === form.roomId);
    const participantCount = Number(form.participantCount);
    const startsAtDate = new Date(`${form.startsAt}+07:00`);
    const endsAtDate = new Date(`${form.endsAt}+07:00`);

    if (!selectedRoom) {
      setError("Silakan pilih ruangan.");
      return;
    }

    if (!form.title.trim() || !form.purpose.trim()) {
      setError("Nama kegiatan dan tujuan peminjaman wajib diisi.");
      return;
    }

    if (!form.startsAt || !form.endsAt || Number.isNaN(startsAtDate.getTime()) || Number.isNaN(endsAtDate.getTime())) {
      setError("Tanggal dan waktu mulai serta selesai wajib diisi.");
      return;
    }

    if (startsAtDate.getTime() <= Date.now()) {
      setError("Waktu mulai harus di masa mendatang. Waktu akan diperiksa kembali oleh server.");
      return;
    }

    if (endsAtDate.getTime() <= startsAtDate.getTime()) {
      setError("Waktu selesai harus setelah waktu mulai.");
      return;
    }

    if (!Number.isInteger(participantCount) || participantCount < 1) {
      setError("Jumlah peserta minimal 1 orang.");
      return;
    }

    if (participantCount > selectedRoom.capacity) {
      setError(`Kapasitas ruangan ini maksimal ${selectedRoom.capacity} orang.`);
      return;
    }

    if (form.isKrsPriority && !krsFile) {
      setError("Unggah dokumen KRS untuk mengajukan booking prioritas.");
      return;
    }

    setSubmitting(true);
    let uploadedDocumentPath: string | null = null;

    try {
      const supabase = createClient();
      const bookingId = crypto.randomUUID();
      let currentUserId: string | null = null;

      // Dokumen diunggah lebih dahulu karena RPC memvalidasi path di Storage.
      if (form.isKrsPriority && krsFile) {
        const { data: userData, error: userError } = await supabase.auth.getUser();
        if (userError) throw userError;
        if (!userData.user) throw new Error("Sesi login tidak ditemukan. Silakan login ulang.");

        currentUserId = userData.user.id;
        const safeFileName = krsFile.name.trim().replace(/[^a-zA-Z0-9._-]/g, "_");
        uploadedDocumentPath = `${currentUserId}/${bookingId}/${safeFileName}`;

        const { error: uploadError } = await supabase.storage
          .from("krs-documents")
          .upload(uploadedDocumentPath, krsFile, {
            cacheControl: "3600",
            contentType: krsFile.type,
            upsert: false,
          });

        if (uploadError) throw uploadError;
      }

      // Waktu server dan klasifikasi instant/regular diperiksa oleh trigger
      // prepare_booking() saat RPC ini memasukkan booking ke database.
      const { error: submitError } = await supabase.rpc("submit_booking", {
        p_booking_id: bookingId,
        p_room_id: form.roomId,
        p_title: form.title.trim(),
        p_purpose: form.purpose.trim(),
        p_starts_at: startsAtDate.toISOString(),
        p_ends_at: endsAtDate.toISOString(),
        p_activity_type: form.activityType,
        p_participant_count: participantCount,
        p_is_krs_priority: form.isKrsPriority,
        p_krs_document_path: uploadedDocumentPath,
        p_reference_code: form.isKrsPriority ? form.referenceCode.trim() || null : null,
      });

      if (submitError) throw submitError;

      // Baca hasil klasifikasi database satu kali setelah pengajuan berhasil.
      const { data: savedBooking, error: resultError } = await supabase
        .from("bookings")
        .select("booking_type, status")
        .eq("id", bookingId)
        .single();

      setSuccessMessage("Booking berhasil diajukan.");
      if (resultError) {
        console.warn("Booking created, but result details could not be loaded:", resultError);
        setResult(null);
      } else {
        setResult({
          bookingType: savedBooking.booking_type,
          status: savedBooking.status,
        } as BookingResult);
      }

      setForm(initialForm);
      setKrsFile(null);
      const fileInput = document.getElementById("krs-document") as HTMLInputElement | null;
      if (fileInput) fileInput.value = "";
    } catch (err) {
      console.error("Submit booking:", err);

      // Jika RPC gagal setelah upload, hapus dokumen yang belum terpakai.
      if (uploadedDocumentPath) {
        const supabase = createClient();
        const { error: cleanupError } = await supabase.storage
          .from("krs-documents")
          .remove([uploadedDocumentPath]);
        if (cleanupError) console.error("KRS upload cleanup failed:", cleanupError);
      }

      const message = getErrorMessage(err, "Booking gagal dikirim. Silakan coba lagi.");
      setError(getBookingErrorMessage(message));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <p className="text-sm font-medium text-slate-500">Komting</p>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">Ajukan Booking Ruangan</h1>
        <p className="mt-2 text-sm text-slate-500">
          Pilih ruangan dan waktu penggunaan. Sistem menentukan jenis booking berdasarkan waktu server
          ketika tombol pengajuan ditekan.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700" role="alert">
          {error}
        </div>
      )}

      {successMessage && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800" role="status">
          <p className="font-semibold">{successMessage}</p>
          {result ? (
            <>
              <p className="mt-1">Jenis booking: {bookingTypeLabel(result.bookingType)}.</p>
              <p className="mt-1">
                Status: {result.status === "approved" ? "Disetujui otomatis" : "Menunggu persetujuan Admin"}.
              </p>
            </>
          ) : (
            <p className="mt-1">Jenis dan status booking sudah diproses oleh database.</p>
          )}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6 rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
        <section className="space-y-4">
          <div>
            <h2 className="font-semibold text-slate-900">Informasi Ruangan</h2>
            <p className="mt-1 text-xs text-slate-500">Pilih ruangan yang akan digunakan.</p>
          </div>

          <div>
            <label htmlFor="room" className="text-sm font-medium text-slate-700">Ruangan</label>
            <select
              id="room"
              value={form.roomId}
              onChange={(event) => updateField("roomId", event.target.value)}
              className={inputClassName}
              disabled={roomsLoading || rooms.length === 0}
              required
            >
              <option value="">
                {roomsLoading ? "Memuat ruangan..." : rooms.length === 0 ? "Tidak ada ruangan aktif" : "Pilih ruangan"}
              </option>
              {rooms.map((room) => (
                <option key={room.id} value={room.id}>
                  {room.room_code} - {room.room_name} ({room.room_type === "kelas" ? "Kelas" : "Laboratorium"}) · Kapasitas {room.capacity}
                </option>
              ))}
            </select>
            {roomsError && (
              <div className="mt-2 flex items-center gap-3 text-sm text-red-600">
                <span>{roomsError}</span>
                <button type="button" onClick={() => {
                                  setRoomsLoading(true);
                                  setRoomsError("");
                                  void loadRooms();
                                }} className="font-semibold underline">Coba lagi</button>
              </div>
            )}
            {selectedRoomDescription(rooms, form.roomId) && (
              <p className="mt-2 text-xs text-slate-500">{selectedRoomDescription(rooms, form.roomId)}</p>
            )}
          </div>
        </section>

        <div className="border-t border-slate-100" />

        <section className="space-y-4">
          <div>
            <h2 className="font-semibold text-slate-900">Detail Kegiatan</h2>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="title" className="text-sm font-medium text-slate-700">Nama Kegiatan</label>
              <input
                id="title"
                value={form.title}
                onChange={(event) => updateField("title", event.target.value)}
                className={inputClassName}
                placeholder="Contoh: Diskusi Kelompok PTIK"
                maxLength={150}
                required
              />
            </div>

            <div>
              <label htmlFor="activity-type" className="text-sm font-medium text-slate-700">Jenis Kegiatan</label>
              <select
                id="activity-type"
                value={form.activityType}
                onChange={(event) => updateField("activityType", event.target.value)}
                className={inputClassName}
              >
                <option value="kegiatan_akademik">Kegiatan Akademik</option>
                <option value="praktikum">Praktikum</option>
                <option value="diskusi">Diskusi</option>
                <option value="kegiatan_lain">Kegiatan Lainnya</option>
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="purpose" className="text-sm font-medium text-slate-700">Tujuan Peminjaman</label>
            <textarea
              id="purpose"
              value={form.purpose}
              onChange={(event) => updateField("purpose", event.target.value)}
              className={inputClassName}
              rows={3}
              placeholder="Jelaskan tujuan penggunaan ruangan..."
              maxLength={1000}
              required
            />
          </div>

          <div>
            <label htmlFor="participants" className="text-sm font-medium text-slate-700">Jumlah Peserta</label>
            <input
              id="participants"
              type="number"
              min={1}
              max={rooms.find((room) => room.id === form.roomId)?.capacity ?? undefined}
              value={form.participantCount}
              onChange={(event) => updateField("participantCount", event.target.value)}
              className={inputClassName}
              placeholder="Masukkan jumlah peserta"
              required
            />
            <p className="mt-1 text-xs text-slate-500">Jumlah peserta tidak boleh melebihi kapasitas ruangan.</p>
          </div>
        </section>

        <div className="border-t border-slate-100" />

        <section className="space-y-4">
          <div>
            <h2 className="font-semibold text-slate-900">Waktu Penggunaan</h2>
            <p className="mt-1 text-xs text-slate-500">
              Semua waktu menggunakan WIB (UTC+07:00), terlepas dari zona waktu perangkat. Waktu akan divalidasi kembali oleh server saat pengajuan dikirim.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="starts-at" className="text-sm font-medium text-slate-700">Mulai (WIB)</label>
              <input
                id="starts-at"
                type="datetime-local"
                value={form.startsAt}
                onChange={(event) => updateField("startsAt", event.target.value)}
                className={inputClassName}
                required
              />
            </div>

            <div>
              <label htmlFor="ends-at" className="text-sm font-medium text-slate-700">Selesai (WIB)</label>
              <input
                id="ends-at"
                type="datetime-local"
                value={form.endsAt}
                onChange={(event) => updateField("endsAt", event.target.value)}
                className={inputClassName}
                required
              />
            </div>
          </div>
        </section>

        <div className="border-t border-slate-100" />

        <section className="space-y-4">
          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 p-4">
            <input
              type="checkbox"
              checked={form.isKrsPriority}
              onChange={(event) => {
                updateField("isKrsPriority", event.target.checked);
                setError("");
              }}
              className="mt-0.5 h-4 w-4 rounded border-slate-300"
            />
            <span>
              <span className="block text-sm font-semibold text-slate-800">Pengajuan prioritas sesuai data KRS</span>
              <span className="mt-1 block text-xs leading-5 text-slate-500">
                Centang dan unggah dokumen KRS. Pengajuan ini tetap menunggu verifikasi dan persetujuan Admin.
              </span>
            </span>
          </label>

          {form.isKrsPriority && (
            <div className="grid gap-4 rounded-lg bg-slate-50 p-4 sm:grid-cols-2">
              <div>
                <label htmlFor="krs-document" className="text-sm font-medium text-slate-700">Dokumen KRS</label>
                <input
                  id="krs-document"
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
                  onChange={(event) => handleKrsFileChange(event.target.files?.[0] ?? null)}
                  className="mt-1 block w-full text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-slate-200 file:px-3 file:py-2 file:text-sm file:font-medium file:text-slate-700"
                  required
                />
                <p className="mt-1 text-xs text-slate-500">PDF, PNG, atau JPG/JPEG. Maksimal 5 MB.</p>
              </div>

              <div>
                <label htmlFor="reference-code" className="text-sm font-medium text-slate-700">Kode Referensi KRS (opsional)</label>
                <input
                  id="reference-code"
                  value={form.referenceCode}
                  onChange={(event) => updateField("referenceCode", event.target.value)}
                  className={inputClassName}
                  placeholder="Masukkan kode referensi jika ada"
                  maxLength={100}
                />
              </div>
            </div>
          )}
        </section>

        <div className="flex flex-col-reverse gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs leading-5 text-slate-500">
            Klasifikasi Instant atau Regular ditentukan oleh waktu server saat tombol diklik, bukan oleh jam perangkat.
          </p>
          <button
            type="submit"
            disabled={submitting || roomsLoading || rooms.length === 0}
            className="inline-flex min-w-40 items-center justify-center rounded-lg bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? "Mengirim..." : "Ajukan Booking"}
          </button>
        </div>
      </form>
    </div>
  );
}

function selectedRoomDescription(rooms: Room[], roomId: string) {
  const room = rooms.find((item) => item.id === roomId);
  if (!room) return "";

  const details = [room.building, room.floor ? `Lantai ${room.floor}` : null]
    .filter(Boolean)
    .join(" · ");
  const facilities = room.facilities?.length ? `Fasilitas: ${room.facilities.join(", ")}` : "";
  return [details, facilities].filter(Boolean).join(" · ");
}
