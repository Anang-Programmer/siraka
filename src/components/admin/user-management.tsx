"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createClient } from "@/lib/supabase/client";
import { getErrorMessage } from "@/lib/errors";

type UserRole = "mahasiswa" | "komting" | "admin";

type UserProfile = {
  id: string;
  full_name: string;
  email: string | null;
  student_number: string | null;
  role: UserRole;
  class_id: string | null;
  is_active: boolean;
  created_at: string;
};

type ClassInfo = {
  id: string;
  class_code: string;
  class_name: string;
};

type RegistrationInfo = {
  user_id: string;
  requested_role: "mahasiswa" | "komting";
  class_id: string;
  status: "pending" | "approved" | "rejected";
  created_at: string;
};

type AccountStatus =
  | "active"
  | "inactive"
  | "pending"
  | "rejected";

type RoleFilter = "all" | UserRole;
type StatusFilter = "all" | AccountStatus;

const roleLabels: Record<UserRole, string> = {
  mahasiswa: "Mahasiswa",
  komting: "Komting",
  admin: "Admin",
};

const statusConfig: Record<
  AccountStatus,
  { label: string; color: string; dot: string }
> = {
  active: {
    label: "Aktif",
    color: "bg-emerald-50 text-emerald-700",
    dot: "bg-emerald-500",
  },
  inactive: {
    label: "Nonaktif",
    color: "bg-slate-100 text-slate-600",
    dot: "bg-slate-400",
  },
  pending: {
    label: "Menunggu Persetujuan",
    color: "bg-amber-50 text-amber-800",
    dot: "bg-amber-500",
  },
  rejected: {
    label: "Pendaftaran Ditolak",
    color: "bg-red-50 text-red-700",
    dot: "bg-red-500",
  },
};

function UsersIcon({
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
      <circle cx="9" cy="7" r="3" />
      <path d="M3 21v-2a6 6 0 0 1 12 0v2" />
      <path d="M16 4a3 3 0 0 1 0 6M21 21v-2a6 6 0 0 0-4-5.7" />
    </svg>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    dateStyle: "medium",
  }).format(new Date(value));
}

function initials(name: string) {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((word) => word.charAt(0))
      .join("")
      .toUpperCase() || "P"
  );
}

function accountStatus(
  profile: UserProfile,
  registration?: RegistrationInfo,
): AccountStatus {
  if (profile.is_active) return "active";

  if (registration?.status === "pending") {
    return "pending";
  }

  if (
    registration?.status === "rejected" &&
    !profile.class_id
  ) {
    return "rejected";
  }

  return "inactive";
}

function displayedRole(
  profile: UserProfile,
  registration?: RegistrationInfo,
): UserRole {
  if (
    !profile.is_active &&
    !profile.class_id &&
    registration &&
    registration.status !== "approved"
  ) {
    return registration.requested_role;
  }

  return profile.role;
}

export default function UserManagement() {
  const controllerRef = useRef<AbortController | null>(null);
  const mutationLock = useRef(false);

  const [users, setUsers] = useState<UserProfile[]>([]);
  const [classes, setClasses] = useState<ClassInfo[]>([]);
  const [registrations, setRegistrations] =
    useState<RegistrationInfo[]>([]);
  const [currentUserId, setCurrentUserId] = useState("");

  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] =
    useState<RoleFilter>("all");
  const [statusFilter, setStatusFilter] =
    useState<StatusFilter>("all");
  const [classFilter, setClassFilter] = useState("all");

  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [success, setSuccess] = useState("");

    const loadUsers = useCallback(() => {
    controllerRef.current?.abort();

    const controller = new AbortController();
    controllerRef.current = controller;

    const { signal } = controller;

    const fetchUsers = async () => {
      const supabase = createClient();

      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (signal.aborted) return;
      if (authError) throw authError;

      if (!user) {
        throw new Error("Sesi Admin tidak ditemukan.");
      }

      const [profileResult, registrationResult] =
        await Promise.all([
          supabase
            .from("profiles")
            .select(
              "id, full_name, email, student_number, role, class_id, is_active, created_at",
            )
            .order("created_at", { ascending: false }),

          supabase
            .from("registration_requests")
            .select(
              "user_id, requested_role, class_id, status, created_at",
            )
            .order("created_at", { ascending: false }),
        ]);

      if (signal.aborted) return;
      if (profileResult.error) throw profileResult.error;
      if (registrationResult.error) {
        throw registrationResult.error;
      }

      const profiles =
        (profileResult.data ?? []) as UserProfile[];

      const registrationRows =
        (registrationResult.data ?? []) as RegistrationInfo[];

      const classIds = [
        ...new Set(
          [
            ...profiles.map((item) => item.class_id),
            ...registrationRows.map((item) => item.class_id),
          ].filter((id): id is string => Boolean(id)),
        ),
      ];

      let classRows: ClassInfo[] = [];

      if (classIds.length > 0) {
        const { data, error: classError } = await supabase
          .from("classes")
          .select("id, class_code, class_name")
          .in("id", classIds)
          .order("class_code", { ascending: true });

        if (signal.aborted) return;
        if (classError) throw classError;

        classRows = (data ?? []) as ClassInfo[];
      }

      if (signal.aborted) return;

      return {
        currentUserId: user.id,
        users: profiles,
        registrations: registrationRows,
        classes: classRows,
      };
    };

    return fetchUsers()
      .then((result) => {
        if (signal.aborted || !result) return;

        setCurrentUserId(result.currentUserId);
        setUsers(result.users);
        setRegistrations(result.registrations);
        setClasses(result.classes);
        setLoadError("");
      })
      .catch((err: unknown) => {
        if (signal.aborted) return;

        console.error("Load Admin users:", err);

        setLoadError(
          getErrorMessage(err, "Gagal mengambil data pengguna."),
        );
      })
      .finally(() => {
        if (!signal.aborted) {
          setLoading(false);
        }
      });
  }, []);

  function refreshUsers() {
    setLoading(true);
    setLoadError("");

    return loadUsers();
  }

  useEffect(() => {
    void loadUsers();

    return () => {
      controllerRef.current?.abort();
    };
  }, [loadUsers]);

  const ready = !loading && !loadError;

  const registrationMap = useMemo(() => {
    const map = new Map<string, RegistrationInfo>();

    // Data diurutkan dari permohonan paling baru.
    for (const registration of registrations) {
      if (!map.has(registration.user_id)) {
        map.set(registration.user_id, registration);
      }
    }

    return map;
  }, [registrations]);

  const classMap = useMemo(
    () => new Map(classes.map((item) => [item.id, item])),
    [classes],
  );

  const userViews = useMemo(
    () =>
      users.map((profile) => {
        const registration = registrationMap.get(profile.id);
        const role = displayedRole(profile, registration);
        const status = accountStatus(profile, registration);
        const classId =
          profile.class_id ?? registration?.class_id ?? null;

        return {
          profile,
          registration,
          role,
          status,
          classId,
          assignedClass: classMap.get(classId ?? "") ?? null,
        };
      }),
    [users, registrationMap, classMap],
  );

  const filteredUsers = useMemo(() => {
    const keyword = search.trim().toLocaleLowerCase("id");

    return userViews.filter((item) => {
      const text = [
        item.profile.full_name,
        item.profile.email,
        item.profile.student_number,
        roleLabels[item.role],
        item.assignedClass?.class_code,
        item.assignedClass?.class_name,
      ]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase("id");

      return (
        (roleFilter === "all" || item.role === roleFilter) &&
        (statusFilter === "all" ||
          item.status === statusFilter) &&
        (classFilter === "all" ||
          item.classId === classFilter) &&
        (!keyword || text.includes(keyword))
      );
    });
  }, [
    userViews,
    search,
    roleFilter,
    statusFilter,
    classFilter,
  ]);

  function canManage(profile: UserProfile) {
    const registration = registrationMap.get(profile.id);
    const status = accountStatus(profile, registration);
    const role = displayedRole(profile, registration);

    if (profile.id === currentUserId) return false;
    if (status === "pending" || status === "rejected") {
      return false;
    }

    if (role !== "admin" && !profile.class_id) {
      return false;
    }

    return true;
  }

  async function toggleUserStatus(profile: UserProfile) {
    if (
      !ready ||
      mutationLock.current ||
      !canManage(profile)
    ) {
      return;
    }

    const nextActive = !profile.is_active;

    const confirmed = window.confirm(
      nextActive
        ? `Aktifkan akun ${profile.full_name}?`
        : `Nonaktifkan akun ${profile.full_name}?\n\nAkses fitur yang memerlukan akun aktif akan dibatasi. Data dan riwayat tetap disimpan.`,
    );

    if (!confirmed) return;

    mutationLock.current = true;
    setBusyId(profile.id);
    setActionError("");
    setSuccess("");

    try {
      const supabase = createClient();

      const { error } = await supabase.rpc(
        "admin_set_user_active",
        {
          p_user_id: profile.id,
          p_is_active: nextActive,
        },
      );

      if (error) throw error;

      setSuccess(
        `Akun ${profile.full_name} berhasil ${
          nextActive ? "diaktifkan" : "dinonaktifkan"
        }.`,
      );

      await refreshUsers();
    } catch (err) {
      console.error("Update user status:", err);

      setActionError(
        getErrorMessage(
          err,
          "Gagal mengubah status pengguna.",
        ),
      );
    } finally {
      mutationLock.current = false;
      setBusyId(null);
    }
  }

  function resetFilters() {
    setSearch("");
    setRoleFilter("all");
    setStatusFilter("all");
    setClassFilter("all");
  }

  const stats = [
    {
      label: "Total Akun",
      value: users.length,
      color: "bg-slate-100 text-primary",
    },
    {
      label: "Akun Aktif",
      value: userViews.filter(
        (item) => item.status === "active",
      ).length,
      color: "bg-emerald-50 text-emerald-700",
    },
    {
      label: "Akun Nonaktif",
      value: userViews.filter(
        (item) => item.status === "inactive",
      ).length,
      color: "bg-sky-50 text-sky-700",
    },
    {
      label: "Menunggu Persetujuan",
      value: userViews.filter(
        (item) => item.status === "pending",
      ).length,
      color: "bg-amber-50 text-amber-800",
    },
  ];

  return (
    <div className="space-y-7">
      <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted">
            Workspace / Administrasi Sistem
          </p>

          <h1 className="mt-2 font-heading text-2xl font-extrabold text-primary sm:text-3xl">
            Pengguna
          </h1>

          <p className="mt-2 text-sm leading-7 text-muted">
            Kelola informasi dan status akses Mahasiswa, Komting,
            serta Admin.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void refreshUsers()}
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
              Perubahan berhasil, tetapi daftar terbaru belum dapat
              dimuat. Tekan Muat Ulang.
            </p>
          )}
        </div>
      )}

      <section
        aria-label="Ringkasan pengguna"
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="rounded-3xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-200/20"
          >
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-xs font-semibold text-muted">
                {stat.label}
              </h2>

              <span className={`rounded-xl p-2 ${stat.color}`}>
                <UsersIcon className="h-4 w-4" />
              </span>
            </div>

            <p className="mt-4 font-heading text-4xl font-extrabold text-primary">
              {ready ? stat.value : "—"}
            </p>
          </div>
        ))}
      </section>

      <section className="space-y-5 rounded-3xl border border-slate-200/80 bg-white p-5 sm:p-6">
        <div>
          <label
            htmlFor="user-search"
            className="mb-3 block text-xs font-bold text-primary"
          >
            Cari pengguna
          </label>

          <input
            id="user-search"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Nama, NIM, email, atau kelas..."
            className="input-field min-h-11 rounded-xl"
          />
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <label
              htmlFor="user-role"
              className="mb-2 block text-xs font-semibold text-primary"
            >
              Peran
            </label>

            <select
              id="user-role"
              value={roleFilter}
              onChange={(event) =>
                setRoleFilter(event.target.value as RoleFilter)
              }
              className="input-field min-h-11 rounded-xl"
            >
              <option value="all">Semua Peran</option>
              <option value="mahasiswa">Mahasiswa</option>
              <option value="komting">Komting</option>
              <option value="admin">Admin</option>
            </select>
          </div>

          <div>
            <label
              htmlFor="user-status"
              className="mb-2 block text-xs font-semibold text-primary"
            >
              Status akun
            </label>

            <select
              id="user-status"
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(
                  event.target.value as StatusFilter,
                )
              }
              className="input-field min-h-11 rounded-xl"
            >
              <option value="all">Semua Status</option>
              <option value="active">Aktif</option>
              <option value="inactive">Nonaktif</option>
              <option value="pending">
                Menunggu Persetujuan
              </option>
              <option value="rejected">
                Pendaftaran Ditolak
              </option>
            </select>
          </div>

          <div>
            <label
              htmlFor="user-class"
              className="mb-2 block text-xs font-semibold text-primary"
            >
              Kelas
            </label>

            <select
              id="user-class"
              value={classFilter}
              onChange={(event) =>
                setClassFilter(event.target.value)
              }
              className="input-field min-h-11 rounded-xl"
            >
              <option value="all">Semua Kelas</option>

              {classes.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.class_code} - {item.class_name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
          <p className="text-xs text-muted">
            {ready
              ? `Menampilkan ${filteredUsers.length} dari ${users.length} akun`
              : "Memuat informasi pengguna"}
          </p>

          <button
            type="button"
            onClick={resetFilters}
            className="rounded-md text-xs font-bold text-primary hover:underline focus-visible:outline-2 focus-visible:outline-primary"
          >
            Reset Filter
          </button>
        </div>
      </section>

      <section className="space-y-5">
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="h-6 w-1 rounded-full bg-secondary"
          />

          <h2 className="font-heading text-lg font-extrabold text-primary">
            Daftar Pengguna
          </h2>
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
              Memuat data pengguna...
            </p>
          </div>
        ) : loadError ? (
          <p className="rounded-3xl border border-slate-200 bg-white p-10 text-center text-sm text-muted">
            Data belum dapat dimuat. Silakan tekan Muat Ulang.
          </p>
        ) : filteredUsers.length === 0 ? (
          <div className="rounded-3xl border border-slate-200 bg-white p-12 text-center">
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-primary">
              <UsersIcon className="h-7 w-7" />
            </span>

            <h3 className="mt-4 text-sm font-bold text-primary">
              Pengguna tidak ditemukan
            </h3>

            <p className="mt-2 text-xs leading-6 text-muted">
              Coba ubah kata kunci atau filter yang digunakan.
            </p>

            <button
              type="button"
              onClick={resetFilters}
              className="btn-outline mt-5 rounded-xl text-xs"
            >
              Reset Filter
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredUsers.map((item) => {
              const {
                profile,
                registration,
                role,
                status: accountState,
                assignedClass,
              } = item;

              const status = statusConfig[accountState];
              const manageable = canManage(profile);
              const isCurrentUser =
                profile.id === currentUserId;

              return (
                <article
                  key={profile.id}
                  className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-sm shadow-slate-200/20"
                >
                  <div className="flex flex-col justify-between gap-4 border-b border-slate-100 p-5 sm:flex-row sm:items-start sm:p-6">
                    <div className="flex min-w-0 items-start gap-3">
                      <span
                        aria-hidden="true"
                        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-xs font-bold text-primary"
                      >
                        {initials(profile.full_name)}
                      </span>

                      <div className="min-w-0">
                        <h3 className="break-words font-heading text-base font-extrabold text-primary">
                          {profile.full_name || "Pengguna"}
                        </h3>

                        <p className="mt-2 break-all text-xs leading-6 text-muted">
                          {profile.email ||
                            "Email tidak tersedia"}
                        </p>

                        {profile.student_number && (
                          <p className="mt-1 text-[11px] text-muted">
                            NIM: {profile.student_number}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex shrink-0 flex-wrap gap-2">
                      <span className="rounded-full border border-slate-200 px-3 py-1.5 text-[10px] font-semibold text-primary">
                        {roleLabels[role]}
                      </span>

                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[10px] font-semibold ${status.color}`}
                      >
                        <span
                          aria-hidden="true"
                          className={`h-1.5 w-1.5 rounded-full ${status.dot}`}
                        />
                        {status.label}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-5 p-5 sm:p-6">
                    <dl className="grid gap-5 sm:grid-cols-3">
                      <div>
                        <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted">
                          Kelas
                        </dt>

                        <dd className="mt-2 text-xs font-semibold leading-7 text-primary">
                          {assignedClass
                            ? `${assignedClass.class_code} · ${assignedClass.class_name}`
                            : role === "admin"
                              ? "Administrator"
                              : "Belum ditetapkan"}
                        </dd>
                      </div>

                      <div>
                        <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted">
                          Terdaftar Sejak
                        </dt>

                        <dd className="mt-2 text-xs font-semibold leading-7 text-primary">
                          {formatDate(profile.created_at)}
                        </dd>
                      </div>

                      <div>
                        <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted">
                          Pendaftaran Terakhir
                        </dt>

                        <dd className="mt-2 text-xs font-semibold leading-7 text-primary">
                          {!registration
                            ? "Tidak ada permohonan"
                            : registration.status === "approved"
                              ? "Disetujui"
                              : registration.status === "rejected"
                                ? "Ditolak"
                                : "Menunggu persetujuan"}
                        </dd>
                      </div>
                    </dl>

                    {accountState === "pending" && (
                      <div className="flex flex-col justify-between gap-3 rounded-2xl border border-amber-200 p-4 sm:flex-row sm:items-center">
                        <p className="text-xs leading-7 text-muted">
                          {registration?.requested_role ===
                          "komting"
                            ? "Pendaftaran Komting diproses melalui halaman Persetujuan Komting."
                            : "Pendaftaran mahasiswa menunggu persetujuan Komting kelas."}
                        </p>

                        {registration?.requested_role ===
                          "komting" && (
                          <Link
                            href="/dashboard/admin/registrations"
                            className="btn-outline shrink-0 rounded-xl text-xs"
                          >
                            Tinjau Pendaftaran →
                          </Link>
                        )}
                      </div>
                    )}

                    <div className="flex flex-col justify-between gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-center">
                      <p className="text-[11px] leading-6 text-muted">
                        {isCurrentUser
                          ? "Ini akun Admin yang sedang Anda gunakan."
                          : accountState === "pending" ||
                              accountState === "rejected"
                            ? "Gunakan alur persetujuan pendaftaran untuk akun ini."
                            : !manageable
                              ? "Kelas akun belum ditetapkan."
                              : "Perubahan status tidak menghapus profil dan riwayat."}
                      </p>

                      {manageable && (
                        <button
                          type="button"
                          onClick={() =>
                            void toggleUserStatus(profile)
                          }
                          disabled={
                            busyId !== null || loading
                          }
                          aria-label={`${
                            profile.is_active
                              ? "Nonaktifkan"
                              : "Aktifkan"
                          } akun ${profile.full_name}`}
                          className={`inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl border px-4 py-2 text-xs font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50 ${
                            profile.is_active
                              ? "border-red-200 text-red-700 hover:bg-red-50"
                              : "border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                          }`}
                        >
                          {busyId === profile.id
                            ? "Memproses..."
                            : profile.is_active
                              ? "Nonaktifkan Akun"
                              : "Aktifkan Akun"}
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-5">
        <h2 className="text-xs font-bold text-primary">
          Pengelolaan Akses Akun
        </h2>

        <p className="mt-2 text-xs leading-7 text-muted">
          Penonaktifan akun membatasi fitur yang memerlukan akun
          aktif. Profil dan riwayat tetap tersimpan. Perubahan peran
          dan penetapan kelas mengikuti alur persetujuan yang sudah
          tersedia.
        </p>
      </section>
    </div>
  );
}