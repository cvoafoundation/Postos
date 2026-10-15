// Bound to a verified profile and trusted membership payment records, never email searches.
export async function memberBillingCustomer(
  db: any,
  stripe: any,
  actor: string,
  email?: string,
  name?: string,
): Promise<string> {
  const mapping = await db.rpc("cvoa_billing_customer", { p_actor: actor });
  if (mapping.error) throw mapping.error;
  if (mapping.data) return mapping.data;
  const members = await db
    .from("members")
    .select("id,stripe_subscription_id")
    .eq("profile_id", actor)
    .is("deleted_at", null);
  if (members.error) throw members.error;
  let customer: string | undefined;
  for (const m of members.data ?? []) {
    if (m.stripe_subscription_id) {
      const subscription = await stripe.subscriptions.retrieve(
        m.stripe_subscription_id,
      );
      customer =
        typeof subscription.customer === "string"
          ? subscription.customer
          : subscription.customer?.id;
      if (subscription.metadata?.member_id !== m.id)
        throw new Error("Subscription ownership could not be verified.");
      if (customer) break;
    }
  }
  if (!customer && members.data?.length) {
    const payments = await db
      .from("membership_payments")
      .select("member_id,stripe_checkout_session_id,stripe_payment_intent_id")
      .in(
        "member_id",
        members.data.map((m: any) => m.id),
      )
      .eq("status", "paid")
      .order("created_at", { ascending: false })
      .limit(10);
    if (payments.error) throw payments.error;
    for (const p of payments.data ?? []) {
      if (p.stripe_checkout_session_id) {
        const session = await stripe.checkout.sessions.retrieve(
          p.stripe_checkout_session_id,
        );
        if (
          session.metadata?.member_id !== p.member_id ||
          session.payment_status !== "paid"
        )
          throw new Error("Payment ownership could not be verified.");
        customer =
          typeof session.customer === "string"
            ? session.customer
            : session.customer?.id;
      } else if (p.stripe_payment_intent_id) {
        const intent = await stripe.paymentIntents.retrieve(
          p.stripe_payment_intent_id,
        );
        if (intent.metadata?.member_id !== p.member_id) continue;
        customer =
          typeof intent.customer === "string"
            ? intent.customer
            : intent.customer?.id;
      }
      if (customer) break;
    }
  }
  if (!customer) {
    const created = await stripe.customers.create(
      { email, name, metadata: { cvoa_profile_id: actor } },
      { idempotencyKey: `cvoa-member-customer-${actor}` },
    );
    customer = created.id;
  }
  const stored = await db.rpc("cvoa_billing_customer", {
    p_actor: actor,
    p_customer: customer,
  });
  if (stored.error || !stored.data)
    throw stored.error ?? new Error("Could not link your billing account.");
  return stored.data;
}
