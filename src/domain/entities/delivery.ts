export interface DeliveryZone {
  id: string;
  name: string;
  state: string | null;
  fee: number;
  // latitude/longitude intentionally omitted — deprecated, not used by new pricing engine
}

// A live quote from calculate_delivery_quote, previewed at Checkout before the order's real quote is
// frozen at placement. Always GPS-based: the customer's pin is mandatory.
export interface DeliveryQuote {
  fee: number;
  etaMinutes: number | null;
  source: 'dynamic_single' | 'dynamic_multi' | string;
  warehousesCount: number;
  distanceKm: number;
}
