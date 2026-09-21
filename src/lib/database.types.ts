export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      affiliate_commissions: {
        Row: {
          affiliate_id: string
          approved_at: string | null
          approved_by: string | null
          commission_amount: number
          commission_rate: number
          created_at: string
          customer_id: string
          id: string
          order_id: string
          paid_at: string | null
          status: string
        }
        Insert: {
          affiliate_id: string
          approved_at?: string | null
          approved_by?: string | null
          commission_amount: number
          commission_rate: number
          created_at?: string
          customer_id: string
          id?: string
          order_id: string
          paid_at?: string | null
          status?: string
        }
        Update: {
          affiliate_id?: string
          approved_at?: string | null
          approved_by?: string | null
          commission_amount?: number
          commission_rate?: number
          created_at?: string
          customer_id?: string
          id?: string
          order_id?: string
          paid_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "affiliate_commissions_affiliate_id_fkey"
            columns: ["affiliate_id"]
            isOneToOne: false
            referencedRelation: "affiliate_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "affiliate_commissions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      affiliate_profiles: {
        Row: {
          admin_note: string | null
          approved_at: string | null
          approved_by: string | null
          code: string
          commission_rate: number
          created_at: string
          customer_id: string
          display_name: string
          id: string
          minimum_payout: number
          payout_details: string | null
          payout_method: string | null
          status: string
          updated_at: string
        }
        Insert: {
          admin_note?: string | null
          approved_at?: string | null
          approved_by?: string | null
          code: string
          commission_rate?: number
          created_at?: string
          customer_id: string
          display_name: string
          id?: string
          minimum_payout?: number
          payout_details?: string | null
          payout_method?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          admin_note?: string | null
          approved_at?: string | null
          approved_by?: string | null
          code?: string
          commission_rate?: number
          created_at?: string
          customer_id?: string
          display_name?: string
          id?: string
          minimum_payout?: number
          payout_details?: string | null
          payout_method?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      ai_request_limits: {
        Row: {
          created_at: string
          customer_id: string
          id: string
        }
        Insert: {
          created_at?: string
          customer_id: string
          id?: string
        }
        Update: {
          created_at?: string
          customer_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_request_limits_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      app_settings: {
        Row: {
          id: boolean
          notification_emails: string[]
          updated_at: string
        }
        Insert: {
          id?: boolean
          notification_emails?: string[]
          updated_at?: string
        }
        Update: {
          id?: boolean
          notification_emails?: string[]
          updated_at?: string
        }
        Relationships: []
      }
      checkout_idempotency: {
        Row: {
          created_at: string
          customer_id: string
          idempotency_key: string
          order_id: string | null
        }
        Insert: {
          created_at?: string
          customer_id: string
          idempotency_key: string
          order_id?: string | null
        }
        Update: {
          created_at?: string
          customer_id?: string
          idempotency_key?: string
          order_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "checkout_idempotency_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkout_idempotency_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      coupon_redemptions: {
        Row: {
          coupon_id: string
          customer_id: string
          discount_amount: number
          id: string
          order_id: string
          redeemed_at: string
        }
        Insert: {
          coupon_id: string
          customer_id: string
          discount_amount: number
          id?: string
          order_id: string
          redeemed_at?: string
        }
        Update: {
          coupon_id?: string
          customer_id?: string
          discount_amount?: number
          id?: string
          order_id?: string
          redeemed_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "coupon_redemptions_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "coupons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupon_redemptions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      coupons: {
        Row: {
          code: string
          created_at: string
          description: string | null
          discount_type: string
          discount_value: number
          ends_at: string | null
          id: string
          is_active: boolean
          max_discount_amount: number | null
          min_order_amount: number
          name: string
          per_user_limit: number
          starts_at: string
          usage_count: number
          usage_limit: number | null
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          discount_type: string
          discount_value: number
          ends_at?: string | null
          id?: string
          is_active?: boolean
          max_discount_amount?: number | null
          min_order_amount?: number
          name: string
          per_user_limit?: number
          starts_at?: string
          usage_count?: number
          usage_limit?: number | null
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          discount_type?: string
          discount_value?: number
          ends_at?: string | null
          id?: string
          is_active?: boolean
          max_discount_amount?: number | null
          min_order_amount?: number
          name?: string
          per_user_limit?: number
          starts_at?: string
          usage_count?: number
          usage_limit?: number | null
        }
        Relationships: []
      }
      customer_favorites: {
        Row: {
          created_at: string
          customer_id: string
          product_id: string
        }
        Insert: {
          created_at?: string
          customer_id: string
          product_id: string
        }
        Update: {
          created_at?: string
          customer_id?: string
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_favorites_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_notifications: {
        Row: {
          body_ar: string
          created_at: string
          customer_id: string
          id: string
          is_read: boolean
          order_id: string | null
          payload: Json
          product_id: string | null
          read_at: string | null
          title_ar: string
          type: string
        }
        Insert: {
          body_ar: string
          created_at?: string
          customer_id: string
          id?: string
          is_read?: boolean
          order_id?: string | null
          payload?: Json
          product_id?: string | null
          read_at?: string | null
          title_ar: string
          type: string
        }
        Update: {
          body_ar?: string
          created_at?: string
          customer_id?: string
          id?: string
          is_read?: boolean
          order_id?: string | null
          payload?: Json
          product_id?: string | null
          read_at?: string | null
          title_ar?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_notifications_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_notifications_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_push_tokens: {
        Row: {
          created_at: string
          customer_id: string
          device_name: string | null
          expo_push_token: string
          id: string
          invalidated_at: string | null
          is_active: boolean
          last_registered_at: string
          platform: string
        }
        Insert: {
          created_at?: string
          customer_id: string
          device_name?: string | null
          expo_push_token: string
          id?: string
          invalidated_at?: string | null
          is_active?: boolean
          last_registered_at?: string
          platform: string
        }
        Update: {
          created_at?: string
          customer_id?: string
          device_name?: string | null
          expo_push_token?: string
          id?: string
          invalidated_at?: string | null
          is_active?: boolean
          last_registered_at?: string
          platform?: string
        }
        Relationships: []
      }
      delivery_zones: {
        Row: {
          created_at: string
          fee: number
          id: string
          is_active: boolean
          name: string
          state: string | null
          warehouse_id: string | null
        }
        Insert: {
          created_at?: string
          fee?: number
          id?: string
          is_active?: boolean
          name: string
          state?: string | null
          warehouse_id?: string | null
        }
        Update: {
          created_at?: string
          fee?: number
          id?: string
          is_active?: boolean
          name?: string
          state?: string | null
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "delivery_zones_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      driver_last_locations: {
        Row: {
          accuracy_meters: number | null
          driver_id: string
          latitude: number
          longitude: number
          updated_at: string
        }
        Insert: {
          accuracy_meters?: number | null
          driver_id: string
          latitude: number
          longitude: number
          updated_at?: string
        }
        Update: {
          accuracy_meters?: number | null
          driver_id?: string
          latitude?: number
          longitude?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "driver_last_locations_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: true
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
        ]
      }
      drivers: {
        Row: {
          company: string | null
          created_at: string
          id: string
          name: string
          phone: string
          status: string
          updated_at: string
          user_id: string | null
          vehicle: string | null
          warehouse_id: string | null
        }
        Insert: {
          company?: string | null
          created_at?: string
          id?: string
          name: string
          phone: string
          status?: string
          updated_at?: string
          user_id?: string | null
          vehicle?: string | null
          warehouse_id?: string | null
        }
        Update: {
          company?: string | null
          created_at?: string
          id?: string
          name?: string
          phone?: string
          status?: string
          updated_at?: string
          user_id?: string | null
          vehicle?: string | null
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "drivers_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_movements: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          movement_type: string
          note: string | null
          product_id: string
          quantity_delta: number
          reference_id: string | null
          warehouse_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          movement_type: string
          note?: string | null
          product_id: string
          quantity_delta: number
          reference_id?: string | null
          warehouse_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          movement_type?: string
          note?: string | null
          product_id?: string
          quantity_delta?: number
          reference_id?: string | null
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      loyalty_ledger: {
        Row: {
          created_at: string
          created_by: string | null
          customer_id: string
          event_type: string
          id: string
          note: string | null
          order_id: string | null
          points_delta: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          customer_id: string
          event_type: string
          id?: string
          note?: string | null
          order_id?: string | null
          points_delta: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          customer_id?: string
          event_type?: string
          id?: string
          note?: string | null
          order_id?: string | null
          points_delta?: number
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_ledger_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      loyalty_settings: {
        Row: {
          currency_per_point: number
          id: boolean
          minimum_redemption_points: number
          points_per_1000: number
          updated_at: string
        }
        Insert: {
          currency_per_point?: number
          id?: boolean
          minimum_redemption_points?: number
          points_per_1000?: number
          updated_at?: string
        }
        Update: {
          currency_per_point?: number
          id?: boolean
          minimum_redemption_points?: number
          points_per_1000?: number
          updated_at?: string
        }
        Relationships: []
      }
      loyalty_tiers: {
        Row: {
          benefits_ar: string | null
          display_order: number
          id: string
          is_active: boolean
          minimum_lifetime_points: number
          name_ar: string
          points_multiplier: number
        }
        Insert: {
          benefits_ar?: string | null
          display_order: number
          id: string
          is_active?: boolean
          minimum_lifetime_points: number
          name_ar: string
          points_multiplier?: number
        }
        Update: {
          benefits_ar?: string | null
          display_order?: number
          id?: string
          is_active?: boolean
          minimum_lifetime_points?: number
          name_ar?: string
          points_multiplier?: number
        }
        Relationships: []
      }
      notification_queue: {
        Row: {
          attempts: number
          channel: string
          created_at: string
          customer_id: string | null
          error_message: string | null
          event_type: string
          id: string
          message: string
          order_id: string | null
          payload: Json
          provider_reference: string | null
          recipient_phone: string | null
          sent_at: string | null
          status: string
        }
        Insert: {
          attempts?: number
          channel?: string
          created_at?: string
          customer_id?: string | null
          error_message?: string | null
          event_type: string
          id?: string
          message: string
          order_id?: string | null
          payload?: Json
          provider_reference?: string | null
          recipient_phone?: string | null
          sent_at?: string | null
          status?: string
        }
        Update: {
          attempts?: number
          channel?: string
          created_at?: string
          customer_id?: string | null
          error_message?: string | null
          event_type?: string
          id?: string
          message?: string
          order_id?: string | null
          payload?: Json
          provider_reference?: string | null
          recipient_phone?: string | null
          sent_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_queue_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_returns: {
        Row: {
          admin_note: string | null
          created_at: string
          customer_id: string
          customer_note: string | null
          id: string
          items: Json
          order_id: string
          reason: string
          requested_resolution: string
          restocked_at: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          updated_at: string
        }
        Insert: {
          admin_note?: string | null
          created_at?: string
          customer_id: string
          customer_note?: string | null
          id?: string
          items?: Json
          order_id: string
          reason: string
          requested_resolution: string
          restocked_at?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          admin_note?: string | null
          created_at?: string
          customer_id?: string
          customer_note?: string | null
          id?: string
          items?: Json
          order_id?: string
          reason?: string
          requested_resolution?: string
          restocked_at?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_returns_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_status_history: {
        Row: {
          changed_by: string | null
          created_at: string
          id: string
          note: string | null
          order_id: string
          status: string
        }
        Insert: {
          changed_by?: string | null
          created_at?: string
          id?: string
          note?: string | null
          order_id: string
          status: string
        }
        Update: {
          changed_by?: string | null
          created_at?: string
          id?: string
          note?: string | null
          order_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_status_history_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          affiliate_code: string | null
          affiliate_id: string | null
          city: string | null
          coupon_code: string | null
          created_at: string
          customer_id: string | null
          customer_name: string | null
          discount_amount: number
          driver_id: string | null
          financial_status: string | null
          fulfillment_warehouse_id: string | null
          id: string
          items: Json | null
          notes: string | null
          order_number: string | null
          payment_method: string | null
          payment_reference: string | null
          payment_status: string | null
          phone: string | null
          points_discount: number
          points_earned: number
          points_redeemed: number
          referral_code: string | null
          referral_referrer_id: string | null
          resources_released_at: string | null
          shipping_address: string | null
          shipping_fee: number
          state: string | null
          status: string | null
          total: number | null
          viewed_at: string | null
        }
        Insert: {
          affiliate_code?: string | null
          affiliate_id?: string | null
          city?: string | null
          coupon_code?: string | null
          created_at?: string
          customer_id?: string | null
          customer_name?: string | null
          discount_amount?: number
          driver_id?: string | null
          financial_status?: string | null
          fulfillment_warehouse_id?: string | null
          id?: string
          items?: Json | null
          notes?: string | null
          order_number?: string | null
          payment_method?: string | null
          payment_reference?: string | null
          payment_status?: string | null
          phone?: string | null
          points_discount?: number
          points_earned?: number
          points_redeemed?: number
          referral_code?: string | null
          referral_referrer_id?: string | null
          resources_released_at?: string | null
          shipping_address?: string | null
          shipping_fee?: number
          state?: string | null
          status?: string | null
          total?: number | null
          viewed_at?: string | null
        }
        Update: {
          affiliate_code?: string | null
          affiliate_id?: string | null
          city?: string | null
          coupon_code?: string | null
          created_at?: string
          customer_id?: string | null
          customer_name?: string | null
          discount_amount?: number
          driver_id?: string | null
          financial_status?: string | null
          fulfillment_warehouse_id?: string | null
          id?: string
          items?: Json | null
          notes?: string | null
          order_number?: string | null
          payment_method?: string | null
          payment_reference?: string | null
          payment_status?: string | null
          phone?: string | null
          points_discount?: number
          points_earned?: number
          points_redeemed?: number
          referral_code?: string | null
          referral_referrer_id?: string | null
          resources_released_at?: string | null
          shipping_address?: string | null
          shipping_fee?: number
          state?: string | null
          status?: string | null
          total?: number | null
          viewed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_affiliate_id_fkey"
            columns: ["affiliate_id"]
            isOneToOne: false
            referencedRelation: "affiliate_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_fulfillment_warehouse_id_fkey"
            columns: ["fulfillment_warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_methods: {
        Row: {
          account_details: Json
          code: string
          created_at: string
          description_ar: string | null
          display_order: number
          is_active: boolean
          name_ar: string
          requires_proof: boolean
        }
        Insert: {
          account_details?: Json
          code: string
          created_at?: string
          description_ar?: string | null
          display_order?: number
          is_active?: boolean
          name_ar: string
          requires_proof?: boolean
        }
        Update: {
          account_details?: Json
          code?: string
          created_at?: string
          description_ar?: string | null
          display_order?: number
          is_active?: boolean
          name_ar?: string
          requires_proof?: boolean
        }
        Relationships: []
      }
      payment_proofs: {
        Row: {
          amount: number
          customer_id: string
          id: string
          order_id: string
          payment_method: string
          proof_path: string
          review_note: string | null
          reviewed_at: string | null
          reviewer_id: string | null
          status: string
          submitted_at: string
          transaction_reference: string | null
        }
        Insert: {
          amount: number
          customer_id: string
          id?: string
          order_id: string
          payment_method: string
          proof_path: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewer_id?: string | null
          status?: string
          submitted_at?: string
          transaction_reference?: string | null
        }
        Update: {
          amount?: number
          customer_id?: string
          id?: string
          order_id?: string
          payment_method?: string
          proof_path?: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewer_id?: string | null
          status?: string
          submitted_at?: string
          transaction_reference?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_proofs_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_proofs_payment_method_fkey"
            columns: ["payment_method"]
            isOneToOne: false
            referencedRelation: "payment_methods"
            referencedColumns: ["code"]
          },
        ]
      }
      products: {
        Row: {
          average_rating: number | null
          benefits: string[] | null
          brand: string | null
          category: string | null
          cost_price: number | null
          created_at: string
          description: string | null
          discount_percentage: number | null
          expiry: string | null
          id: string
          image: string | null
          images: string[] | null
          ingredients: string[] | null
          is_active: boolean
          is_imported: boolean | null
          name_ar: string | null
          name_en: string | null
          origin: string | null
          price: number | null
          reviews_count: number | null
          skin_type: string[] | null
          stock: number | null
          usage: string | null
          variants: Json
        }
        Insert: {
          average_rating?: number | null
          benefits?: string[] | null
          brand?: string | null
          category?: string | null
          cost_price?: number | null
          created_at?: string
          description?: string | null
          discount_percentage?: number | null
          expiry?: string | null
          id?: string
          image?: string | null
          images?: string[] | null
          ingredients?: string[] | null
          is_active?: boolean
          is_imported?: boolean | null
          name_ar?: string | null
          name_en?: string | null
          origin?: string | null
          price?: number | null
          reviews_count?: number | null
          skin_type?: string[] | null
          stock?: number | null
          usage?: string | null
          variants?: Json
        }
        Update: {
          average_rating?: number | null
          benefits?: string[] | null
          brand?: string | null
          category?: string | null
          cost_price?: number | null
          created_at?: string
          description?: string | null
          discount_percentage?: number | null
          expiry?: string | null
          id?: string
          image?: string | null
          images?: string[] | null
          ingredients?: string[] | null
          is_active?: boolean
          is_imported?: boolean | null
          name_ar?: string | null
          name_en?: string | null
          origin?: string | null
          price?: number | null
          reviews_count?: number | null
          skin_type?: string[] | null
          stock?: number | null
          usage?: string | null
          variants?: Json
        }
        Relationships: []
      }
      profiles: {
        Row: {
          beauty_points: number | null
          created_at: string
          email: string | null
          id: string
          loyalty_lifetime_points: number
          loyalty_tier: string
          referral_code: string | null
          referred_by: string | null
          role: string | null
        }
        Insert: {
          beauty_points?: number | null
          created_at?: string
          email?: string | null
          id: string
          loyalty_lifetime_points?: number
          loyalty_tier?: string
          referral_code?: string | null
          referred_by?: string | null
          role?: string | null
        }
        Update: {
          beauty_points?: number | null
          created_at?: string
          email?: string | null
          id?: string
          loyalty_lifetime_points?: number
          loyalty_tier?: string
          referral_code?: string | null
          referred_by?: string | null
          role?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_loyalty_tier_fkey"
            columns: ["loyalty_tier"]
            isOneToOne: false
            referencedRelation: "loyalty_tiers"
            referencedColumns: ["id"]
          },
        ]
      }
      promotions: {
        Row: {
          created_at: string | null
          description: string | null
          discount_type: string
          discount_value: number
          end_date: string | null
          id: string
          start_date: string
          target_kind: string
          target_product_ids: string[]
          target_value: string | null
          title: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          discount_type: string
          discount_value: number
          end_date?: string | null
          id?: string
          start_date?: string
          target_kind?: string
          target_product_ids?: string[]
          target_value?: string | null
          title: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          discount_type?: string
          discount_value?: number
          end_date?: string | null
          id?: string
          start_date?: string
          target_kind?: string
          target_product_ids?: string[]
          target_value?: string | null
          title?: string
        }
        Relationships: []
      }
      push_notification_deliveries: {
        Row: {
          created_at: string
          customer_id: string
          error_message: string | null
          event_type: string
          expo_ticket_id: string | null
          id: string
          order_id: string
          push_token_id: string
          response_payload: Json
          status: string
        }
        Insert: {
          created_at?: string
          customer_id: string
          error_message?: string | null
          event_type: string
          expo_ticket_id?: string | null
          id?: string
          order_id: string
          push_token_id: string
          response_payload?: Json
          status: string
        }
        Update: {
          created_at?: string
          customer_id?: string
          error_message?: string | null
          event_type?: string
          expo_ticket_id?: string | null
          id?: string
          order_id?: string
          push_token_id?: string
          response_payload?: Json
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_notification_deliveries_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "push_notification_deliveries_push_token_id_fkey"
            columns: ["push_token_id"]
            isOneToOne: false
            referencedRelation: "customer_push_tokens"
            referencedColumns: ["id"]
          },
        ]
      }
      referral_rewards: {
        Row: {
          created_at: string
          id: string
          order_id: string
          points_awarded: number
          referred_customer_id: string
          referrer_id: string
          status: string
        }
        Insert: {
          created_at?: string
          id?: string
          order_id: string
          points_awarded?: number
          referred_customer_id: string
          referrer_id: string
          status?: string
        }
        Update: {
          created_at?: string
          id?: string
          order_id?: string
          points_awarded?: number
          referred_customer_id?: string
          referrer_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "referral_rewards_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      restock_subscriptions: {
        Row: {
          created_at: string
          customer_id: string
          id: string
          is_active: boolean
          notified_at: string | null
          product_id: string
        }
        Insert: {
          created_at?: string
          customer_id: string
          id?: string
          is_active?: boolean
          notified_at?: string | null
          product_id: string
        }
        Update: {
          created_at?: string
          customer_id?: string
          id?: string
          is_active?: boolean
          notified_at?: string | null
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "restock_subscriptions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      reviews: {
        Row: {
          comment: string | null
          created_at: string
          id: string
          image_paths: string[]
          is_verified_purchase: boolean
          order_id: string | null
          product_id: string | null
          rating: number | null
          status: string
          user_id: string | null
          user_name: string | null
        }
        Insert: {
          comment?: string | null
          created_at?: string
          id?: string
          image_paths?: string[]
          is_verified_purchase?: boolean
          order_id?: string | null
          product_id?: string | null
          rating?: number | null
          status?: string
          user_id?: string | null
          user_name?: string | null
        }
        Update: {
          comment?: string | null
          created_at?: string
          id?: string
          image_paths?: string[]
          is_verified_purchase?: boolean
          order_id?: string | null
          product_id?: string | null
          rating?: number | null
          status?: string
          user_id?: string | null
          user_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reviews_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_transfers: {
        Row: {
          created_at: string
          created_by: string | null
          from_warehouse_id: string
          id: string
          note: string | null
          product_id: string
          quantity: number
          status: string
          to_warehouse_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          from_warehouse_id: string
          id?: string
          note?: string | null
          product_id: string
          quantity: number
          status?: string
          to_warehouse_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          from_warehouse_id?: string
          id?: string
          note?: string | null
          product_id?: string
          quantity?: number
          status?: string
          to_warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_transfers_from_warehouse_id_fkey"
            columns: ["from_warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transfers_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transfers_to_warehouse_id_fkey"
            columns: ["to_warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      storefront_banners: {
        Row: {
          action_type: string
          action_value: string | null
          created_at: string
          display_order: number
          ends_at: string | null
          id: string
          image_url: string | null
          is_active: boolean
          starts_at: string
          subtitle_ar: string | null
          title_ar: string
        }
        Insert: {
          action_type?: string
          action_value?: string | null
          created_at?: string
          display_order?: number
          ends_at?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          starts_at?: string
          subtitle_ar?: string | null
          title_ar: string
        }
        Update: {
          action_type?: string
          action_value?: string | null
          created_at?: string
          display_order?: number
          ends_at?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          starts_at?: string
          subtitle_ar?: string | null
          title_ar?: string
        }
        Relationships: []
      }
      storefront_collection_products: {
        Row: {
          collection_id: string
          created_at: string
          display_order: number
          product_id: string
        }
        Insert: {
          collection_id: string
          created_at?: string
          display_order?: number
          product_id: string
        }
        Update: {
          collection_id?: string
          created_at?: string
          display_order?: number
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "storefront_collection_products_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "storefront_collections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "storefront_collection_products_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      storefront_collections: {
        Row: {
          created_at: string
          description_ar: string | null
          display_order: number
          icon: string
          id: string
          is_active: boolean
          name_ar: string
          rule_config: Json
          rule_type: string
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description_ar?: string | null
          display_order?: number
          icon?: string
          id?: string
          is_active?: boolean
          name_ar: string
          rule_config?: Json
          rule_type: string
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description_ar?: string | null
          display_order?: number
          icon?: string
          id?: string
          is_active?: boolean
          name_ar?: string
          rule_config?: Json
          rule_type?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      warehouse_inventory: {
        Row: {
          product_id: string
          quantity: number
          reorder_level: number
          updated_at: string
          warehouse_id: string
        }
        Insert: {
          product_id: string
          quantity?: number
          reorder_level?: number
          updated_at?: string
          warehouse_id: string
        }
        Update: {
          product_id?: string
          quantity?: number
          reorder_level?: number
          updated_at?: string
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "warehouse_inventory_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warehouse_inventory_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      warehouses: {
        Row: {
          address: string | null
          city: string
          code: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          phone: string | null
          state: string
        }
        Insert: {
          address?: string | null
          city: string
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          phone?: string | null
          state: string
        }
        Update: {
          address?: string | null
          city?: string
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          phone?: string | null
          state?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      adjust_loyalty_points: {
        Args: { p_customer_id: string; p_note: string; p_points_delta: number }
        Returns: number
      }
      adjust_warehouse_inventory: {
        Args: {
          p_note?: string
          p_product_id: string
          p_quantity_delta: number
          p_reorder_level?: number
          p_warehouse_id: string
        }
        Returns: number
      }
      admin_backdate_test_order: {
        Args: { p_created_at: string; p_order_id: string }
        Returns: undefined
      }
      admin_business_report: {
        Args: { p_end?: string; p_start?: string }
        Returns: Json
      }
      admin_delete_collection: { Args: { p_id: string }; Returns: undefined }
      admin_delete_coupon: { Args: { p_id: string }; Returns: undefined }
      admin_delete_promotion: { Args: { p_id: string }; Returns: undefined }
      admin_delete_test_orders: { Args: never; Returns: number }
      admin_end_promotion: { Args: { p_id: string }; Returns: undefined }
      admin_get_collections: {
        Args: never
        Returns: {
          description_ar: string
          display_order: number
          icon: string
          id: string
          is_active: boolean
          name_ar: string
          product_ids: string[]
          rule_config: Json
          rule_type: string
          slug: string
          updated_at: string
        }[]
      }
      admin_get_coupons: {
        Args: never
        Returns: {
          code: string
          created_at: string
          description: string | null
          discount_type: string
          discount_value: number
          ends_at: string | null
          id: string
          is_active: boolean
          max_discount_amount: number | null
          min_order_amount: number
          name: string
          per_user_limit: number
          starts_at: string
          usage_count: number
          usage_limit: number | null
        }[]
        SetofOptions: {
          from: "*"
          to: "coupons"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      admin_get_promotions: {
        Args: never
        Returns: {
          created_at: string
          description: string
          discount_type: string
          discount_value: number
          end_date: string
          id: string
          start_date: string
          status: string
          target_kind: string
          target_product_ids: string[]
          target_value: string
          title: string
        }[]
      }
      admin_run_stale_order_sweep: { Args: never; Returns: number }
      admin_save_collection: {
        Args: {
          p_description_ar?: string
          p_display_order?: number
          p_icon?: string
          p_id?: string
          p_is_active?: boolean
          p_name_ar: string
          p_product_ids?: string[]
          p_rule_config?: Json
          p_rule_type: string
          p_slug: string
        }
        Returns: string
      }
      admin_save_coupon: {
        Args: {
          p_code: string
          p_description?: string
          p_discount_type: string
          p_discount_value: number
          p_ends_at?: string
          p_id?: string
          p_is_active?: boolean
          p_max_discount_amount?: number
          p_min_order_amount?: number
          p_name: string
          p_per_user_limit?: number
          p_starts_at?: string
          p_usage_limit?: number
        }
        Returns: string
      }
      admin_save_promotion: {
        Args: {
          p_description?: string
          p_discount_type: string
          p_discount_value: number
          p_end_date?: string
          p_id?: string
          p_start_date?: string
          p_target_kind: string
          p_target_product_ids?: string[]
          p_target_value?: string
          p_title: string
        }
        Returns: string
      }
      admin_set_collection_products: {
        Args: { p_collection_id: string; p_product_ids: string[] }
        Returns: undefined
      }
      admin_update_order_operation: {
        Args: {
          p_driver_id?: string
          p_expected_status: string
          p_note?: string
          p_order_id: string
          p_status?: string
          p_warehouse_id?: string
        }
        Returns: {
          driver_id: string
          fulfillment_warehouse_id: string
          id: string
          status: string
          updated_at: string
        }[]
      }
      cancel_stale_orders: { Args: { p_max_age?: string }; Returns: number }
      checkout_order: {
        Args: {
          p_city: string
          p_coupon_code?: string
          p_customer_name: string
          p_items: Json
          p_payment_method: string
          p_phone: string
          p_points_to_redeem?: number
          p_shipping_address: string
          p_state: string
        }
        Returns: {
          discount_amount: number
          order_id: string
          order_number: string
          points_discount: number
          shipping_fee: number
          total: number
        }[]
      }
      checkout_order_safe: {
        Args: {
          p_city: string
          p_coupon_code?: string
          p_customer_name: string
          p_idempotency_key?: string
          p_items: Json
          p_payment_method: string
          p_phone: string
          p_points_to_redeem?: number
          p_shipping_address: string
          p_state: string
        }
        Returns: {
          discount_amount: number
          order_id: string
          order_number: string
          points_discount: number
          shipping_fee: number
          total: number
        }[]
      }
      checkout_order_with_growth:
        | {
            Args: {
              p_affiliate_code?: string
              p_city: string
              p_coupon_code?: string
              p_customer_name: string
              p_items: Json
              p_payment_method: string
              p_phone: string
              p_points_to_redeem?: number
              p_referral_code?: string
              p_shipping_address: string
              p_state: string
            }
            Returns: {
              discount_amount: number
              order_id: string
              order_number: string
              points_discount: number
              shipping_fee: number
              total: number
            }[]
          }
        | {
            Args: {
              p_affiliate_code?: string
              p_city: string
              p_coupon_code?: string
              p_customer_name: string
              p_idempotency_key?: string
              p_items: Json
              p_payment_method: string
              p_phone: string
              p_points_to_redeem?: number
              p_referral_code?: string
              p_shipping_address: string
              p_state: string
            }
            Returns: {
              discount_amount: number
              order_id: string
              order_number: string
              points_discount: number
              shipping_fee: number
              total: number
            }[]
          }
      clear_driver_location: { Args: never; Returns: undefined }
      create_customer_notification: {
        Args: {
          p_body: string
          p_customer_id: string
          p_order_id?: string
          p_payload?: Json
          p_product_id?: string
          p_title: string
          p_type: string
        }
        Returns: string
      }
      create_order: {
        Args: {
          p_city: string
          p_customer_name: string
          p_items: Json
          p_payment_method: string
          p_phone: string
          p_shipping_address: string
          p_state: string
        }
        Returns: {
          order_id: string
          order_number: string
          shipping_fee: number
          total: number
        }[]
      }
      customer_cancel_order: {
        Args: { p_order_id: string }
        Returns: {
          id: string
          status: string
        }[]
      }
      dispatch_email_queue: { Args: never; Returns: undefined }
      effective_price: {
        Args: {
          p_base_price: number
          p_brand: string
          p_category: string
          p_discount_percentage: number
          p_product_id: string
        }
        Returns: {
          effective_price: number
          promotion_id: string
          reduction: number
          rule_kind: string
          rule_label: string
        }[]
      }
      evaluate_coupon: {
        Args: {
          p_base_subtotal: number
          p_code: string
          p_customer_id: string
          p_line_reductions: number
          p_lock: boolean
        }
        Returns: {
          code: string
          coupon_id: string
          name: string
          reason: string
          reduction: number
        }[]
      }
      get_admin_product: {
        Args: { p_product_id: string }
        Returns: {
          average_rating: number | null
          benefits: string[] | null
          brand: string | null
          category: string | null
          cost_price: number | null
          created_at: string
          description: string | null
          discount_percentage: number | null
          expiry: string | null
          id: string
          image: string | null
          images: string[] | null
          ingredients: string[] | null
          is_active: boolean
          is_imported: boolean | null
          name_ar: string | null
          name_en: string | null
          origin: string | null
          price: number | null
          reviews_count: number | null
          skin_type: string[] | null
          stock: number | null
          usage: string | null
          variants: Json
        }[]
        SetofOptions: {
          from: "*"
          to: "products"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_admin_product_review_stats: {
        Args: never
        Returns: {
          average_published_rating: number
          brand: string
          hidden_count: number
          latest_review_at: string
          photo_count: number
          product_id: string
          product_image: string
          product_name_ar: string
          published_count: number
          sales_count: number
        }[]
      }
      get_admin_products: {
        Args: never
        Returns: {
          average_rating: number | null
          benefits: string[] | null
          brand: string | null
          category: string | null
          cost_price: number | null
          created_at: string
          description: string | null
          discount_percentage: number | null
          expiry: string | null
          id: string
          image: string | null
          images: string[] | null
          ingredients: string[] | null
          is_active: boolean
          is_imported: boolean | null
          name_ar: string | null
          name_en: string | null
          origin: string | null
          price: number | null
          reviews_count: number | null
          skin_type: string[] | null
          stock: number | null
          usage: string | null
          variants: Json
        }[]
        SetofOptions: {
          from: "*"
          to: "products"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_public_product: {
        Args: { p_product_id: string }
        Returns: {
          average_rating: number
          benefits: string[]
          brand: string
          category: string
          created_at: string
          description: string
          discount_percentage: number
          effective_price: number
          expiry: string
          id: string
          image: string
          images: string[]
          ingredients: string[]
          is_imported: boolean
          name_ar: string
          name_en: string
          origin: string
          price: number
          pricing_rule_kind: string
          pricing_rule_label: string
          reviews_count: number
          skin_type: string[]
          stock: number
          usage: string
          variants: Json
        }[]
      }
      get_public_product_reviews: {
        Args: { p_product_id: string }
        Returns: {
          comment: string
          created_at: string
          id: string
          image_paths: string[]
          rating: number
          reviewer_label: string
          verified_purchase: boolean
        }[]
      }
      get_public_product_sales_metrics: {
        Args: never
        Returns: {
          product_id: string
          sales_count: number
        }[]
      }
      get_public_products: {
        Args: never
        Returns: {
          average_rating: number
          benefits: string[]
          brand: string
          category: string
          created_at: string
          description: string
          discount_percentage: number
          effective_price: number
          expiry: string
          id: string
          image: string
          images: string[]
          ingredients: string[]
          is_imported: boolean
          name_ar: string
          name_en: string
          origin: string
          price: number
          pricing_rule_kind: string
          pricing_rule_label: string
          reviews_count: number
          skin_type: string[]
          stock: number
          usage: string
          variants: Json
        }[]
      }
      get_reviewable_order_items: {
        Args: never
        Returns: {
          has_review: boolean
          order_id: string
          order_number: string
          product_id: string
          product_image: string
          product_name_ar: string
        }[]
      }
      get_storefront_collections: {
        Args: never
        Returns: {
          description_ar: string
          display_order: number
          icon: string
          id: string
          name_ar: string
          product_ids: string[]
          slug: string
        }[]
      }
      is_admin: { Args: never; Returns: boolean }
      is_driver: { Args: never; Returns: boolean }
      mark_order_viewed: { Args: { p_order_id: string }; Returns: undefined }
      moderate_product_review: {
        Args: {
          p_remove_images?: boolean
          p_review_id: string
          p_status: string
        }
        Returns: {
          images_removed: number
          review_id: string
          status: string
        }[]
      }
      notify_restock_subscribers: {
        Args: { p_product_id: string }
        Returns: undefined
      }
      preview_coupon: {
        Args: { p_code: string; p_items: Json }
        Returns: {
          base_subtotal: number
          code: string
          line_reductions: number
          name: string
          ok: boolean
          reason: string
          reduction: number
        }[]
      }
      product_variant: {
        Args: { p_variant_id: string; p_variants: Json }
        Returns: Json
      }
      promotion_status: {
        Args: { p_end_date: string; p_start_date: string }
        Returns: string
      }
      public_variants: {
        Args: {
          p_brand: string
          p_category: string
          p_discount_percentage: number
          p_price: number
          p_product_id: string
          p_variants: Json
        }
        Returns: Json
      }
      refresh_product_review_summary: {
        Args: { p_product_id: string }
        Returns: undefined
      }
      register_customer_push_token: {
        Args: {
          p_device_name?: string
          p_expo_push_token: string
          p_platform: string
        }
        Returns: string
      }
      release_order_resources: {
        Args: { p_order_id: string }
        Returns: undefined
      }
      request_order_return: {
        Args: {
          p_customer_note?: string
          p_items: Json
          p_order_id: string
          p_reason: string
          p_requested_resolution: string
        }
        Returns: string
      }
      review_affiliate_commission: {
        Args: { p_commission_id: string; p_status: string }
        Returns: string
      }
      review_order_return: {
        Args: {
          p_admin_note?: string
          p_restock?: boolean
          p_return_id: string
          p_status: string
        }
        Returns: string
      }
      review_payment_proof: {
        Args: { p_proof_id: string; p_review_note?: string; p_status: string }
        Returns: string
      }
      set_affiliate_status: {
        Args: {
          p_admin_note?: string
          p_affiliate_id: string
          p_commission_rate?: number
          p_status: string
        }
        Returns: string
      }
      set_driver_availability: { Args: { p_status: string }; Returns: string }
      share_driver_location: {
        Args: {
          p_accuracy_meters?: number
          p_latitude: number
          p_longitude: number
        }
        Returns: string
      }
      submit_affiliate_application: {
        Args: {
          p_display_name: string
          p_payout_details?: string
          p_payout_method?: string
        }
        Returns: {
          admin_note: string | null
          approved_at: string | null
          approved_by: string | null
          code: string
          commission_rate: number
          created_at: string
          customer_id: string
          display_name: string
          id: string
          minimum_payout: number
          payout_details: string | null
          payout_method: string | null
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "affiliate_profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      submit_payment_proof: {
        Args: {
          p_amount: number
          p_order_id: string
          p_payment_method: string
          p_proof_path: string
          p_transaction_reference: string
        }
        Returns: string
      }
      submit_purchased_product_review: {
        Args: {
          p_comment?: string
          p_image_paths?: string[]
          p_order_id: string
          p_product_id: string
          p_rating: number
        }
        Returns: string
      }
      subscribe_restock: { Args: { p_product_id: string }; Returns: undefined }
      transfer_warehouse_stock: {
        Args: {
          p_from_warehouse_id: string
          p_note?: string
          p_product_id: string
          p_quantity: number
          p_to_warehouse_id: string
        }
        Returns: string
      }
      update_driver_order_status: {
        Args: {
          p_failure_reason?: string
          p_note?: string
          p_order_id: string
          p_status: string
        }
        Returns: string
      }
      variant_line: {
        Args: {
          p_product_id: string
          p_product_price: number
          p_variant_id: string
          p_variants: Json
        }
        Returns: {
          unit_price: number
          variant_id: string
          variant_name: string
          variant_price: number
        }[]
      }
      variants_are_valid: { Args: { p_variants: Json }; Returns: boolean }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
