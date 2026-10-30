export interface Brand {
  id: string;
  name_ar: string;
  name_en: string | null;
  slug: string | null;
  logoUrl: string | null;
  sortOrder: number;
  productCount: number;
}
