export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      batches: {
        Row: {
          code: string
          created_at: string
          created_by: string | null
          id: string
          location: string | null
          notes: string | null
          sown_at: string | null
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: string | null
          id?: string
          location?: string | null
          notes?: string | null
          sown_at?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string | null
          id?: string
          location?: string | null
          notes?: string | null
          sown_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "batches_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      calibration_profiles: {
        Row: {
          created_at: string
          id: string
          name: string
          px_per_mm: number
          source: Database["public"]["Enums"]["calibration_source"]
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          px_per_mm: number
          source: Database["public"]["Enums"]["calibration_source"]
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          px_per_mm?: number
          source?: Database["public"]["Enums"]["calibration_source"]
        }
        Relationships: []
      }
      inspections: {
        Row: {
          batch_id: string | null
          calibration_id: string | null
          captured_at: string
          created_at: string
          id: string
          image_url: string
          inspector_id: string
          mean_area_mm2: number | null
          mean_length_mm: number | null
          mean_width_mm: number | null
          notes: string | null
          status: Database["public"]["Enums"]["inspection_status"]
          total_seeds: number
          variety_id: string
        }
        Insert: {
          batch_id?: string | null
          calibration_id?: string | null
          captured_at?: string
          created_at?: string
          id?: string
          image_url: string
          inspector_id: string
          mean_area_mm2?: number | null
          mean_length_mm?: number | null
          mean_width_mm?: number | null
          notes?: string | null
          status?: Database["public"]["Enums"]["inspection_status"]
          total_seeds?: number
          variety_id: string
        }
        Update: {
          batch_id?: string | null
          calibration_id?: string | null
          captured_at?: string
          created_at?: string
          id?: string
          image_url?: string
          inspector_id?: string
          mean_area_mm2?: number | null
          mean_length_mm?: number | null
          mean_width_mm?: number | null
          notes?: string | null
          status?: Database["public"]["Enums"]["inspection_status"]
          total_seeds?: number
          variety_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inspections_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inspections_calibration_id_fkey"
            columns: ["calibration_id"]
            isOneToOne: false
            referencedRelation: "calibration_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inspections_inspector_id_fkey"
            columns: ["inspector_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inspections_variety_id_fkey"
            columns: ["variety_id"]
            isOneToOne: false
            referencedRelation: "varieties"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string
          full_name: string | null
          id: string
          locale: Database["public"]["Enums"]["locale"]
          role: Database["public"]["Enums"]["role"]
          touched_at: string
        }
        Insert: {
          created_at?: string
          email: string
          full_name?: string | null
          id: string
          locale?: Database["public"]["Enums"]["locale"]
          role?: Database["public"]["Enums"]["role"]
          touched_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          locale?: Database["public"]["Enums"]["locale"]
          role?: Database["public"]["Enums"]["role"]
          touched_at?: string
        }
        Relationships: []
      }
      seeds: {
        Row: {
          area_mm2: number
          bbox: Json
          defects: Json
          grade: Database["public"]["Enums"]["seed_grade"]
          id: string
          index: number
          inspection_id: string
          length_mm: number
          width_mm: number
        }
        Insert: {
          area_mm2: number
          bbox: Json
          defects?: Json
          grade: Database["public"]["Enums"]["seed_grade"]
          id?: string
          index: number
          inspection_id: string
          length_mm: number
          width_mm: number
        }
        Update: {
          area_mm2?: number
          bbox?: Json
          defects?: Json
          grade?: Database["public"]["Enums"]["seed_grade"]
          id?: string
          index?: number
          inspection_id?: string
          length_mm?: number
          width_mm?: number
        }
        Relationships: [
          {
            foreignKeyName: "seeds_inspection_id_fkey"
            columns: ["inspection_id"]
            isOneToOne: false
            referencedRelation: "inspections"
            referencedColumns: ["id"]
          },
        ]
      }
      varieties: {
        Row: {
          color_key: string | null
          coco_class_id: number | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          image_url: string | null
          model_class_aliases: string[] | null
          name: string
          ref_length_mm: number | null
          ref_width_mm: number | null
          scientific_name: string | null
        }
        Insert: {
          color_key?: string | null
          coco_class_id?: number | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          model_class_aliases?: string[] | null
          name: string
          ref_length_mm?: number | null
          ref_width_mm?: number | null
          scientific_name?: string | null
        }
        Update: {
          color_key?: string | null
          coco_class_id?: number | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          model_class_aliases?: string[] | null
          name?: string
          ref_length_mm?: number | null
          ref_width_mm?: number | null
          scientific_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "varieties_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      current_role_value: {
        Args: never
        Returns: Database["public"]["Enums"]["role"]
      }
      is_admin: { Args: never; Returns: boolean }
    }
    Enums: {
      calibration_source: "lidar" | "aruco"
      inspection_status: "pending" | "analyzing" | "complete" | "failed"
      locale: "en" | "th"
      role: "inspector" | "admin"
      seed_grade: "A" | "B" | "C" | "reject"
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
    Enums: {
      calibration_source: ["lidar", "aruco"],
      inspection_status: ["pending", "analyzing", "complete", "failed"],
      locale: ["en", "th"],
      role: ["inspector", "admin"],
      seed_grade: ["A", "B", "C", "reject"],
    },
  },
} as const

