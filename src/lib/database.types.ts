// AUTOGENERADO por `pnpm run db:types`. NO editar a mano.
// Regenerar tras cada migración.


export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "appointment_notes": {
                  Row: {
                    "appointment_id": string,"note": string,"updated_at": string
                  }
                  Insert: {
                    "appointment_id": string,"note": string,"updated_at"?: string
                  }
                  Update: {
                    "appointment_id"?: string,"note"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "appointment_notes_appointment_id_fkey"
      columns: ["appointment_id"]
isOneToOne: true
      referencedRelation: "appointments"
      referencedColumns: ["id"]
    }
                  ]
                },"appointment_tokens": {
                  Row: {
                    "appointment_id": string,"created_at": string,"expires_at": string,"token_hash": string
                  }
                  Insert: {
                    "appointment_id": string,"created_at"?: string,"expires_at": string,"token_hash": string
                  }
                  Update: {
                    "appointment_id"?: string,"created_at"?: string,"expires_at"?: string,"token_hash"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "appointment_tokens_appointment_id_fkey"
      columns: ["appointment_id"]
isOneToOne: true
      referencedRelation: "appointments"
      referencedColumns: ["id"]
    }
                  ]
                },"appointments": {
                  Row: {
                    "anonymized_at": string | null,"confirmation_email_sent_at": string | null,"consent_at": string | null,"consent_version": string | null,"created_at": string,"during": unknown,"guest_email": string | null,"guest_name": string | null,"guest_phone": string | null,"id": string,"service_id": string,"status": Database["public"]['Enums']["appointment_status"],"stylist_id": string,"updated_at": string,"user_id": string | null
                  }
                  Insert: {
                    "anonymized_at"?: string | null,"confirmation_email_sent_at"?: string | null,"consent_at"?: string | null,"consent_version"?: string | null,"created_at"?: string,"during": unknown,"guest_email"?: string | null,"guest_name"?: string | null,"guest_phone"?: string | null,"id"?: string,"service_id": string,"status"?: Database["public"]['Enums']["appointment_status"],"stylist_id": string,"updated_at"?: string,"user_id"?: string | null
                  }
                  Update: {
                    "anonymized_at"?: string | null,"confirmation_email_sent_at"?: string | null,"consent_at"?: string | null,"consent_version"?: string | null,"created_at"?: string,"during"?: unknown,"guest_email"?: string | null,"guest_name"?: string | null,"guest_phone"?: string | null,"id"?: string,"service_id"?: string,"status"?: Database["public"]['Enums']["appointment_status"],"stylist_id"?: string,"updated_at"?: string,"user_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "appointments_service_id_fkey"
      columns: ["service_id"]
isOneToOne: false
      referencedRelation: "services"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "appointments_stylist_id_fkey"
      columns: ["stylist_id"]
isOneToOne: false
      referencedRelation: "stylists"
      referencedColumns: ["id"]
    }
                  ]
                },"gallery_items": {
                  Row: {
                    "active": boolean,"after_path": string,"ai_generated": boolean,"alt_after": string,"alt_before": string,"before_path": string,"created_at": string,"id": string,"service_id": string,"sort_order": number,"stylist_id": string,"technique": string
                  }
                  Insert: {
                    "active"?: boolean,"after_path": string,"ai_generated"?: boolean,"alt_after": string,"alt_before": string,"before_path": string,"created_at"?: string,"id"?: string,"service_id": string,"sort_order"?: number,"stylist_id": string,"technique": string
                  }
                  Update: {
                    "active"?: boolean,"after_path"?: string,"ai_generated"?: boolean,"alt_after"?: string,"alt_before"?: string,"before_path"?: string,"created_at"?: string,"id"?: string,"service_id"?: string,"sort_order"?: number,"stylist_id"?: string,"technique"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "gallery_items_service_id_fkey"
      columns: ["service_id"]
isOneToOne: false
      referencedRelation: "services"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "gallery_items_stylist_id_fkey"
      columns: ["stylist_id"]
isOneToOne: false
      referencedRelation: "stylists"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "created_at": string,"full_name": string | null,"id": string,"phone": string | null,"role": Database["public"]['Enums']["user_role"]
                  }
                  Insert: {
                    "created_at"?: string,"full_name"?: string | null,"id": string,"phone"?: string | null,"role"?: Database["public"]['Enums']["user_role"]
                  }
                  Update: {
                    "created_at"?: string,"full_name"?: string | null,"id"?: string,"phone"?: string | null,"role"?: Database["public"]['Enums']["user_role"]
                  }
                  Relationships: [
                    
                  ]
                },"rate_limits": {
                  Row: {
                    "created_at": string,"id": number,"key_hash": string,"kind": string
                  }
                  Insert: {
                    "created_at"?: string,"id"?: never,"key_hash": string,"kind": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: never,"key_hash"?: string,"kind"?: string
                  }
                  Relationships: [
                    
                  ]
                },"salon_hours": {
                  Row: {
                    "closes": string,"id": string,"opens": string,"weekday": number
                  }
                  Insert: {
                    "closes": string,"id"?: string,"opens": string,"weekday": number
                  }
                  Update: {
                    "closes"?: string,"id"?: string,"opens"?: string,"weekday"?: number
                  }
                  Relationships: [
                    
                  ]
                },"services": {
                  Row: {
                    "active": boolean,"category": string,"created_at": string,"duration_min": number,"id": string,"name": string,"price_from_cents": number,"sort_order": number
                  }
                  Insert: {
                    "active"?: boolean,"category": string,"created_at"?: string,"duration_min": number,"id"?: string,"name": string,"price_from_cents": number,"sort_order"?: number
                  }
                  Update: {
                    "active"?: boolean,"category"?: string,"created_at"?: string,"duration_min"?: number,"id"?: string,"name"?: string,"price_from_cents"?: number,"sort_order"?: number
                  }
                  Relationships: [
                    
                  ]
                },"stylist_schedule": {
                  Row: {
                    "ends": string,"id": string,"starts": string,"stylist_id": string,"weekday": number
                  }
                  Insert: {
                    "ends": string,"id"?: string,"starts": string,"stylist_id": string,"weekday": number
                  }
                  Update: {
                    "ends"?: string,"id"?: string,"starts"?: string,"stylist_id"?: string,"weekday"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "stylist_schedule_stylist_id_fkey"
      columns: ["stylist_id"]
isOneToOne: false
      referencedRelation: "stylists"
      referencedColumns: ["id"]
    }
                  ]
                },"stylist_services": {
                  Row: {
                    "service_id": string,"stylist_id": string
                  }
                  Insert: {
                    "service_id": string,"stylist_id": string
                  }
                  Update: {
                    "service_id"?: string,"stylist_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "stylist_services_service_id_fkey"
      columns: ["service_id"]
isOneToOne: false
      referencedRelation: "services"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "stylist_services_stylist_id_fkey"
      columns: ["stylist_id"]
isOneToOne: false
      referencedRelation: "stylists"
      referencedColumns: ["id"]
    }
                  ]
                },"stylists": {
                  Row: {
                    "active": boolean,"bio": string | null,"created_at": string,"id": string,"name": string,"specialty": string | null
                  }
                  Insert: {
                    "active"?: boolean,"bio"?: string | null,"created_at"?: string,"id"?: string,"name": string,"specialty"?: string | null
                  }
                  Update: {
                    "active"?: boolean,"bio"?: string | null,"created_at"?: string,"id"?: string,"name"?: string,"specialty"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"time_blocks": {
                  Row: {
                    "created_at": string,"during": unknown,"id": string,"kind": Database["public"]['Enums']["time_block_kind"],"note": string | null,"stylist_id": string
                  }
                  Insert: {
                    "created_at"?: string,"during": unknown,"id"?: string,"kind"?: Database["public"]['Enums']["time_block_kind"],"note"?: string | null,"stylist_id": string
                  }
                  Update: {
                    "created_at"?: string,"during"?: unknown,"id"?: string,"kind"?: Database["public"]['Enums']["time_block_kind"],"note"?: string | null,"stylist_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "time_blocks_stylist_id_fkey"
      columns: ["stylist_id"]
isOneToOne: false
      referencedRelation: "stylists"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "admin_appointment_availability":
{ Args: { "p_appointment_id": string,"p_date": string }; Returns: {
              "starts_at": string,"stylist_id": string
            }[]
                           },
"admin_cancel_appointment":
{ Args: { "p_appointment_id": string }; Returns: {
              "id": string,"status": Database["public"]['Enums']["appointment_status"]
            }[]
                           },
"admin_create_time_blocks":
{ Args: { "p_ends_at": string,"p_kind": Database["public"]['Enums']["time_block_kind"],"p_note"?: string,"p_starts_at": string,"p_stylist_ids": (string)[] }; Returns: number
                           },
"admin_reschedule_appointment":
{ Args: { "p_appointment_id": string,"p_starts_at": string,"p_stylist_id": string }; Returns: {
              "ends_at": string,"id": string,"starts_at": string,"stylist_id": string
            }[]
                           },
"admin_save_service":
{ Args: { "p_active": boolean,"p_category": string,"p_duration_min": number,"p_id"?: string,"p_name": string,"p_price_from_cents": number,"p_stylist_ids": (string)[] }; Returns: string
                           },
"admin_save_weekly_hours":
{ Args: { "p_ranges": Json,"p_stylist_id"?: string }; Returns: number
                           },
"admin_schedule_conflicts":
{ Args: { "p_ranges": Json,"p_stylist_id"?: string }; Returns: {
              "appointment_id": string,"ends_at": string,"starts_at": string,"stylist_id": string
            }[]
                           },
"anonymize_expired_data":
{ Args: { "p_months"?: number }; Returns: {
              "appointments_anonymized": number,"profiles_cleared": number,"rate_limits_purged": number
            }[]
                           },
"anonymize_person":
{ Args: { "p_guest_email": string,"p_user_id": string }; Returns: number
                           },
"availability_core":
{ Args: { "p_date": string,"p_exclude_appointment": string,"p_service_id": string,"p_stylist_id": string }; Returns: {
              "starts_at": string,"stylist_id": string
            }[]
                           },
"cancel_guest_appointment":
{ Args: { "p_token": string }; Returns: {
              "id": string,"status": Database["public"]['Enums']["appointment_status"]
            }[]
                           },
"consume_login_link_quota":
{ Args: { "p_email_hash": string,"p_ip_hash"?: string,"p_max_per_email"?: number,"p_max_per_ip"?: number,"p_window_minutes"?: number }; Returns: undefined
                           },
"create_booking":
{ Args: { "p_consent_version": string,"p_guest_email": string,"p_guest_name": string,"p_guest_phone": string,"p_ip_hash"?: string,"p_ip_window_minutes"?: number,"p_max_active_per_email"?: number,"p_max_per_ip"?: number,"p_service_id": string,"p_starts_at": string,"p_stylist_id": string }; Returns: {
              "appointment_id": string,"ends_at": string,"starts_at": string
            }[]
                           },
"delete_account_data":
{ Args: { "p_user_id": string }; Returns: number
                           },
"delete_guest_data":
{ Args: { "p_token": string }; Returns: number
                           },
"get_availability":
{ Args: { "p_date": string,"p_service_id": string,"p_stylist_id"?: string }; Returns: {
              "starts_at": string,"stylist_id": string
            }[]
                           },
"get_guest_appointment":
{ Args: { "p_token": string }; Returns: {
              "ends_at": string,"id": string,"service_id": string,"starts_at": string,"status": Database["public"]['Enums']["appointment_status"],"stylist_id": string
            }[]
                           },
"get_guest_reschedule_availability":
{ Args: { "p_date": string,"p_token": string }; Returns: {
              "starts_at": string,"stylist_id": string
            }[]
                           },
"is_admin":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"issue_management_token":
{ Args: { "p_appointment_id": string }; Returns: string
                           },
"reschedule_guest_appointment":
{ Args: { "p_starts_at": string,"p_stylist_id": string,"p_token": string }; Returns: {
              "ends_at": string,"id": string,"starts_at": string,"stylist_id": string
            }[]
                           },
"schedule_conflicts":
{ Args: { "p_ranges": Json,"p_stylist_id": string }; Returns: {
              "appointment_id": string,"ends_at": string,"starts_at": string,"stylist_id": string
            }[]
                           }
          }
          Enums: {
            "appointment_status": "pending"|"confirmed"|"completed"|"no_show"|"cancelled","time_block_kind": "vacation"|"break"|"block","user_role": "client"|"admin"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            "appointment_status": ["pending", "confirmed", "completed", "no_show", "cancelled"],"time_block_kind": ["vacation", "break", "block"],"user_role": ["client", "admin"]
          }
        }
} as const

