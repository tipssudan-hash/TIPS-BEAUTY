export interface PaymentMethod {
  code: string;
  nameAr: string;
  descriptionAr: string | null;
  requiresProof: boolean;
  accountDetails: Record<string, string>;
}
