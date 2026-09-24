export interface Collection {
  id: string;
  slug: string;
  name_ar: string;
  description_ar: string | null;
  icon: string;
  displayOrder: number;
  productIds: string[];
}
