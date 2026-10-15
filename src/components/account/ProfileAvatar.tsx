import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";
export default function ProfileAvatar({
  className = "h-10 w-10",
}: {
  className?: string;
}) {
  const { profile } = useAuth(),
    [signed, setSigned] = useState<{ path: string; url: string } | null>(null);
  const path = profile?.avatar_path;
  useEffect(() => {
    let alive = true;
    setSigned(null);
    if (path && profile?.id && path.startsWith(profile.id + "/"))
      void supabase.storage
        .from("profile-photos")
        .createSignedUrl(path, 3600)
        .then(({ data, error }) => {
          if (alive && !error && data) setSigned({ path, url: data.signedUrl });
        })
        .catch(() => {});
    return () => {
      alive = false;
    };
  }, [path, profile?.id]);
  const initials =
    profile?.full_name
      ?.split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((s) => s[0])
      .join("") || "CV";
  return signed && signed.path === path ? (
    <img
      src={signed.url}
      alt="Your profile photo"
      className={`${className} rounded-full object-cover shrink-0`}
      onError={() => setSigned(null)}
    />
  ) : (
    <span
      aria-label="Profile initials"
      className={`${className} rounded-full bg-gold/10 border border-gold/30 flex items-center justify-center text-gold font-display shrink-0`}
    >
      {initials}
    </span>
  );
}
