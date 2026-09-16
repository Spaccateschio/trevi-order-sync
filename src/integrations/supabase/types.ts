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
      companies: {
        Row: {
          address_line: string | null
          brand_primary_color: string | null
          brand_secondary_color: string | null
          city: string | null
          country: string
          created_at: string
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
          vat_number: string | null
        }
        Insert: {
          address_line?: string | null
          brand_primary_color?: string | null
          brand_secondary_color?: string | null
          city?: string | null
          country?: string
          created_at?: string
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
          vat_number?: string | null
        }
        Update: {
          address_line?: string | null
          brand_primary_color?: string | null
          brand_secondary_color?: string | null
          city?: string | null
          country?: string
          created_at?: string
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
          vat_number?: string | null
        }
        Relationships: []
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
          display_name: string
          notes: string | null
          timezone: string
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          display_name: string
          notes?: string | null
          timezone?: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
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
      customer_companies: {
        Row: {
          address_line: string | null
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
          phone: string | null
          postal_code: string | null
          province: string | null
          status: Database["public"]["Enums"]["entity_status"]
          tax_code: string | null
          updated_at: string
          vat_number: string | null
        }
        Insert: {
          address_line?: string | null
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
          phone?: string | null
          postal_code?: string | null
          province?: string | null
          status?: Database["public"]["Enums"]["entity_status"]
          tax_code?: string | null
          updated_at?: string
          vat_number?: string | null
        }
        Update: {
          address_line?: string | null
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
          phone?: string | null
          postal_code?: string | null
          province?: string | null
          status?: Database["public"]["Enums"]["entity_status"]
          tax_code?: string | null
          updated_at?: string
          vat_number?: string | null
        }
        Relationships: []
      }
      customer_company_users: {
        Row: {
          created_at: string
          customer_company_id: string
          id: string
          role: Database["public"]["Enums"]["customer_user_role"]
          status: Database["public"]["Enums"]["entity_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          customer_company_id: string
          id?: string
          role?: Database["public"]["Enums"]["customer_user_role"]
          status?: Database["public"]["Enums"]["entity_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          customer_company_id?: string
          id?: string
          role?: Database["public"]["Enums"]["customer_user_role"]
          status?: Database["public"]["Enums"]["entity_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_company_users_customer_company_id_fkey"
            columns: ["customer_company_id"]
            isOneToOne: false
            referencedRelation: "customer_companies"
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
          company_id: string
          created_at: string
          customer_company_id: string
          decided_at: string | null
          decided_by: string | null
          id: string
          internal_reference: string | null
          notes: string | null
          origin: Database["public"]["Enums"]["relation_origin"]
          requested_at: string
          requested_by: string | null
          status: Database["public"]["Enums"]["relation_status"]
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          customer_company_id: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          internal_reference?: string | null
          notes?: string | null
          origin?: Database["public"]["Enums"]["relation_origin"]
          requested_at?: string
          requested_by?: string | null
          status?: Database["public"]["Enums"]["relation_status"]
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          customer_company_id?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          internal_reference?: string | null
          notes?: string | null
          origin?: Database["public"]["Enums"]["relation_origin"]
          requested_at?: string
          requested_by?: string | null
          status?: Database["public"]["Enums"]["relation_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_customer_relations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_customer_relations_customer_company_id_fkey"
            columns: ["customer_company_id"]
            isOneToOne: false
            referencedRelation: "customer_companies"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      customer_sees_company: { Args: { _company_id: string }; Returns: boolean }
      has_company_role: {
        Args: {
          _company_id: string
          _role: Database["public"]["Enums"]["app_role"]
        }
        Returns: boolean
      }
      is_company_admin: { Args: { _company_id: string }; Returns: boolean }
      is_company_member: { Args: { _company_id: string }; Returns: boolean }
      is_customer_owner: {
        Args: { _customer_company_id: string }
        Returns: boolean
      }
      is_customer_user: {
        Args: { _customer_company_id: string }
        Returns: boolean
      }
      register_customer_company: {
        Args: {
          _address_line?: string
          _city?: string
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
      shares_company_with: { Args: { _user_id: string }; Returns: boolean }
      supplier_admin_of_customer: {
        Args: { _customer_company_id: string }
        Returns: boolean
      }
      supplier_sees_customer: {
        Args: { _customer_company_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "amministratore" | "operatore" | "trasportatore"
      customer_user_role: "owner" | "member"
      entity_status: "attivo" | "disattivato" | "revocato"
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
      app_role: ["amministratore", "operatore", "trasportatore"],
      customer_user_role: ["owner", "member"],
      entity_status: ["attivo", "disattivato", "revocato"],
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
