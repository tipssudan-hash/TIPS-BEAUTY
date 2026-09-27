
## Database Updates for Features

### 1. Reviews Table
Run this SQL query in your Supabase SQL Editor to create the reviews system:

```sql
CREATE TABLE reviews (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  product_id uuid REFERENCES products(id) ON DELETE CASCADE,
  user_name text NOT NULL,
  rating integer CHECK (rating >= 1 AND rating <= 5),
  comment text,
  created_at timestamp with time zone DEFAULT now()
);

-- Enable RLS
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;

-- Allow anyone to read reviews
CREATE POLICY "Public reviews are viewable by everyone" ON reviews
  FOR SELECT USING (true);

-- Allow anyone to insert reviews (for now, or restrict to auth users)
CREATE POLICY "Anyone can insert reviews" ON reviews
  FOR INSERT WITH CHECK (true);
```

### 2. Update Products Table
Add a column to store average rating for easier sorting (optional, can be calculated dynamically):

```sql
ALTER TABLE products ADD COLUMN average_rating numeric DEFAULT 0;
ALTER TABLE products ADD COLUMN reviews_count integer DEFAULT 0;
```

### 3. Update Orders Table
Ensure the `payment_method` column supports text values (it should already be text).
