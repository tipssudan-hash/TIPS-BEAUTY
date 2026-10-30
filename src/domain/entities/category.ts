// A storefront category. The backend allows two levels: a top-level category (parentId null) may have children.
// productCount is the number of active Products in the category and its children.
export interface Category {
  id: string;
  parentId: string | null;
  name_ar: string;
  name_en: string | null;
  slug: string | null;
  imageUrl: string | null;
  icon: string | null;
  sortOrder: number;
  productCount: number;
}
