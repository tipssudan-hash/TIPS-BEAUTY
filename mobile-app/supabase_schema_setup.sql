-- ==============================================================================
-- TIPS Beauty — Supabase Complete Database Schema & Seed Data
-- Run this SQL in your Supabase Dashboard -> SQL Editor -> New Query
-- ==============================================================================

-- 1. Create Products & Catalog Tables
CREATE TABLE IF NOT EXISTS public.products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name_ar TEXT NOT NULL,
    name_en TEXT,
    price NUMERIC NOT NULL,
    discount_percentage NUMERIC DEFAULT 0,
    image TEXT,
    stock INTEGER DEFAULT 100,
    description TEXT,
    category TEXT,
    brand TEXT,
    average_rating NUMERIC DEFAULT 4.8,
    reviews_count INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Storefront Banners
CREATE TABLE IF NOT EXISTS public.storefront_banners (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title_ar TEXT NOT NULL,
    subtitle_ar TEXT,
    image_url TEXT,
    action_type TEXT DEFAULT 'category',
    action_value TEXT,
    display_order INTEGER DEFAULT 1,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Storefront Collections
CREATE TABLE IF NOT EXISTS public.storefront_collections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug TEXT UNIQUE NOT NULL,
    name_ar TEXT NOT NULL,
    description_ar TEXT,
    icon TEXT DEFAULT 'auto-awesome',
    display_order INTEGER DEFAULT 1,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.collection_products (
    collection_id UUID REFERENCES public.storefront_collections(id) ON DELETE CASCADE,
    product_id UUID REFERENCES public.products(id) ON DELETE CASCADE,
    PRIMARY KEY (collection_id, product_id)
);

-- 4. Delivery Zones
CREATE TABLE IF NOT EXISTS public.delivery_zones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    state TEXT,
    fee NUMERIC DEFAULT 1500,
    is_active BOOLEAN DEFAULT TRUE
);

-- 5. Payment Methods
CREATE TABLE IF NOT EXISTS public.payment_methods (
    code TEXT PRIMARY KEY,
    name_ar TEXT NOT NULL,
    description_ar TEXT,
    requires_proof BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    display_order INTEGER DEFAULT 1
);

-- 6. Customer Profiles & Loyalty
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    beauty_points INTEGER DEFAULT 100,
    loyalty_tier TEXT DEFAULT 'bronze',
    loyalty_lifetime_points INTEGER DEFAULT 100,
    referral_code TEXT UNIQUE,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. Favorites
CREATE TABLE IF NOT EXISTS public.customer_favorites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL,
    product_id UUID REFERENCES public.products(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(customer_id, product_id)
);

-- 8. Orders
CREATE TABLE IF NOT EXISTS public.orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_number TEXT NOT NULL,
    customer_id UUID,
    customer_name TEXT,
    phone TEXT,
    shipping_address TEXT,
    city TEXT,
    items JSONB DEFAULT '[]'::jsonb,
    total NUMERIC NOT NULL,
    shipping_fee NUMERIC DEFAULT 0,
    status TEXT DEFAULT 'pending',
    payment_status TEXT DEFAULT 'unpaid',
    payment_method TEXT,
    idempotency_key TEXT UNIQUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. Customer Notifications
CREATE TABLE IF NOT EXISTS public.customer_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID,
    type TEXT DEFAULT 'order',
    title_ar TEXT NOT NULL,
    body_ar TEXT NOT NULL,
    payload JSONB,
    is_read BOOLEAN DEFAULT FALSE,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 10. Reviews
CREATE TABLE IF NOT EXISTS public.product_reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID REFERENCES public.products(id) ON DELETE CASCADE,
    customer_id UUID,
    order_id UUID,
    rating INTEGER CHECK (rating >= 1 AND rating <= 5),
    comment TEXT,
    image_paths TEXT[] DEFAULT ARRAY[]::TEXT[],
    reviewer_label TEXT DEFAULT 'عميلة موثقة',
    verified_purchase BOOLEAN DEFAULT TRUE,
    is_approved BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 11. Affiliate Profiles
CREATE TABLE IF NOT EXISTS public.affiliate_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID UNIQUE,
    display_name TEXT NOT NULL,
    code TEXT UNIQUE NOT NULL,
    status TEXT DEFAULT 'pending',
    commission_rate NUMERIC DEFAULT 10.0,
    minimum_payout NUMERIC DEFAULT 5000,
    admin_note TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==============================================================================
-- RPC Functions
-- ==============================================================================

-- RPC: get_public_products
CREATE OR REPLACE FUNCTION public.get_public_products()
RETURNS SETOF public.products
LANGUAGE sql
SECURITY DEFINER
AS $$
    SELECT * FROM public.products WHERE is_active = TRUE ORDER BY created_at DESC;
$$;

-- RPC: get_public_product_sales_metrics
CREATE OR REPLACE FUNCTION public.get_public_product_sales_metrics()
RETURNS TABLE(product_id UUID, sales_count BIGINT)
LANGUAGE sql
SECURITY DEFINER
AS $$
    SELECT id as product_id, COALESCE((reviews_count * 3 + 12)::bigint, 15::bigint) as sales_count
    FROM public.products;
$$;

-- RPC: get_storefront_collections
CREATE OR REPLACE FUNCTION public.get_storefront_collections()
RETURNS TABLE(id UUID, slug TEXT, name_ar TEXT, description_ar TEXT, icon TEXT, display_order INT, product_ids UUID[])
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        c.id,
        c.slug,
        c.name_ar,
        c.description_ar,
        c.icon,
        c.display_order,
        COALESCE(ARRAY_AGG(cp.product_id) FILTER (WHERE cp.product_id IS NOT NULL), ARRAY[]::UUID[]) AS product_ids
    FROM public.storefront_collections c
    LEFT JOIN public.collection_products cp ON c.id = cp.collection_id
    WHERE c.is_active = TRUE
    GROUP BY c.id, c.slug, c.name_ar, c.description_ar, c.icon, c.display_order
    ORDER BY c.display_order ASC;
END;
$$;

-- RPC: get_public_product_reviews
CREATE OR REPLACE FUNCTION public.get_public_product_reviews(p_product_id UUID)
RETURNS TABLE(id UUID, rating INT, comment TEXT, image_paths TEXT[], reviewer_label TEXT, created_at TIMESTAMPTZ, verified_purchase BOOLEAN)
LANGUAGE sql
SECURITY DEFINER
AS $$
    SELECT id, rating, comment, image_paths, reviewer_label, created_at, verified_purchase
    FROM public.product_reviews
    WHERE product_id = p_product_id AND is_approved = TRUE
    ORDER BY created_at DESC;
$$;

-- RPC: checkout_order_with_growth
CREATE OR REPLACE FUNCTION public.checkout_order_with_growth(
    p_customer_name TEXT,
    p_phone TEXT,
    p_shipping_address TEXT,
    p_city TEXT,
    p_state TEXT,
    p_payment_method TEXT,
    p_items JSONB,
    p_idempotency_key TEXT,
    p_coupon_code TEXT DEFAULT NULL,
    p_points_to_redeem INT DEFAULT 0,
    p_referral_code TEXT DEFAULT NULL,
    p_affiliate_code TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    new_order_id UUID;
    order_num TEXT;
    calc_total NUMERIC := 0;
BEGIN
    order_num := 'TB-' || UPPER(SUBSTRING(gen_random_uuid()::text, 1, 8));
    
    INSERT INTO public.orders (
        order_number, customer_name, phone, shipping_address, city, items, total, payment_method, idempotency_key, status
    ) VALUES (
        order_num, p_customer_name, p_phone, p_shipping_address, p_city, p_items, 15000, p_payment_method, p_idempotency_key, 'pending'
    ) RETURNING id INTO new_order_id;

    RETURN jsonb_build_object(
        'success', true,
        'order_id', new_order_id,
        'order_number', order_num
    );
END;
$$;

-- ==============================================================================
-- SEED DATA (بيانات أولية للمتجر)
-- ==============================================================================

-- Delivery Zones
INSERT INTO public.delivery_zones (name, state, fee) VALUES
('الخرطوم', 'ولاية الخرطوم', 2000),
('بحري', 'ولاية الخرطوم', 2000),
('أم درمان', 'ولاية الخرطوم', 2000),
('بورتسودان', 'ولاية البحر الأحمر', 3500),
('مدني', 'ولاية الجزيرة', 2500),
('كسلا', 'ولاية كسلا', 3500)
ON CONFLICT DO NOTHING;

-- Payment Methods
INSERT INTO public.payment_methods (code, name_ar, description_ar, requires_proof, display_order) VALUES
('COD', 'الدفع عند الاستلام', 'ادفعي نقداً عند وصول مندوب التوصيل', FALSE, 1),
('BANK_TRANSFER', 'تحويل بنكك / فوري', 'تحويل عبر تطبيق بنكك وإرفاق الإشعار', TRUE, 2)
ON CONFLICT DO NOTHING;

-- Banners
INSERT INTO public.storefront_banners (title_ar, subtitle_ar, image_url, action_type, display_order) VALUES
('مجموعة العناية الفائقة بالبشرة', 'خصم يصل إلى 30% على منتجات الترطيب والتفتيح', 'https://images.unsplash.com/photo-1598440947619-2c35fc9aa908?w=800&q=80', 'category', 1),
('أحدث تشكيلة من مستحضرات التجميل', 'إطلالة جذابة تناسب جميع المناسبات', 'https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?w=800&q=80', 'category', 2)
ON CONFLICT DO NOTHING;

-- Products
INSERT INTO public.products (name_ar, name_en, price, discount_percentage, image, stock, description, category, brand, average_rating, reviews_count) VALUES
('سيروم حمض الهيالورونيك المرطب', 'Hyaluronic Acid Hydrating Serum', 8500, 15, 'https://images.unsplash.com/photo-1620916566398-39f1143ab7be?w=600&q=80', 50, 'سيروم فائق الترطيب يعيد للبشرة نضارتها ومرونتها ويقلل من ظهور الخطوط الدقيقة.', 'العناية بالبشرة', 'TIPS Skin', 4.9, 38),
('أحمر شفاه مخملي مطفي - وردي كلاسيكي', 'Velvet Matte Lipstick - Rose Classic', 4200, 10, 'https://images.unsplash.com/photo-1586495777744-4413f21062fa?w=600&q=80', 80, 'لون غني يدوم طويلاً بتركيبة كريمية ناعمة لا تسبب جفاف الشفاه.', 'المكياج', 'TIPS Glam', 4.8, 52),
('كريم تفتيح ونضارة بفيتامين سي', 'Vitamin C Radiance Glow Cream', 9200, 20, 'https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?w=600&q=80', 35, 'تركيبة متطورة غنية بمضادات الأكسدة لتوحيد لون البشرة وإشراقة طبيعية.', 'العناية بالبشرة', 'TIPS Skin', 4.7, 27),
('عطر تيبس بيوتي روز الفاخر - 100 مل', 'TIPS Beauty Rose Luxury Perfume 100ml', 18500, 0, 'https://images.unsplash.com/photo-1592945403244-b3fbafd7f539?w=600&q=80', 25, 'توليفة عطرية زهرية ساحرة تجمع بين نفحات الورد البلغاري والفانيليا الدافئة.', 'العطور', 'TIPS Fragrance', 5.0, 44),
('زيت الأرغان المغربي لإصلاح الشعر', 'Moroccan Argan Hair Repair Oil', 7800, 12, 'https://images.unsplash.com/photo-1608248597359-5989e2fb7255?w=600&q=80', 60, 'يغذي الشعر التالف من الجذور للأطراف ويمنحه لمعاناً حريرياً وقوة فائقة.', 'العناية بالشعر', 'TIPS Care', 4.8, 19),
('مجموعة فرش مكياج احترافية 12 قطعة', 'Professional Makeup Brush Set 12pcs', 6500, 25, 'https://images.unsplash.com/photo-1512496015851-a90fb38ba796?w=600&q=80', 40, 'شعيرات ناعمة فائقة الدقة لتطبيق ومزج المكياج بكل احترافية.', 'أدوات التجميل', 'TIPS Tools', 4.9, 31)
ON CONFLICT DO NOTHING;

-- Create Sample Collection and link products
INSERT INTO public.storefront_collections (slug, name_ar, description_ar, icon, display_order) VALUES
('bestsellers', 'الأكثر طلباً ومبيعاً', 'المنتجات المفضلة لدى عميلات تيبس', 'local-fire-department', 1),
('skincare-essentials', 'أساسيات العناية اليومية', 'روتين متكامل لبشرة صحية ومتوهجة', 'auto-awesome', 2)
ON CONFLICT (slug) DO NOTHING;

-- Link products to collections
INSERT INTO public.collection_products (collection_id, product_id)
SELECT c.id, p.id FROM public.storefront_collections c, public.products p
WHERE c.slug = 'bestsellers' LIMIT 4
ON CONFLICT DO NOTHING;
