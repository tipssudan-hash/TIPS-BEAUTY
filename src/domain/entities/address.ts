// A saved delivery address of the customer. Locality is the delivery zone's name; coordinates are optional
// because a saved address may have been picked without GPS.
export interface CustomerAddress {
  id: string;
  label: string;
  recipientName: string;
  phone: string;
  state: string;
  city: string;
  addressLine: string;
  latitude: number | null;
  longitude: number | null;
  isDefault: boolean;
}
