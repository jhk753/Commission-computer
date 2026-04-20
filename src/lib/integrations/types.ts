export interface CRMDeal {
  sourceId: string;
  name: string;
  amount: number;
  currency: string;
  stage: "won" | "open" | "lost";
  probability: number;  // 0..1
  closeDate: Date;
  ownerExternalId?: string;
  product?: string;
}

export interface CRMProvider {
  name: "hubspot" | "salesforce";
  /** Fetch deals for a fiscal year. Returns normalized CRMDeal[]. */
  fetchDeals(year: number): Promise<CRMDeal[]>;
}
