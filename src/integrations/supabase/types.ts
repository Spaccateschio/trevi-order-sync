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
      address_functions: {
        Row: {
          address_id: string
          company_id: string | null
          created_at: string
          customer_record_id: string | null
          function: Database["public"]["Enums"]["address_function"]
          id: string
          is_default: boolean
        }
        Insert: {
          address_id: string
          company_id?: string | null
          created_at?: string
          customer_record_id?: string | null
          function: Database["public"]["Enums"]["address_function"]
          id?: string
          is_default?: boolean
        }
        Update: {
          address_id?: string
          company_id?: string | null
          created_at?: string
          customer_record_id?: string | null
          function?: Database["public"]["Enums"]["address_function"]
          id?: string
          is_default?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "address_functions_address_id_fkey"
            columns: ["address_id"]
            isOneToOne: false
            referencedRelation: "addresses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "address_functions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "address_functions_customer_record_id_fkey"
            columns: ["customer_record_id"]
            isOneToOne: false
            referencedRelation: "customer_records"
            referencedColumns: ["id"]
          },
        ]
      }
      addresses: {
        Row: {
          address_line: string | null
          city: string | null
          company_id: string | null
          contact_name: string | null
          country: string
          created_at: string
          created_by: string | null
          customer_record_id: string | null
          id: string
          label: string
          notes: string | null
          phone: string | null
          postal_code: string | null
          province: string | null
          status: Database["public"]["Enums"]["entity_status"]
          street_number: string | null
          updated_at: string
          visible_to_partners: boolean
        }
        Insert: {
          address_line?: string | null
          city?: string | null
          company_id?: string | null
          contact_name?: string | null
          country?: string
          created_at?: string
          created_by?: string | null
          customer_record_id?: string | null
          id?: string
          label: string
          notes?: string | null
          phone?: string | null
          postal_code?: string | null
          province?: string | null
          status?: Database["public"]["Enums"]["entity_status"]
          street_number?: string | null
          updated_at?: string
          visible_to_partners?: boolean
        }
        Update: {
          address_line?: string | null
          city?: string | null
          company_id?: string | null
          contact_name?: string | null
          country?: string
          created_at?: string
          created_by?: string | null
          customer_record_id?: string | null
          id?: string
          label?: string
          notes?: string | null
          phone?: string | null
          postal_code?: string | null
          province?: string | null
          status?: Database["public"]["Enums"]["entity_status"]
          street_number?: string | null
          updated_at?: string
          visible_to_partners?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "addresses_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "addresses_customer_record_id_fkey"
            columns: ["customer_record_id"]
            isOneToOne: false
            referencedRelation: "customer_records"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_events: {
        Row: {
          action: string
          actor_user_id: string | null
          company_id: string | null
          created_at: string
          detail: Json | null
          entity_id: string | null
          entity_type: string
          id: string
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          company_id?: string | null
          created_at?: string
          detail?: Json | null
          entity_id?: string | null
          entity_type: string
          id?: string
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          company_id?: string | null
          created_at?: string
          detail?: Json | null
          entity_id?: string | null
          entity_type?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      buyer_product_favorites: {
        Row: {
          buyer_company_id: string
          created_at: string
          created_by: string | null
          id: string
          product_id: string
          seller_company_id: string
        }
        Insert: {
          buyer_company_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          product_id: string
          seller_company_id: string
        }
        Update: {
          buyer_company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          product_id?: string
          seller_company_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "buyer_product_favorites_buyer_company_id_fkey"
            columns: ["buyer_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "buyer_product_favorites_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "buyer_product_favorites_seller_company_id_fkey"
            columns: ["seller_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          address_line: string | null
          brand_primary_color: string | null
          brand_secondary_color: string | null
          can_buy: boolean
          can_sell: boolean
          city: string | null
          country: string
          created_at: string
          created_by: string | null
          delivery_address_line: string | null
          delivery_city: string | null
          delivery_notes: string | null
          delivery_postal_code: string | null
          delivery_province: string | null
          email: string | null
          id: string
          legal_name: string
          logo_url: string | null
          phone: string | null
          postal_code: string | null
          province: string | null
          status: Database["public"]["Enums"]["entity_status"]
          tax_code: string | null
          updated_at: string
          vat_normalized: string | null
          vat_number: string | null
        }
        Insert: {
          address_line?: string | null
          brand_primary_color?: string | null
          brand_secondary_color?: string | null
          can_buy?: boolean
          can_sell?: boolean
          city?: string | null
          country?: string
          created_at?: string
          created_by?: string | null
          delivery_address_line?: string | null
          delivery_city?: string | null
          delivery_notes?: string | null
          delivery_postal_code?: string | null
          delivery_province?: string | null
          email?: string | null
          id?: string
          legal_name: string
          logo_url?: string | null
          phone?: string | null
          postal_code?: string | null
          province?: string | null
          status?: Database["public"]["Enums"]["entity_status"]
          tax_code?: string | null
          updated_at?: string
          vat_normalized?: string | null
          vat_number?: string | null
        }
        Update: {
          address_line?: string | null
          brand_primary_color?: string | null
          brand_secondary_color?: string | null
          can_buy?: boolean
          can_sell?: boolean
          city?: string | null
          country?: string
          created_at?: string
          created_by?: string | null
          delivery_address_line?: string | null
          delivery_city?: string | null
          delivery_notes?: string | null
          delivery_postal_code?: string | null
          delivery_province?: string | null
          email?: string | null
          id?: string
          legal_name?: string
          logo_url?: string | null
          phone?: string | null
          postal_code?: string | null
          province?: string | null
          status?: Database["public"]["Enums"]["entity_status"]
          tax_code?: string | null
          updated_at?: string
          vat_normalized?: string | null
          vat_number?: string | null
        }
        Relationships: []
      }
      company_invitations: {
        Row: {
          created_at: string
          customer_record_id: string | null
          decided_at: string | null
          email: string | null
          email_normalized: string | null
          expires_at: string
          id: string
          invite_code: string | null
          invited_by: string | null
          is_free_invite: boolean
          price_list_number: number | null
          relation_id: string | null
          resend_count: number
          seller_company_id: string
          sent_at: string
          status: Database["public"]["Enums"]["invitation_status"]
          token_hash: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          customer_record_id?: string | null
          decided_at?: string | null
          email?: string | null
          email_normalized?: string | null
          expires_at: string
          id?: string
          invite_code?: string | null
          invited_by?: string | null
          is_free_invite?: boolean
          price_list_number?: number | null
          relation_id?: string | null
          resend_count?: number
          seller_company_id: string
          sent_at?: string
          status?: Database["public"]["Enums"]["invitation_status"]
          token_hash: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          customer_record_id?: string | null
          decided_at?: string | null
          email?: string | null
          email_normalized?: string | null
          expires_at?: string
          id?: string
          invite_code?: string | null
          invited_by?: string | null
          is_free_invite?: boolean
          price_list_number?: number | null
          relation_id?: string | null
          resend_count?: number
          seller_company_id?: string
          sent_at?: string
          status?: Database["public"]["Enums"]["invitation_status"]
          token_hash?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_invitations_customer_record_id_fkey"
            columns: ["customer_record_id"]
            isOneToOne: false
            referencedRelation: "customer_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_invitations_relation_id_fkey"
            columns: ["relation_id"]
            isOneToOne: false
            referencedRelation: "supplier_customer_relations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_invitations_seller_company_id_fkey"
            columns: ["seller_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      company_member_roles: {
        Row: {
          company_id: string
          created_at: string
          id: string
          member_id: string
          role: Database["public"]["Enums"]["app_role"]
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          member_id: string
          role: Database["public"]["Enums"]["app_role"]
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          member_id?: string
          role?: Database["public"]["Enums"]["app_role"]
        }
        Relationships: [
          {
            foreignKeyName: "company_member_roles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_member_roles_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "company_members"
            referencedColumns: ["id"]
          },
        ]
      }
      company_members: {
        Row: {
          company_id: string
          created_at: string
          id: string
          invited_by: string | null
          status: Database["public"]["Enums"]["entity_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          invited_by?: string | null
          status?: Database["public"]["Enums"]["entity_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          invited_by?: string | null
          status?: Database["public"]["Enums"]["entity_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_members_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      company_settings: {
        Row: {
          company_id: string
          created_at: string
          default_price_list_number: number | null
          display_name: string
          notes: string | null
          timezone: string
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          default_price_list_number?: number | null
          display_name: string
          notes?: string | null
          timezone?: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          default_price_list_number?: number | null
          display_name?: string
          notes?: string | null
          timezone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_settings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_destinations: {
        Row: {
          address_id: string | null
          contact_name: string | null
          created_at: string
          created_by: string | null
          customer_record_id: string
          danea_reference: string | null
          id: string
          internal_code: string | null
          is_default: boolean
          label: string
          notes: string | null
          phone: string | null
          seller_company_id: string
          separate_documents: boolean
          status: Database["public"]["Enums"]["entity_status"]
          updated_at: string
        }
        Insert: {
          address_id?: string | null
          contact_name?: string | null
          created_at?: string
          created_by?: string | null
          customer_record_id: string
          danea_reference?: string | null
          id?: string
          internal_code?: string | null
          is_default?: boolean
          label: string
          notes?: string | null
          phone?: string | null
          seller_company_id: string
          separate_documents?: boolean
          status?: Database["public"]["Enums"]["entity_status"]
          updated_at?: string
        }
        Update: {
          address_id?: string | null
          contact_name?: string | null
          created_at?: string
          created_by?: string | null
          customer_record_id?: string
          danea_reference?: string | null
          id?: string
          internal_code?: string | null
          is_default?: boolean
          label?: string
          notes?: string | null
          phone?: string | null
          seller_company_id?: string
          separate_documents?: boolean
          status?: Database["public"]["Enums"]["entity_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_destinations_address_id_fkey"
            columns: ["address_id"]
            isOneToOne: false
            referencedRelation: "addresses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_destinations_customer_record_id_fkey"
            columns: ["customer_record_id"]
            isOneToOne: false
            referencedRelation: "customer_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_destinations_seller_company_id_fkey"
            columns: ["seller_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_product_unit_preferences: {
        Row: {
          buyer_company_id: string
          created_at: string
          created_by: string | null
          id: string
          product_id: string
          product_sale_unit_id: string
          seller_company_id: string
          updated_at: string
        }
        Insert: {
          buyer_company_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          product_id: string
          product_sale_unit_id: string
          seller_company_id: string
          updated_at?: string
        }
        Update: {
          buyer_company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          product_id?: string
          product_sale_unit_id?: string
          seller_company_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_product_unit_preferences_buyer_company_id_fkey"
            columns: ["buyer_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_product_unit_preferences_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_product_unit_preferences_product_sale_unit_id_fkey"
            columns: ["product_sale_unit_id"]
            isOneToOne: false
            referencedRelation: "product_sale_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_product_unit_preferences_seller_company_id_fkey"
            columns: ["seller_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_record_proposed_updates: {
        Row: {
          created_at: string
          current_value: string | null
          customer_record_id: string
          decided_at: string | null
          decided_by: string | null
          field_name: string
          id: string
          proposed_by: string | null
          proposed_value: string | null
          seller_company_id: string
          source: string
          status: Database["public"]["Enums"]["proposed_update_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          current_value?: string | null
          customer_record_id: string
          decided_at?: string | null
          decided_by?: string | null
          field_name: string
          id?: string
          proposed_by?: string | null
          proposed_value?: string | null
          seller_company_id: string
          source?: string
          status?: Database["public"]["Enums"]["proposed_update_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          current_value?: string | null
          customer_record_id?: string
          decided_at?: string | null
          decided_by?: string | null
          field_name?: string
          id?: string
          proposed_by?: string | null
          proposed_value?: string | null
          seller_company_id?: string
          source?: string
          status?: Database["public"]["Enums"]["proposed_update_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_record_proposed_updates_customer_record_id_fkey"
            columns: ["customer_record_id"]
            isOneToOne: false
            referencedRelation: "customer_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_record_proposed_updates_seller_company_id_fkey"
            columns: ["seller_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_records: {
        Row: {
          address_line: string | null
          agent: string | null
          archive_id: string | null
          assigned_price_list_number: number | null
          bank: string | null
          city: string | null
          contact_name: string | null
          country: string | null
          created_at: string
          created_by: string | null
          credit_limit: string | null
          danea_extra: Json | null
          delivery_address_line: string | null
          delivery_city: string | null
          delivery_notes: string | null
          delivery_postal_code: string | null
          delivery_province: string | null
          discounts: string | null
          email: string | null
          fax: string | null
          id: string
          internal_reference: string | null
          legal_name: string
          notes: string | null
          our_bank: string | null
          payment_terms: string | null
          pec: string | null
          phone: string | null
          postal_code: string | null
          province: string | null
          region: string | null
          sdi_admin_reference: string | null
          sdi_code: string | null
          seller_company_id: string
          status: Database["public"]["Enums"]["entity_status"]
          tax_code: string | null
          updated_at: string
          vat_normalized: string | null
          vat_number: string | null
        }
        Insert: {
          address_line?: string | null
          agent?: string | null
          archive_id?: string | null
          assigned_price_list_number?: number | null
          bank?: string | null
          city?: string | null
          contact_name?: string | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          credit_limit?: string | null
          danea_extra?: Json | null
          delivery_address_line?: string | null
          delivery_city?: string | null
          delivery_notes?: string | null
          delivery_postal_code?: string | null
          delivery_province?: string | null
          discounts?: string | null
          email?: string | null
          fax?: string | null
          id?: string
          internal_reference?: string | null
          legal_name: string
          notes?: string | null
          our_bank?: string | null
          payment_terms?: string | null
          pec?: string | null
          phone?: string | null
          postal_code?: string | null
          province?: string | null
          region?: string | null
          sdi_admin_reference?: string | null
          sdi_code?: string | null
          seller_company_id: string
          status?: Database["public"]["Enums"]["entity_status"]
          tax_code?: string | null
          updated_at?: string
          vat_normalized?: string | null
          vat_number?: string | null
        }
        Update: {
          address_line?: string | null
          agent?: string | null
          archive_id?: string | null
          assigned_price_list_number?: number | null
          bank?: string | null
          city?: string | null
          contact_name?: string | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          credit_limit?: string | null
          danea_extra?: Json | null
          delivery_address_line?: string | null
          delivery_city?: string | null
          delivery_notes?: string | null
          delivery_postal_code?: string | null
          delivery_province?: string | null
          discounts?: string | null
          email?: string | null
          fax?: string | null
          id?: string
          internal_reference?: string | null
          legal_name?: string
          notes?: string | null
          our_bank?: string | null
          payment_terms?: string | null
          pec?: string | null
          phone?: string | null
          postal_code?: string | null
          province?: string | null
          region?: string | null
          sdi_admin_reference?: string | null
          sdi_code?: string | null
          seller_company_id?: string
          status?: Database["public"]["Enums"]["entity_status"]
          tax_code?: string | null
          updated_at?: string
          vat_normalized?: string | null
          vat_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_records_archive_id_fkey"
            columns: ["archive_id"]
            isOneToOne: false
            referencedRelation: "danea_archives"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_records_seller_company_id_fkey"
            columns: ["seller_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      danea_archives: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          id: string
          is_default: boolean
          name: string
          notes: string | null
          status: Database["public"]["Enums"]["entity_status"]
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_default?: boolean
          name: string
          notes?: string | null
          status?: Database["public"]["Enums"]["entity_status"]
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_default?: boolean
          name?: string
          notes?: string | null
          status?: Database["public"]["Enums"]["entity_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "danea_archives_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      danea_auth_failures: {
        Row: {
          attempted_username: string | null
          created_at: string
          id: string
          reason: string
          remote_hint: string | null
        }
        Insert: {
          attempted_username?: string | null
          created_at?: string
          id?: string
          reason: string
          remote_hint?: string | null
        }
        Update: {
          attempted_username?: string | null
          created_at?: string
          id?: string
          reason?: string
          remote_hint?: string | null
        }
        Relationships: []
      }
      danea_price_lists: {
        Row: {
          archive_id: string
          company_id: string
          created_at: string
          danea_name: string | null
          display_name: string | null
          id: string
          is_active: boolean
          list_number: number
          updated_at: string
        }
        Insert: {
          archive_id: string
          company_id: string
          created_at?: string
          danea_name?: string | null
          display_name?: string | null
          id?: string
          is_active?: boolean
          list_number: number
          updated_at?: string
        }
        Update: {
          archive_id?: string
          company_id?: string
          created_at?: string
          danea_name?: string | null
          display_name?: string | null
          id?: string
          is_active?: boolean
          list_number?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "danea_price_lists_archive_id_fkey"
            columns: ["archive_id"]
            isOneToOne: false
            referencedRelation: "danea_archives"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "danea_price_lists_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      danea_stations: {
        Row: {
          allowed_uses: string[]
          archive_id: string
          company_id: string
          created_at: string
          created_by: string | null
          detected_app_version: string | null
          detected_creator: string | null
          detected_default_price: number | null
          detected_image_folder: string | null
          detected_warehouse: string | null
          id: string
          last_auth_at: string | null
          last_auth_outcome: string | null
          last_success_at: string | null
          name: string
          password_hash: string
          password_salt: string
          status: Database["public"]["Enums"]["danea_connection_status"]
          updated_at: string
          username: string
        }
        Insert: {
          allowed_uses?: string[]
          archive_id: string
          company_id: string
          created_at?: string
          created_by?: string | null
          detected_app_version?: string | null
          detected_creator?: string | null
          detected_default_price?: number | null
          detected_image_folder?: string | null
          detected_warehouse?: string | null
          id?: string
          last_auth_at?: string | null
          last_auth_outcome?: string | null
          last_success_at?: string | null
          name: string
          password_hash: string
          password_salt: string
          status?: Database["public"]["Enums"]["danea_connection_status"]
          updated_at?: string
          username: string
        }
        Update: {
          allowed_uses?: string[]
          archive_id?: string
          company_id?: string
          created_at?: string
          created_by?: string | null
          detected_app_version?: string | null
          detected_creator?: string | null
          detected_default_price?: number | null
          detected_image_folder?: string | null
          detected_warehouse?: string | null
          id?: string
          last_auth_at?: string | null
          last_auth_outcome?: string | null
          last_success_at?: string | null
          name?: string
          password_hash?: string
          password_salt?: string
          status?: Database["public"]["Enums"]["danea_connection_status"]
          updated_at?: string
          username?: string
        }
        Relationships: [
          {
            foreignKeyName: "danea_stations_archive_id_fkey"
            columns: ["archive_id"]
            isOneToOne: false
            referencedRelation: "danea_archives"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "danea_stations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      danea_sync_issues: {
        Row: {
          company_id: string
          created_at: string
          field_name: string | null
          id: string
          product_code: string | null
          reason: string
          sync_run_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          field_name?: string | null
          id?: string
          product_code?: string | null
          reason: string
          sync_run_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          field_name?: string | null
          id?: string
          product_code?: string | null
          reason?: string
          sync_run_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "danea_sync_issues_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "danea_sync_issues_sync_run_id_fkey"
            columns: ["sync_run_id"]
            isOneToOne: false
            referencedRelation: "danea_sync_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      danea_sync_runs: {
        Row: {
          app_version: string | null
          archive_id: string
          company_id: string
          created_at: string
          created_count: number
          creator: string | null
          duplicate_payload: boolean
          error_message: string | null
          finished_at: string | null
          id: string
          imported_by: string | null
          mode: Database["public"]["Enums"]["danea_sync_mode"]
          outcome: Database["public"]["Enums"]["danea_sync_outcome"]
          payload_bytes: number | null
          payload_hash: string | null
          received_count: number
          skipped_count: number
          source: Database["public"]["Enums"]["danea_sync_source"]
          started_at: string
          station_id: string | null
          unpublished_count: number
          updated_at: string
          updated_count: number
          warehouse: string | null
        }
        Insert: {
          app_version?: string | null
          archive_id: string
          company_id: string
          created_at?: string
          created_count?: number
          creator?: string | null
          duplicate_payload?: boolean
          error_message?: string | null
          finished_at?: string | null
          id?: string
          imported_by?: string | null
          mode: Database["public"]["Enums"]["danea_sync_mode"]
          outcome?: Database["public"]["Enums"]["danea_sync_outcome"]
          payload_bytes?: number | null
          payload_hash?: string | null
          received_count?: number
          skipped_count?: number
          source?: Database["public"]["Enums"]["danea_sync_source"]
          started_at?: string
          station_id?: string | null
          unpublished_count?: number
          updated_at?: string
          updated_count?: number
          warehouse?: string | null
        }
        Update: {
          app_version?: string | null
          archive_id?: string
          company_id?: string
          created_at?: string
          created_count?: number
          creator?: string | null
          duplicate_payload?: boolean
          error_message?: string | null
          finished_at?: string | null
          id?: string
          imported_by?: string | null
          mode?: Database["public"]["Enums"]["danea_sync_mode"]
          outcome?: Database["public"]["Enums"]["danea_sync_outcome"]
          payload_bytes?: number | null
          payload_hash?: string | null
          received_count?: number
          skipped_count?: number
          source?: Database["public"]["Enums"]["danea_sync_source"]
          started_at?: string
          station_id?: string | null
          unpublished_count?: number
          updated_at?: string
          updated_count?: number
          warehouse?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "danea_sync_runs_archive_id_fkey"
            columns: ["archive_id"]
            isOneToOne: false
            referencedRelation: "danea_archives"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "danea_sync_runs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "danea_sync_runs_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "danea_stations"
            referencedColumns: ["id"]
          },
        ]
      }
      product_images: {
        Row: {
          archive_id: string
          byte_size: number
          checksum_sha256: string
          company_id: string
          content_type: string
          created_at: string
          height: number
          id: string
          image_path: string
          product_id: string
          thumbnail_byte_size: number
          thumbnail_height: number
          thumbnail_path: string
          thumbnail_width: number
          updated_at: string
          uploaded_by: string
          width: number
        }
        Insert: {
          archive_id: string
          byte_size: number
          checksum_sha256: string
          company_id: string
          content_type: string
          created_at?: string
          height: number
          id?: string
          image_path: string
          product_id: string
          thumbnail_byte_size: number
          thumbnail_height: number
          thumbnail_path: string
          thumbnail_width: number
          updated_at?: string
          uploaded_by: string
          width: number
        }
        Update: {
          archive_id?: string
          byte_size?: number
          checksum_sha256?: string
          company_id?: string
          content_type?: string
          created_at?: string
          height?: number
          id?: string
          image_path?: string
          product_id?: string
          thumbnail_byte_size?: number
          thumbnail_height?: number
          thumbnail_path?: string
          thumbnail_width?: number
          updated_at?: string
          uploaded_by?: string
          width?: number
        }
        Relationships: [
          {
            foreignKeyName: "product_images_archive_id_fkey"
            columns: ["archive_id"]
            isOneToOne: false
            referencedRelation: "danea_archives"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_images_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_images_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: true
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_prices: {
        Row: {
          company_id: string
          created_at: string
          gross_price: number | null
          id: string
          list_number: number
          net_price: number | null
          product_id: string
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          gross_price?: number | null
          id?: string
          list_number: number
          net_price?: number | null
          product_id: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          gross_price?: number | null
          id?: string
          list_number?: number
          net_price?: number | null
          product_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_prices_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_prices_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_sale_units: {
        Row: {
          company_id: string
          conversion_factor: number | null
          conversion_reference_um: string | null
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          is_customer_visible: boolean
          is_default: boolean
          needs_review: boolean
          product_id: string
          unit_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          company_id: string
          conversion_factor?: number | null
          conversion_reference_um?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          is_customer_visible?: boolean
          is_default?: boolean
          needs_review?: boolean
          product_id: string
          unit_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          company_id?: string
          conversion_factor?: number | null
          conversion_reference_um?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          is_customer_visible?: boolean
          is_default?: boolean
          needs_review?: boolean
          product_id?: string
          unit_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_sale_units_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_sale_units_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_sale_units_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units_of_measure"
            referencedColumns: ["id"]
          },
        ]
      }
      product_supplier_costs: {
        Row: {
          company_id: string
          created_at: string
          id: string
          product_id: string
          received_at: string
          supplier_code: string | null
          supplier_gross_price: number | null
          supplier_name: string | null
          supplier_net_price: number | null
          supplier_product_code: string | null
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          product_id: string
          received_at?: string
          supplier_code?: string | null
          supplier_gross_price?: number | null
          supplier_name?: string | null
          supplier_net_price?: number | null
          supplier_product_code?: string | null
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          product_id?: string
          received_at?: string
          supplier_code?: string | null
          supplier_gross_price?: number | null
          supplier_name?: string | null
          supplier_net_price?: number | null
          supplier_product_code?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_supplier_costs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_supplier_costs_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: true
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          archive_id: string
          b2b_visible: boolean
          barcode: string | null
          category: string | null
          code: string
          company_id: string
          created_at: string
          custom_field_1: string | null
          custom_field_2: string | null
          custom_field_3: string | null
          custom_field_4: string | null
          danea_internal_id: string | null
          danea_um: string | null
          description: string | null
          description_html: string | null
          first_received_at: string
          id: string
          image_file_name: string | null
          image_folder: string | null
          last_received_at: string
          last_sync_run_id: string | null
          link: string | null
          notes: string | null
          producer_name: string | null
          product_type: string | null
          publish_status: Database["public"]["Enums"]["product_publish_status"]
          raw_payload: Json | null
          size_um: string | null
          subcategory: string | null
          subcategory_levels: string[] | null
          supplier_code: string | null
          supplier_name: string | null
          supplier_notes: string | null
          supplier_product_code: string | null
          unpublished_at: string | null
          updated_at: string
          vat_class: string | null
          vat_code: string | null
          vat_description: string | null
          vat_perc: number | null
          weight_um: string | null
        }
        Insert: {
          archive_id: string
          b2b_visible?: boolean
          barcode?: string | null
          category?: string | null
          code: string
          company_id: string
          created_at?: string
          custom_field_1?: string | null
          custom_field_2?: string | null
          custom_field_3?: string | null
          custom_field_4?: string | null
          danea_internal_id?: string | null
          danea_um?: string | null
          description?: string | null
          description_html?: string | null
          first_received_at?: string
          id?: string
          image_file_name?: string | null
          image_folder?: string | null
          last_received_at?: string
          last_sync_run_id?: string | null
          link?: string | null
          notes?: string | null
          producer_name?: string | null
          product_type?: string | null
          publish_status?: Database["public"]["Enums"]["product_publish_status"]
          raw_payload?: Json | null
          size_um?: string | null
          subcategory?: string | null
          subcategory_levels?: string[] | null
          supplier_code?: string | null
          supplier_name?: string | null
          supplier_notes?: string | null
          supplier_product_code?: string | null
          unpublished_at?: string | null
          updated_at?: string
          vat_class?: string | null
          vat_code?: string | null
          vat_description?: string | null
          vat_perc?: number | null
          weight_um?: string | null
        }
        Update: {
          archive_id?: string
          b2b_visible?: boolean
          barcode?: string | null
          category?: string | null
          code?: string
          company_id?: string
          created_at?: string
          custom_field_1?: string | null
          custom_field_2?: string | null
          custom_field_3?: string | null
          custom_field_4?: string | null
          danea_internal_id?: string | null
          danea_um?: string | null
          description?: string | null
          description_html?: string | null
          first_received_at?: string
          id?: string
          image_file_name?: string | null
          image_folder?: string | null
          last_received_at?: string
          last_sync_run_id?: string | null
          link?: string | null
          notes?: string | null
          producer_name?: string | null
          product_type?: string | null
          publish_status?: Database["public"]["Enums"]["product_publish_status"]
          raw_payload?: Json | null
          size_um?: string | null
          subcategory?: string | null
          subcategory_levels?: string[] | null
          supplier_code?: string | null
          supplier_name?: string | null
          supplier_notes?: string | null
          supplier_product_code?: string | null
          unpublished_at?: string | null
          updated_at?: string
          vat_class?: string | null
          vat_code?: string | null
          vat_description?: string | null
          vat_perc?: number | null
          weight_um?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "products_archive_id_fkey"
            columns: ["archive_id"]
            isOneToOne: false
            referencedRelation: "danea_archives"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_last_sync_run_id_fkey"
            columns: ["last_sync_run_id"]
            isOneToOne: false
            referencedRelation: "danea_sync_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          first_name: string | null
          id: string
          last_name: string | null
          phone: string | null
          status: Database["public"]["Enums"]["entity_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          first_name?: string | null
          id?: string
          last_name?: string | null
          phone?: string | null
          status?: Database["public"]["Enums"]["entity_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          first_name?: string | null
          id?: string
          last_name?: string | null
          phone?: string | null
          status?: Database["public"]["Enums"]["entity_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      supplier_customer_relations: {
        Row: {
          accepted_at: string | null
          buyer_company_id: string
          buyer_enabled: boolean
          created_at: string
          customer_record_id: string | null
          decided_at: string | null
          decided_by: string | null
          id: string
          internal_reference: string | null
          notes: string | null
          origin: Database["public"]["Enums"]["relation_origin"]
          requested_at: string
          requested_by: string | null
          seller_company_id: string
          seller_enabled: boolean
          status: Database["public"]["Enums"]["relation_status"]
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          buyer_company_id: string
          buyer_enabled?: boolean
          created_at?: string
          customer_record_id?: string | null
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          internal_reference?: string | null
          notes?: string | null
          origin?: Database["public"]["Enums"]["relation_origin"]
          requested_at?: string
          requested_by?: string | null
          seller_company_id: string
          seller_enabled?: boolean
          status?: Database["public"]["Enums"]["relation_status"]
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          buyer_company_id?: string
          buyer_enabled?: boolean
          created_at?: string
          customer_record_id?: string | null
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          internal_reference?: string | null
          notes?: string | null
          origin?: Database["public"]["Enums"]["relation_origin"]
          requested_at?: string
          requested_by?: string | null
          seller_company_id?: string
          seller_enabled?: boolean
          status?: Database["public"]["Enums"]["relation_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "relations_buyer_fkey"
            columns: ["buyer_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_customer_relations_company_id_fkey"
            columns: ["seller_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_customer_relations_customer_record_id_fkey"
            columns: ["customer_record_id"]
            isOneToOne: false
            referencedRelation: "customer_records"
            referencedColumns: ["id"]
          },
        ]
      }
      units_of_measure: {
        Row: {
          code: string
          company_id: string
          created_at: string
          created_by: string | null
          description: string
          id: string
          status: Database["public"]["Enums"]["entity_status"]
          updated_at: string
        }
        Insert: {
          code: string
          company_id: string
          created_at?: string
          created_by?: string | null
          description: string
          id?: string
          status?: Database["public"]["Enums"]["entity_status"]
          updated_at?: string
        }
        Update: {
          code?: string
          company_id?: string
          created_at?: string
          created_by?: string | null
          description?: string
          id?: string
          status?: Database["public"]["Enums"]["entity_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "units_of_measure_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      user_grid_preferences: {
        Row: {
          columns: Json
          created_at: string
          device_class: string
          grid_key: string
          id: string
          sort: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          columns?: Json
          created_at?: string
          device_class: string
          grid_key: string
          id?: string
          sort?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          columns?: Json
          created_at?: string
          device_class?: string
          grid_key?: string
          id?: string
          sort?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_customer_invitation: {
        Args: { _buyer_company_id: string; _token: string }
        Returns: string
      }
      accept_invitation_code: {
        Args: { _buyer_company_id: string; _code: string }
        Returns: string
      }
      accept_invitation_row: {
        Args: { _buyer_company_id: string; _invitation_id: string }
        Returns: string
      }
      accept_invitation_with_new_company: {
        Args: {
          _address_line?: string
          _can_buy?: boolean
          _can_sell?: boolean
          _city?: string
          _delivery_address_line?: string
          _delivery_city?: string
          _delivery_notes?: string
          _delivery_postal_code?: string
          _delivery_province?: string
          _email?: string
          _legal_name: string
          _phone?: string
          _postal_code?: string
          _province?: string
          _tax_code?: string
          _token: string
          _vat_number?: string
        }
        Returns: string
      }
      apply_invitation_price_list: {
        Args: { _invitation_id: string; _relation_id: string }
        Returns: undefined
      }
      apply_product_sale_unit_batch: {
        Args: {
          _actor_user_id?: string
          _boolean_value?: boolean
          _company_id: string
          _conversion_factor?: number
          _operation: string
          _overwrite?: boolean
          _product_ids: string[]
          _unit_id: string
        }
        Returns: Json
      }
      available_buyers: {
        Args: never
        Returns: {
          city: string
          id: string
          legal_name: string
          province: string
        }[]
      }
      available_suppliers: {
        Args: never
        Returns: {
          city: string
          id: string
          legal_name: string
          province: string
        }[]
      }
      buyer_catalog_prices: {
        Args: { _product_ids: string[]; _seller_company_id: string }
        Returns: {
          gross_price: number
          list_number: number
          net_price: number
          product_id: string
        }[]
      }
      can_read_company_address: {
        Args: { _company_id: string; _visible: boolean }
        Returns: boolean
      }
      can_view_seller_catalogue: {
        Args: { _seller_company_id: string }
        Returns: boolean
      }
      can_write_customer_record: {
        Args: { _customer_record_id: string }
        Returns: boolean
      }
      cancel_customer_invitation: {
        Args: { _invitation_id: string }
        Returns: undefined
      }
      company_buys: { Args: { _company_id: string }; Returns: boolean }
      company_exists_for_vat: {
        Args: { _vat_number: string }
        Returns: boolean
      }
      company_sells: { Args: { _company_id: string }; Returns: boolean }
      create_customer_invitation: {
        Args: {
          _customer_record_id: string
          _email: string
          _price_list_number?: number
          _valid_days?: number
        }
        Returns: {
          invitation_id: string
          invite_code: string
          token: string
        }[]
      }
      create_free_invitation: {
        Args: {
          _email?: string
          _price_list_number?: number
          _seller_company_id: string
          _valid_days?: number
        }
        Returns: {
          invitation_id: string
          invite_code: string
          token: string
        }[]
      }
      customer_record_match_suggestions: {
        Args: { _customer_record_id: string }
        Returns: {
          company_id: string
          legal_name: string
          vat_normalized: string
        }[]
      }
      decide_company_relation: {
        Args: { _accept: boolean; _relation_id: string }
        Returns: undefined
      }
      decide_proposed_update: {
        Args: { _accept: boolean; _proposal_id: string }
        Returns: undefined
      }
      generate_invite_code: { Args: never; Returns: string }
      has_active_relation: {
        Args: { _buyer_company_id: string; _seller_company_id: string }
        Returns: boolean
      }
      has_company_role: {
        Args: {
          _company_id: string
          _role: Database["public"]["Enums"]["app_role"]
        }
        Returns: boolean
      }
      invitation_preview: {
        Args: { _token: string }
        Returns: {
          company_exists_for_vat: boolean
          customer_address_line: string
          customer_city: string
          customer_delivery_address_line: string
          customer_delivery_city: string
          customer_delivery_notes: string
          customer_delivery_postal_code: string
          customer_delivery_province: string
          customer_email: string
          customer_legal_name: string
          customer_phone: string
          customer_postal_code: string
          customer_province: string
          customer_record_id: string
          customer_tax_code: string
          customer_vat_normalized: string
          customer_vat_number: string
          email: string
          expired: boolean
          invitation_id: string
          seller_company_id: string
          seller_company_name: string
          status: Database["public"]["Enums"]["invitation_status"]
          vat_mismatch: boolean
        }[]
      }
      invite_customer_relation: {
        Args: { _buyer_company_id: string; _seller_company_id: string }
        Returns: string
      }
      is_company_admin: { Args: { _company_id: string }; Returns: boolean }
      is_company_member: { Args: { _company_id: string }; Returns: boolean }
      link_customer_record_to_relation: {
        Args: { _customer_record_id: string; _relation_id: string }
        Returns: undefined
      }
      manage_customer_destination: {
        Args: {
          _action: string
          _address_id?: string
          _contact_name?: string
          _customer_record_id: string
          _danea_reference?: string
          _destination_id?: string
          _internal_code?: string
          _is_default?: boolean
          _label?: string
          _notes?: string
          _phone?: string
          _separate_documents?: boolean
        }
        Returns: string
      }
      manage_customer_record: {
        Args: {
          _action: string
          _address_line?: string
          _agent?: string
          _archive_id?: string
          _bank?: string
          _city?: string
          _contact_name?: string
          _country?: string
          _credit_limit?: string
          _customer_record_id?: string
          _danea_extra?: Json
          _delivery_address_line?: string
          _delivery_city?: string
          _delivery_notes?: string
          _delivery_postal_code?: string
          _delivery_province?: string
          _discounts?: string
          _email?: string
          _fax?: string
          _internal_reference?: string
          _legal_name?: string
          _notes?: string
          _our_bank?: string
          _payment_terms?: string
          _pec?: string
          _phone?: string
          _postal_code?: string
          _price_list_number?: number
          _province?: string
          _region?: string
          _sdi_admin_reference?: string
          _sdi_code?: string
          _seller_company_id: string
          _tax_code?: string
          _vat_number?: string
        }
        Returns: string
      }
      manage_customer_record_status: {
        Args: {
          _action: string
          _customer_record_id: string
          _seller_company_id: string
        }
        Returns: string
      }
      manage_unit_of_measure: {
        Args: {
          _action: string
          _actor_user_id?: string
          _code?: string
          _company_id: string
          _description?: string
          _unit_id: string
        }
        Returns: string
      }
      normalize_vat: { Args: { _value: string }; Returns: string }
      owns_customer_record: {
        Args: { _customer_record_id: string }
        Returns: boolean
      }
      register_company: {
        Args: {
          _address_line?: string
          _can_buy: boolean
          _can_sell: boolean
          _city?: string
          _delivery_address_line?: string
          _delivery_city?: string
          _delivery_notes?: string
          _delivery_postal_code?: string
          _delivery_province?: string
          _email?: string
          _legal_name: string
          _phone?: string
          _postal_code?: string
          _province?: string
          _tax_code?: string
          _vat_number?: string
        }
        Returns: string
      }
      relation_is_operational: {
        Args: { _buyer_company_id: string; _seller_company_id: string }
        Returns: boolean
      }
      remove_product_image: {
        Args: {
          _actor_user_id: string
          _company_id: string
          _product_id: string
        }
        Returns: {
          old_image_path: string
          old_thumbnail_path: string
        }[]
      }
      request_supplier_relation: {
        Args: { _buyer_company_id: string; _seller_company_id: string }
        Returns: string
      }
      resend_customer_invitation: {
        Args: { _invitation_id: string; _valid_days?: number }
        Returns: {
          invitation_id: string
          token: string
        }[]
      }
      resolve_default_price_list: {
        Args: { _company_id: string }
        Returns: number
      }
      revoke_company_relation: {
        Args: { _relation_id: string }
        Returns: undefined
      }
      search_companies: {
        Args: { _query: string; _role: string }
        Returns: {
          city: string
          id: string
          legal_name: string
          province: string
        }[]
      }
      set_company_capabilities: {
        Args: { _can_buy: boolean; _can_sell: boolean; _company_id: string }
        Returns: undefined
      }
      set_customer_price_list: {
        Args: { _customer_record_id: string; _list_number: number }
        Returns: undefined
      }
      set_default_price_list: {
        Args: { _company_id: string; _list_number: number }
        Returns: undefined
      }
      set_product_b2b_visibility: {
        Args: {
          _actor_user_id?: string
          _company_id: string
          _product_ids: string[]
          _visible: boolean
        }
        Returns: number
      }
      set_product_image: {
        Args: {
          _actor_user_id: string
          _archive_id: string
          _byte_size: number
          _checksum_sha256: string
          _company_id: string
          _content_type: string
          _height: number
          _image_path: string
          _product_id: string
          _thumbnail_byte_size: number
          _thumbnail_height: number
          _thumbnail_path: string
          _thumbnail_width: number
          _width: number
        }
        Returns: {
          old_image_path: string
          old_thumbnail_path: string
        }[]
      }
      set_relation_side_enabled: {
        Args: { _enabled: boolean; _relation_id: string }
        Returns: undefined
      }
      shares_company_with: { Args: { _user_id: string }; Returns: boolean }
      shares_relation_with: { Args: { _company_id: string }; Returns: boolean }
    }
    Enums: {
      address_function:
        | "sede_legale"
        | "sede_operativa"
        | "consegna"
        | "ritiro"
        | "magazzino"
      app_role: "amministratore" | "operatore" | "trasportatore"
      danea_connection_status: "attivo" | "revocato"
      danea_sync_mode: "full" | "incremental"
      danea_sync_outcome: "in_corso" | "completato" | "fallito"
      danea_sync_source: "postazione" | "manuale"
      entity_status: "attivo" | "disattivato" | "revocato"
      invitation_status:
        | "in_attesa"
        | "accettato"
        | "annullato"
        | "annullato_scaduto"
      product_publish_status: "pubblicato" | "non_pubblicato"
      proposed_update_status: "in_attesa" | "accettato" | "rifiutato"
      relation_origin: "invito_fornitore" | "richiesta_cliente"
      relation_status:
        | "in_attesa"
        | "attivo"
        | "sospeso"
        | "revocato"
        | "rifiutato"
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
    Enums: {
      address_function: [
        "sede_legale",
        "sede_operativa",
        "consegna",
        "ritiro",
        "magazzino",
      ],
      app_role: ["amministratore", "operatore", "trasportatore"],
      danea_connection_status: ["attivo", "revocato"],
      danea_sync_mode: ["full", "incremental"],
      danea_sync_outcome: ["in_corso", "completato", "fallito"],
      danea_sync_source: ["postazione", "manuale"],
      entity_status: ["attivo", "disattivato", "revocato"],
      invitation_status: [
        "in_attesa",
        "accettato",
        "annullato",
        "annullato_scaduto",
      ],
      product_publish_status: ["pubblicato", "non_pubblicato"],
      proposed_update_status: ["in_attesa", "accettato", "rifiutato"],
      relation_origin: ["invito_fornitore", "richiesta_cliente"],
      relation_status: [
        "in_attesa",
        "attivo",
        "sospeso",
        "revocato",
        "rifiutato",
      ],
    },
  },
} as const
