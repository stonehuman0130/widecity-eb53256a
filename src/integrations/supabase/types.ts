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
          group_id: string | null
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
          group_id?: string | null
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
          group_id?: string | null
          hidden_from_partner?: boolean
          id?: string
          month?: number
          time?: string
          title?: string
          user_id?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "events_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      google_calendar_tokens: {
        Row: {
          access_token: string
          created_at: string
          expires_at: string
          id: string
          refresh_token: string
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token: string
          created_at?: string
          expires_at: string
          id?: string
          refresh_token: string
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string
          created_at?: string
          expires_at?: string
          id?: string
          refresh_token?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      group_members: {
        Row: {
          group_id: string
          id: string
          joined_at: string
          role: string
          user_id: string
        }
        Insert: {
          group_id: string
          id?: string
          joined_at?: string
          role?: string
          user_id: string
        }
        Update: {
          group_id?: string
          id?: string
          joined_at?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      groups: {
        Row: {
          created_at: string
          created_by: string
          emoji: string
          id: string
          invite_code: string | null
          name: string
          type: string
        }
        Insert: {
          created_at?: string
          created_by: string
          emoji?: string
          id?: string
          invite_code?: string | null
          name: string
          type?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          emoji?: string
          id?: string
          invite_code?: string | null
          name?: string
          type?: string
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
          group_id: string | null
          hidden_from_partner: boolean
          id: string
          label: string
          user_id: string
        }
        Insert: {
          category?: string
          created_at?: string
          group_id?: string | null
          hidden_from_partner?: boolean
          id?: string
          label: string
          user_id: string
        }
        Update: {
          category?: string
          created_at?: string
          group_id?: string | null
          hidden_from_partner?: boolean
          id?: string
          label?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "habits_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
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
          group_id: string | null
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
          group_id?: string | null
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
          group_id?: string | null
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
        Relationships: [
          {
            foreignKeyName: "tasks_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
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
          group_id: string | null
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
          group_id?: string | null
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
          group_id?: string | null
          hidden_from_partner?: boolean
          id?: string
          scheduled_date?: string | null
          tag?: string
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workouts_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      connect_partner: { Args: { code: string }; Returns: Json }
      create_group: {
        Args: { _emoji?: string; _name: string; _type?: string }
        Returns: Json
      }
      create_shared_habit: {
        Args: { _category: string; _label: string }
        Returns: Json
      }
      disconnect_partner: { Args: never; Returns: Json }
      get_partner_id: { Args: { _user_id: string }; Returns: string }
      is_group_member: {
        Args: { _group_id: string; _user_id: string }
        Returns: boolean
      }
      join_group: { Args: { _code: string }; Returns: Json }
      leave_group: { Args: { _group_id: string }; Returns: Json }
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
