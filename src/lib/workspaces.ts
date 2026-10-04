import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "./supabase";

export function useWorkspace<T>(
  name: string,
  args: Record<string, unknown> = {},
) {
  const { profile } = useAuth();
  const argsKey = JSON.stringify(args);
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);
  const refresh = useCallback(() => setVersion((v) => v + 1), []);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    setData(null);
    void (async () => {
      try {
        const result = await supabase.rpc(name, JSON.parse(argsKey));
        if (result.error) throw result.error;
        if (active) setData(result.data as T);
      } catch (e) {
        if (active)
          setError(
            e instanceof Error
              ? e.message
              : ((e as { message?: string }).message ??
                  "Could not load this workspace."),
          );
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [name, argsKey, version, profile?.id, profile?.role, profile?.state, profile?.post_id]);
  return { data, error, loading, refresh };
}

export function toCents(input: string): number {
  if (!/^\d{1,8}(\.\d{1,2})?$/.test(input.trim()))
    throw new Error("Enter a positive amount with at most two decimal places.");
  const [whole, fraction = ""] = input.trim().split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (cents <= 0) throw new Error("Amount must be greater than zero.");
  return cents;
}
export const dollars = (cents: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    cents / 100,
  );

export function membershipActions(member: {
  membership_type: string;
  membership_status: string;
  auto_renew: boolean;
  stripe_subscription_id?: string | null;
}) {
  const lifetime = member.membership_type === "lifetime";
  const pending = member.membership_status === "pending_payment";
  const subscription = member.auto_renew || !!member.stripe_subscription_id;
  return {
    renew: !lifetime && !subscription && !pending,
    upgrade: !lifetime && !subscription && !pending,
    completePayment: pending,
    cancelRenewal: !!member.stripe_subscription_id || (subscription && !pending),
    changePost: member.membership_status === "active",
  };
}
