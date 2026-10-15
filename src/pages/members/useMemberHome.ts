import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Member, Post, CongressDelegate } from "@/lib/types";
import type {
  Verification,
  ApplicationSummary,
  HomeSession,
} from "./memberHomeModel";
export interface MemberHomeData {
  events: { id: string; title: string; event_date: string }[];
  member: Member | null;
  posts: Post[];
  verification: Verification[];
  applications: ApplicationSummary[];
  delegates: CongressDelegate[];
  labels: { profiles: { id: string; full_name: string }[] };
  meetings: {
    bodies: { id: string; post_id: string | null }[];
    sessions: HomeSession[];
  };
}
const empty = (): MemberHomeData => ({
  events: [],
  member: null,
  posts: [],
  verification: [],
  applications: [],
  delegates: [],
  labels: { profiles: [] },
  meetings: { bodies: [], sessions: [] },
});
export function useMemberHome(profileId?: string) {
  const [data, setData] = useState<MemberHomeData>(empty),
    [errors, setErrors] = useState<Record<string, string>>({}),
    [loading, setLoading] = useState(true),
    [version, setVersion] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setData(empty());
    setErrors({});
    if (!profileId) {
      setLoading(false);
      return;
    }
    void (async () => {
      const membership = Promise.resolve(
        supabase
          .from("members")
          .select(
            "id,post_id,profile_id,full_name,membership_number,membership_type,membership_status,joined_at,expires_at,dd214_review_status,created_at",
          )
          .eq("profile_id", profileId)
          .is("deleted_at", null)
          .order("created_at", { ascending: false }),
      );
      const requests = {
        membership: () => membership,
        events: async () => {
          const result = await membership;
          if (result.error) return { data: [], error: result.error };
          const rows = (result.data ?? []) as Member[];
          const own =
            rows.find((r) => r.membership_status === "active") ?? rows[0];
          return own?.post_id
            ? await supabase
                .from("community_service_events")
                .select("id,title,event_date")
                .eq("post_id", own.post_id)
                .gte("event_date", new Date().toLocaleDateString("en-CA"))
                .order("event_date")
                .limit(3)
            : { data: [], error: null };
        },
        companies: () => supabase.rpc("cvoa_public_posts"),
        verification: () => supabase.rpc("cvoa_member_verification"),
        applications: () => supabase.rpc("cvoa_my_applications"),
        delegates: async () => {
          const result = await membership;
          if (result.error) return { data: [], error: result.error };
          const rows = (result.data ?? []) as Member[];
          const own =
            rows.find((r) => r.membership_status === "active") ?? rows[0];
          return own?.post_id
            ? await supabase
                .from("congress_delegates")
                .select(
                  "id,post_id,profile_id,is_alternate,term_start,term_end",
                )
                .eq("post_id", own.post_id)
            : { data: [], error: null };
        },
        labels: () => supabase.rpc("cvoa_congress_labels"),
        meetings: () => supabase.rpc("uro_directory"),
      };
      const keys = Object.keys(requests) as (keyof typeof requests)[];
      const results = await Promise.allSettled(
        keys.map((k) => Promise.resolve().then(() => requests[k]())),
      );
      if (!active) return;
      const loaded = empty(),
        issues: Record<string, string> = {};
      results.forEach((result, i) => {
        const key = keys[i];
        if (result.status === "rejected") {
          issues[key] =
            "Could not load this section. Use Refresh to try again.";
          return;
        }
        if (result.value.error) {
          issues[key] = result.value.error.message;
          return;
        }
        const value = result.value.data;
        if (key === "membership") {
          const rows = (value ?? []) as Member[];
          loaded.member =
            rows.find((r) => r.membership_status === "active") ??
            rows[0] ??
            null;
        } else if (key === "events") loaded.events = value ?? [];
        else if (key === "companies") loaded.posts = (value ?? []) as Post[];
        else if (key === "verification") loaded.verification = value ?? [];
        else if (key === "applications") loaded.applications = value ?? [];
        else if (key === "delegates")
          loaded.delegates = (value ?? []) as CongressDelegate[];
        else if (key === "labels") loaded.labels = value ?? { profiles: [] };
        else loaded.meetings = value ?? { bodies: [], sessions: [] };
      });
      setData(loaded);
      setErrors(issues);
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [profileId, version]);
  useEffect(() => {
    const refresh = () => setVersion((v) => v + 1);
    window.addEventListener("focus", refresh);
    window.addEventListener("cvoa:people-changed", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      window.removeEventListener("cvoa:people-changed", refresh);
    };
  }, []);
  return { data, errors, loading, refresh: () => setVersion((v) => v + 1) };
}
