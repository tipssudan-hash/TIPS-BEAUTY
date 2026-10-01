export interface DeliveryZone {
  id: string;
  name: string;
  state: string | null;
  fee: number;
}

// GPS-04: a live quote from calculate_delivery_quote, previewed at Checkout before the order's
// real quote is frozen at placement. eta_minutes is null whenever source isn't 'dynamic' — the
// flat fee carries no estimated window. The customer only ever sees fee + eta_minutes, never a
// distance/km figure or the source itself (that's an internal/admin concept).
export interface DeliveryQuote {
  fee: number;
  etaMinutes: number | null;
  source: 'dynamic' | 'flat_fee' | 'flat_fee_missing_coordinates' | 'flat_fee_missing_config';
}
