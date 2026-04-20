// HubSpot integration.
// Uses a Private App token (simplest path, no OAuth dance) by default.
// To switch to the OAuth flow, store tokens in the Integration table and
// refresh them via /oauth/v1/token.
//
// Docs:
//   https://developers.hubspot.com/docs/api/crm/deals
//   https://developers.hubspot.com/docs/api/crm/pipelines

import type { CRMDeal, CRMProvider } from "./types";

const HUBSPOT_API = "https://api.hubapi.com";

// Map pipeline stage label → normalized stage + default probability.
// Real deployments should fetch /crm/v3/pipelines/deals to get per-pipeline
// mapping; we keep the common defaults here.
const STAGE_MAP: Record<string, { stage: CRMDeal["stage"]; probability: number }> = {
  closedwon: { stage: "won", probability: 1 },
  closedlost: { stage: "lost", probability: 0 },
  appointmentscheduled: { stage: "open", probability: 0.2 },
  qualifiedtobuy: { stage: "open", probability: 0.4 },
  presentationscheduled: { stage: "open", probability: 0.6 },
  decisionmakerboughtin: { stage: "open", probability: 0.8 },
  contractsent: { stage: "open", probability: 0.9 },
};

export class HubSpotProvider implements CRMProvider {
  name = "hubspot" as const;

  constructor(private token: string) {}

  async fetchDeals(year: number): Promise<CRMDeal[]> {
    const after = new Date(Date.UTC(year, 0, 1)).getTime();
    const before = new Date(Date.UTC(year + 1, 0, 1)).getTime();

    const body = {
      filterGroups: [
        {
          filters: [
            { propertyName: "closedate", operator: "GTE", value: String(after) },
            { propertyName: "closedate", operator: "LT", value: String(before) },
          ],
        },
      ],
      properties: ["dealname", "amount", "dealstage", "closedate", "hs_deal_stage_probability", "hubspot_owner_id"],
      limit: 100,
    };

    const all: CRMDeal[] = [];
    let after_: string | undefined;
    for (;;) {
      const payload = after_ ? { ...body, after: after_ } : body;
      const res = await fetch(`${HUBSPOT_API}/crm/v3/objects/deals/search`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`HubSpot error ${res.status}: ${await res.text()}`);
      const json = (await res.json()) as {
        results: Array<{ id: string; properties: Record<string, string | null> }>;
        paging?: { next?: { after: string } };
      };

      for (const r of json.results) {
        const p = r.properties;
        const stageRaw = (p.dealstage || "").toLowerCase();
        const mapped = STAGE_MAP[stageRaw] ?? { stage: "open", probability: 0.3 };
        const probability =
          p.hs_deal_stage_probability != null
            ? Number(p.hs_deal_stage_probability)
            : mapped.probability;
        all.push({
          sourceId: r.id,
          name: p.dealname ?? "(unnamed)",
          amount: Number(p.amount ?? 0),
          currency: "EUR",
          stage: mapped.stage,
          probability,
          closeDate: p.closedate ? new Date(p.closedate) : new Date(),
          ownerExternalId: p.hubspot_owner_id ?? undefined,
        });
      }

      after_ = json.paging?.next?.after;
      if (!after_) break;
    }
    return all;
  }
}
