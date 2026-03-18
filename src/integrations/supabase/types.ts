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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      events: {
        Row: {
          assignee: string
          created_at: string
          day: number
          description: string | null
          hidden_from_partner: boolean
          id: string
          month: number
          time: string
          title: string
          user_id: string
          year: number
        }
        Insert: {
          assignee?: string
          created_at?: string
          day: number
          description?: string | null
          hidden_from_partner?: boolean
          id?: string
          month: number
          time?: string
          title: string
          user_id: string
          year: number
        }
        Update: {
          assignee?: string
          created_at?: string
          day?: number
          description?: string | null
          hidden_from_partner?: boolean
          id?: string
          month?: number
          time?: string
          title?: string
          user_id?: string
          year?: number
        }
        Relationships: []
      }
      habit_completions: {
        Row: {
          completed_date: string
          created_at: string
          habit_id: string
          id: string
          user_id: string
        }
        Insert: {
          completed_date: string
          created_at?: string
          habit_id: string
          id?: string
          user_id: string
        }
        Update: {
          completed_date?: string
          created_at?: string
          habit_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "habit_completions_habit_id_fkey"
            columns: ["habit_id"]
            isOneToOne: false
            referencedRelation: "habits"
            referencedColumns: ["id"]
          },
        ]
      }
      habits: {
        Row: {
          category: string
          created_at: string
          hidden_from_partner: boolean
          id: string
          label: string
          user_id: string
        }
        Insert: {
          category?: string
          created_at?: string
          hidden_from_partner?: boolean
          id?: string
          label: string
          user_id: string
        }
        Update: {
          category?: string
          created_at?: string
          hidden_from_partner?: boolean
          id?: string
          label?: string
          user_id?: string
        }
        Relationships: []
      }
      nudges: {
        Row: {
          created_at: string
          from_user_id: string
          habit_id: string | null
          id: string
          message: string
          seen: boolean
          to_user_id: string
        }
        Insert: {
          created_at?: string
          from_user_id: string
          habit_id?: string | null
          id?: string
          message?: string
          seen?: boolean
          to_user_id: string
        }
        Update: {
          created_at?: string
          from_user_id?: string
          habit_id?: string | null
          id?: string
          message?: string
          seen?: boolean
          to_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "nudges_habit_id_fkey"
            columns: ["habit_id"]
            isOneToOne: false
            referencedRelation: "habits"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          calendar_token: string | null
          created_at: string
          display_name: string
          email: string | null
          id: string
          invite_code: string | null
          partner_id: string | null
          timezone: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          calendar_token?: string | null
          created_at?: string
          display_name?: string
          email?: string | null
          id: string
          invite_code?: string | null
          partner_id?: string | null
          timezone?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          calendar_token?: string | null
          created_at?: string
          display_name?: string
          email?: string | null
          id?: string
          invite_code?: string | null
          partner_id?: string | null
          timezone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          assignee: string
          created_at: string
          done: boolean
          hidden_from_partner: boolean
          id: string
          scheduled_day: number | null
          scheduled_month: number | null
          scheduled_year: number | null
          tag: string
          time: string
          title: string
          user_id: string
        }
        Insert: {
          assignee?: string
          created_at?: string
          done?: boolean
          hidden_from_partner?: boolean
          id?: string
          scheduled_day?: number | null
          scheduled_month?: number | null
          scheduled_year?: number | null
          tag?: string
          time?: string
          title: string
          user_id: string
        }
        Update: {
          assignee?: string
          created_at?: string
          done?: boolean
          hidden_from_partner?: boolean
          id?: string
          scheduled_day?: number | null
          scheduled_month?: number | null
          scheduled_year?: number | null
          tag?: string
          time?: string
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      water_tracking: {
        Row: {
          date: string
          goal: number
          id: string
          intake: number
          user_id: string
        }
        Insert: {
          date?: string
          goal?: number
          id?: string
          intake?: number
          user_id: string
        }
        Update: {
          date?: string
          goal?: number
          id?: string
          intake?: number
          user_id?: string
        }
        Relationships: []
      }
      workouts: {
        Row: {
          cal: number
          completed_date: string | null
          created_at: string
          done: boolean
          duration: string
          emoji: string
          exercises: Json | null
          hidden_from_partner: boolean
          id: string
          scheduled_date: string | null
          tag: string
          title: string
          user_id: string
        }
        Insert: {
          cal?: number
          completed_date?: string | null
          created_at?: string
          done?: boolean
          duration?: string
          emoji?: string
          exercises?: Json | null
          hidden_from_partner?: boolean
          id?: string
          scheduled_date?: string | null
          tag?: string
          title: string
          user_id: string
        }
        Update: {
          cal?: number
          completed_date?: string | null
          created_at?: string
          done?: boolean
          duration?: string
          emoji?: string
          exercises?: Json | null
          hidden_from_partner?: boolean
          id?: string
          scheduled_date?: string | null
          tag?: string
          title?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      connect_partner: { Args: { code: string }; Returns: Json }
      create_shared_habit: {
        Args: { _category: string; _label: string }
        Returns: Json
      }
      disconnect_partner: { Args: never; Returns: Json }
      get_partner_id: { Args: { _user_id: string }; Returns: string }
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
