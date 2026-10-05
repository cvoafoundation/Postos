import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import { readAllRows } from "./readAllRows";
import {
  computePostHealth,
  type PostHealthResult,
  type PostHealthInputs,
} from "./postHealth";
import { useAuth } from "@/context/AuthContext";
import type { Post } from "./types";

// Batch by jurisdiction, rather than issuing a complete set of queries for every post.
export function usePostHealth(postIds: string[], version = 0) {
  const { profile } = useAuth();
  const idsKey = [...new Set(postIds)].sort().join(",");
  const [scores, setScores] = useState<Record<string, PostHealthResult>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    let active = true;
    setScores({});
    setError(null);
    const ids = idsKey.split(",").filter(Boolean);
    if (!ids.length) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const read = (table: string, columns = "*", postColumn = "post_id") =>
      readAllRows<any>(() =>
        supabase.from(table).select(columns).in(postColumn, ids).order("id"),
      );
    void Promise.all([
      supabase
        .rpc("cvoa_post_health_evidence", { p_posts: ids })
        .then(({ data, error }) => {
          if (error) throw error;
          return data as Record<
            string,
            NonNullable<PostHealthInputs["evidence"]>
          >;
        }),
      read("posts", "*", "id"),
      read("meeting_records", "id,post_id,meeting_date"),
      readAllRows<any>(() =>
        supabase
          .from("uro_meetings")
          .select("id,post_id,meeting_date")
          .in("post_id", ids)
          .eq("status", "published")
          .order("id"),
      ),
      readAllRows<any>(() =>
        supabase
          .from("uro_sessions")
          .select("id,started_at,uro_bodies!inner(post_id)")
          .in("uro_bodies.post_id", ids)
          .not("published_at", "is", null)
          .order("id"),
      ),
      read("members", "id,post_id,membership_status,joined_at"),
      read(
        "governance_signatures",
        "id,post_id,profile_id,signed_at,signer_name,form_type",
      ),
      read("annual_reviews"),
      read("community_service_events", "id,post_id,event_date"),
      read("financial_transactions", "id,post_id,transaction_type,amount"),
    ])
      .then(
        ([
          evidence,
          posts,
          legacyMinutes,
          publishedMinutes,
          governanceMinutes,
          members,
          signatures,
          reviews,
          service,
          transactions,
        ]) => {
          const indexes = new Map<any[], Map<string, any[]>>();
          const rowsFor = (rows: any[], id: string, key = "post_id") => {
            let index = indexes.get(rows);
            if (!index) {
              index = new Map();
              for (const row of rows) {
                const group = index.get(row[key]) ?? [];
                group.push(row);
                index.set(row[key], group);
              }
              indexes.set(rows, index);
            }
            return index.get(id) ?? [];
          };
          const minutes = [
            ...legacyMinutes,
            ...publishedMinutes,
            ...governanceMinutes.map((m) => ({
              post_id: m.uro_bodies.post_id,
              meeting_date: m.started_at?.slice(0, 10),
            })),
          ];
          const next: Record<string, PostHealthResult> = {};
          for (const post of posts as Post[]) {
            if (post.status !== "active_post") continue;
            next[post.id] = computePostHealth({
              post,
              evidence: evidence[post.id],
              foundingTeam: evidence[post.id]?.current_officers ?? [],
              sponsors: [],
              meetingDates: rowsFor(minutes, post.id).map(
                (m) => m.meeting_date,
              ),
              members: rowsFor(members, post.id),
              recruits: [],
              hasDelegate: evidence[post.id]?.has_delegate ?? false,
              delegateVotesCast: evidence[post.id]?.votes_cast ?? 0,
              governanceSignatures: rowsFor(signatures, post.id),
              annualReview:
                rowsFor(reviews, post.id).find(
                  (r) => r.review_year === new Date().getFullYear(),
                ) ?? null,
              communityServiceEvents: rowsFor(service, post.id),
              financialTransactions: rowsFor(transactions, post.id),
            });
          }
          if (active) setScores(next);
        },
      )
      .catch((e) => {
        if (active) setError(e.message ?? "Health data could not be loaded.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [
    idsKey,
    version,
    profile?.id,
    profile?.role,
    profile?.state,
    profile?.post_id,
  ]);
  return { scores, error, loading };
}

export function healthColor(status?: string) {
  return status === "green"
    ? "text-status-active border-status-active"
    : status === "yellow"
      ? "text-status-developing border-status-developing"
      : status === "red"
        ? "text-status-attention border-status-attention"
        : "text-muted border-hairline";
}
