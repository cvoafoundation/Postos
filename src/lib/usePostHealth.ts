import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import { scoreHealthSnapshots, type HealthSnapshot } from "./healthSnapshot";
import type { PostHealthResult } from "./postHealth";
import { useAuth } from "@/context/AuthContext";
// One permission-checked, time-stamped snapshot per batch. Every level uses it.
export function usePostHealth(postIds: string[], version = 0) {
  const { profile } = useAuth();
  const idsKey = [...new Set(postIds)].sort().join(",");
  const [refreshTick, setRefreshTick] = useState(0);
  const scopeKey = JSON.stringify([
    idsKey,
    version,
    refreshTick,
    profile?.id,
    profile?.role,
    profile?.state,
    profile?.post_id,
  ]);
  const [resultKey, setResultKey] = useState("");
  useEffect(() => {
    const refresh = () => setRefreshTick((v) => v + 1);
    const visible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    window.addEventListener("focus", refresh);
    window.addEventListener("cvoa:people-changed", refresh);
    document.addEventListener("visibilitychange", visible);
    return () => {
      window.removeEventListener("focus", refresh);
      window.removeEventListener("cvoa:people-changed", refresh);
      document.removeEventListener("visibilitychange", visible);
    };
  }, []);
  const [scores, setScores] = useState<Record<string, PostHealthResult>>({}),
    [error, setError] = useState<string | null>(null),
    [loading, setLoading] = useState(false);
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
    const load = async () => {
      const snapshots: Record<string, HealthSnapshot> = {};
      for (let i = 0; i < ids.length; i += 500) {
        const chunk = ids.slice(i, i + 500);
        const r = await supabase.rpc("cvoa_post_health_evidence", {
          p_posts: chunk,
        });
        if (r.error) throw r.error;
        if (!r.data || chunk.some((id) => !r.data[id]?.post))
          throw new Error(
            "Company rating evidence is incomplete. Refresh to retry.",
          );
        Object.assign(snapshots, r.data);
      }
      return scoreHealthSnapshots(snapshots);
    };
    void load()
      .then((next) => {
        if (active) {
          setScores(next);
          setResultKey(scopeKey);
        }
      })
      .catch((e) => {
        if (active) {
          setError(e.message || "Health data could not be loaded.");
          setResultKey(scopeKey);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [scopeKey]);
  // Do not show a previous Company's/account's result during a scope transition.
  return {
    scores: resultKey === scopeKey ? scores : {},
    error: resultKey === scopeKey ? error : null,
    loading: !!idsKey && (resultKey !== scopeKey || loading),
    refresh: () => setRefreshTick((v) => v + 1),
  };
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
