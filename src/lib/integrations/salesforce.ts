// Salesforce integration using the standard REST Opportunity object.
// Authentication: OAuth 2.0 web server flow — tokens stored in Integration.
// We query the SOQL API for closed & open opportunities in the fiscal year.
//
// Docs:
//   https://developer.salesforce.com/docs/atlas.en-us.api_rest.meta/api_rest/
//   https://developer.salesforce.com/docs/atlas.en-us.object_reference.meta/object_reference/sforce_api_objects_opportunity.htm

import type { CRMDeal, CRMProvider } from "./types";

interface SFOpportunity {
  Id: string;
  Name: string;
  Amount: number | null;
  CurrencyIsoCode?: string;
  StageName: string;
  Probability: number | null;
  CloseDate: string;
  IsWon: boolean;
  IsClosed: boolean;
  OwnerId: string;
}

export class SalesforceProvider implements CRMProvider {
  name = "salesforce" as const;

  constructor(
    private accessToken: string,
    private instanceUrl: string,
    private apiVersion = "v59.0",
  ) {}

  async fetchDeals(year: number): Promise<CRMDeal[]> {
    const from = `${year}-01-01`;
    const to = `${year + 1}-01-01`;
    const soql =
      `SELECT Id, Name, Amount, StageName, Probability, CloseDate, IsWon, IsClosed, OwnerId ` +
      `FROM Opportunity WHERE CloseDate >= ${from} AND CloseDate < ${to}`;

    const url = `${this.instanceUrl}/services/data/${this.apiVersion}/query?q=${encodeURIComponent(soql)}`;

    const all: CRMDeal[] = [];
    let next: string | null = url;
    while (next) {
      const res: Response = await fetch(next, {
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          Accept: "application/json",
        },
      });
      if (!res.ok) throw new Error(`Salesforce error ${res.status}: ${await res.text()}`);
      const json = (await res.json()) as {
        records: SFOpportunity[];
        done: boolean;
        nextRecordsUrl?: string;
      };
      for (const o of json.records) {
        let stage: CRMDeal["stage"] = "open";
        if (o.IsWon) stage = "won";
        else if (o.IsClosed) stage = "lost";

        all.push({
          sourceId: o.Id,
          name: o.Name,
          amount: o.Amount ?? 0,
          currency: o.CurrencyIsoCode ?? "EUR",
          stage,
          probability: o.Probability != null ? o.Probability / 100 : 0.3,
          closeDate: new Date(o.CloseDate),
          ownerExternalId: o.OwnerId,
        });
      }
      next = json.done ? null : `${this.instanceUrl}${json.nextRecordsUrl}`;
    }
    return all;
  }
}
