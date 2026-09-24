// A staff-managed home-page banner; the backend policy already hides inactive and out-of-schedule rows.
export type BannerActionType = 'none' | 'category' | 'product' | 'collection' | 'url';

export interface Banner {
  id: string;
  title_ar: string;
  subtitle_ar: string | null;
  imageUrl: string;
  actionType: BannerActionType;
  actionValue: string | null;
}
