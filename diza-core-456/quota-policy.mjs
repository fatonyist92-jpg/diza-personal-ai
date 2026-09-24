const PERIOD_MS = {
  minute: 60_000,
  hour: 60 * 60_000,
  day: 24 * 60 * 60_000,
  week: 7 * 24 * 60 * 60_000,
  month: 30 * 24 * 60 * 60_000,
};

function pickLimit(limits, metric) {
  const rows = (limits || []).filter((x) => x.metric === metric);
  if (!rows.length) return null;
  return rows.sort((a, b) => PERIOD_MS[a.period] - PERIOD_MS[b.period])[0];
}

export function syncLedgerFromCatalog(catalog, ledger, { now = () => Date.now(), providers = [] } = {}) {
  const byId = new Map(providers.map((p) => [p.id, p]));
  const updated = [];

  for (const entry of catalog.list()) {
    const provider = byId.get(entry.id);
    const modelId = provider?.modelId || entry.defaultModel || "default";
    const intel = entry.intel;
    if (!intel) continue;

    const request = pickLimit(intel.limits, "requests");
    const token = pickLimit(intel.limits, "tokens");
    const chosen = request || token;
    const periodMs = chosen ? PERIOD_MS[chosen.period] || null : null;
    const current = ledger.get(entry.id, modelId);
    const patch = {
      paidAllowed: false,
      billingMode: "free_only",
      disabled: entry.enabled === false || entry.autoEligible === false,
    };

    if (request) patch.requestLimit = request.value;
    if (token) patch.tokenLimit = token.value;
    if (chosen) patch.quotaType = chosen.period;
    if (periodMs) {
      patch.periodMs = periodMs;
      if (!current.resetAt || Number(current.resetAt) <= now()) {
        patch.resetAt = now() + periodMs;
      }
    }

    ledger.upsert(entry.id, modelId, patch);
    updated.push({ providerId: entry.id, modelId, patch });
  }
  return updated;
}
