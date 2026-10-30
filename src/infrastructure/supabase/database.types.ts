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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      account_deletions: {
        Row: {
          customer_id: string
          id: string
          orders_anonymised: number
          proofs_removed: number
          requested_at: string
        }
        Insert: {
          customer_id: string
          id?: string
          orders_anonymised?: number
          proofs_removed?: number
          requested_at?: string
        }
        Update: {
          customer_id?: string
          id?: string
          orders_anonymised?: number
          proofs_removed?: number
          requested_at?: string
        }
        Relationships: []
      }
      admin_audit_log: {
        Row: {
          action: string
          changed_at: string
          changed_by: string | null
          changed_columns: string[] | null
          id: number
          new_data: Json | null
          old_data: Json | null
          row_id: string
          table_name: string
        }
        Insert: {
          action: string
          changed_at?: string
          changed_by?: string | null
          changed_columns?: string[] | null
          id?: never
          new_data?: Json | null
          old_data?: Json | null
          row_id: string
          table_name: string
        }
        Update: {
          action?: string
          changed_at?: string
          changed_by?: string | null
          changed_columns?: string[] | null
          id?: never
          new_data?: Json | null
          old_data?: Json | null
          row_id?: string
          table_name?: string
        }
        Relationships: []
      }
      affiliate_commissions: {
        Row: {
          affiliate_id: string
          approved_at: string | null
          approved_by: string | null
          commission_amount: number
          commission_rate: number
          created_at: string
          customer_id: string
          eligible_at: string | null
          id: string
          order_id: string
          paid_amount: number
          paid_at: string | null
          review_note: string | null
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
          eligible_at?: string | null
          id?: string
          order_id: string
          paid_amount?: number
          paid_at?: string | null
          review_note?: string | null
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
          eligible_at?: string | null
          id?: string
          order_id?: string
          paid_amount?: number
          paid_at?: string | null
          review_note?: string | null
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
      affiliate_payout_allocations: {
        Row: {
          amount: number
          commission_id: string
          payout_id: string
        }
        Insert: {
          amount: number
          commission_id: string
          payout_id: string
        }
        Update: {
          amount?: number
          commission_id?: string
          payout_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "affiliate_payout_allocations_commission_id_fkey"
            columns: ["commission_id"]
            isOneToOne: false
            referencedRelation: "affiliate_commissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "affiliate_payout_allocations_payout_id_fkey"
            columns: ["payout_id"]
            isOneToOne: false
            referencedRelation: "affiliate_payouts"
            referencedColumns: ["id"]
          },
        ]
      }
      affiliate_payouts: {
        Row: {
          affiliate_id: string
          amount: number
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          payout_method: string
          reference_number: string | null
        }
        Insert: {
          affiliate_id: string
          amount: number
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          payout_method: string
          reference_number?: string | null
        }
        Update: {
          affiliate_id?: string
          amount?: number
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          payout_method?: string
          reference_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "affiliate_payouts_affiliate_id_fkey"
            columns: ["affiliate_id"]
            isOneToOne: false
            referencedRelation: "affiliate_profiles"
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
          customer_id: string | null
          display_name: string
          email: string | null
          id: string
          minimum_payout: number
          payout_details: string | null
          payout_method: string | null
          phone: string | null
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
          customer_id?: string | null
          display_name: string
          email?: string | null
          id?: string
          minimum_payout?: number
          payout_details?: string | null
          payout_method?: string | null
          phone?: string | null
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
          customer_id?: string | null
          display_name?: string
          email?: string | null
          id?: string
          minimum_payout?: number
          payout_details?: string | null
          payout_method?: string | null
          phone?: string | null
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
          affiliate_hold_days: number
          auth_apple_enabled: boolean
          auth_captcha_enabled: boolean
          auth_google_enabled: boolean
          auth_password_enabled: boolean
          auth_phone_enabled: boolean
          dynamic_pricing_states: string[]
          id: boolean
          notification_emails: string[]
          otp_cooldown_seconds: number
          otp_max_per_ip_hour: number
          otp_max_per_phone_hour: number
          otp_primary_channel: string
          otp_sms_enabled: boolean
          otp_whatsapp_enabled: boolean
          require_delivery_code: boolean
          require_delivery_proof: boolean
          require_packing_check: boolean
          updated_at: string
        }
        Insert: {
          affiliate_hold_days?: number
          auth_apple_enabled?: boolean
          auth_captcha_enabled?: boolean
          auth_google_enabled?: boolean
          auth_password_enabled?: boolean
          auth_phone_enabled?: boolean
          dynamic_pricing_states?: string[]
          id?: boolean
          notification_emails?: string[]
          otp_cooldown_seconds?: number
          otp_max_per_ip_hour?: number
          otp_max_per_phone_hour?: number
          otp_primary_channel?: string
          otp_sms_enabled?: boolean
          otp_whatsapp_enabled?: boolean
          require_delivery_code?: boolean
          require_delivery_proof?: boolean
          require_packing_check?: boolean
          updated_at?: string
        }
        Update: {
          affiliate_hold_days?: number
          auth_apple_enabled?: boolean
          auth_captcha_enabled?: boolean
          auth_google_enabled?: boolean
          auth_password_enabled?: boolean
          auth_phone_enabled?: boolean
          dynamic_pricing_states?: string[]
          id?: boolean
          notification_emails?: string[]
          otp_cooldown_seconds?: number
          otp_max_per_ip_hour?: number
          otp_max_per_phone_hour?: number
          otp_primary_channel?: string
          otp_sms_enabled?: boolean
          otp_whatsapp_enabled?: boolean
          require_delivery_code?: boolean
          require_delivery_proof?: boolean
          require_packing_check?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      brands: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          logo_url: string | null
          name_ar: string
          name_en: string | null
          slug: string | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          logo_url?: string | null
          name_ar: string
          name_en?: string | null
          slug?: string | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          logo_url?: string | null
          name_ar?: string
          name_en?: string | null
          slug?: string | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      categories: {
        Row: {
          created_at: string
          icon: string | null
          id: string
          image_url: string | null
          is_active: boolean
          name_ar: string
          name_en: string | null
          parent_id: string | null
          slug: string | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          icon?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          name_ar: string
          name_en?: string | null
          parent_id?: string | null
          slug?: string | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          icon?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          name_ar?: string
          name_en?: string | null
          parent_id?: string | null
          slug?: string | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      checkout_idempotency: {
        Row: {
          created_at: string
          customer_id: string
          idempotency_key: string
          order_id: string | null
          request_hash: string | null
        }
        Insert: {
          created_at?: string
          customer_id: string
          idempotency_key: string
          order_id?: string | null
          request_hash?: string | null
        }
        Update: {
          created_at?: string
          customer_id?: string
          idempotency_key?: string
          order_id?: string | null
          request_hash?: string | null
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
          affiliate_id: string | null
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
          affiliate_id?: string | null
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
          affiliate_id?: string | null
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
        Relationships: [
          {
            foreignKeyName: "coupons_affiliate_id_fkey"
            columns: ["affiliate_id"]
            isOneToOne: false
            referencedRelation: "affiliate_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_addresses: {
        Row: {
          address_line: string
          city: string
          created_at: string
          customer_id: string
          id: string
          is_default: boolean
          label: string | null
          latitude: number | null
          longitude: number | null
          phone: string
          recipient_name: string
          state: string
          updated_at: string
        }
        Insert: {
          address_line: string
          city: string
          created_at?: string
          customer_id?: string
          id?: string
          is_default?: boolean
          label?: string | null
          latitude?: number | null
          longitude?: number | null
          phone: string
          recipient_name: string
          state: string
          updated_at?: string
        }
        Update: {
          address_line?: string
          city?: string
          created_at?: string
          customer_id?: string
          id?: string
          is_default?: boolean
          label?: string | null
          latitude?: number | null
          longitude?: number | null
          phone?: string
          recipient_name?: string
          state?: string
          updated_at?: string
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
          app_audience: string
          created_at: string
          customer_id: string
          device_name: string | null
          expo_push_token: string | null
          id: string
          invalidated_at: string | null
          is_active: boolean
          last_registered_at: string
          platform: string
          provider: string
          push_token: string | null
        }
        Insert: {
          app_audience?: string
          created_at?: string
          customer_id: string
          device_name?: string | null
          expo_push_token?: string | null
          id?: string
          invalidated_at?: string | null
          is_active?: boolean
          last_registered_at?: string
          platform: string
          provider?: string
          push_token?: string | null
        }
        Update: {
          app_audience?: string
          created_at?: string
          customer_id?: string
          device_name?: string | null
          expo_push_token?: string | null
          id?: string
          invalidated_at?: string | null
          is_active?: boolean
          last_registered_at?: string
          platform?: string
          provider?: string
          push_token?: string | null
        }
        Relationships: []
      }
      delivery_pricing_config: {
        Row: {
          avg_speed_kmh: number
          base_fee: number
          created_at: string
          delivery_zone_id: string | null
          handling_fee: number
          id: string
          is_active: boolean
          max_fee: number | null
          min_fee: number
          per_extra_warehouse_fee: number
          per_kg_rate: number
          per_km_rate: number
          road_multiplier: number
          state: string | null
          updated_at: string
          warehouse_id: string | null
          weight_multiplier: number
        }
        Insert: {
          avg_speed_kmh?: number
          base_fee?: number
          created_at?: string
          delivery_zone_id?: string | null
          handling_fee?: number
          id?: string
          is_active?: boolean
          max_fee?: number | null
          min_fee?: number
          per_extra_warehouse_fee?: number
          per_kg_rate?: number
          per_km_rate?: number
          road_multiplier?: number
          state?: string | null
          updated_at?: string
          warehouse_id?: string | null
          weight_multiplier?: number
        }
        Update: {
          avg_speed_kmh?: number
          base_fee?: number
          created_at?: string
          delivery_zone_id?: string | null
          handling_fee?: number
          id?: string
          is_active?: boolean
          max_fee?: number | null
          min_fee?: number
          per_extra_warehouse_fee?: number
          per_kg_rate?: number
          per_km_rate?: number
          road_multiplier?: number
          state?: string | null
          updated_at?: string
          warehouse_id?: string | null
          weight_multiplier?: number
        }
        Relationships: [
          {
            foreignKeyName: "delivery_pricing_config_delivery_zone_id_fkey"
            columns: ["delivery_zone_id"]
            isOneToOne: false
            referencedRelation: "delivery_zones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_pricing_config_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_pricing_config_audit: {
        Row: {
          action: string
          changed_at: string
          changed_by: string | null
          config_id: string | null
          id: number
          new_values: Json | null
          old_values: Json | null
        }
        Insert: {
          action: string
          changed_at?: string
          changed_by?: string | null
          config_id?: string | null
          id?: never
          new_values?: Json | null
          old_values?: Json | null
        }
        Update: {
          action?: string
          changed_at?: string
          changed_by?: string | null
          config_id?: string | null
          id?: never
          new_values?: Json | null
          old_values?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "delivery_pricing_config_audit_config_id_fkey"
            columns: ["config_id"]
            isOneToOne: false
            referencedRelation: "delivery_pricing_config"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_zones: {
        Row: {
          created_at: string
          fee: number
          id: string
          is_active: boolean
          latitude: number | null
          longitude: number | null
          name: string
          state: string | null
          warehouse_id: string | null
        }
        Insert: {
          created_at?: string
          fee?: number
          id?: string
          is_active?: boolean
          latitude?: number | null
          longitude?: number | null
          name: string
          state?: string | null
          warehouse_id?: string | null
        }
        Update: {
          created_at?: string
          fee?: number
          id?: string
          is_active?: boolean
          latitude?: number | null
          longitude?: number | null
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
      driver_cash_ledger: {
        Row: {
          amount: number
          business_date: string
          created_at: string
          created_by: string | null
          driver_id: string
          entry_type: string
          id: string
          note: string | null
          order_id: string | null
          remittance_id: string | null
          warehouse_id: string | null
        }
        Insert: {
          amount: number
          business_date: string
          created_at?: string
          created_by?: string | null
          driver_id: string
          entry_type: string
          id?: string
          note?: string | null
          order_id?: string | null
          remittance_id?: string | null
          warehouse_id?: string | null
        }
        Update: {
          amount?: number
          business_date?: string
          created_at?: string
          created_by?: string | null
          driver_id?: string
          entry_type?: string
          id?: string
          note?: string | null
          order_id?: string | null
          remittance_id?: string | null
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "driver_cash_ledger_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_cash_ledger_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_cash_ledger_remittance_id_fkey"
            columns: ["remittance_id"]
            isOneToOne: false
            referencedRelation: "driver_cash_remittances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_cash_ledger_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      driver_cash_remittances: {
        Row: {
          amount: number
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          driver_id: string
          driver_notes: string | null
          id: string
          status: string
          submitted_at: string
          supervisor_notes: string | null
          warehouse_id: string | null
        }
        Insert: {
          amount: number
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          driver_id: string
          driver_notes?: string | null
          id?: string
          status?: string
          submitted_at?: string
          supervisor_notes?: string | null
          warehouse_id?: string | null
        }
        Update: {
          amount?: number
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          driver_id?: string
          driver_notes?: string | null
          id?: string
          status?: string
          submitted_at?: string
          supervisor_notes?: string | null
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "driver_cash_remittances_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_cash_remittances_warehouse_id_fkey"
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
          unit_cost: number | null
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
          unit_cost?: number | null
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
          unit_cost?: number | null
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
      order_delivery_codes: {
        Row: {
          code_hash: string
          failed_attempts: number
          issued_at: string
          order_id: string
          override_by: string | null
          override_reason: string | null
          verified_at: string | null
        }
        Insert: {
          code_hash: string
          failed_attempts?: number
          issued_at?: string
          order_id: string
          override_by?: string | null
          override_reason?: string | null
          verified_at?: string | null
        }
        Update: {
          code_hash?: string
          failed_attempts?: number
          issued_at?: string
          order_id?: string
          override_by?: string | null
          override_reason?: string | null
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_delivery_codes_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_item_checks: {
        Row: {
          checked_at: string
          checked_by: string | null
          checked_qty: number
          line_no: number
          order_id: string
          stage: string
        }
        Insert: {
          checked_at?: string
          checked_by?: string | null
          checked_qty: number
          line_no: number
          order_id: string
          stage: string
        }
        Update: {
          checked_at?: string
          checked_by?: string | null
          checked_qty?: number
          line_no?: number
          order_id?: string
          stage?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_item_checks_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_line_costs: {
        Row: {
          is_estimated: boolean
          line_no: number
          order_id: string
          product_id: string
          quantity: number
          unit_cost: number | null
          variant_id: string | null
        }
        Insert: {
          is_estimated?: boolean
          line_no: number
          order_id: string
          product_id: string
          quantity: number
          unit_cost?: number | null
          variant_id?: string | null
        }
        Update: {
          is_estimated?: boolean
          line_no?: number
          order_id?: string
          product_id?: string
          quantity?: number
          unit_cost?: number | null
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_line_costs_order_id_fkey"
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
          refund_amount: number | null
          refund_reference: string | null
          refunded_at: string | null
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
          refund_amount?: number | null
          refund_reference?: string | null
          refunded_at?: string | null
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
          refund_amount?: number | null
          refund_reference?: string | null
          refunded_at?: string | null
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
      order_staff_notes: {
        Row: {
          note: string
          order_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          note: string
          order_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          note?: string
          order_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_staff_notes_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
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
          cod_collected_at: string | null
          cod_collected_by: string | null
          coupon_code: string | null
          created_at: string
          customer_id: string | null
          customer_lat: number | null
          customer_lng: number | null
          customer_name: string | null
          delivery_proof_path: string | null
          discount_amount: number
          driver_id: string | null
          estimated_delivery_at: string | null
          financial_status: string | null
          fulfillment_warehouse_id: string | null
          handed_over_at: string | null
          id: string
          items: Json | null
          location_source: string
          needs_fulfillment_review: boolean
          notes: string | null
          order_number: string | null
          packed_at: string | null
          packed_by: string | null
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
          returned_received_by: string | null
          returned_to_warehouse_at: string | null
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
          cod_collected_at?: string | null
          cod_collected_by?: string | null
          coupon_code?: string | null
          created_at?: string
          customer_id?: string | null
          customer_lat?: number | null
          customer_lng?: number | null
          customer_name?: string | null
          delivery_proof_path?: string | null
          discount_amount?: number
          driver_id?: string | null
          estimated_delivery_at?: string | null
          financial_status?: string | null
          fulfillment_warehouse_id?: string | null
          handed_over_at?: string | null
          id?: string
          items?: Json | null
          location_source?: string
          needs_fulfillment_review?: boolean
          notes?: string | null
          order_number?: string | null
          packed_at?: string | null
          packed_by?: string | null
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
          returned_received_by?: string | null
          returned_to_warehouse_at?: string | null
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
          cod_collected_at?: string | null
          cod_collected_by?: string | null
          coupon_code?: string | null
          created_at?: string
          customer_id?: string | null
          customer_lat?: number | null
          customer_lng?: number | null
          customer_name?: string | null
          delivery_proof_path?: string | null
          discount_amount?: number
          driver_id?: string | null
          estimated_delivery_at?: string | null
          financial_status?: string | null
          fulfillment_warehouse_id?: string | null
          handed_over_at?: string | null
          id?: string
          items?: Json | null
          location_source?: string
          needs_fulfillment_review?: boolean
          notes?: string | null
          order_number?: string | null
          packed_at?: string | null
          packed_by?: string | null
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
          returned_received_by?: string | null
          returned_to_warehouse_at?: string | null
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
      orders_notes_eta_backup: {
        Row: {
          backed_up_at: string
          notes: string | null
          order_id: string
        }
        Insert: {
          backed_up_at?: string
          notes?: string | null
          order_id: string
        }
        Update: {
          backed_up_at?: string
          notes?: string | null
          order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_notes_eta_backup_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      otp_delivery_log: {
        Row: {
          attempt: number | null
          channel: string
          created_at: string
          error_message: string | null
          id: string
          phone: string
          provider: string | null
          provider_message_id: string | null
          status: string
        }
        Insert: {
          attempt?: number | null
          channel: string
          created_at?: string
          error_message?: string | null
          id?: string
          phone: string
          provider?: string | null
          provider_message_id?: string | null
          status: string
        }
        Update: {
          attempt?: number | null
          channel?: string
          created_at?: string
          error_message?: string | null
          id?: string
          phone?: string
          provider?: string | null
          provider_message_id?: string | null
          status?: string
        }
        Relationships: []
      }
      otp_request_attempts: {
        Row: {
          created_at: string
          id: string
          ip_address: string | null
          phone: string
        }
        Insert: {
          created_at?: string
          id?: string
          ip_address?: string | null
          phone: string
        }
        Update: {
          created_at?: string
          id?: string
          ip_address?: string | null
          phone?: string
        }
        Relationships: []
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
      product_cost_history: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          new_average_cost: number
          previous_average_cost: number | null
          product_id: string
          quantity_delta: number
          quantity_on_hand_before: number
          source_id: string
          source_type: string
          unit_cost: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          new_average_cost: number
          previous_average_cost?: number | null
          product_id: string
          quantity_delta: number
          quantity_on_hand_before: number
          source_id: string
          source_type: string
          unit_cost: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          new_average_cost?: number
          previous_average_cost?: number | null
          product_id?: string
          quantity_delta?: number
          quantity_on_hand_before?: number
          source_id?: string
          source_type?: string
          unit_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "product_cost_history_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          average_cost: number | null
          average_cost_updated_at: string | null
          average_rating: number | null
          benefits: string[] | null
          brand: string | null
          brand_id: string | null
          category: string | null
          category_id: string | null
          cost_price: number | null
          created_at: string
          description: string | null
          discount_percentage: number | null
          expiry: string | null
          height_cm: number | null
          id: string
          image: string | null
          images: string[] | null
          ingredients: string[] | null
          is_active: boolean
          is_imported: boolean | null
          length_cm: number | null
          name_ar: string | null
          name_en: string | null
          origin: string | null
          price: number | null
          reviews_count: number | null
          skin_type: string[] | null
          stock: number | null
          usage: string | null
          variants: Json
          weight_grams: number | null
          width_cm: number | null
        }
        Insert: {
          average_cost?: number | null
          average_cost_updated_at?: string | null
          average_rating?: number | null
          benefits?: string[] | null
          brand?: string | null
          brand_id?: string | null
          category?: string | null
          category_id?: string | null
          cost_price?: number | null
          created_at?: string
          description?: string | null
          discount_percentage?: number | null
          expiry?: string | null
          height_cm?: number | null
          id?: string
          image?: string | null
          images?: string[] | null
          ingredients?: string[] | null
          is_active?: boolean
          is_imported?: boolean | null
          length_cm?: number | null
          name_ar?: string | null
          name_en?: string | null
          origin?: string | null
          price?: number | null
          reviews_count?: number | null
          skin_type?: string[] | null
          stock?: number | null
          usage?: string | null
          variants?: Json
          weight_grams?: number | null
          width_cm?: number | null
        }
        Update: {
          average_cost?: number | null
          average_cost_updated_at?: string | null
          average_rating?: number | null
          benefits?: string[] | null
          brand?: string | null
          brand_id?: string | null
          category?: string | null
          category_id?: string | null
          cost_price?: number | null
          created_at?: string
          description?: string | null
          discount_percentage?: number | null
          expiry?: string | null
          height_cm?: number | null
          id?: string
          image?: string | null
          images?: string[] | null
          ingredients?: string[] | null
          is_active?: boolean
          is_imported?: boolean | null
          length_cm?: number | null
          name_ar?: string | null
          name_en?: string | null
          origin?: string | null
          price?: number | null
          reviews_count?: number | null
          skin_type?: string[] | null
          stock?: number | null
          usage?: string | null
          variants?: Json
          weight_grams?: number | null
          width_cm?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "products_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          assigned_warehouse_id: string | null
          avatar_url: string | null
          beauty_points: number | null
          created_at: string
          deleted_at: string | null
          email: string | null
          full_name: string | null
          id: string
          is_credit_customer: boolean
          loyalty_lifetime_points: number
          loyalty_tier: string
          phone: string | null
          phone_confirmed_at: string | null
          referral_code: string | null
          referred_by: string | null
          role: string | null
          signup_method: string | null
        }
        Insert: {
          assigned_warehouse_id?: string | null
          avatar_url?: string | null
          beauty_points?: number | null
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          full_name?: string | null
          id: string
          is_credit_customer?: boolean
          loyalty_lifetime_points?: number
          loyalty_tier?: string
          phone?: string | null
          phone_confirmed_at?: string | null
          referral_code?: string | null
          referred_by?: string | null
          role?: string | null
          signup_method?: string | null
        }
        Update: {
          assigned_warehouse_id?: string | null
          avatar_url?: string | null
          beauty_points?: number | null
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          is_credit_customer?: boolean
          loyalty_lifetime_points?: number
          loyalty_tier?: string
          phone?: string | null
          phone_confirmed_at?: string | null
          referral_code?: string | null
          referred_by?: string | null
          role?: string | null
          signup_method?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_assigned_warehouse_id_fkey"
            columns: ["assigned_warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_loyalty_tier_fkey"
            columns: ["loyalty_tier"]
            isOneToOne: false
            referencedRelation: "loyalty_tiers"
            referencedColumns: ["id"]
          },
        ]
      }
      promotion_bundle_items: {
        Row: {
          product_id: string
          promotion_id: string
          quantity: number
        }
        Insert: {
          product_id: string
          promotion_id: string
          quantity: number
        }
        Update: {
          product_id?: string
          promotion_id?: string
          quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "promotion_bundle_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promotion_bundle_items_promotion_id_fkey"
            columns: ["promotion_id"]
            isOneToOne: false
            referencedRelation: "promotions"
            referencedColumns: ["id"]
          },
        ]
      }
      promotions: {
        Row: {
          bundle_price: number | null
          buy_quantity: number | null
          created_at: string | null
          description: string | null
          discount_type: string | null
          discount_value: number | null
          end_date: string | null
          get_discount_percent: number | null
          get_quantity: number | null
          id: string
          max_applications_per_order: number | null
          promotion_type: string
          start_date: string
          target_brand_id: string | null
          target_category_id: string | null
          target_kind: string
          target_product_ids: string[]
          target_value: string | null
          tiers: Json | null
          title: string
        }
        Insert: {
          bundle_price?: number | null
          buy_quantity?: number | null
          created_at?: string | null
          description?: string | null
          discount_type?: string | null
          discount_value?: number | null
          end_date?: string | null
          get_discount_percent?: number | null
          get_quantity?: number | null
          id?: string
          max_applications_per_order?: number | null
          promotion_type?: string
          start_date?: string
          target_brand_id?: string | null
          target_category_id?: string | null
          target_kind?: string
          target_product_ids?: string[]
          target_value?: string | null
          tiers?: Json | null
          title: string
        }
        Update: {
          bundle_price?: number | null
          buy_quantity?: number | null
          created_at?: string | null
          description?: string | null
          discount_type?: string | null
          discount_value?: number | null
          end_date?: string | null
          get_discount_percent?: number | null
          get_quantity?: number | null
          id?: string
          max_applications_per_order?: number | null
          promotion_type?: string
          start_date?: string
          target_brand_id?: string | null
          target_category_id?: string | null
          target_kind?: string
          target_product_ids?: string[]
          target_value?: string | null
          tiers?: Json | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "promotions_target_brand_id_fkey"
            columns: ["target_brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promotions_target_category_id_fkey"
            columns: ["target_category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_invoice_attachments: {
        Row: {
          id: string
          invoice_id: string
          storage_path: string
          uploaded_at: string
          uploaded_by: string | null
        }
        Insert: {
          id?: string
          invoice_id: string
          storage_path: string
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Update: {
          id?: string
          invoice_id?: string
          storage_path?: string
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_invoice_attachments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "purchase_invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_invoice_items: {
        Row: {
          batch_number: string | null
          expiry_date: string | null
          id: string
          invoice_id: string
          landed_unit_cost: number | null
          line_no: number
          line_total: number | null
          product_id: string
          quantity: number
          unit_cost: number
          variant_id: string | null
          variant_name: string | null
        }
        Insert: {
          batch_number?: string | null
          expiry_date?: string | null
          id?: string
          invoice_id: string
          landed_unit_cost?: number | null
          line_no: number
          line_total?: number | null
          product_id: string
          quantity: number
          unit_cost: number
          variant_id?: string | null
          variant_name?: string | null
        }
        Update: {
          batch_number?: string | null
          expiry_date?: string | null
          id?: string
          invoice_id?: string
          landed_unit_cost?: number | null
          line_no?: number
          line_total?: number | null
          product_id?: string
          quantity?: number
          unit_cost?: number
          variant_id?: string | null
          variant_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "purchase_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_invoice_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_invoices: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          created_by: string | null
          discount_amount: number
          extra_costs: number
          id: string
          invoice_date: string
          invoice_number: string
          notes: string | null
          status: string
          subtotal: number
          supplier_id: string
          supplier_invoice_ref: string | null
          total: number | null
          updated_at: string
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
          warehouse_id: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          discount_amount?: number
          extra_costs?: number
          id?: string
          invoice_date: string
          invoice_number?: string
          notes?: string | null
          status?: string
          subtotal?: number
          supplier_id: string
          supplier_invoice_ref?: string | null
          total?: number | null
          updated_at?: string
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
          warehouse_id: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          discount_amount?: number
          extra_costs?: number
          id?: string
          invoice_date?: string
          invoice_number?: string
          notes?: string | null
          status?: string
          subtotal?: number
          supplier_id?: string
          supplier_invoice_ref?: string | null
          total?: number | null
          updated_at?: string
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_invoices_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_invoices_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
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
          provider: string | null
          provider_message_id: string | null
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
          provider?: string | null
          provider_message_id?: string | null
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
          provider?: string | null
          provider_message_id?: string | null
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
      staff_notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          kind: string
          read_at: string | null
          ref_id: string | null
          ref_type: string | null
          title: string
          user_id: string
          warehouse_id: string | null
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          kind: string
          read_at?: string | null
          ref_id?: string | null
          ref_type?: string | null
          title: string
          user_id: string
          warehouse_id?: string | null
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          kind?: string
          read_at?: string | null
          ref_id?: string | null
          ref_type?: string | null
          title?: string
          user_id?: string
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "staff_notifications_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
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
      supplier_return_items: {
        Row: {
          id: string
          product_id: string
          purchase_invoice_item_id: string | null
          quantity: number
          return_id: string
          unit_cost: number
          variant_id: string | null
        }
        Insert: {
          id?: string
          product_id: string
          purchase_invoice_item_id?: string | null
          quantity: number
          return_id: string
          unit_cost: number
          variant_id?: string | null
        }
        Update: {
          id?: string
          product_id?: string
          purchase_invoice_item_id?: string | null
          quantity?: number
          return_id?: string
          unit_cost?: number
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "supplier_return_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_return_items_purchase_invoice_item_id_fkey"
            columns: ["purchase_invoice_item_id"]
            isOneToOne: false
            referencedRelation: "purchase_invoice_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_return_items_return_id_fkey"
            columns: ["return_id"]
            isOneToOne: false
            referencedRelation: "supplier_returns"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_returns: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          created_by: string | null
          id: string
          is_void_reversal: boolean
          notes: string | null
          purchase_invoice_id: string | null
          reason: string
          return_number: string
          status: string
          supplier_id: string
          updated_at: string
          warehouse_id: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_void_reversal?: boolean
          notes?: string | null
          purchase_invoice_id?: string | null
          reason: string
          return_number?: string
          status?: string
          supplier_id: string
          updated_at?: string
          warehouse_id: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_void_reversal?: boolean
          notes?: string | null
          purchase_invoice_id?: string | null
          reason?: string
          return_number?: string
          status?: string
          supplier_id?: string
          updated_at?: string
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_returns_purchase_invoice_id_fkey"
            columns: ["purchase_invoice_id"]
            isOneToOne: false
            referencedRelation: "purchase_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_returns_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_returns_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          address: string | null
          created_at: string
          created_by: string | null
          email: string | null
          id: string
          is_active: boolean
          name: string
          notes: string | null
          phone: string | null
          tax_number: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          phone?: string | null
          tax_number?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          phone?: string | null
          tax_number?: string | null
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
      warehouse_manager_access: {
        Row: {
          granted_at: string
          granted_by: string | null
          is_primary: boolean
          user_id: string
          warehouse_id: string
        }
        Insert: {
          granted_at?: string
          granted_by?: string | null
          is_primary?: boolean
          user_id: string
          warehouse_id: string
        }
        Update: {
          granted_at?: string
          granted_by?: string | null
          is_primary?: boolean
          user_id?: string
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "warehouse_manager_access_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warehouse_manager_access_warehouse_id_fkey"
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
          base_dispatch_minutes: number
          city: string
          code: string
          created_at: string
          id: string
          is_active: boolean
          latitude: number | null
          longitude: number | null
          name: string
          phone: string | null
          state: string
        }
        Insert: {
          address?: string | null
          base_dispatch_minutes?: number
          city: string
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          latitude?: number | null
          longitude?: number | null
          name: string
          phone?: string | null
          state: string
        }
        Update: {
          address?: string | null
          base_dispatch_minutes?: number
          city?: string
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          latitude?: number | null
          longitude?: number | null
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
      account_deletion_preview: { Args: never; Returns: Json }
      add_purchase_invoice_attachment: {
        Args: { p_invoice_id: string; p_storage_path: string }
        Returns: string
      }
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
      admin_adjust_driver_cash: {
        Args: { p_amount: number; p_driver_id: string; p_note: string }
        Returns: string
      }
      admin_backdate_test_order: {
        Args: { p_created_at: string; p_order_id: string }
        Returns: undefined
      }
      admin_backdate_test_order_status: {
        Args: { p_created_at: string; p_order_id: string; p_status: string }
        Returns: undefined
      }
      admin_bulk_assign_category: {
        Args: { p_category_id: string; p_ids: string[] }
        Returns: number
      }
      admin_bulk_set_coupons_active: {
        Args: { p_ids: string[]; p_is_active: boolean }
        Returns: number
      }
      admin_bulk_set_products_active: {
        Args: { p_ids: string[]; p_is_active: boolean }
        Returns: number
      }
      admin_bulk_set_review_status: {
        Args: { p_ids: string[]; p_status: string }
        Returns: number
      }
      admin_business_report: {
        Args: { p_end?: string; p_start?: string }
        Returns: Json
      }
      admin_delete_brand: { Args: { p_id: string }; Returns: undefined }
      admin_delete_category: { Args: { p_id: string }; Returns: undefined }
      admin_delete_collection: { Args: { p_id: string }; Returns: undefined }
      admin_delete_coupon: { Args: { p_id: string }; Returns: undefined }
      admin_delete_promotion: { Args: { p_id: string }; Returns: undefined }
      admin_delete_test_orders: { Args: never; Returns: number }
      admin_delivery_failures: {
        Args: { p_hours?: number; p_limit?: number }
        Returns: {
          attempts: number
          channel: string
          created_at: string
          error_message: string
          order_number: string
          recipient: string
          reference: string
          source: string
          status: string
        }[]
      }
      admin_delivery_summary: { Args: { p_hours?: number }; Returns: Json }
      admin_end_promotion: { Args: { p_id: string }; Returns: undefined }
      admin_get_affiliate_details: {
        Args: { p_affiliate_id: string }
        Returns: Json
      }
      admin_get_affiliates: {
        Args: never
        Returns: {
          admin_note: string
          code: string
          commission_rate: number
          coupons_count: number
          created_at: string
          display_name: string
          email: string
          id: string
          minimum_payout: number
          payout_details: string
          payout_method: string
          pending_balance: number
          phone: string
          status: string
          total_commission_earned: number
          total_discount_given: number
          total_orders: number
          total_payouts_paid: number
          total_sales: number
        }[]
      }
      admin_get_audit_log: {
        Args: {
          p_from?: string
          p_limit?: number
          p_offset?: number
          p_row_id?: string
          p_table?: string
          p_to?: string
          p_user?: string
        }
        Returns: {
          action: string
          changed_at: string
          changed_by: string
          changed_by_name: string
          changed_columns: string[]
          id: number
          new_data: Json
          old_data: Json
          row_id: string
          table_name: string
          total_count: number
        }[]
      }
      admin_get_brands: {
        Args: never
        Returns: {
          id: string
          is_active: boolean
          logo_url: string
          name_ar: string
          name_en: string
          product_count: number
          slug: string
          sort_order: number
        }[]
      }
      admin_get_categories: {
        Args: never
        Returns: {
          icon: string
          id: string
          image_url: string
          is_active: boolean
          name_ar: string
          name_en: string
          parent_id: string
          product_count: number
          slug: string
          sort_order: number
        }[]
      }
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
          affiliate_id: string | null
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
      admin_get_drivers: {
        Args: never
        Returns: {
          company: string
          created_at: string
          id: string
          location_updated_at: string
          name: string
          phone: string
          status: string
          user_email: string
          user_id: string
          vehicle: string
          warehouse_id: string
        }[]
      }
      admin_get_fulfillment_review_orders: {
        Args: never
        Returns: {
          affiliate_code: string | null
          affiliate_id: string | null
          city: string | null
          cod_collected_at: string | null
          cod_collected_by: string | null
          coupon_code: string | null
          created_at: string
          customer_id: string | null
          customer_lat: number | null
          customer_lng: number | null
          customer_name: string | null
          delivery_proof_path: string | null
          discount_amount: number
          driver_id: string | null
          estimated_delivery_at: string | null
          financial_status: string | null
          fulfillment_warehouse_id: string | null
          handed_over_at: string | null
          id: string
          items: Json | null
          location_source: string
          needs_fulfillment_review: boolean
          notes: string | null
          order_number: string | null
          packed_at: string | null
          packed_by: string | null
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
          returned_received_by: string | null
          returned_to_warehouse_at: string | null
          shipping_address: string | null
          shipping_fee: number
          state: string | null
          status: string | null
          total: number | null
          viewed_at: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "orders"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      admin_get_promotions: {
        Args: never
        Returns: {
          bundle_items: Json
          bundle_price: number
          buy_quantity: number
          created_at: string
          description: string
          discount_type: string
          discount_value: number
          end_date: string
          get_discount_percent: number
          get_quantity: number
          id: string
          max_applications_per_order: number
          promotion_type: string
          start_date: string
          status: string
          target_brand_id: string
          target_category_id: string
          target_kind: string
          target_product_ids: string[]
          target_value: string
          tiers: Json
          title: string
        }[]
      }
      admin_link_driver_user: {
        Args: { p_driver_id: string; p_email: string }
        Returns: string
      }
      admin_list_order_returns: {
        Args: { p_limit?: number; p_offset?: number; p_search?: string }
        Returns: {
          admin_note: string
          city: string
          created_at: string
          customer_id: string
          customer_name: string
          customer_note: string
          id: string
          items: Json
          order_id: string
          order_number: string
          order_payment_method: string
          order_payment_status: string
          order_total: number
          phone: string
          reason: string
          refund_amount: number
          refund_reference: string
          refundable_cap: number
          refunded_at: string
          requested_resolution: string
          restocked_at: string
          returned_items_value: number
          reviewed_at: string
          state: string
          status: string
          total_count: number
          updated_at: string
        }[]
      }
      admin_list_warehouse_managers: {
        Args: never
        Returns: {
          email: string
          full_name: string
          phone: string
          primary_warehouse_id: string
          user_id: string
          warehouse_ids: string[]
        }[]
      }
      admin_profit_report: {
        Args: { p_end: string; p_start: string; p_warehouse_id?: string }
        Returns: Json
      }
      admin_record_affiliate_payout: {
        Args: {
          p_affiliate_id: string
          p_amount: number
          p_notes?: string
          p_payout_method: string
          p_reference_number?: string
        }
        Returns: string
      }
      admin_release_eligible_commissions: {
        Args: { p_affiliate_id?: string }
        Returns: number
      }
      admin_reorder_brands: { Args: { p_ids: string[] }; Returns: undefined }
      admin_reorder_categories: {
        Args: { p_ids: string[] }
        Returns: undefined
      }
      admin_resolve_fulfillment_review: {
        Args: { p_order_id: string }
        Returns: undefined
      }
      admin_run_stale_order_sweep: { Args: never; Returns: number }
      admin_save_affiliate: {
        Args: {
          p_admin_note?: string
          p_commission_rate?: number
          p_display_name?: string
          p_email?: string
          p_id?: string
          p_minimum_payout?: number
          p_payout_details?: string
          p_payout_method?: string
          p_phone?: string
          p_status?: string
        }
        Returns: string
      }
      admin_save_brand: {
        Args: {
          p_id?: string
          p_is_active?: boolean
          p_logo_url?: string
          p_name_ar: string
          p_name_en?: string
          p_slug?: string
          p_sort_order?: number
        }
        Returns: string
      }
      admin_save_category: {
        Args: {
          p_icon?: string
          p_id?: string
          p_image_url?: string
          p_is_active?: boolean
          p_name_ar: string
          p_name_en?: string
          p_parent_id?: string
          p_slug?: string
          p_sort_order?: number
        }
        Returns: string
      }
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
          p_affiliate_id?: string
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
          p_bundle_items?: Json
          p_bundle_price?: number
          p_buy_quantity?: number
          p_description?: string
          p_discount_type: string
          p_discount_value: number
          p_end_date?: string
          p_get_discount_percent?: number
          p_get_quantity?: number
          p_id?: string
          p_max_applications_per_order?: number
          p_promotion_type?: string
          p_start_date?: string
          p_target_brand_id?: string
          p_target_category_id?: string
          p_target_kind: string
          p_target_product_ids?: string[]
          p_target_value?: string
          p_tiers?: Json
          p_title: string
        }
        Returns: string
      }
      admin_set_accountant: {
        Args: { p_is_accountant: boolean; p_user_id: string }
        Returns: undefined
      }
      admin_set_collection_products: {
        Args: { p_collection_id: string; p_product_ids: string[] }
        Returns: undefined
      }
      admin_set_warehouse_manager_access: {
        Args: {
          p_primary_warehouse_id?: string
          p_user_id: string
          p_warehouse_ids: string[]
        }
        Returns: undefined
      }
      admin_set_warehouse_supervisor: {
        Args: { p_user_id: string; p_warehouse_id: string }
        Returns: undefined
      }
      admin_unlink_driver_user: {
        Args: { p_driver_id: string }
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
      admin_verify_payment_and_advance: {
        Args: {
          p_allow_duplicate_reference?: boolean
          p_expected_status: string
          p_proof_id: string
          p_review_note?: string
          p_target_status?: string
        }
        Returns: undefined
      }
      approve_purchase_invoice: {
        Args: { p_invoice_id: string }
        Returns: undefined
      }
      approve_supplier_return: {
        Args: { p_return_id: string }
        Returns: undefined
      }
      business_date: { Args: { p_ts: string }; Returns: string }
      calculate_delivery_quote:
        | {
            Args: {
              p_delivery_zone_id: string
              p_order_weight?: number
              p_warehouse_id: string
            }
            Returns: {
              eta_minutes: number
              fee: number
              source: string
            }[]
          }
        | {
            Args: {
              p_customer_lat: number
              p_customer_lng: number
              p_delivery_zone_id: string
              p_order_weight: number
              p_warehouse_id: string
            }
            Returns: {
              eta_minutes: number
              fee: number
              source: string
            }[]
          }
        | {
            Args: {
              p_customer_lat: number
              p_customer_lng: number
              p_order_weight_grams?: number
              p_warehouse_ids: string[]
            }
            Returns: {
              distance_km: number
              eta_minutes: number
              fee: number
              source: string
              warehouses_count: number
            }[]
          }
      can_manage_warehouse: {
        Args: { p_warehouse_id: string }
        Returns: boolean
      }
      cancel_stale_orders: { Args: { p_max_age?: string }; Returns: number }
      cancel_supplier_return: {
        Args: { p_reason: string; p_return_id: string }
        Returns: undefined
      }
      checkout_order:
        | {
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
        | {
            Args: {
              p_city: string
              p_coupon_code: string
              p_customer_lat: number
              p_customer_lng: number
              p_customer_name: string
              p_items: Json
              p_payment_method: string
              p_phone: string
              p_points_to_redeem: number
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
          p_customer_lat?: number
          p_customer_lng?: number
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
          distance_km: number
          order_id: string
          order_number: string
          points_discount: number
          shipping_fee: number
          total: number
          warehouses_count: number
        }[]
      }
      checkout_order_with_growth: {
        Args: {
          p_affiliate_code?: string
          p_city: string
          p_coupon_code?: string
          p_customer_lat?: number
          p_customer_lng?: number
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
      cod_receipt_order_id: { Args: { p_object_name: string }; Returns: string }
      confirm_cod_payment: { Args: { p_order_id: string }; Returns: undefined }
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
      customer_issue_delivery_code: {
        Args: { p_order_id: string }
        Returns: string
      }
      deactivate_push_token: { Args: { p_token: string }; Returns: boolean }
      delete_my_account: { Args: never; Returns: Json }
      delivery_proof_order_id: {
        Args: { p_object_name: string }
        Returns: string
      }
      dispatch_email_queue: { Args: never; Returns: undefined }
      dispatch_whatsapp_queue: { Args: never; Returns: undefined }
      driver_outstanding_cod: { Args: { p_driver_id: string }; Returns: number }
      driver_set_pickup_check: {
        Args: { p_checked_qty: number; p_line_no: number; p_order_id: string }
        Returns: undefined
      }
      driver_submit_cash_remittance: {
        Args: { p_amount: number; p_notes?: string }
        Returns: string
      }
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
      evaluate_cart_promotions: {
        Args: { p_lines: Json }
        Returns: {
          line_index: number
          promotion_id: string
          reduction: number
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
      generate_delivery_code: { Args: never; Returns: string }
      get_active_promotions: {
        Args: never
        Returns: {
          bundle_items: Json
          bundle_price: number
          buy_quantity: number
          description: string
          discount_type: string
          discount_value: number
          end_date: string
          get_discount_percent: number
          get_quantity: number
          id: string
          product_ids: string[]
          promotion_type: string
          start_date: string
          target_kind: string
          target_value: string
          tiers: Json
          title: string
        }[]
      }
      get_admin_product: {
        Args: { p_product_id: string }
        Returns: {
          average_cost: number | null
          average_cost_updated_at: string | null
          average_rating: number | null
          benefits: string[] | null
          brand: string | null
          brand_id: string | null
          category: string | null
          category_id: string | null
          cost_price: number | null
          created_at: string
          description: string | null
          discount_percentage: number | null
          expiry: string | null
          height_cm: number | null
          id: string
          image: string | null
          images: string[] | null
          ingredients: string[] | null
          is_active: boolean
          is_imported: boolean | null
          length_cm: number | null
          name_ar: string | null
          name_en: string | null
          origin: string | null
          price: number | null
          reviews_count: number | null
          skin_type: string[] | null
          stock: number | null
          usage: string | null
          variants: Json
          weight_grams: number | null
          width_cm: number | null
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
        Args: { p_limit?: number; p_offset?: number; p_search?: string }
        Returns: {
          average_cost: number
          average_cost_updated_at: string
          average_rating: number
          benefits: string[]
          brand: string
          brand_id: string
          category: string
          category_id: string
          cost_price: number
          created_at: string
          description: string
          discount_percentage: number
          expiry: string
          height_cm: number
          id: string
          image: string
          images: string[]
          ingredients: string[]
          is_active: boolean
          is_imported: boolean
          length_cm: number
          name_ar: string
          name_en: string
          origin: string
          price: number
          reviews_count: number
          skin_type: string[]
          stock: number
          total_count: number
          usage: string
          variants: Json
          weight_grams: number
          width_cm: number
        }[]
      }
      get_auth_settings: { Args: never; Returns: Json }
      get_my_cash_position: {
        Args: { p_business_date?: string }
        Returns: Json
      }
      get_my_deliveries: {
        Args: { p_order_id?: string }
        Returns: {
          city: string
          cod_amount: number
          cod_collected: boolean
          created_at: string
          customer_lat: number
          customer_lng: number
          customer_name: string
          estimated_delivery_at: string
          id: string
          item_count: number
          items: Json
          notes: string
          order_number: string
          payment_method: string
          phone: string
          shipping_address: string
          staff_note: string
          state: string
          status: string
          status_changed_at: string
          warehouse_name: string
        }[]
      }
      get_my_delivery: {
        Args: { p_order_id: string }
        Returns: {
          accuracy_meters: number
          driver_name: string
          driver_phone: string
          latitude: number
          location_updated_at: string
          longitude: number
        }[]
      }
      get_my_driver_summary: {
        Args: { p_from: string; p_to: string }
        Returns: Json
      }
      get_my_staff_context: { Args: never; Returns: Json }
      get_otp_settings: { Args: never; Returns: Json }
      get_public_brands: {
        Args: never
        Returns: {
          id: string
          logo_url: string
          name_ar: string
          name_en: string
          product_count: number
          slug: string
          sort_order: number
        }[]
      }
      get_public_categories: {
        Args: never
        Returns: {
          icon: string
          id: string
          image_url: string
          name_ar: string
          name_en: string
          parent_id: string
          product_count: number
          slug: string
          sort_order: number
        }[]
      }
      get_public_product: {
        Args: { p_product_id: string }
        Returns: {
          average_rating: number
          benefits: string[]
          brand: string
          brand_id: string
          category: string
          category_id: string
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
        Args: { p_limit?: number; p_offset?: number; p_product_id: string }
        Returns: {
          comment: string
          created_at: string
          id: string
          image_paths: string[]
          rating: number
          reviewer_label: string
          total_count: number
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
          brand_id: string
          category: string
          category_id: string
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
      get_warehouse_settlement_summary: {
        Args: { p_end?: string; p_start?: string; p_warehouse_id?: string }
        Returns: Json
      }
      has_verified_contact: { Args: { p_user_id?: string }; Returns: boolean }
      haversine_km: {
        Args: { p_lat1: number; p_lat2: number; p_lng1: number; p_lng2: number }
        Returns: number
      }
      internal_admin_update_order_operation: {
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
      internal_review_payment_proof: {
        Args: { p_proof_id: string; p_review_note: string; p_status: string }
        Returns: string
      }
      is_accountant: { Args: never; Returns: boolean }
      is_admin: { Args: never; Returns: boolean }
      is_assigned_driver: { Args: { p_order_id: string }; Returns: boolean }
      is_driver: { Args: never; Returns: boolean }
      is_warehouse_manager: { Args: never; Returns: boolean }
      is_warehouse_supervisor: { Args: never; Returns: boolean }
      log_otp_delivery: {
        Args: {
          p_attempt?: number
          p_channel: string
          p_error?: string
          p_phone: string
          p_provider: string
          p_provider_message_id?: string
          p_status: string
        }
        Returns: string
      }
      mark_all_notifications_read: { Args: never; Returns: number }
      mark_notification_read: { Args: { p_id: string }; Returns: undefined }
      mark_order_viewed: { Args: { p_order_id: string }; Returns: undefined }
      mark_staff_notifications_read: {
        Args: { p_ids: string[] }
        Returns: undefined
      }
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
      my_warehouse_id: { Args: never; Returns: string }
      my_warehouse_ids: { Args: never; Returns: string[] }
      normalize_sd_phone: { Args: { p_phone: string }; Returns: string }
      notify_restock_subscribers: {
        Args: { p_product_id: string }
        Returns: undefined
      }
      order_line_quantity: {
        Args: { p_items: Json; p_line_no: number }
        Returns: number
      }
      order_return_refund_caps: {
        Args: { p_items: Json; p_order_id: string; p_return_id: string }
        Returns: {
          items_value: number
          refund_cap: number
          shipping_part: number
        }[]
      }
      preview_cart_pricing: {
        Args: { p_coupon_code?: string; p_items: Json }
        Returns: Json
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
      preview_delivery_quote: {
        Args: {
          p_city?: string
          p_customer_lat?: number
          p_customer_lng?: number
          p_items: Json
          p_state?: string
        }
        Returns: {
          distance_km: number
          eta_minutes: number
          fee: number
          source: string
          warehouses_count: number
        }[]
      }
      price_cart_lines: {
        Args: { p_items: Json }
        Returns: {
          base_subtotal: number
          line_reductions: number
          lines: Json
        }[]
      }
      product_variant: {
        Args: { p_variant_id: string; p_variants: Json }
        Returns: Json
      }
      promotion_matches_product: {
        Args: { p_product_id: string; p_promotion_id: string }
        Returns: boolean
      }
      promotion_status: {
        Args: { p_end_date: string; p_start_date: string }
        Returns: string
      }
      promotion_tiers_valid: { Args: { p_tiers: Json }; Returns: boolean }
      prune_otp_attempts: { Args: never; Returns: number }
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
      purchase_apply_supplier_return: {
        Args: { p_return_id: string }
        Returns: undefined
      }
      purchase_attachment_warehouse_id: {
        Args: { p_object_name: string }
        Returns: string
      }
      record_otp_attempt: {
        Args: { p_ip?: string; p_phone: string }
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
      register_push_token: {
        Args: {
          p_app_audience?: string
          p_device_name?: string
          p_platform: string
          p_provider: string
          p_token: string
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
      resolve_delivery_zone: {
        Args: { p_city: string; p_state: string }
        Returns: {
          zone_fee: number
          zone_id: string
          zone_latitude: number
          zone_longitude: number
        }[]
      }
      resolve_fulfillment_warehouses: {
        Args: {
          p_customer_lat?: number
          p_customer_lng?: number
          p_items: Json
        }
        Returns: {
          strategy: string
          warehouse_ids: string[]
        }[]
      }
      review_affiliate_commission: {
        Args: { p_commission_id: string; p_note?: string; p_status: string }
        Returns: string
      }
      review_order_return: {
        Args: {
          p_admin_note?: string
          p_refund_amount?: number
          p_refund_reference?: string
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
      save_purchase_invoice_draft: {
        Args: {
          p_discount_amount?: number
          p_extra_costs?: number
          p_id?: string
          p_invoice_date: string
          p_items: Json
          p_notes?: string
          p_supplier_id: string
          p_supplier_invoice_ref?: string
          p_warehouse_id: string
        }
        Returns: string
      }
      save_supplier_return_draft: {
        Args: {
          p_id?: string
          p_items: Json
          p_notes?: string
          p_purchase_invoice_id?: string
          p_reason: string
          p_supplier_id: string
          p_warehouse_id: string
        }
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
      staff_confirm_failed_delivery_return: {
        Args: { p_note?: string; p_order_id: string }
        Returns: undefined
      }
      staff_get_driver_locations: {
        Args: { p_warehouse_id?: string }
        Returns: {
          accuracy_meters: number
          active_order_numbers: string[]
          driver_id: string
          latitude: number
          longitude: number
          name: string
          status: string
          updated_at: string
        }[]
      }
      staff_get_fulfillment_breakdown: {
        Args: { p_order_id: string }
        Returns: {
          available: number
          is_fulfillment_warehouse: boolean
          line_no: number
          name_ar: string
          product_id: string
          quantity: number
          warehouse_id: string
          warehouse_name: string
        }[]
      }
      staff_get_item_checks: {
        Args: { p_order_id: string }
        Returns: {
          checked_at: string
          checked_qty: number
          line_no: number
          stage: string
        }[]
      }
      staff_get_orders_needing_action: {
        Args: { p_warehouse_id?: string }
        Returns: {
          order_id: string
          order_number: string
          reason: string
          since: string
          status: string
          warehouse_id: string
        }[]
      }
      staff_mark_packed: { Args: { p_order_id: string }; Returns: undefined }
      staff_notification_recipients: {
        Args: { p_warehouse_id: string }
        Returns: string[]
      }
      staff_override_delivery_code: {
        Args: { p_order_id: string; p_reason: string }
        Returns: undefined
      }
      staff_save_supplier: {
        Args: {
          p_address?: string
          p_email?: string
          p_id?: string
          p_is_active?: boolean
          p_name: string
          p_notes?: string
          p_phone?: string
          p_tax_number?: string
        }
        Returns: string
      }
      staff_search_products: {
        Args: { p_limit?: number; p_query?: string }
        Returns: {
          brand: string
          id: string
          image: string
          is_active: boolean
          name_ar: string
          variants: Json
        }[]
      }
      staff_set_item_check: {
        Args: { p_checked_qty: number; p_line_no: number; p_order_id: string }
        Returns: undefined
      }
      staff_set_order_eta: {
        Args: {
          p_estimated_delivery_at: string
          p_note?: string
          p_order_id: string
        }
        Returns: undefined
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
          customer_id: string | null
          display_name: string
          email: string | null
          id: string
          minimum_payout: number
          payout_details: string | null
          payout_method: string | null
          phone: string | null
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
      supervisor_assign_driver: {
        Args: { p_driver_id: string; p_order_id: string }
        Returns: undefined
      }
      supervisor_confirm_cash_remittance: {
        Args: { p_action?: string; p_notes?: string; p_remittance_id: string }
        Returns: string
      }
      supervisor_get_warehouse_drivers: {
        Args: { p_warehouse_id?: string }
        Returns: {
          active_deliveries: number
          id: string
          name: string
          phone: string
          status: string
        }[]
      }
      supervisor_update_order: {
        Args: {
          p_expected_status?: string
          p_notes?: string
          p_order_id: string
          p_status?: string
        }
        Returns: undefined
      }
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
          p_delivery_code?: string
          p_failure_reason?: string
          p_note?: string
          p_order_id: string
          p_payment_type?: string
          p_proof_path?: string
          p_receipt_path?: string
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
      void_purchase_invoice: {
        Args: { p_invoice_id: string; p_reason: string }
        Returns: undefined
      }
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
