export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type JobStatus =
  | "intake"
  | "ready"
  | "notified"
  | "owner_handling"
  | "closed";

export type PhotoPolicy = "always" | "if_helpful" | "never";

type ConversationRow = {
  id: string;
  phone: string;
  last_message_at: string;
  last_message_preview: string;
  created_at: string;
  ai_paused: boolean;
  paused_at: string | null;
  customer_name: string | null;
  owner_notes: string | null;
  draft_problem: string | null;
  draft_is_emergency: boolean | null;
  draft_address: string | null;
  draft_availability: string | null;
  draft_job_type: string | null;
  draft_location_lat: number | null;
  draft_location_lng: number | null;
  draft_photo_count: number;
};

type OwnerAssistantMessageRow = {
  id: string;
  role: "owner" | "assistant";
  content: string;
  created_at: string;
};

type MessageRow = {
  id: string;
  conversation_id: string;
  role: "user" | "assistant" | "owner";
  content: string;
  created_at: string;
};

type GoogleTokenRow = {
  id: string;
  access_token: string;
  refresh_token: string;
  token_expiry: string;
  calendar_id: string;
  is_valid: boolean;
  created_at: string;
  updated_at: string;
};

type JobRow = {
  id: string;
  conversation_id: string | null;
  phone: string;
  customer_name: string | null;
  problem: string;
  job_type: string | null;
  is_emergency: boolean;
  address_text: string | null;
  location_lat: number | null;
  location_lng: number | null;
  customer_availability: string | null;
  status: JobStatus;
  notified_at: string | null;
  created_at: string;
  updated_at: string;
};

type JobMediaRow = {
  id: string;
  job_id: string | null;
  conversation_id: string;
  storage_path: string;
  mime_type: string | null;
  whatsapp_media_id: string | null;
  created_at: string;
};

type ServiceRow = {
  id: string;
  name: string;
  duration_minutes: number;
  price: number;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

type BusinessProfileRow = {
  id: boolean;
  name: string;
  trade: string;
  persona: string;
  service_area: string;
  owner_notify_phone: string;
  photo_policy: PhotoPolicy;
  emergency_policy: string;
  updated_at: string;
};

type BusinessHoursRow = {
  day_of_week: number;
  is_open: boolean;
  intervals: Json;
};

export type Database = {
  public: {
    Tables: {
      conversations: {
        Row: ConversationRow;
        Insert: {
          id?: string;
          phone: string;
          last_message_at?: string;
          last_message_preview?: string;
          created_at?: string;
          ai_paused?: boolean;
          paused_at?: string | null;
          customer_name?: string | null;
          owner_notes?: string | null;
          draft_problem?: string | null;
          draft_is_emergency?: boolean | null;
          draft_address?: string | null;
          draft_availability?: string | null;
          draft_job_type?: string | null;
          draft_location_lat?: number | null;
          draft_location_lng?: number | null;
          draft_photo_count?: number;
        };
        Update: Partial<ConversationRow>;
        Relationships: [];
      };
      owner_assistant_messages: {
        Row: OwnerAssistantMessageRow;
        Insert: {
          id?: string;
          role: "owner" | "assistant";
          content: string;
          created_at?: string;
        };
        Update: Partial<OwnerAssistantMessageRow>;
        Relationships: [];
      };
      messages: {
        Row: MessageRow;
        Insert: {
          id?: string;
          conversation_id: string;
          role: "user" | "assistant" | "owner";
          content: string;
          created_at?: string;
        };
        Update: Partial<MessageRow>;
        Relationships: [];
      };
      google_calendar_tokens: {
        Row: GoogleTokenRow;
        Insert: {
          id?: string;
          access_token: string;
          refresh_token: string;
          token_expiry: string;
          calendar_id?: string;
          is_valid?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<GoogleTokenRow>;
        Relationships: [];
      };
      jobs: {
        Row: JobRow;
        Insert: {
          id?: string;
          conversation_id?: string | null;
          phone: string;
          customer_name?: string | null;
          problem?: string;
          job_type?: string | null;
          is_emergency?: boolean;
          address_text?: string | null;
          location_lat?: number | null;
          location_lng?: number | null;
          customer_availability?: string | null;
          status?: JobStatus;
          notified_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<JobRow>;
        Relationships: [];
      };
      job_media: {
        Row: JobMediaRow;
        Insert: {
          id?: string;
          job_id?: string | null;
          conversation_id: string;
          storage_path: string;
          mime_type?: string | null;
          whatsapp_media_id?: string | null;
          created_at?: string;
        };
        Update: Partial<JobMediaRow>;
        Relationships: [];
      };
      services: {
        Row: ServiceRow;
        Insert: {
          id?: string;
          name: string;
          duration_minutes?: number;
          price?: number;
          is_active?: boolean;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<ServiceRow>;
        Relationships: [];
      };
      business_profile: {
        Row: BusinessProfileRow;
        Insert: {
          id?: boolean;
          name?: string;
          trade?: string;
          persona?: string;
          service_area?: string;
          owner_notify_phone?: string;
          photo_policy?: PhotoPolicy;
          emergency_policy?: string;
          updated_at?: string;
        };
        Update: Partial<BusinessProfileRow>;
        Relationships: [];
      };
      business_hours: {
        Row: BusinessHoursRow;
        Insert: {
          day_of_week: number;
          is_open?: boolean;
          intervals?: Json;
        };
        Update: Partial<BusinessHoursRow>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
