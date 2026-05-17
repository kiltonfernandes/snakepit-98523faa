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
      activity_logs: {
        Row: {
          action_type: string
          created_at: string
          details_json: Json
          entity_id: string | null
          entity_type: string
          id: string
          summary: string
        }
        Insert: {
          action_type: string
          created_at?: string
          details_json?: Json
          entity_id?: string | null
          entity_type: string
          id: string
          summary: string
        }
        Update: {
          action_type?: string
          created_at?: string
          details_json?: Json
          entity_id?: string | null
          entity_type?: string
          id?: string
          summary?: string
        }
        Relationships: []
      }
      ai_usage_logs: {
        Row: {
          created_at: string
          episode_date: string | null
          estimated_cost: number
          id: string
          model: string
          scope: string
          tokens_input: number
          tokens_output: number
          week_id: string | null
        }
        Insert: {
          created_at?: string
          episode_date?: string | null
          estimated_cost?: number
          id: string
          model?: string
          scope?: string
          tokens_input?: number
          tokens_output?: number
          week_id?: string | null
        }
        Update: {
          created_at?: string
          episode_date?: string | null
          estimated_cost?: number
          id?: string
          model?: string
          scope?: string
          tokens_input?: number
          tokens_output?: number
          week_id?: string | null
        }
        Relationships: []
      }
      app_settings: {
        Row: {
          ai_model: string
          banned_terms_text: string
          brand_tone_temperature: number
          default_export_container: string
          default_export_layout: string
          description_template_html: string
          prompt_overrides_json: Json
          singleton_id: number
          theme_name: string
        }
        Insert: {
          ai_model?: string
          banned_terms_text?: string
          brand_tone_temperature?: number
          default_export_container?: string
          default_export_layout?: string
          description_template_html?: string
          prompt_overrides_json?: Json
          singleton_id?: number
          theme_name?: string
        }
        Update: {
          ai_model?: string
          banned_terms_text?: string
          brand_tone_temperature?: number
          default_export_container?: string
          default_export_layout?: string
          description_template_html?: string
          prompt_overrides_json?: Json
          singleton_id?: number
          theme_name?: string
        }
        Relationships: []
      }
      editorial_weeks: {
        Row: {
          created_at: string
          id: string
          start_date: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id: string
          start_date: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          start_date?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      episode_materials: {
        Row: {
          cover_saved_at: string | null
          cover_source_url: string | null
          cover_url: string | null
          created_at: string
          description_html: string | null
          episode_date: string
          id: string
          is_standalone: boolean
          mentioned_in_episode: string | null
          repository_file_id: string | null
          repository_provider: string | null
          repository_uploaded_at: string | null
          repository_url: string | null
          selected_title_index: number | null
          slot_key: string
          source_pauta_id: string | null
          spotify_link: string | null
          title_options_json: Json
          updated_at: string
          week_id: string
        }
        Insert: {
          cover_saved_at?: string | null
          cover_source_url?: string | null
          cover_url?: string | null
          created_at?: string
          description_html?: string | null
          episode_date: string
          id: string
          is_standalone?: boolean
          mentioned_in_episode?: string | null
          repository_file_id?: string | null
          repository_provider?: string | null
          repository_uploaded_at?: string | null
          repository_url?: string | null
          selected_title_index?: number | null
          slot_key: string
          source_pauta_id?: string | null
          spotify_link?: string | null
          title_options_json?: Json
          updated_at?: string
          week_id: string
        }
        Update: {
          cover_saved_at?: string | null
          cover_source_url?: string | null
          cover_url?: string | null
          created_at?: string
          description_html?: string | null
          episode_date?: string
          id?: string
          is_standalone?: boolean
          mentioned_in_episode?: string | null
          repository_file_id?: string | null
          repository_provider?: string | null
          repository_uploaded_at?: string | null
          repository_url?: string | null
          selected_title_index?: number | null
          slot_key?: string
          source_pauta_id?: string | null
          spotify_link?: string | null
          title_options_json?: Json
          updated_at?: string
          week_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "episode_materials_source_pauta_id_fkey"
            columns: ["source_pauta_id"]
            isOneToOne: false
            referencedRelation: "pautas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "episode_materials_week_id_fkey"
            columns: ["week_id"]
            isOneToOne: false
            referencedRelation: "editorial_weeks"
            referencedColumns: ["id"]
          },
        ]
      }
      pauta_news_links: {
        Row: {
          pauta_id: string
          position: number
          url: string
        }
        Insert: {
          pauta_id: string
          position: number
          url: string
        }
        Update: {
          pauta_id?: string
          position?: number
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "pauta_news_links_pauta_id_fkey"
            columns: ["pauta_id"]
            isOneToOne: false
            referencedRelation: "pautas"
            referencedColumns: ["id"]
          },
        ]
      }
      pauta_releases: {
        Row: {
          pauta_id: string
          position: number
          release_id: string
        }
        Insert: {
          pauta_id: string
          position?: number
          release_id: string
        }
        Update: {
          pauta_id?: string
          position?: number
          release_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pauta_releases_pauta_id_fkey"
            columns: ["pauta_id"]
            isOneToOne: false
            referencedRelation: "pautas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pauta_releases_release_id_fkey"
            columns: ["release_id"]
            isOneToOne: false
            referencedRelation: "releases"
            referencedColumns: ["id"]
          },
        ]
      }
      pauta_templates: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          sections_config: Json
          segway_intro: string | null
          segway_outro: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id: string
          name: string
          sections_config?: Json
          segway_intro?: string | null
          segway_outro?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          sections_config?: Json
          segway_intro?: string | null
          segway_outro?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      pautas: {
        Row: {
          created_at: string
          discovered_links_json: Json
          finalized_at: string | null
          id: string
          is_standalone: boolean
          pauta_type: string
          publication_date: string
          raw_inputs_json: Json
          rendered_markdown: string | null
          rendered_text: string | null
          sections_json: Json
          standalone_topics: Json
          status: string
          template_id: string | null
          updated_at: string
          warnings_json: Json
          week_id: string
        }
        Insert: {
          created_at?: string
          discovered_links_json?: Json
          finalized_at?: string | null
          id: string
          is_standalone?: boolean
          pauta_type?: string
          publication_date: string
          raw_inputs_json?: Json
          rendered_markdown?: string | null
          rendered_text?: string | null
          sections_json?: Json
          standalone_topics?: Json
          status?: string
          template_id?: string | null
          updated_at?: string
          warnings_json?: Json
          week_id: string
        }
        Update: {
          created_at?: string
          discovered_links_json?: Json
          finalized_at?: string | null
          id?: string
          is_standalone?: boolean
          pauta_type?: string
          publication_date?: string
          raw_inputs_json?: Json
          rendered_markdown?: string | null
          rendered_text?: string | null
          sections_json?: Json
          standalone_topics?: Json
          status?: string
          template_id?: string | null
          updated_at?: string
          warnings_json?: Json
          week_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pautas_week_id_fkey"
            columns: ["week_id"]
            isOneToOne: false
            referencedRelation: "editorial_weeks"
            referencedColumns: ["id"]
          },
        ]
      }
      prompt_sessions: {
        Row: {
          applied_at: string | null
          created_at: string
          error_message: string | null
          id: string
          parsed_payload_json: Json | null
          prompt_text: string
          response_text: string | null
          scope: string
          status: string
          target_json: Json
          updated_at: string
        }
        Insert: {
          applied_at?: string | null
          created_at?: string
          error_message?: string | null
          id: string
          parsed_payload_json?: Json | null
          prompt_text: string
          response_text?: string | null
          scope: string
          status?: string
          target_json: Json
          updated_at?: string
        }
        Update: {
          applied_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          parsed_payload_json?: Json | null
          prompt_text?: string
          response_text?: string | null
          scope?: string
          status?: string
          target_json?: Json
          updated_at?: string
        }
        Relationships: []
      }
      release_genres: {
        Row: {
          genre: string
          release_id: string
        }
        Insert: {
          genre: string
          release_id: string
        }
        Update: {
          genre?: string
          release_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "release_genres_release_id_fkey"
            columns: ["release_id"]
            isOneToOne: false
            referencedRelation: "releases"
            referencedColumns: ["id"]
          },
        ]
      }
      releases: {
        Row: {
          album: string
          apple_music_url: string | null
          artist: string
          bandcamp_url: string | null
          comments: string | null
          country: string | null
          created_at: string
          deezer_url: string | null
          id: string
          metal_archives_url: string | null
          rating: number | null
          release_date: string
          spotify_url: string | null
          updated_at: string
          youtube_url: string | null
        }
        Insert: {
          album: string
          apple_music_url?: string | null
          artist: string
          bandcamp_url?: string | null
          comments?: string | null
          country?: string | null
          created_at?: string
          deezer_url?: string | null
          id: string
          metal_archives_url?: string | null
          rating?: number | null
          release_date: string
          spotify_url?: string | null
          updated_at?: string
          youtube_url?: string | null
        }
        Update: {
          album?: string
          apple_music_url?: string | null
          artist?: string
          bandcamp_url?: string | null
          comments?: string | null
          country?: string | null
          created_at?: string
          deezer_url?: string | null
          id?: string
          metal_archives_url?: string | null
          rating?: number | null
          release_date?: string
          spotify_url?: string | null
          updated_at?: string
          youtube_url?: string | null
        }
        Relationships: []
      }
      rivaldo_presets: {
        Row: {
          audio_params_json: Json
          created_at: string
          description: string | null
          id: string
          is_default: boolean
          name: string
          processing_profile_json: Json
          updated_at: string
        }
        Insert: {
          audio_params_json?: Json
          created_at?: string
          description?: string | null
          id: string
          is_default?: boolean
          name: string
          processing_profile_json?: Json
          updated_at?: string
        }
        Update: {
          audio_params_json?: Json
          created_at?: string
          description?: string | null
          id?: string
          is_default?: boolean
          name?: string
          processing_profile_json?: Json
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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
