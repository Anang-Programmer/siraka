import { createClient } from "@/lib/supabase/server";

export type AppRole = "admin" | "komting" | "mahasiswa";

export type UserProfile = {
  id: string;
  full_name: string;
  email: string | null;
  role: AppRole;
  class_id: string | null;
  is_active: boolean;
};

export async function getCurrentProfile() {
  const supabase = await createClient();

  const {
    data: claimsData,
    error: claimsError,
  } = await supabase.auth.getClaims();

  const userId = claimsData?.claims?.sub;

  if (claimsError || typeof userId !== "string") {
    return null;
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, email, role, class_id, is_active")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    console.error("Load current profile:", error);
    throw new Error("Gagal memuat profil pengguna. Silakan coba lagi.");
  }

  if (!data || !data.is_active) {
    return null;
  }

  const validRoles: AppRole[] = [
    "admin",
    "komting",
    "mahasiswa",
  ];

  if (!validRoles.includes(data.role as AppRole)) {
    return null;
  }

  return {
    supabase,
    profile: data as UserProfile,
  };
}