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
          supplier_record_id: string | null
        }
        Insert: {
          address_id: string
          company_id?: string | null
          created_at?: string
          customer_record_id?: string | null
          function: Database["public"]["Enums"]["address_function"]
          id?: string
          is_default?: boolean
          supplier_record_id?: string | null
        }
        Update: {
          address_id?: string
          company_id?: string | null
          created_at?: string
          customer_record_id?: string | null
          function?: Database["public"]["Enums"]["address_function"]
          id?: string
          is_default?: boolean
          supplier_record_id?: string | null
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
          {
            foreignKeyName: "address_functions_supplier_record_id_fkey"
            columns: ["supplier_record_id"]
            isOneToOne: false
            referencedRelation: "supplier_records"
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
          supplier_record_id: string | null
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
          supplier_record_id?: string | null
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
          supplier_record_id?: string | null
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
          {
            foreignKeyName: "addresses_supplier_record_id_fkey"
            columns: ["supplier_record_id"]
            isOneToOne: false
            referencedRelation: "supplier_records"
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
          buyer_company_id: string | null
          contact_name: string | null
          created_at: string
          created_by: string | null
          customer_record_id: string | null
          danea_reference: string | null
          function: Database["public"]["Enums"]["address_function"]
          id: string
          internal_code: string | null
          is_default: boolean
          label: string
          notes: string | null
          phone: string | null
          seller_company_id: string | null
          separate_documents: boolean
          status: Database["public"]["Enums"]["entity_status"]
          supplier_record_id: string | null
          updated_at: string
        }
        Insert: {
          address_id?: string | null
          buyer_company_id?: string | null
          contact_name?: string | null
          created_at?: string
          created_by?: string | null
          customer_record_id?: string | null
          danea_reference?: string | null
          function?: Database["public"]["Enums"]["address_function"]
          id?: string
          internal_code?: string | null
          is_default?: boolean
          label: string
          notes?: string | null
          phone?: string | null
          seller_company_id?: string | null
          separate_documents?: boolean
          status?: Database["public"]["Enums"]["entity_status"]
          supplier_record_id?: string | null
          updated_at?: string
        }
        Update: {
          address_id?: string | null
          buyer_company_id?: string | null
          contact_name?: string | null
          created_at?: string
          created_by?: string | null
          customer_record_id?: string | null
          danea_reference?: string | null
          function?: Database["public"]["Enums"]["address_function"]
          id?: string
          internal_code?: string | null
          is_default?: boolean
          label?: string
          notes?: string | null
          phone?: string | null
          seller_company_id?: string | null
          separate_documents?: boolean
          status?: Database["public"]["Enums"]["entity_status"]
          supplier_record_id?: string | null
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
            foreignKeyName: "customer_destinations_buyer_company_id_fkey"
            columns: ["buyer_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
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
          {
            foreignKeyName: "customer_destinations_supplier_record_id_fkey"
            columns: ["supplier_record_id"]
            isOneToOne: false
            referencedRelation: "supplier_records"
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
      goods_receipt_items: {
        Row: {
          company_id: string
          conversion_factor: number | null
          created_at: string
          delivery_item_id: string | null
          expiry_date: string | null
          id: string
          notes: string | null
          order_item_id: string | null
          producer_lot_code: string | null
          producer_name: string | null
          product_id: string
          receipt_id: string
          stock_quantity: number | null
          unit_code: string | null
          unit_cost: number | null
          unit_id: string | null
          updated_at: string
          verified_quantity: number
        }
        Insert: {
          company_id: string
          conversion_factor?: number | null
          created_at?: string
          delivery_item_id?: string | null
          expiry_date?: string | null
          id?: string
          notes?: string | null
          order_item_id?: string | null
          producer_lot_code?: string | null
          producer_name?: string | null
          product_id: string
          receipt_id: string
          stock_quantity?: number | null
          unit_code?: string | null
          unit_cost?: number | null
          unit_id?: string | null
          updated_at?: string
          verified_quantity: number
        }
        Update: {
          company_id?: string
          conversion_factor?: number | null
          created_at?: string
          delivery_item_id?: string | null
          expiry_date?: string | null
          id?: string
          notes?: string | null
          order_item_id?: string | null
          producer_lot_code?: string | null
          producer_name?: string | null
          product_id?: string
          receipt_id?: string
          stock_quantity?: number | null
          unit_code?: string | null
          unit_cost?: number | null
          unit_id?: string | null
          updated_at?: string
          verified_quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "goods_receipt_items_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goods_receipt_items_delivery_item_id_fkey"
            columns: ["delivery_item_id"]
            isOneToOne: false
            referencedRelation: "purchase_delivery_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goods_receipt_items_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "purchase_order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goods_receipt_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goods_receipt_items_receipt_id_fkey"
            columns: ["receipt_id"]
            isOneToOne: false
            referencedRelation: "goods_receipts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goods_receipt_items_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units_of_measure"
            referencedColumns: ["id"]
          },
        ]
      }
      goods_receipts: {
        Row: {
          archive_id: string
          company_id: string
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          created_by: string | null
          delivery_id: string | null
          id: string
          location_id: string
          notes: string | null
          number: string
          order_id: string
          received_at: string
          status: Database["public"]["Enums"]["goods_receipt_status"]
          supplier_record_id: string
          updated_at: string
        }
        Insert: {
          archive_id: string
          company_id: string
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          created_by?: string | null
          delivery_id?: string | null
          id?: string
          location_id: string
          notes?: string | null
          number: string
          order_id: string
          received_at?: string
          status?: Database["public"]["Enums"]["goods_receipt_status"]
          supplier_record_id: string
          updated_at?: string
        }
        Update: {
          archive_id?: string
          company_id?: string
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          created_by?: string | null
          delivery_id?: string | null
          id?: string
          location_id?: string
          notes?: string | null
          number?: string
          order_id?: string
          received_at?: string
          status?: Database["public"]["Enums"]["goods_receipt_status"]
          supplier_record_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "goods_receipts_archive_id_fkey"
            columns: ["archive_id"]
            isOneToOne: false
            referencedRelation: "danea_archives"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goods_receipts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goods_receipts_delivery_id_fkey"
            columns: ["delivery_id"]
            isOneToOne: false
            referencedRelation: "purchase_deliveries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goods_receipts_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "inventory_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goods_receipts_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goods_receipts_supplier_record_id_fkey"
            columns: ["supplier_record_id"]
            isOneToOne: false
            referencedRelation: "supplier_records"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_adjustments: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          id: string
          location_id: string
          notes: string | null
          product_id: string
          quantity: number
          reason: string
          reference_count_id: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          location_id: string
          notes?: string | null
          product_id: string
          quantity: number
          reason: string
          reference_count_id?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          location_id?: string
          notes?: string | null
          product_id?: string
          quantity?: number
          reason?: string
          reference_count_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_adjustments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_adjustments_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "inventory_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_adjustments_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_adjustments_reference_count_id_fkey"
            columns: ["reference_count_id"]
            isOneToOne: false
            referencedRelation: "inventory_counts"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_counts: {
        Row: {
          company_id: string
          counted_at: string
          counted_by: string | null
          counted_quantity: number
          created_at: string
          difference: number | null
          id: string
          location_id: string
          notes: string | null
          previous_quantity: number
          product_id: string
          session_id: string
          unit_code: string | null
          unit_id: string | null
          updated_at: string
        }
        Insert: {
          company_id: string
          counted_at?: string
          counted_by?: string | null
          counted_quantity: number
          created_at?: string
          difference?: number | null
          id?: string
          location_id: string
          notes?: string | null
          previous_quantity?: number
          product_id: string
          session_id: string
          unit_code?: string | null
          unit_id?: string | null
          updated_at?: string
        }
        Update: {
          company_id?: string
          counted_at?: string
          counted_by?: string | null
          counted_quantity?: number
          created_at?: string
          difference?: number | null
          id?: string
          location_id?: string
          notes?: string | null
          previous_quantity?: number
          product_id?: string
          session_id?: string
          unit_code?: string | null
          unit_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_counts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_counts_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "inventory_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_counts_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_counts_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "inventory_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_counts_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units_of_measure"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_locations: {
        Row: {
          code: string | null
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
          code?: string | null
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
          code?: string | null
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
            foreignKeyName: "inventory_locations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_movements: {
        Row: {
          archive_id: string | null
          company_id: string
          created_at: string
          created_by: string | null
          id: string
          location_id: string
          movement_type: Database["public"]["Enums"]["inventory_movement_type"]
          notes: string | null
          product_id: string
          quantity: number
          source_id: string | null
          source_table: string | null
          stock_lot_id: string | null
          unit_code: string | null
          unit_id: string | null
        }
        Insert: {
          archive_id?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          location_id: string
          movement_type: Database["public"]["Enums"]["inventory_movement_type"]
          notes?: string | null
          product_id: string
          quantity: number
          source_id?: string | null
          source_table?: string | null
          stock_lot_id?: string | null
          unit_code?: string | null
          unit_id?: string | null
        }
        Update: {
          archive_id?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          location_id?: string
          movement_type?: Database["public"]["Enums"]["inventory_movement_type"]
          notes?: string | null
          product_id?: string
          quantity?: number
          source_id?: string | null
          source_table?: string | null
          stock_lot_id?: string | null
          unit_code?: string | null
          unit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_movements_archive_id_fkey"
            columns: ["archive_id"]
            isOneToOne: false
            referencedRelation: "danea_archives"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "inventory_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_stock_lot_id_fkey"
            columns: ["stock_lot_id"]
            isOneToOne: false
            referencedRelation: "stock_lots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units_of_measure"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_sessions: {
        Row: {
          archive_id: string
          company_id: string
          created_at: string
          created_by: string | null
          finished_at: string | null
          id: string
          location_id: string | null
          name: string
          notes: string | null
          scope: Database["public"]["Enums"]["inventory_session_scope"]
          started_at: string
          status: Database["public"]["Enums"]["inventory_session_status"]
          updated_at: string
        }
        Insert: {
          archive_id: string
          company_id: string
          created_at?: string
          created_by?: string | null
          finished_at?: string | null
          id?: string
          location_id?: string | null
          name: string
          notes?: string | null
          scope?: Database["public"]["Enums"]["inventory_session_scope"]
          started_at?: string
          status?: Database["public"]["Enums"]["inventory_session_status"]
          updated_at?: string
        }
        Update: {
          archive_id?: string
          company_id?: string
          created_at?: string
          created_by?: string | null
          finished_at?: string | null
          id?: string
          location_id?: string | null
          name?: string
          notes?: string | null
          scope?: Database["public"]["Enums"]["inventory_session_scope"]
          started_at?: string
          status?: Database["public"]["Enums"]["inventory_session_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_sessions_archive_id_fkey"
            columns: ["archive_id"]
            isOneToOne: false
            referencedRelation: "danea_archives"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_sessions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_sessions_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "inventory_locations"
            referencedColumns: ["id"]
          },
        ]
      }
      product_danea_supplier_matches: {
        Row: {
          company_id: string
          created_at: string
          danea_supplier_code: string | null
          danea_supplier_name: string | null
          decided_at: string | null
          decided_by: string | null
          id: string
          product_id: string
          status: Database["public"]["Enums"]["danea_supplier_match_status"]
          supplier_record_id: string | null
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          danea_supplier_code?: string | null
          danea_supplier_name?: string | null
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          product_id: string
          status?: Database["public"]["Enums"]["danea_supplier_match_status"]
          supplier_record_id?: string | null
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          danea_supplier_code?: string | null
          danea_supplier_name?: string | null
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          product_id?: string
          status?: Database["public"]["Enums"]["danea_supplier_match_status"]
          supplier_record_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_danea_supplier_matches_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_danea_supplier_matches_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_danea_supplier_matches_supplier_record_id_fkey"
            columns: ["supplier_record_id"]
            isOneToOne: false
            referencedRelation: "supplier_records"
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
      product_stock_settings: {
        Row: {
          company_id: string
          coverage_days: number | null
          created_at: string
          created_by: string | null
          id: string
          min_stock: number | null
          notes: string | null
          order_multiple: number | null
          perishability: string | null
          product_id: string
          stock_unit_id: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          company_id: string
          coverage_days?: number | null
          created_at?: string
          created_by?: string | null
          id?: string
          min_stock?: number | null
          notes?: string | null
          order_multiple?: number | null
          perishability?: string | null
          product_id: string
          stock_unit_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          company_id?: string
          coverage_days?: number | null
          created_at?: string
          created_by?: string | null
          id?: string
          min_stock?: number | null
          notes?: string | null
          order_multiple?: number | null
          perishability?: string | null
          product_id?: string
          stock_unit_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_stock_settings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_stock_settings_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_stock_settings_stock_unit_id_fkey"
            columns: ["stock_unit_id"]
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
      product_supplier_links: {
        Row: {
          company_id: string
          conversion_factor: number | null
          conversion_reference_um: string | null
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          is_preferred: boolean
          lead_time_days: number | null
          manual_cost: number | null
          manual_cost_at: string | null
          min_quantity: number | null
          notes: string | null
          origin: Database["public"]["Enums"]["product_supplier_origin"]
          product_id: string
          purchase_unit_id: string | null
          supplier_product_code: string | null
          supplier_record_id: string
          updated_at: string
        }
        Insert: {
          company_id: string
          conversion_factor?: number | null
          conversion_reference_um?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          is_preferred?: boolean
          lead_time_days?: number | null
          manual_cost?: number | null
          manual_cost_at?: string | null
          min_quantity?: number | null
          notes?: string | null
          origin?: Database["public"]["Enums"]["product_supplier_origin"]
          product_id: string
          purchase_unit_id?: string | null
          supplier_product_code?: string | null
          supplier_record_id: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          conversion_factor?: number | null
          conversion_reference_um?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          is_preferred?: boolean
          lead_time_days?: number | null
          manual_cost?: number | null
          manual_cost_at?: string | null
          min_quantity?: number | null
          notes?: string | null
          origin?: Database["public"]["Enums"]["product_supplier_origin"]
          product_id?: string
          purchase_unit_id?: string | null
          supplier_product_code?: string | null
          supplier_record_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_supplier_links_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_supplier_links_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_supplier_links_purchase_unit_id_fkey"
            columns: ["purchase_unit_id"]
            isOneToOne: false
            referencedRelation: "units_of_measure"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_supplier_links_supplier_record_id_fkey"
            columns: ["supplier_record_id"]
            isOneToOne: false
            referencedRelation: "supplier_records"
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
      purchase_deliveries: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          company_id: string
          created_at: string
          declared_at: string | null
          declared_by: string | null
          declared_by_name: string | null
          id: string
          notes: string | null
          order_id: string
          origin: Database["public"]["Enums"]["purchase_delivery_origin"]
          sequence: number
          status: Database["public"]["Enums"]["purchase_delivery_status"]
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          company_id: string
          created_at?: string
          declared_at?: string | null
          declared_by?: string | null
          declared_by_name?: string | null
          id?: string
          notes?: string | null
          order_id: string
          origin: Database["public"]["Enums"]["purchase_delivery_origin"]
          sequence: number
          status?: Database["public"]["Enums"]["purchase_delivery_status"]
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          company_id?: string
          created_at?: string
          declared_at?: string | null
          declared_by?: string | null
          declared_by_name?: string | null
          id?: string
          notes?: string | null
          order_id?: string
          origin?: Database["public"]["Enums"]["purchase_delivery_origin"]
          sequence?: number
          status?: Database["public"]["Enums"]["purchase_delivery_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_deliveries_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_deliveries_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_delivery_disputes: {
        Row: {
          company_id: string
          created_at: string
          delivery_item_id: string
          id: string
          notes: string | null
          opened_at: string
          opened_by: string | null
          reason: Database["public"]["Enums"]["purchase_dispute_reason"]
          resolution_notes: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: Database["public"]["Enums"]["purchase_dispute_status"]
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          delivery_item_id: string
          id?: string
          notes?: string | null
          opened_at?: string
          opened_by?: string | null
          reason: Database["public"]["Enums"]["purchase_dispute_reason"]
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: Database["public"]["Enums"]["purchase_dispute_status"]
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          delivery_item_id?: string
          id?: string
          notes?: string | null
          opened_at?: string
          opened_by?: string | null
          reason?: Database["public"]["Enums"]["purchase_dispute_reason"]
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: Database["public"]["Enums"]["purchase_dispute_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_delivery_disputes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_delivery_disputes_delivery_item_id_fkey"
            columns: ["delivery_item_id"]
            isOneToOne: false
            referencedRelation: "purchase_delivery_items"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_delivery_items: {
        Row: {
          accepted_quantity: number | null
          company_id: string
          created_at: string
          decided_at: string | null
          decided_by: string | null
          declared_expiry: string | null
          declared_producer: string | null
          declared_producer_lot: string | null
          declared_quantity: number
          declared_weight: number | null
          delivery_id: string
          id: string
          line_notes: string | null
          line_type: Database["public"]["Enums"]["purchase_delivery_line_type"]
          missing_reason: string | null
          order_item_id: string | null
          product_id: string
          replaces_order_item_id: string | null
          status: Database["public"]["Enums"]["purchase_delivery_line_status"]
          unit_code: string | null
          unit_id: string | null
          updated_at: string
        }
        Insert: {
          accepted_quantity?: number | null
          company_id: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          declared_expiry?: string | null
          declared_producer?: string | null
          declared_producer_lot?: string | null
          declared_quantity?: number
          declared_weight?: number | null
          delivery_id: string
          id?: string
          line_notes?: string | null
          line_type?: Database["public"]["Enums"]["purchase_delivery_line_type"]
          missing_reason?: string | null
          order_item_id?: string | null
          product_id: string
          replaces_order_item_id?: string | null
          status?: Database["public"]["Enums"]["purchase_delivery_line_status"]
          unit_code?: string | null
          unit_id?: string | null
          updated_at?: string
        }
        Update: {
          accepted_quantity?: number | null
          company_id?: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          declared_expiry?: string | null
          declared_producer?: string | null
          declared_producer_lot?: string | null
          declared_quantity?: number
          declared_weight?: number | null
          delivery_id?: string
          id?: string
          line_notes?: string | null
          line_type?: Database["public"]["Enums"]["purchase_delivery_line_type"]
          missing_reason?: string | null
          order_item_id?: string | null
          product_id?: string
          replaces_order_item_id?: string | null
          status?: Database["public"]["Enums"]["purchase_delivery_line_status"]
          unit_code?: string | null
          unit_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_delivery_items_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_delivery_items_delivery_id_fkey"
            columns: ["delivery_id"]
            isOneToOne: false
            referencedRelation: "purchase_deliveries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_delivery_items_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "purchase_order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_delivery_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_delivery_items_replaces_order_item_id_fkey"
            columns: ["replaces_order_item_id"]
            isOneToOne: false
            referencedRelation: "purchase_order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_delivery_items_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units_of_measure"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_delivery_line_events: {
        Row: {
          actor_label: string | null
          actor_user_id: string | null
          company_id: string
          created_at: string
          delivery_item_id: string
          event_type: Database["public"]["Enums"]["delivery_line_event_type"]
          id: string
          new_quantity: number | null
          notes: string | null
          previous_quantity: number | null
          reason: string | null
        }
        Insert: {
          actor_label?: string | null
          actor_user_id?: string | null
          company_id: string
          created_at?: string
          delivery_item_id: string
          event_type: Database["public"]["Enums"]["delivery_line_event_type"]
          id?: string
          new_quantity?: number | null
          notes?: string | null
          previous_quantity?: number | null
          reason?: string | null
        }
        Update: {
          actor_label?: string | null
          actor_user_id?: string | null
          company_id?: string
          created_at?: string
          delivery_item_id?: string
          event_type?: Database["public"]["Enums"]["delivery_line_event_type"]
          id?: string
          new_quantity?: number | null
          notes?: string | null
          previous_quantity?: number | null
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_delivery_line_events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_delivery_line_events_delivery_item_id_fkey"
            columns: ["delivery_item_id"]
            isOneToOne: false
            referencedRelation: "purchase_delivery_items"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_order_items: {
        Row: {
          company_id: string
          conversion_factor: number | null
          created_at: string
          id: string
          notes: string | null
          order_id: string
          ordered_quantity: number
          product_id: string
          product_supplier_link_id: string | null
          purchase_quantity: number | null
          purchase_unit_code: string | null
          purchase_unit_id: string | null
          supplier_product_code: string | null
          unit_code: string | null
          unit_cost: number | null
          unit_id: string | null
          updated_at: string
        }
        Insert: {
          company_id: string
          conversion_factor?: number | null
          created_at?: string
          id?: string
          notes?: string | null
          order_id: string
          ordered_quantity: number
          product_id: string
          product_supplier_link_id?: string | null
          purchase_quantity?: number | null
          purchase_unit_code?: string | null
          purchase_unit_id?: string | null
          supplier_product_code?: string | null
          unit_code?: string | null
          unit_cost?: number | null
          unit_id?: string | null
          updated_at?: string
        }
        Update: {
          company_id?: string
          conversion_factor?: number | null
          created_at?: string
          id?: string
          notes?: string | null
          order_id?: string
          ordered_quantity?: number
          product_id?: string
          product_supplier_link_id?: string | null
          purchase_quantity?: number | null
          purchase_unit_code?: string | null
          purchase_unit_id?: string | null
          supplier_product_code?: string | null
          unit_code?: string | null
          unit_cost?: number | null
          unit_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_order_items_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_items_product_supplier_link_id_fkey"
            columns: ["product_supplier_link_id"]
            isOneToOne: false
            referencedRelation: "product_supplier_links"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_items_purchase_unit_id_fkey"
            columns: ["purchase_unit_id"]
            isOneToOne: false
            referencedRelation: "units_of_measure"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_items_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units_of_measure"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_order_share_links: {
        Row: {
          access_count: number
          company_id: string
          created_at: string
          created_by: string | null
          expires_at: string
          id: string
          last_access_at: string | null
          order_id: string
          recipient_label: string | null
          revoked_at: string | null
          token_hash: string
          updated_at: string
        }
        Insert: {
          access_count?: number
          company_id: string
          created_at?: string
          created_by?: string | null
          expires_at: string
          id?: string
          last_access_at?: string | null
          order_id: string
          recipient_label?: string | null
          revoked_at?: string | null
          token_hash: string
          updated_at?: string
        }
        Update: {
          access_count?: number
          company_id?: string
          created_at?: string
          created_by?: string | null
          expires_at?: string
          id?: string
          last_access_at?: string | null
          order_id?: string
          recipient_label?: string | null
          revoked_at?: string | null
          token_hash?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_order_share_links_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_share_links_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_orders: {
        Row: {
          archive_id: string
          closed_at: string | null
          company_id: string
          created_at: string
          created_by: string | null
          destination_address_id: string | null
          destination_location_id: string
          id: string
          notes: string | null
          number: string
          relation_id: string | null
          sent_at: string | null
          shopping_list_id: string | null
          status: Database["public"]["Enums"]["purchase_order_status"]
          supplier_record_id: string
          updated_at: string
        }
        Insert: {
          archive_id: string
          closed_at?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          destination_address_id?: string | null
          destination_location_id: string
          id?: string
          notes?: string | null
          number: string
          relation_id?: string | null
          sent_at?: string | null
          shopping_list_id?: string | null
          status?: Database["public"]["Enums"]["purchase_order_status"]
          supplier_record_id: string
          updated_at?: string
        }
        Update: {
          archive_id?: string
          closed_at?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          destination_address_id?: string | null
          destination_location_id?: string
          id?: string
          notes?: string | null
          number?: string
          relation_id?: string | null
          sent_at?: string | null
          shopping_list_id?: string | null
          status?: Database["public"]["Enums"]["purchase_order_status"]
          supplier_record_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_orders_archive_id_fkey"
            columns: ["archive_id"]
            isOneToOne: false
            referencedRelation: "danea_archives"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_destination_address_id_fkey"
            columns: ["destination_address_id"]
            isOneToOne: false
            referencedRelation: "addresses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_destination_location_id_fkey"
            columns: ["destination_location_id"]
            isOneToOne: false
            referencedRelation: "inventory_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_relation_id_fkey"
            columns: ["relation_id"]
            isOneToOne: false
            referencedRelation: "supplier_customer_relations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_shopping_list_id_fkey"
            columns: ["shopping_list_id"]
            isOneToOne: false
            referencedRelation: "shopping_lists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_supplier_record_id_fkey"
            columns: ["supplier_record_id"]
            isOneToOne: false
            referencedRelation: "supplier_records"
            referencedColumns: ["id"]
          },
        ]
      }
      shopping_list_item_suppliers: {
        Row: {
          assigned_quantity: number
          company_id: string
          conversion_factor: number | null
          created_at: string
          created_by: string | null
          id: string
          item_id: string
          min_warning_accepted: boolean
          min_warning_accepted_at: string | null
          min_warning_accepted_by: string | null
          notes: string | null
          product_supplier_link_id: string
          purchase_quantity: number | null
          purchase_unit_code: string | null
          purchase_unit_id: string | null
          supplier_record_id: string
          updated_at: string
        }
        Insert: {
          assigned_quantity: number
          company_id: string
          conversion_factor?: number | null
          created_at?: string
          created_by?: string | null
          id?: string
          item_id: string
          min_warning_accepted?: boolean
          min_warning_accepted_at?: string | null
          min_warning_accepted_by?: string | null
          notes?: string | null
          product_supplier_link_id: string
          purchase_quantity?: number | null
          purchase_unit_code?: string | null
          purchase_unit_id?: string | null
          supplier_record_id: string
          updated_at?: string
        }
        Update: {
          assigned_quantity?: number
          company_id?: string
          conversion_factor?: number | null
          created_at?: string
          created_by?: string | null
          id?: string
          item_id?: string
          min_warning_accepted?: boolean
          min_warning_accepted_at?: string | null
          min_warning_accepted_by?: string | null
          notes?: string | null
          product_supplier_link_id?: string
          purchase_quantity?: number | null
          purchase_unit_code?: string | null
          purchase_unit_id?: string | null
          supplier_record_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shopping_list_item_suppliers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shopping_list_item_suppliers_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "shopping_list_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shopping_list_item_suppliers_product_supplier_link_id_fkey"
            columns: ["product_supplier_link_id"]
            isOneToOne: false
            referencedRelation: "product_supplier_links"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shopping_list_item_suppliers_purchase_unit_id_fkey"
            columns: ["purchase_unit_id"]
            isOneToOne: false
            referencedRelation: "units_of_measure"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shopping_list_item_suppliers_supplier_record_id_fkey"
            columns: ["supplier_record_id"]
            isOneToOne: false
            referencedRelation: "supplier_records"
            referencedColumns: ["id"]
          },
        ]
      }
      shopping_list_items: {
        Row: {
          change_reason: string | null
          company_id: string
          created_at: string
          created_by: string | null
          decided_at: string | null
          decided_by: string | null
          decided_quantity: number
          id: string
          list_id: string
          notes: string | null
          origin: Database["public"]["Enums"]["shopping_list_item_origin"]
          product_id: string
          snapshot_available: number | null
          snapshot_min_stock: number | null
          snapshot_needed: number | null
          snapshot_order_multiple: number | null
          snapshot_raw_need: number | null
          suggested_quantity: number | null
          unit_code: string | null
          unit_id: string | null
          updated_at: string
        }
        Insert: {
          change_reason?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          decided_at?: string | null
          decided_by?: string | null
          decided_quantity: number
          id?: string
          list_id: string
          notes?: string | null
          origin?: Database["public"]["Enums"]["shopping_list_item_origin"]
          product_id: string
          snapshot_available?: number | null
          snapshot_min_stock?: number | null
          snapshot_needed?: number | null
          snapshot_order_multiple?: number | null
          snapshot_raw_need?: number | null
          suggested_quantity?: number | null
          unit_code?: string | null
          unit_id?: string | null
          updated_at?: string
        }
        Update: {
          change_reason?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          decided_at?: string | null
          decided_by?: string | null
          decided_quantity?: number
          id?: string
          list_id?: string
          notes?: string | null
          origin?: Database["public"]["Enums"]["shopping_list_item_origin"]
          product_id?: string
          snapshot_available?: number | null
          snapshot_min_stock?: number | null
          snapshot_needed?: number | null
          snapshot_order_multiple?: number | null
          snapshot_raw_need?: number | null
          suggested_quantity?: number | null
          unit_code?: string | null
          unit_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shopping_list_items_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shopping_list_items_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "shopping_lists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shopping_list_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shopping_list_items_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units_of_measure"
            referencedColumns: ["id"]
          },
        ]
      }
      shopping_lists: {
        Row: {
          archive_id: string
          closed_at: string | null
          company_id: string
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          created_by: string | null
          id: string
          name: string
          notes: string | null
          status: Database["public"]["Enums"]["shopping_list_status"]
          updated_at: string
        }
        Insert: {
          archive_id: string
          closed_at?: string | null
          company_id: string
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          notes?: string | null
          status?: Database["public"]["Enums"]["shopping_list_status"]
          updated_at?: string
        }
        Update: {
          archive_id?: string
          closed_at?: string | null
          company_id?: string
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          notes?: string | null
          status?: Database["public"]["Enums"]["shopping_list_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shopping_lists_archive_id_fkey"
            columns: ["archive_id"]
            isOneToOne: false
            referencedRelation: "danea_archives"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shopping_lists_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_lot_reconciliations: {
        Row: {
          archive_id: string | null
          attributed_quantity: number
          company_id: string
          count_id: string | null
          created_at: string
          decided_at: string | null
          decided_by: string | null
          detected_difference: number
          id: string
          location_id: string
          notes: string | null
          product_id: string
          session_id: string | null
          status: Database["public"]["Enums"]["lot_reconciliation_status"]
          updated_at: string
        }
        Insert: {
          archive_id?: string | null
          attributed_quantity?: number
          company_id: string
          count_id?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          detected_difference: number
          id?: string
          location_id: string
          notes?: string | null
          product_id: string
          session_id?: string | null
          status?: Database["public"]["Enums"]["lot_reconciliation_status"]
          updated_at?: string
        }
        Update: {
          archive_id?: string | null
          attributed_quantity?: number
          company_id?: string
          count_id?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          detected_difference?: number
          id?: string
          location_id?: string
          notes?: string | null
          product_id?: string
          session_id?: string | null
          status?: Database["public"]["Enums"]["lot_reconciliation_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_lot_reconciliations_archive_id_fkey"
            columns: ["archive_id"]
            isOneToOne: false
            referencedRelation: "danea_archives"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_lot_reconciliations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_lot_reconciliations_count_id_fkey"
            columns: ["count_id"]
            isOneToOne: false
            referencedRelation: "inventory_counts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_lot_reconciliations_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "inventory_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_lot_reconciliations_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_lot_reconciliations_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "inventory_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_lots: {
        Row: {
          archive_id: string
          company_id: string
          created_at: string
          entered_at: string
          expiry_date: string | null
          goods_receipt_item_id: string
          id: string
          initial_quantity: number
          internal_code: string
          location_id: string
          notes: string | null
          producer_lot_code: string | null
          producer_name: string | null
          product_id: string
          status: Database["public"]["Enums"]["stock_lot_status"]
          supplier_record_id: string | null
          unit_code: string | null
          unit_cost: number | null
          unit_id: string | null
          updated_at: string
        }
        Insert: {
          archive_id: string
          company_id: string
          created_at?: string
          entered_at?: string
          expiry_date?: string | null
          goods_receipt_item_id: string
          id?: string
          initial_quantity: number
          internal_code: string
          location_id: string
          notes?: string | null
          producer_lot_code?: string | null
          producer_name?: string | null
          product_id: string
          status?: Database["public"]["Enums"]["stock_lot_status"]
          supplier_record_id?: string | null
          unit_code?: string | null
          unit_cost?: number | null
          unit_id?: string | null
          updated_at?: string
        }
        Update: {
          archive_id?: string
          company_id?: string
          created_at?: string
          entered_at?: string
          expiry_date?: string | null
          goods_receipt_item_id?: string
          id?: string
          initial_quantity?: number
          internal_code?: string
          location_id?: string
          notes?: string | null
          producer_lot_code?: string | null
          producer_name?: string | null
          product_id?: string
          status?: Database["public"]["Enums"]["stock_lot_status"]
          supplier_record_id?: string | null
          unit_code?: string | null
          unit_cost?: number | null
          unit_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_lots_archive_id_fkey"
            columns: ["archive_id"]
            isOneToOne: false
            referencedRelation: "danea_archives"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_lots_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_lots_goods_receipt_item_id_fkey"
            columns: ["goods_receipt_item_id"]
            isOneToOne: true
            referencedRelation: "goods_receipt_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_lots_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "inventory_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_lots_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_lots_supplier_record_id_fkey"
            columns: ["supplier_record_id"]
            isOneToOne: false
            referencedRelation: "supplier_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_lots_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units_of_measure"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_customer_relations: {
        Row: {
          accepted_at: string | null
          buyer_company_id: string
          buyer_enabled: boolean
          created_at: string
          customer_record_id: string | null
          customer_record_match_required: boolean
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
          supplier_record_id: string | null
          supplier_record_match_required: boolean
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          buyer_company_id: string
          buyer_enabled?: boolean
          created_at?: string
          customer_record_id?: string | null
          customer_record_match_required?: boolean
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
          supplier_record_id?: string | null
          supplier_record_match_required?: boolean
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          buyer_company_id?: string
          buyer_enabled?: boolean
          created_at?: string
          customer_record_id?: string | null
          customer_record_match_required?: boolean
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
          supplier_record_id?: string | null
          supplier_record_match_required?: boolean
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
          {
            foreignKeyName: "supplier_customer_relations_supplier_record_id_fkey"
            columns: ["supplier_record_id"]
            isOneToOne: false
            referencedRelation: "supplier_records"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_records: {
        Row: {
          address_line: string | null
          agent: string | null
          archive_id: string | null
          bank: string | null
          buyer_company_id: string
          city: string | null
          contact_name: string | null
          country: string | null
          created_at: string
          created_by: string | null
          credit_limit: string | null
          danea_extra: Json | null
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
          bank?: string | null
          buyer_company_id: string
          city?: string | null
          contact_name?: string | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          credit_limit?: string | null
          danea_extra?: Json | null
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
          bank?: string | null
          buyer_company_id?: string
          city?: string | null
          contact_name?: string | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          credit_limit?: string | null
          danea_extra?: Json | null
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
          status?: Database["public"]["Enums"]["entity_status"]
          tax_code?: string | null
          updated_at?: string
          vat_normalized?: string | null
          vat_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "supplier_records_archive_id_fkey"
            columns: ["archive_id"]
            isOneToOne: false
            referencedRelation: "danea_archives"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_records_buyer_company_id_fkey"
            columns: ["buyer_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
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
      accept_purchase_delivery: {
        Args: { _actor_user_id?: string; _delivery_id: string }
        Returns: string
      }
      add_purchase_delivery_extra_item: {
        Args: {
          _actor_label?: string
          _actor_user_id?: string
          _declared_producer?: string
          _declared_producer_lot?: string
          _declared_quantity: number
          _delivery_id: string
          _line_notes?: string
          _line_type?: Database["public"]["Enums"]["purchase_delivery_line_type"]
          _product_id: string
          _replaces_order_item_id?: string
          _skip_access_check?: boolean
          _unit_code?: string
          _unit_id?: string
        }
        Returns: string
      }
      add_shopping_list_items: {
        Args: {
          _actor_user_id?: string
          _company_id: string
          _items: Json
          _list_id: string
          _replace_existing?: boolean
        }
        Returns: Json
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
      assign_shopping_list_supplier: {
        Args: {
          _action: string
          _actor_user_id?: string
          _assigned_quantity?: number
          _company_id: string
          _item_id: string
          _link_id?: string
          _min_warning_accepted?: boolean
          _notes?: string
          _purchase_quantity?: number
        }
        Returns: string
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
      can_declare_on_order: { Args: { _order_id: string }; Returns: boolean }
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
      can_write_supplier_record: {
        Args: { _supplier_record_id: string }
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
      compute_purchase_need: {
        Args: {
          _available: number
          _min_stock: number
          _needed: number
          _order_multiple?: number
        }
        Returns: {
          raw_need: number
          rounded: boolean
          suggested: number
        }[]
      }
      confirm_goods_receipt: {
        Args: { _actor_user_id?: string; _receipt_id: string }
        Returns: string
      }
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
      create_order_share_link: {
        Args: {
          _actor_user_id?: string
          _expires_at: string
          _order_id: string
          _recipient_label?: string
          _token_hash: string
        }
        Returns: string
      }
      create_purchase_orders_from_list: {
        Args: {
          _actor_user_id?: string
          _company_id: string
          _destination_location_id?: string
          _list_id: string
        }
        Returns: Json
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
      delivery_comparison: {
        Args: { _delivery_id: string }
        Returns: {
          accepted_quantity: number
          code: string
          declared: number
          declared_expiry: string
          declared_producer: string
          declared_producer_lot: string
          declared_weight: number
          delivery_item_id: string
          description: string
          difference: number
          dispute_id: string
          dispute_notes: string
          dispute_reason: string
          dispute_status: string
          line_notes: string
          line_type: string
          missing_reason: string
          order_item_id: string
          ordered: number
          outcome: string
          previously_declared: number
          product_id: string
          status: string
          unit_code: string
        }[]
      }
      dispute_purchase_delivery_item: {
        Args: {
          _actor_user_id?: string
          _delivery_item_id: string
          _notes?: string
          _reason: Database["public"]["Enums"]["purchase_dispute_reason"]
        }
        Returns: string
      }
      ensure_default_inventory_location: {
        Args: { _actor_user_id?: string; _company_id: string }
        Returns: string
      }
      external_order_snapshot: { Args: { _token_hash: string }; Returns: Json }
      generate_invite_code: { Args: never; Returns: string }
      goods_receipt_history: {
        Args: { _product_id: string }
        Returns: {
          location_name: string
          order_id: string
          order_number: string
          producer_lot_code: string
          producer_name: string
          receipt_id: string
          receipt_number: string
          received_at: string
          status: string
          supplier_name: string
          unit_code: string
          unit_cost: number
          verified_quantity: number
        }[]
      }
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
      inventory_location_stock: {
        Args: { _location_id: string; _product_id: string }
        Returns: {
          counted_at: string
          counted_by: string
          has_count: boolean
          quantity: number
        }[]
      }
      inventory_location_stock_list: {
        Args: { _archive_id: string; _company_id: string; _location_id: string }
        Returns: {
          counted_at: string
          has_count: boolean
          product_id: string
          quantity: number
        }[]
      }
      inventory_requirements: {
        Args: { _archive_id: string; _company_id: string; _needs?: Json }
        Returns: {
          available: number
          code: string
          count_status: string
          counted_locations: number
          danea_um: string
          description: string
          min_stock: number
          needed: number
          order_multiple: number
          product_id: string
          raw_need: number
          rounded: boolean
          suggested: number
          total_locations: number
        }[]
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
      is_order_supplier: { Args: { _order_id: string }; Returns: boolean }
      link_customer_record_to_relation: {
        Args: { _customer_record_id: string; _relation_id: string }
        Returns: undefined
      }
      link_supplier_record_to_relation: {
        Args: { _relation_id: string; _supplier_record_id: string }
        Returns: string
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
      manage_inventory_location: {
        Args: {
          _action: string
          _actor_user_id?: string
          _code?: string
          _company_id: string
          _is_default?: boolean
          _location_id?: string
          _name?: string
          _notes?: string
        }
        Returns: string
      }
      manage_inventory_session: {
        Args: {
          _action: string
          _actor_user_id?: string
          _archive_id?: string
          _company_id: string
          _location_id?: string
          _name?: string
          _notes?: string
          _scope?: Database["public"]["Enums"]["inventory_session_scope"]
          _session_id?: string
        }
        Returns: string
      }
      manage_product_stock_settings: {
        Args: {
          _actor_user_id?: string
          _clear_fields?: string[]
          _company_id: string
          _coverage_days?: number
          _min_stock?: number
          _notes?: string
          _order_multiple?: number
          _perishability?: string
          _product_ids: string[]
          _stock_unit_id?: string
        }
        Returns: number
      }
      manage_product_supplier_link: {
        Args: {
          _action: string
          _company_id: string
          _conversion_factor?: number
          _conversion_reference_um?: string
          _is_preferred?: boolean
          _lead_time_days?: number
          _link_id?: string
          _manual_cost?: number
          _min_quantity?: number
          _notes?: string
          _product_id?: string
          _purchase_unit_id?: string
          _supplier_product_code?: string
          _supplier_record_id?: string
        }
        Returns: string
      }
      manage_purchase_order: {
        Args: {
          _action: string
          _actor_user_id?: string
          _destination_location_id?: string
          _notes?: string
          _order_id: string
        }
        Returns: string
      }
      manage_shopping_list: {
        Args: {
          _action: string
          _actor_user_id?: string
          _archive_id?: string
          _company_id: string
          _list_id?: string
          _name?: string
          _notes?: string
        }
        Returns: string
      }
      manage_supplier_destination: {
        Args: {
          _action: string
          _address_id?: string
          _contact_name?: string
          _danea_reference?: string
          _destination_id?: string
          _function?: Database["public"]["Enums"]["address_function"]
          _internal_code?: string
          _is_default?: boolean
          _label?: string
          _notes?: string
          _phone?: string
          _supplier_record_id: string
        }
        Returns: string
      }
      manage_supplier_record: {
        Args: {
          _action: string
          _address_line?: string
          _agent?: string
          _archive_id?: string
          _bank?: string
          _buyer_company_id: string
          _city?: string
          _contact_name?: string
          _country?: string
          _credit_limit?: string
          _danea_extra?: Json
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
          _province?: string
          _region?: string
          _sdi_admin_reference?: string
          _sdi_code?: string
          _supplier_record_id?: string
          _tax_code?: string
          _vat_number?: string
        }
        Returns: string
      }
      manage_supplier_record_status: {
        Args: {
          _action: string
          _buyer_company_id: string
          _supplier_record_id: string
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
      next_document_number: {
        Args: { _company_id: string; _prefix: string }
        Returns: string
      }
      normalize_vat: { Args: { _value: string }; Returns: string }
      open_goods_receipt: {
        Args: { _actor_user_id?: string; _delivery_id: string }
        Returns: string
      }
      open_lot_reconciliation: {
        Args: {
          _actor_user_id?: string
          _location_id: string
          _notes?: string
          _product_id: string
        }
        Returns: string
      }
      open_purchase_delivery: {
        Args: {
          _actor_user_id?: string
          _declared_by_name?: string
          _order_id: string
          _origin?: Database["public"]["Enums"]["purchase_delivery_origin"]
          _skip_access_check?: boolean
        }
        Returns: string
      }
      order_supplier_company: { Args: { _order_id: string }; Returns: string }
      owns_customer_record: {
        Args: { _customer_record_id: string }
        Returns: boolean
      }
      owns_supplier_record: {
        Args: { _supplier_record_id: string }
        Returns: boolean
      }
      product_lot_availability: {
        Args: { _product_id: string }
        Returns: {
          entered_at: string
          expiry_date: string
          initial_quantity: number
          internal_code: string
          location_id: string
          location_name: string
          lot_id: string
          producer_lot_code: string
          producer_name: string
          remaining_quantity: number
          status: string
          supplier_name: string
          supplier_record_id: string
          unit_code: string
          unit_cost: number
        }[]
      }
      product_lot_reconciliation: {
        Args: { _location_id?: string; _product_id: string }
        Returns: {
          difference: number
          has_count: boolean
          location_id: string
          location_name: string
          lots_theoretical: number
          physical: number
        }[]
      }
      product_stock_overview: { Args: { _product_id: string }; Returns: Json }
      product_supplier_overview: {
        Args: { _product_id: string }
        Returns: {
          b2b_relation_status: Database["public"]["Enums"]["relation_status"]
          conversion_factor: number
          conversion_reference_um: string
          danea_cost_at: string
          danea_gross_cost: number
          danea_net_cost: number
          is_active: boolean
          is_preferred: boolean
          lead_time_days: number
          link_id: string
          manual_cost: number
          manual_cost_at: string
          min_quantity: number
          notes: string
          origin: Database["public"]["Enums"]["product_supplier_origin"]
          purchase_unit_code: string
          purchase_unit_id: string
          supplier_internal_reference: string
          supplier_name: string
          supplier_product_code: string
          supplier_record_id: string
        }[]
      }
      purchase_order_overview: {
        Args: { _company_id: string }
        Returns: {
          archive_id: string
          created_at: string
          declared_total: number
          deliveries: number
          destination_location_id: string
          destination_name: string
          lines: number
          notes: string
          number: string
          open_disputes: number
          order_id: string
          ordered_total: number
          received_total: number
          sent_at: string
          status: string
          supplier_name: string
          supplier_record_id: string
        }[]
      }
      record_inventory_adjustment: {
        Args: {
          _actor_user_id?: string
          _company_id: string
          _location_id: string
          _notes?: string
          _product_id: string
          _quantity: number
          _reason: string
        }
        Returns: string
      }
      record_inventory_count: {
        Args: {
          _actor_user_id?: string
          _company_id: string
          _counted_quantity: number
          _location_id: string
          _notes?: string
          _product_id: string
          _session_id: string
          _unit_code?: string
          _unit_id?: string
        }
        Returns: string
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
      remove_shopping_list_item: {
        Args: { _actor_user_id?: string; _company_id: string; _item_id: string }
        Returns: boolean
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
      resolve_danea_supplier_match: {
        Args: {
          _action: string
          _company_id: string
          _legal_name?: string
          _match_id: string
          _supplier_record_id?: string
        }
        Returns: string
      }
      resolve_default_price_list: {
        Args: { _company_id: string }
        Returns: number
      }
      resolve_lot_reconciliation: {
        Args: {
          _action: string
          _actor_user_id?: string
          _notes?: string
          _quantity?: number
          _reconciliation_id: string
          _stock_lot_id?: string
        }
        Returns: string
      }
      resolve_order_share_token: {
        Args: { _token_hash: string }
        Returns: string
      }
      resolve_purchase_delivery_dispute: {
        Args: {
          _accepted_quantity?: number
          _actor_user_id?: string
          _dispute_id: string
          _notes?: string
          _resolution: string
        }
        Returns: string
      }
      resolve_relation_records: {
        Args: { _relation_id: string }
        Returns: undefined
      }
      revoke_company_relation: {
        Args: { _relation_id: string }
        Returns: undefined
      }
      revoke_order_share_link: {
        Args: { _actor_user_id?: string; _link_id: string }
        Returns: string
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
      set_goods_receipt_item: {
        Args: {
          _actor_user_id?: string
          _expiry_date?: string
          _notes?: string
          _producer_lot_code?: string
          _producer_name?: string
          _receipt_item_id: string
          _unit_cost?: number
          _verified_quantity?: number
        }
        Returns: string
      }
      set_preferred_product_supplier: {
        Args: {
          _company_id: string
          _product_id: string
          _supplier_record_id?: string
        }
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
      set_purchase_delivery_item: {
        Args: {
          _actor_label?: string
          _actor_user_id?: string
          _declared_expiry?: string
          _declared_producer?: string
          _declared_producer_lot?: string
          _declared_quantity?: number
          _declared_weight?: number
          _delivery_item_id: string
          _line_notes?: string
          _missing_reason?: string
          _skip_access_check?: boolean
        }
        Returns: string
      }
      set_relation_side_enabled: {
        Args: { _enabled: boolean; _relation_id: string }
        Returns: undefined
      }
      set_shopping_list_item_quantity: {
        Args: {
          _actor_user_id?: string
          _company_id: string
          _decided_quantity: number
          _item_id: string
          _notes?: string
          _reason?: string
        }
        Returns: string
      }
      shares_company_with: { Args: { _user_id: string }; Returns: boolean }
      shares_relation_with: { Args: { _company_id: string }; Returns: boolean }
      shopping_list_item_state: {
        Args: { _item_id: string }
        Returns: {
          assigned: number
          remaining: number
          status: string
          under_minimum: number
          untranslatable: number
        }[]
      }
      shopping_list_overview: {
        Args: { _list_id: string }
        Returns: {
          assigned: number
          change_reason: string
          code: string
          created_at: string
          current_available: number
          current_min_stock: number
          current_order_multiple: number
          current_suggested: number
          decided_quantity: number
          description: string
          item_id: string
          origin: string
          product_id: string
          remaining: number
          snapshot_available: number
          snapshot_min_stock: number
          snapshot_needed: number
          snapshot_order_multiple: number
          snapshot_raw_need: number
          status: string
          suggested_quantity: number
          suppliers_available: number
          under_minimum: number
          unit_code: string
          untranslatable: number
        }[]
      }
      submit_purchase_delivery: {
        Args: {
          _actor_label?: string
          _actor_user_id?: string
          _delivery_id: string
          _notes?: string
          _skip_access_check?: boolean
        }
        Returns: string
      }
      supplier_record_match_suggestions: {
        Args: { _relation_id: string }
        Returns: {
          city: string
          id: string
          internal_reference: string
          legal_name: string
          vat_number: string
        }[]
      }
      sync_danea_product_supplier_links: {
        Args: { _company_id: string }
        Returns: Json
      }
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
      danea_supplier_match_status: "da_associare" | "associato" | "ignorato"
      danea_sync_mode: "full" | "incremental"
      danea_sync_outcome: "in_corso" | "completato" | "fallito"
      danea_sync_source: "postazione" | "manuale"
      delivery_line_event_type:
        | "dichiarata"
        | "modificata"
        | "contestata"
        | "rettificata"
        | "accettata"
        | "rifiutata"
      entity_status: "attivo" | "disattivato" | "revocato"
      goods_receipt_status: "bozza" | "confermato"
      inventory_movement_type:
        | "entrata_acquisto"
        | "uscita_cliente"
        | "scarto"
        | "reso"
        | "trasferimento"
        | "rettifica"
      inventory_session_scope: "generale" | "ubicazione"
      inventory_session_status: "in_corso" | "completata" | "annullata"
      invitation_status:
        | "in_attesa"
        | "accettato"
        | "annullato"
        | "annullato_scaduto"
      lot_reconciliation_status: "aperta" | "riconciliata" | "ignorata"
      product_publish_status: "pubblicato" | "non_pubblicato"
      product_supplier_origin: "manuale" | "danea"
      proposed_update_status: "in_attesa" | "accettato" | "rifiutato"
      purchase_delivery_line_status:
        | "dichiarata"
        | "accettata"
        | "contestata"
        | "rettificata"
        | "rifiutata"
      purchase_delivery_line_type:
        | "ordinata"
        | "aggiunta_fornitore"
        | "sostituzione"
      purchase_delivery_origin:
        | "fornitore_b2b"
        | "fornitore_link_esterno"
        | "operatore_interno"
      purchase_delivery_status:
        | "bozza"
        | "dichiarata"
        | "in_contestazione"
        | "accettata"
        | "chiusa_con_rifiuti"
      purchase_dispute_reason:
        | "quantita_inferiore"
        | "quantita_superiore"
        | "non_consegnato"
        | "non_ordinato"
        | "qualita"
        | "pezzatura"
        | "altro"
      purchase_dispute_status:
        | "aperta"
        | "risolta_accettata"
        | "risolta_rettificata"
        | "risolta_rifiutata"
      purchase_order_status:
        | "bozza"
        | "inviato"
        | "parzialmente_consegnato"
        | "consegnato"
        | "chiuso"
        | "annullato"
      relation_origin: "invito_fornitore" | "richiesta_cliente"
      relation_status:
        | "in_attesa"
        | "attivo"
        | "sospeso"
        | "revocato"
        | "rifiutato"
      shopping_list_item_origin: "manuale" | "fabbisogno"
      shopping_list_status: "aperta" | "confermata" | "chiusa" | "annullata"
      stock_lot_status: "disponibile" | "esaurito" | "bloccato"
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
      danea_supplier_match_status: ["da_associare", "associato", "ignorato"],
      danea_sync_mode: ["full", "incremental"],
      danea_sync_outcome: ["in_corso", "completato", "fallito"],
      danea_sync_source: ["postazione", "manuale"],
      delivery_line_event_type: [
        "dichiarata",
        "modificata",
        "contestata",
        "rettificata",
        "accettata",
        "rifiutata",
      ],
      entity_status: ["attivo", "disattivato", "revocato"],
      goods_receipt_status: ["bozza", "confermato"],
      inventory_movement_type: [
        "entrata_acquisto",
        "uscita_cliente",
        "scarto",
        "reso",
        "trasferimento",
        "rettifica",
      ],
      inventory_session_scope: ["generale", "ubicazione"],
      inventory_session_status: ["in_corso", "completata", "annullata"],
      invitation_status: [
        "in_attesa",
        "accettato",
        "annullato",
        "annullato_scaduto",
      ],
      lot_reconciliation_status: ["aperta", "riconciliata", "ignorata"],
      product_publish_status: ["pubblicato", "non_pubblicato"],
      product_supplier_origin: ["manuale", "danea"],
      proposed_update_status: ["in_attesa", "accettato", "rifiutato"],
      purchase_delivery_line_status: [
        "dichiarata",
        "accettata",
        "contestata",
        "rettificata",
        "rifiutata",
      ],
      purchase_delivery_line_type: [
        "ordinata",
        "aggiunta_fornitore",
        "sostituzione",
      ],
      purchase_delivery_origin: [
        "fornitore_b2b",
        "fornitore_link_esterno",
        "operatore_interno",
      ],
      purchase_delivery_status: [
        "bozza",
        "dichiarata",
        "in_contestazione",
        "accettata",
        "chiusa_con_rifiuti",
      ],
      purchase_dispute_reason: [
        "quantita_inferiore",
        "quantita_superiore",
        "non_consegnato",
        "non_ordinato",
        "qualita",
        "pezzatura",
        "altro",
      ],
      purchase_dispute_status: [
        "aperta",
        "risolta_accettata",
        "risolta_rettificata",
        "risolta_rifiutata",
      ],
      purchase_order_status: [
        "bozza",
        "inviato",
        "parzialmente_consegnato",
        "consegnato",
        "chiuso",
        "annullato",
      ],
      relation_origin: ["invito_fornitore", "richiesta_cliente"],
      relation_status: [
        "in_attesa",
        "attivo",
        "sospeso",
        "revocato",
        "rifiutato",
      ],
      shopping_list_item_origin: ["manuale", "fabbisogno"],
      shopping_list_status: ["aperta", "confermata", "chiusa", "annullata"],
      stock_lot_status: ["disponibile", "esaurito", "bloccato"],
    },
  },
} as const
