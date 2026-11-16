export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: {
          extensions?: Json;
          operationName?: string;
          query?: string;
          variables?: Json;
        };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      calling_catalog: {
        Row: {
          access: string;
          active: boolean;
          id: string;
          level: string;
          name_en: string | null;
          name_es: string | null;
          name_pt: string;
          notify_group: string | null;
          org_chart_section: string | null;
          sort_order: number;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          access?: string;
          active?: boolean;
          id: string;
          level: string;
          name_en?: string | null;
          name_es?: string | null;
          name_pt: string;
          notify_group?: string | null;
          org_chart_section?: string | null;
          sort_order: number;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          access?: string;
          active?: boolean;
          id?: string;
          level?: string;
          name_en?: string | null;
          name_es?: string | null;
          name_pt?: string;
          notify_group?: string | null;
          org_chart_section?: string | null;
          sort_order?: number;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [];
      };
      calling_catalog_log: {
        Row: {
          actor_id: string | null;
          after: Json;
          before: Json | null;
          calling_id: string;
          created_at: string;
          id: string;
        };
        Insert: {
          actor_id?: string | null;
          after: Json;
          before?: Json | null;
          calling_id: string;
          created_at?: string;
          id?: string;
        };
        Update: {
          actor_id?: string | null;
          after?: Json;
          before?: Json | null;
          calling_id?: string;
          created_at?: string;
          id?: string;
        };
        Relationships: [];
      };
      events: {
        Row: {
          created_at: string;
          created_by: string | null;
          ends_at: string;
          id: string;
          links: string[];
          location: string;
          notes: string;
          starts_at: string;
          title: string;
          type: string;
          unit_id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          ends_at: string;
          id?: string;
          links?: string[];
          location?: string;
          notes?: string;
          starts_at: string;
          title: string;
          type: string;
          unit_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          ends_at?: string;
          id?: string;
          links?: string[];
          location?: string;
          notes?: string;
          starts_at?: string;
          title?: string;
          type?: string;
          unit_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'events_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'events_unit_id_fkey';
            columns: ['unit_id'];
            isOneToOne: false;
            referencedRelation: 'units';
            referencedColumns: ['id'];
          },
        ];
      };
      member_calls: {
        Row: {
          calling_id: string;
          granted_at: string;
          granted_by: string | null;
          id: string;
          org_chart_consent: string | null;
          org_chart_consent_at: string | null;
          unit_id: string;
          user_id: string;
        };
        Insert: {
          calling_id: string;
          granted_at?: string;
          granted_by?: string | null;
          id?: string;
          org_chart_consent?: string | null;
          org_chart_consent_at?: string | null;
          unit_id: string;
          user_id: string;
        };
        Update: {
          calling_id?: string;
          granted_at?: string;
          granted_by?: string | null;
          id?: string;
          org_chart_consent?: string | null;
          org_chart_consent_at?: string | null;
          unit_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'member_calls_calling_id_fkey';
            columns: ['calling_id'];
            isOneToOne: false;
            referencedRelation: 'calling_catalog';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'member_calls_granted_by_fkey';
            columns: ['granted_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'member_calls_unit_id_fkey';
            columns: ['unit_id'];
            isOneToOne: false;
            referencedRelation: 'units';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'member_calls_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      memberships: {
        Row: {
          granted_at: string;
          granted_by: string | null;
          id: string;
          role: string;
          unit_id: string;
          user_id: string;
        };
        Insert: {
          granted_at?: string;
          granted_by?: string | null;
          id?: string;
          role: string;
          unit_id: string;
          user_id: string;
        };
        Update: {
          granted_at?: string;
          granted_by?: string | null;
          id?: string;
          role?: string;
          unit_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'memberships_granted_by_fkey';
            columns: ['granted_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'memberships_unit_id_fkey';
            columns: ['unit_id'];
            isOneToOne: false;
            referencedRelation: 'units';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'memberships_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      notification_deliveries: {
        Row: {
          device_token: string;
          notification_id: string;
          user_id: string | null;
        };
        Insert: {
          device_token: string;
          notification_id: string;
          user_id?: string | null;
        };
        Update: {
          device_token?: string;
          notification_id?: string;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'notification_deliveries_notification_id_fkey';
            columns: ['notification_id'];
            isOneToOne: false;
            referencedRelation: 'notifications';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'notification_deliveries_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      notification_reads: {
        Row: {
          notification_id: string;
          read_at: string;
          user_id: string;
        };
        Insert: {
          notification_id: string;
          read_at?: string;
          user_id: string;
        };
        Update: {
          notification_id?: string;
          read_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'notification_reads_notification_id_fkey';
            columns: ['notification_id'];
            isOneToOne: false;
            referencedRelation: 'notifications';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'notification_reads_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      notifications: {
        Row: {
          audience: string[];
          body: string;
          created_at: string;
          event_location: string | null;
          event_starts_at: string | null;
          id: string;
          item_id: string;
          kind: string;
          sent_by: string | null;
          title: string;
          unit_id: string;
        };
        Insert: {
          audience: string[];
          body?: string;
          created_at?: string;
          event_location?: string | null;
          event_starts_at?: string | null;
          id?: string;
          item_id: string;
          kind: string;
          sent_by?: string | null;
          title: string;
          unit_id: string;
        };
        Update: {
          audience?: string[];
          body?: string;
          created_at?: string;
          event_location?: string | null;
          event_starts_at?: string | null;
          id?: string;
          item_id?: string;
          kind?: string;
          sent_by?: string | null;
          title?: string;
          unit_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'notifications_sent_by_fkey';
            columns: ['sent_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'notifications_unit_id_fkey';
            columns: ['unit_id'];
            isOneToOne: false;
            referencedRelation: 'units';
            referencedColumns: ['id'];
          },
        ];
      };
      profiles: {
        Row: {
          consented_at: string | null;
          created_at: string;
          display_name: string;
          home_unit_id: string | null;
          id: string;
          locale: string;
          organizations: string[];
          updated_at: string;
        };
        Insert: {
          consented_at?: string | null;
          created_at?: string;
          display_name: string;
          home_unit_id?: string | null;
          id: string;
          locale?: string;
          organizations?: string[];
          updated_at?: string;
        };
        Update: {
          consented_at?: string | null;
          created_at?: string;
          display_name?: string;
          home_unit_id?: string | null;
          id?: string;
          locale?: string;
          organizations?: string[];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'profiles_home_unit_id_fkey';
            columns: ['home_unit_id'];
            isOneToOne: false;
            referencedRelation: 'units';
            referencedColumns: ['id'];
          },
        ];
      };
      push_devices: {
        Row: {
          created_at: string;
          last_seen_at: string;
          locale: string;
          platform: string;
          token: string;
          units: string[];
          user_id: string | null;
        };
        Insert: {
          created_at?: string;
          last_seen_at?: string;
          locale: string;
          platform: string;
          token: string;
          units: string[];
          user_id?: string | null;
        };
        Update: {
          created_at?: string;
          last_seen_at?: string;
          locale?: string;
          platform?: string;
          token?: string;
          units?: string[];
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'push_devices_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      push_register_attempts: {
        Row: {
          created_at: string;
          id: number;
          ip_hash: string;
        };
        Insert: {
          created_at?: string;
          id?: never;
          ip_hash: string;
        };
        Update: {
          created_at?: string;
          id?: never;
          ip_hash?: string;
        };
        Relationships: [];
      };
      role_grants_log: {
        Row: {
          action: string;
          actor_id: string | null;
          calling_id: string | null;
          created_at: string;
          id: string;
          leadership_group: string | null;
          role: string;
          unit_id: string;
          user_id: string;
        };
        Insert: {
          action: string;
          actor_id?: string | null;
          calling_id?: string | null;
          created_at?: string;
          id?: string;
          leadership_group?: string | null;
          role: string;
          unit_id: string;
          user_id: string;
        };
        Update: {
          action?: string;
          actor_id?: string | null;
          calling_id?: string | null;
          created_at?: string;
          id?: string;
          leadership_group?: string | null;
          role?: string;
          unit_id?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      units: {
        Row: {
          id: string;
          kind: string;
          name: string;
          sort_order: number;
        };
        Insert: {
          id: string;
          kind: string;
          name: string;
          sort_order: number;
        };
        Update: {
          id?: string;
          kind?: string;
          name?: string;
          sort_order?: number;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      calling_holder_count: { Args: { p_id: string }; Returns: number };
      can_lead: { Args: { p_unit: string }; Returns: boolean };
      can_publish: { Args: { p_unit: string }; Returns: boolean };
      complete_welcome: {
        Args: {
          p_display_name: string;
          p_home_unit_id: string;
          p_locale: string;
        };
        Returns: undefined;
      };
      delete_my_account: { Args: never; Returns: undefined };
      export_my_data: { Args: never; Returns: Json };
      grant_admin: { Args: { p_email: string }; Returns: undefined };
      grant_calling: {
        Args: { p_calling_id: string; p_email: string; p_unit_id: string };
        Returns: string;
      };
      has_role: {
        Args: { p_roles: string[]; p_unit: string };
        Returns: boolean;
      };
      is_admin: { Args: never; Returns: boolean };
      is_stake_leader: { Args: never; Returns: boolean };
      is_stake_publisher: { Args: never; Returns: boolean };
      legacy_role_to_calling: {
        Args: { p_group: string; p_role: string; p_unit_kind: string };
        Returns: string;
      };
      list_access: {
        Args: never;
        Returns: {
          calling_id: string;
          calling_name_en: string;
          calling_name_es: string;
          calling_name_pt: string;
          display_name: string;
          email: string;
          entry_id: string;
          kind: string;
          unit_id: string;
          user_id: string;
        }[];
      };
      mark_notifications_read: { Args: { p_ids: string[] }; Returns: undefined };
      my_accesses: {
        Args: never;
        Returns: {
          access: string;
          unit_id: string;
        }[];
      };
      my_device_units: { Args: { p_device_token: string }; Returns: string[] };
      my_notifications: {
        Args: { p_device_token: string };
        Returns: {
          body: string;
          created_at: string;
          event_location: string;
          event_starts_at: string;
          id: string;
          item_id: string;
          kind: string;
          read: boolean;
          title: string;
          unit_id: string;
        }[];
      };
      org_chart_members: {
        Args: never;
        Returns: {
          calling_id: string;
          calling_name_en: string;
          calling_name_es: string;
          calling_name_pt: string;
          display_name: string;
          member_call_id: string;
          section: string;
          sort_order: number;
          unit_id: string;
        }[];
      };
      push_audience_options: { Args: { p_unit: string }; Returns: string[] };
      push_cleanup: { Args: never; Returns: undefined };
      push_discard: { Args: { p_notification_id: string }; Returns: undefined };
      push_item: {
        Args: { p_item_id: string; p_kind: string };
        Returns: {
          location: string;
          starts_at: string;
          text_body: string;
          title: string;
          unit_id: string;
        }[];
      };
      push_prepare: {
        Args: {
          p_actor: string;
          p_audience: string[];
          p_body: string;
          p_event_location: string;
          p_event_starts_at: string;
          p_item_id: string;
          p_kind: string;
          p_title: string;
        };
        Returns: Json;
      };
      push_recipients: {
        Args: { p_audience: string[]; p_unit: string };
        Returns: {
          locale: string;
          token: string;
          user_id: string;
        }[];
      };
      push_register_device: {
        Args: {
          p_ip_hash: string;
          p_locale: string;
          p_platform: string;
          p_token: string;
          p_user_id: string;
        };
        Returns: string;
      };
      push_remove_devices: { Args: { p_tokens: string[] }; Returns: undefined };
      revoke_admin: { Args: { p_user_id: string }; Returns: undefined };
      revoke_calling: { Args: { p_member_call_id: string }; Returns: undefined };
      save_calling: {
        Args: {
          p_access: string;
          p_active: boolean;
          p_id: string;
          p_level: string;
          p_name_en: string;
          p_name_es: string;
          p_name_pt: string;
          p_notify_group: string;
          p_org_chart_section: string;
        };
        Returns: string;
      };
      set_device_units: {
        Args: { p_device_token: string; p_units: string[] };
        Returns: undefined;
      };
      set_org_chart_consent: {
        Args: { p_accepted: boolean; p_member_call_id: string };
        Returns: undefined;
      };
      valid_event_links: { Args: { p_links: string[] }; Returns: boolean };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema['Enums'] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema['CompositeTypes'] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const;
