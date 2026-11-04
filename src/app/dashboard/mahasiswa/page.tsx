
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { getErrorMessage } from "@/lib/errors";
import { useCurrentTime } from "@/lib/hooks/use-current-time";

type StudentProfile = {
  id: string;
  full_name: string;
  email: string | null;
  student_number: string | null;
  class_id: string | null;
  role: string;
  is_active: boolean;
};

type StudentClass = {
  class_code: string;
  class_name: string;
  study_program: string;
};

type BookingItem = {
  id: string;
  title: string;
  purpose: string | null;
  activity_type: string | null;
  room_id: string;
  starts_at: string;
  ends_at: string;
};

type Room = {
  id: string;
  room_code: string;
  room_name: string;
  building: string | null;
};

function getJakartaDate(now: number) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(now));
  return ["year", "month", "day"]
    .map((type) => parts.find((part) => part.type === type)?.value)
    .join("-");
}

function getTodayRange(date: string) {
  const start = new Date(`${date}T00:00:00+07:00`);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);

  return {
    start: start.toISOString(),
    end: end.toISOString(),
  };
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(value);
}

function formatScheduleDate(value: string) {
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(value));
}

function formatScheduleDateTime(value: string, todayDate: string) {
  const d = new Date(value);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const bookingDate = ["year", "month", "day"]
    .map((type) => parts.find((part) => part.type === type)?.value)
    .join("-");

  const timeStr = formatTime(value);

  if (bookingDate === todayDate) {
    return `Hari ini, pukul ${timeStr}`;
  }

  const dateLabel = new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    weekday: "long",
    day: "numeric",
    month: "short",
  }).format(d);

  return `${dateLabel}, pukul ${timeStr}`;
}

type ActionIconName = "rooms" | "calendar" | "inbox";

function ActionIcon({ name }: { name: ActionIconName }) {
  const common = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  if (name === "rooms") {
    return <svg viewBox="0 0 24 24" aria-hidden="true" {...common}><path d="M4 21V5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v16M15 9h4a1 1 0 0 1 1 1v11M2 21h20M8 8h3M8 12h3M8 16h3" /></svg>;
  }
  if (name === "calendar") {
    return <svg viewBox="0 0 24 24" aria-hidden="true" {...common}><rect x="3.5" y="5" width="17" height="16" rx="2" /><path d="M8 3v4M16 3v4M3.5 10h17" /></svg>;
  }
  return <svg viewBox="0 0 24 24" aria-hidden="true" {...common}><path d="M4 4h16l2 11v4H2v-4L4 4Z" /><path d="M2 15h6l2 2h4l2-2h6" /></svg>;
}

function QuickAction({
  href,
  icon,
  title,
  description,
}: {
  href: string;
  icon: ActionIconName;
  title: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="group flex min-h-40 flex-col rounded-xl border border-slate-200 bg-white p-5 transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-sm"
    >
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 p-2.5 text-slate-700">
          <ActionIcon name={icon} />
        </span>
        <h3 className="font-semibold text-slate-900">{title}</h3>
      </div>

      <p className="mt-3 flex-1 text-sm leading-5 text-slate-500">
        {description}
      </p>

      <span className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-slate-800">
        Buka halaman
      </span>
    </Link>
  );
}

export default function MahasiswaDashboardPage() {
  const router = useRouter();
  const now = useCurrentTime();
  const loadController = useRef<AbortController | null>(null);
  const today = now === null ? "" : getJakartaDate(now);

  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [studentClass, setStudentClass] = useState<StudentClass | null>(null);
  const [todayBookings, setTodayBookings] = useState<BookingItem[]>([]);
  const [upcomingBookings, setUpcomingBookings] = useState<BookingItem[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadDashboard = useCallback(() => {
    loadController.current?.abort();
    const controller = new AbortController();
    loadController.current = controller;
    const { signal } = controller;
    const request = async () => {
      const supabase = createClient();

      // 1. Ambil pengguna yang sedang login.
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (signal?.aborted) return;
      if (authError) throw authError;

      if (!user) {
        router.replace("/login");
        return;
      }

      // 2. Ambil profil mahasiswa.
      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select(
          "id, full_name, email, student_number, class_id, role, is_active"
        )
        .eq("id", user.id)
        .maybeSingle();

      if (signal?.aborted) return;
      if (profileError) throw profileError;

      if (
        !profileData ||
        profileData.role !== "mahasiswa" ||
        !profileData.is_active
      ) {
        router.replace("/registration-status");
        return;
      }

      setProfile(profileData);

      // 3. Ambil informasi kelas.
      if (profileData.class_id) {
        const { data: classData, error: classError } = await supabase
          .from("classes")
          .select("class_code, class_name, study_program")
          .eq("id", profileData.class_id)
          .maybeSingle();

        if (signal?.aborted) return;
        if (classError) throw classError;

        setStudentClass(classData);
      } else {
        setStudentClass(null);
      }

      // 4. Ambil booking yang disetujui untuk kelas hari ini dan mendatang.
      if (!profileData.class_id) {
        setTodayBookings([]);
        setUpcomingBookings([]);
        setRooms([]);
        return;
      }

      const { start, end } = getTodayRange(today);

      const { data: bookingData, error: bookingError } = await supabase
        .from("bookings")
        .select(
          "id, title, purpose, activity_type, room_id, starts_at, ends_at"
        )
        .eq("class_id", profileData.class_id)
        .eq("status", "approved")
        .gte("ends_at", start)
        .order("starts_at", { ascending: true });

      if (signal?.aborted) return;
      if (bookingError) throw bookingError;

      const allBookings = (bookingData ?? []) as BookingItem[];

      const todayList = allBookings.filter(
        (b) => b.starts_at < end && b.ends_at > start
      );
      const upcomingList = allBookings.filter((b) => b.starts_at >= end);

      setTodayBookings(todayList);
      setUpcomingBookings(upcomingList);

      // 5. Ambil nama ruangan untuk seluruh jadwal yang disetujui.
      const roomIds = [
        ...new Set(allBookings.map((booking) => booking.room_id)),
      ];

      if (roomIds.length > 0) {
        const { data: roomData, error: roomError } = await supabase
          .from("rooms")
          .select("id, room_code, room_name, building")
          .in("id", roomIds);

        if (signal?.aborted) return;
        if (roomError) throw roomError;

        setRooms(roomData ?? []);
      } else {
        setRooms([]);
      }
    };
    return request().catch((err: unknown) => {
      if (signal?.aborted) return;
      console.error("Load mahasiswa dashboard:", err);
      setError(getErrorMessage(err, "Gagal memuat dashboard."));
    }).finally(() => {
      if (!signal?.aborted) setLoading(false);
    });
  }, [router, today]);

  useEffect(() => {
    if (!today) return;
    void loadDashboard();
    return () => loadController.current?.abort();
  }, [loadDashboard, today]);

  const getRoom = (roomId: string) => {
    return rooms.find((room) => room.id === roomId);
  };

  const allApprovedBookings = [...todayBookings, ...upcomingBookings];
  const nextBooking = allApprovedBookings.find(
    (booking) => now !== null && Date.parse(booking.ends_at) > now
  );

  return (
    <div className="space-y-7 pb-10">
      {/* Header */}
      <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <p className="text-sm font-medium text-slate-500">
            Dashboard Mahasiswa
          </p>

          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
            Selamat datang,{" "}
            {loading ? "..." : profile?.full_name ?? "Mahasiswa"}!
          </h1>

          <p className="mt-2 text-sm text-slate-500">
            {now === null ? "Memuat tanggal..." : formatDate(new Date(now))}
          </p>
        </div>

        <button
          onClick={() => {
            setLoading(true);
            setError("");
            void loadDashboard();
          }}
          disabled={loading || !today}
          className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
        >
          {loading ? "Memuat..." : "Muat Ulang"}
        </button>
      </section>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Informasi mahasiswa */}
      <section className="rounded-2xl bg-slate-900 p-6 text-white">
        <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
          <div>
            <p className="text-sm text-slate-300">
              Informasi Akademik
            </p>

            <h2 className="mt-2 text-xl font-bold">
              {studentClass?.class_name ?? "Kelas belum tersedia"}
            </h2>

            <p className="mt-1 text-sm text-slate-300">
              {studentClass?.class_code ?? "-"}
              {" - "}
              {studentClass?.study_program ?? "-"}
            </p>
          </div>

          <div className="rounded-xl border border-white/15 bg-white/10 p-4 sm:min-w-48">
            <p className="text-xs text-slate-300">Nomor Induk Mahasiswa</p>
            <p className="mt-1 text-lg font-semibold">
              {profile?.student_number ?? "-"}
            </p>
          </div>
        </div>
      </section>

      {/* Ringkasan */}
      <section className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-sm text-slate-500">
            Jadwal kelas hari ini
          </p>

          <div className="mt-2 flex items-end justify-between">
            <h2 className="text-3xl font-bold text-slate-900">
              {loading ? "..." : todayBookings.length}
            </h2>
            <span className="text-sm font-medium text-slate-500">
              {upcomingBookings.length > 0
                ? `${upcomingBookings.length} jadwal mendatang`
                : "Kegiatan disetujui"}
            </span>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-sm text-slate-500">
            Kegiatan berikutnya
          </p>

          {loading ? (
            <p className="mt-2 text-sm text-slate-400">Memuat...</p>
          ) : nextBooking ? (
            <>
              <h2 className="mt-2 truncate text-lg font-bold text-slate-900">
                {nextBooking.title}
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                {formatScheduleDateTime(nextBooking.starts_at, today)}
              </p>
            </>
          ) : (
            <p className="mt-2 text-sm text-slate-500">
              Tidak ada kegiatan terjadwal berikutnya.
            </p>
          )}
        </div>
      </section>

      {/* Aksi cepat */}
      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900">
            Akses Cepat
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Pilih layanan yang ingin kamu gunakan.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <QuickAction
            href="/dashboard/mahasiswa/rooms"
            icon="rooms"
            title="Informasi Ruangan"
            description="Lihat daftar ruang kelas dan laboratorium beserta fasilitasnya."
          />

          <QuickAction
            href="/dashboard/mahasiswa/schedule"
            icon="calendar"
            title="Jadwal & Ketersediaan"
            description="Periksa penggunaan dan ketersediaan ruangan."
          />

          <QuickAction
            href="/dashboard/mahasiswa/requests"
            icon="inbox"
            title="Ajukan Kebutuhan"
            description="Sampaikan kebutuhan penggunaan ruangan kepada Komting."
          />
        </div>
      </section>

      {/* Jadwal hari ini */}
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="flex flex-col justify-between gap-2 border-b border-slate-100 p-5 sm:flex-row sm:items-center">
          <div>
            <h2 className="font-bold text-slate-900">
              Aktivitas Kelas Hari Ini
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Daftar booking kelas yang sudah disetujui untuk hari ini.
            </p>
          </div>

          <Link
            href="/dashboard/mahasiswa/schedule"
            className="text-sm font-semibold text-slate-800 underline decoration-slate-300 underline-offset-4 hover:decoration-slate-800"
          >
            Lihat jadwal
          </Link>
        </div>

        {loading ? (
          <div className="p-8 text-center text-sm text-slate-400">
            Memuat jadwal...
          </div>
        ) : todayBookings.length === 0 ? (
          <div className="p-10 text-center">
            <p className="font-medium text-slate-700">
              Belum ada kegiatan hari ini
            </p>
            <p className="mt-1 text-sm text-slate-400">
              Jadwal kelas yang telah disetujui untuk hari ini akan muncul di sini.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {todayBookings.map((booking) => {
              const room = getRoom(booking.room_id);

              return (
                <div
                  key={booking.id}
                  className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <h3 className="font-semibold text-slate-900">
                      {booking.title}
                    </h3>

                    <p className="mt-1 text-sm text-slate-500">
                      {booking.activity_type ?? booking.purpose ?? "Kegiatan kelas"}
                    </p>

                    <p className="mt-2 text-sm text-slate-600">
                      {room?.room_code ?? "Ruangan"}{" "}
                      {room?.room_name ? `- ${room.room_name}` : ""}
                      {room?.building ? ` - ${room.building}` : ""}
                    </p>
                  </div>

                  <div className="sm:text-right">
                    <p className="font-semibold text-slate-900">
                      {formatTime(booking.starts_at)}
                      {" - "}
                      {formatTime(booking.ends_at)} WIB
                    </p>

                    <span className="mt-2 inline-flex rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                      Disetujui Admin
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Jadwal kelas mendatang */}
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="flex flex-col justify-between gap-2 border-b border-slate-100 p-5 sm:flex-row sm:items-center">
          <div>
            <h2 className="font-bold text-slate-900">
              Jadwal Kelas Mendatang
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Daftar kegiatan dan perkuliahan kelas yang telah disetujui Admin untuk hari berikutnya.
            </p>
          </div>

          <Link
            href="/dashboard/mahasiswa/schedule"
            className="text-sm font-semibold text-slate-800 underline decoration-slate-300 underline-offset-4 hover:decoration-slate-800"
          >
            Lihat ketersediaan ruangan
          </Link>
        </div>

        {loading ? (
          <div className="p-8 text-center text-sm text-slate-400">
            Memuat jadwal mendatang...
          </div>
        ) : upcomingBookings.length === 0 ? (
          <div className="p-10 text-center">
            <p className="font-medium text-slate-700">
              Belum ada jadwal mendatang
            </p>
            <p className="mt-1 text-sm text-slate-400">
              Jadwal kelas yang telah disetujui Admin untuk hari esok atau mendatang akan muncul di sini.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {upcomingBookings.map((booking) => {
              const room = getRoom(booking.room_id);

              return (
                <div
                  key={booking.id}
                  className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold text-slate-900">
                        {booking.title}
                      </h3>
                      <span className="rounded-md bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-700">
                        {formatScheduleDate(booking.starts_at)}
                      </span>
                    </div>

                    <p className="mt-1 text-sm text-slate-500">
                      {booking.activity_type ?? booking.purpose ?? "Kegiatan kelas"}
                    </p>

                    <p className="mt-2 text-sm text-slate-600">
                      {room?.room_code ?? "Ruangan"}{" "}
                      {room?.room_name ? `- ${room.room_name}` : ""}
                      {room?.building ? ` - ${room.building}` : ""}
                    </p>
                  </div>

                  <div className="sm:text-right">
                    <p className="font-semibold text-slate-900">
                      {formatTime(booking.starts_at)}
                      {" - "}
                      {formatTime(booking.ends_at)} WIB
                    </p>

                    <span className="mt-2 inline-flex rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                      Disetujui Admin
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Informasi */}
      <section className="rounded-xl border border-slate-200 bg-slate-50 p-5">
        <div>
          <div>
            <h3 className="font-semibold text-slate-900">
              Butuh ruangan untuk kegiatan kelas?
            </h3>

            <p className="mt-1 text-sm leading-relaxed text-slate-600">
              Kamu dapat menyampaikan kebutuhan ruangan melalui formulir
              pengajuan. Komting kelas akan meninjau permintaan tersebut
              dan mengajukan booking apabila diperlukan.
            </p>

            <Link
              href="/dashboard/mahasiswa/requests"
              className="mt-3 inline-flex text-sm font-semibold text-slate-800 underline decoration-slate-300 underline-offset-4 hover:decoration-slate-800"
            >
              Sampaikan kebutuhan ruangan
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
