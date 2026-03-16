/**
 * Supabase Database type definitions.
 *
 * These types are manually defined to match the SQL schema.
 * In production, regenerate with:
 *   npx supabase gen types typescript --project-id <project-id> > src/lib/supabase/types.ts
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string;
          name: string | null;
          avatar: string | null;
          organization: string | null;
          role: Database["public"]["Enums"]["UserRole"];
          createdAt: string;
          updatedAt: string;
        };
        Insert: {
          id: string;
          email: string;
          name?: string | null;
          avatar?: string | null;
          organization?: string | null;
          role?: Database["public"]["Enums"]["UserRole"];
          createdAt?: string;
          updatedAt?: string;
        };
        Update: {
          id?: string;
          email?: string;
          name?: string | null;
          avatar?: string | null;
          organization?: string | null;
          role?: Database["public"]["Enums"]["UserRole"];
          createdAt?: string;
          updatedAt?: string;
        };
        Relationships: [];
      };
      workspaces: {
        Row: {
          id: string;
          name: string;
          slug: string;
          ownerId: string;
          createdAt: string;
          updatedAt: string;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          ownerId: string;
          createdAt?: string;
          updatedAt?: string;
        };
        Update: {
          id?: string;
          name?: string;
          slug?: string;
          ownerId?: string;
          createdAt?: string;
          updatedAt?: string;
        };
        Relationships: [];
      };
      workspace_members: {
        Row: {
          id: string;
          workspaceId: string;
          userId: string;
          role: Database["public"]["Enums"]["MemberRole"];
          joinedAt: string;
        };
        Insert: {
          id?: string;
          workspaceId: string;
          userId: string;
          role?: Database["public"]["Enums"]["MemberRole"];
          joinedAt?: string;
        };
        Update: {
          id?: string;
          workspaceId?: string;
          userId?: string;
          role?: Database["public"]["Enums"]["MemberRole"];
          joinedAt?: string;
        };
        Relationships: [];
      };
      interviews: {
        Row: {
          id: string;
          title: string;
          description: string | null;
          objective: string | null;
          assessmentCriteria: Json | null;
          mode: Database["public"]["Enums"]["InterviewMode"];
          allowModeSwitch: boolean;
          userId: string;
          workspaceId: string | null;
          aiPersona: string | null;
          aiName: string;
          aiTone: Database["public"]["Enums"]["ToneLevel"];
          followUpDepth: Database["public"]["Enums"]["FollowUpDepth"];
          language: string;
          llmProvider: string | null;
          llmModel: string | null;
          isActive: boolean;
          timeLimitMinutes: number | null;
          customBranding: Json | null;
          publicSlug: string | null;
          requireInvite: boolean;
          videoMode: boolean;
          chatEnabled: boolean;
          voiceEnabled: boolean;
          videoEnabled: boolean;
          createdAt: string;
          updatedAt: string;
        };
        Insert: {
          id?: string;
          title: string;
          description?: string | null;
          objective?: string | null;
          assessmentCriteria?: Json | null;
          mode?: Database["public"]["Enums"]["InterviewMode"];
          allowModeSwitch?: boolean;
          userId: string;
          workspaceId?: string | null;
          aiPersona?: string | null;
          aiName?: string;
          aiTone?: Database["public"]["Enums"]["ToneLevel"];
          followUpDepth?: Database["public"]["Enums"]["FollowUpDepth"];
          language?: string;
          llmProvider?: string | null;
          llmModel?: string | null;
          isActive?: boolean;
          timeLimitMinutes?: number | null;
          customBranding?: Json | null;
          publicSlug?: string | null;
          requireInvite?: boolean;
          videoMode?: boolean;
          chatEnabled?: boolean;
          voiceEnabled?: boolean;
          videoEnabled?: boolean;
          createdAt?: string;
          updatedAt?: string;
        };
        Update: {
          id?: string;
          title?: string;
          description?: string | null;
          objective?: string | null;
          assessmentCriteria?: Json | null;
          mode?: Database["public"]["Enums"]["InterviewMode"];
          allowModeSwitch?: boolean;
          userId?: string;
          workspaceId?: string | null;
          aiPersona?: string | null;
          aiName?: string;
          aiTone?: Database["public"]["Enums"]["ToneLevel"];
          followUpDepth?: Database["public"]["Enums"]["FollowUpDepth"];
          language?: string;
          llmProvider?: string | null;
          llmModel?: string | null;
          isActive?: boolean;
          timeLimitMinutes?: number | null;
          customBranding?: Json | null;
          publicSlug?: string | null;
          requireInvite?: boolean;
          videoMode?: boolean;
          chatEnabled?: boolean;
          voiceEnabled?: boolean;
          videoEnabled?: boolean;
          createdAt?: string;
          updatedAt?: string;
        };
        Relationships: [];
      };
      questions: {
        Row: {
          id: string;
          interviewId: string;
          order: number;
          text: string;
          description: string | null;
          type: Database["public"]["Enums"]["QuestionType"];
          options: Json | null;
          starterCode: Json | null;
          validationRules: Json | null;
          followUpPrompts: Json | null;
          probeOnShort: boolean;
          probeThreshold: number | null;
          showIf: Json | null;
          skipIf: Json | null;
          timeLimitSeconds: number | null;
          isRequired: boolean;
          allowFileUpload: boolean;
          allowedFileTypes: string[];
          createdAt: string;
          updatedAt: string;
        };
        Insert: {
          id?: string;
          interviewId: string;
          order: number;
          text: string;
          description?: string | null;
          type: Database["public"]["Enums"]["QuestionType"];
          options?: Json | null;
          starterCode?: Json | null;
          validationRules?: Json | null;
          followUpPrompts?: Json | null;
          probeOnShort?: boolean;
          probeThreshold?: number | null;
          showIf?: Json | null;
          skipIf?: Json | null;
          timeLimitSeconds?: number | null;
          isRequired?: boolean;
          allowFileUpload?: boolean;
          allowedFileTypes?: string[];
          createdAt?: string;
          updatedAt?: string;
        };
        Update: {
          id?: string;
          interviewId?: string;
          order?: number;
          text?: string;
          description?: string | null;
          type?: Database["public"]["Enums"]["QuestionType"];
          options?: Json | null;
          starterCode?: Json | null;
          validationRules?: Json | null;
          followUpPrompts?: Json | null;
          probeOnShort?: boolean;
          probeThreshold?: number | null;
          showIf?: Json | null;
          skipIf?: Json | null;
          timeLimitSeconds?: number | null;
          isRequired?: boolean;
          allowFileUpload?: boolean;
          allowedFileTypes?: string[];
          createdAt?: string;
          updatedAt?: string;
        };
        Relationships: [];
      };
      sessions: {
        Row: {
          id: string;
          interviewId: string;
          participantEmail: string | null;
          participantName: string | null;
          participantPhone: string | null;
          participantMetadata: Json | null;
          status: Database["public"]["Enums"]["SessionStatus"];
          currentQuestionId: string | null;
          modeUsed: Database["public"]["Enums"]["InterviewMode"];
          modeSwitches: number;
          summary: string | null;
          insights: Json | null;
          themes: string[];
          sentiment: Json | null;
          startedAt: string;
          completedAt: string | null;
          lastActivityAt: string;
          totalDurationSeconds: number | null;
          audioRecordingUrl: string | null;
          audioDuration: number | null;
          screenshots: Json | null;
          createdAt: string;
          updatedAt: string;
        };
        Insert: {
          id?: string;
          interviewId: string;
          participantEmail?: string | null;
          participantName?: string | null;
          participantPhone?: string | null;
          participantMetadata?: Json | null;
          status?: Database["public"]["Enums"]["SessionStatus"];
          currentQuestionId?: string | null;
          modeUsed?: Database["public"]["Enums"]["InterviewMode"];
          modeSwitches?: number;
          summary?: string | null;
          insights?: Json | null;
          themes?: string[];
          sentiment?: Json | null;
          startedAt?: string;
          completedAt?: string | null;
          lastActivityAt?: string;
          totalDurationSeconds?: number | null;
          audioRecordingUrl?: string | null;
          audioDuration?: number | null;
          screenshots?: Json | null;
          createdAt?: string;
          updatedAt?: string;
        };
        Update: {
          id?: string;
          interviewId?: string;
          participantEmail?: string | null;
          participantName?: string | null;
          participantPhone?: string | null;
          participantMetadata?: Json | null;
          status?: Database["public"]["Enums"]["SessionStatus"];
          currentQuestionId?: string | null;
          modeUsed?: Database["public"]["Enums"]["InterviewMode"];
          modeSwitches?: number;
          summary?: string | null;
          insights?: Json | null;
          themes?: string[];
          sentiment?: Json | null;
          startedAt?: string;
          completedAt?: string | null;
          lastActivityAt?: string;
          totalDurationSeconds?: number | null;
          audioRecordingUrl?: string | null;
          audioDuration?: number | null;
          screenshots?: Json | null;
          createdAt?: string;
          updatedAt?: string;
        };
        Relationships: [];
      };
      messages: {
        Row: {
          id: string;
          sessionId: string;
          role: Database["public"]["Enums"]["MessageRole"];
          content: string;
          contentType: Database["public"]["Enums"]["ContentType"];
          audioUrl: string | null;
          audioDurationSeconds: number | null;
          transcription: string | null;
          whiteboardData: Json | null;
          whiteboardImageUrl: string | null;
          whiteboardPages: number;
          questionId: string | null;
          isFollowUp: boolean;
          parentMessageId: string | null;
          sentiment: string | null;
          wordCount: number | null;
          readingTimeSeconds: number | null;
          timestamp: string;
        };
        Insert: {
          id?: string;
          sessionId: string;
          role: Database["public"]["Enums"]["MessageRole"];
          content: string;
          contentType?: Database["public"]["Enums"]["ContentType"];
          audioUrl?: string | null;
          audioDurationSeconds?: number | null;
          transcription?: string | null;
          whiteboardData?: Json | null;
          whiteboardImageUrl?: string | null;
          whiteboardPages?: number;
          questionId?: string | null;
          isFollowUp?: boolean;
          parentMessageId?: string | null;
          sentiment?: string | null;
          wordCount?: number | null;
          readingTimeSeconds?: number | null;
          timestamp?: string;
        };
        Update: {
          id?: string;
          sessionId?: string;
          role?: Database["public"]["Enums"]["MessageRole"];
          content?: string;
          contentType?: Database["public"]["Enums"]["ContentType"];
          audioUrl?: string | null;
          audioDurationSeconds?: number | null;
          transcription?: string | null;
          whiteboardData?: Json | null;
          whiteboardImageUrl?: string | null;
          whiteboardPages?: number;
          questionId?: string | null;
          isFollowUp?: boolean;
          parentMessageId?: string | null;
          sentiment?: string | null;
          wordCount?: number | null;
          readingTimeSeconds?: number | null;
          timestamp?: string;
        };
        Relationships: [];
      };
      api_keys: {
        Row: {
          id: string;
          userId: string;
          name: string;
          key: string;
          lastUsedAt: string | null;
          expiresAt: string | null;
          isActive: boolean;
          createdAt: string;
        };
        Insert: {
          id?: string;
          userId: string;
          name: string;
          key: string;
          lastUsedAt?: string | null;
          expiresAt?: string | null;
          isActive?: boolean;
          createdAt?: string;
        };
        Update: {
          id?: string;
          userId?: string;
          name?: string;
          key?: string;
          lastUsedAt?: string | null;
          expiresAt?: string | null;
          isActive?: boolean;
          createdAt?: string;
        };
        Relationships: [];
      };
      project_members: {
        Row: {
          id: string;
          projectId: string;
          userId: string;
          role: Database["public"]["Enums"]["MemberRole"];
          assignedAt: string;
        };
        Insert: {
          id?: string;
          projectId: string;
          userId: string;
          role?: Database["public"]["Enums"]["MemberRole"];
          assignedAt?: string;
        };
        Update: {
          id?: string;
          projectId?: string;
          userId?: string;
          role?: Database["public"]["Enums"]["MemberRole"];
          assignedAt?: string;
        };
        Relationships: [];
      };
      audit_logs: {
        Row: {
          id: string;
          userId: string | null;
          action: string;
          resourceType: string;
          resourceId: string | null;
          metadata: Json | null;
          ipAddress: string | null;
          userAgent: string | null;
          createdAt: string;
        };
        Insert: {
          id?: string;
          userId?: string | null;
          action: string;
          resourceType: string;
          resourceId?: string | null;
          metadata?: Json | null;
          ipAddress?: string | null;
          userAgent?: string | null;
          createdAt?: string;
        };
        Update: {
          id?: string;
          userId?: string | null;
          action?: string;
          resourceType?: string;
          resourceId?: string | null;
          metadata?: Json | null;
          ipAddress?: string | null;
          userAgent?: string | null;
          createdAt?: string;
        };
        Relationships: [];
      };
      webhooks: {
        Row: {
          id: string;
          userId: string;
          url: string;
          events: string[];
          secret: string | null;
          isActive: boolean;
          createdAt: string;
          updatedAt: string;
        };
        Insert: {
          id?: string;
          userId: string;
          url: string;
          events?: string[];
          secret?: string | null;
          isActive?: boolean;
          createdAt?: string;
          updatedAt?: string;
        };
        Update: {
          id?: string;
          userId?: string;
          url?: string;
          events?: string[];
          secret?: string | null;
          isActive?: boolean;
          createdAt?: string;
          updatedAt?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      UserRole: "USER" | "ADMIN" | "ENTERPRISE";
      MemberRole: "OWNER" | "ADMIN" | "MEMBER" | "VIEWER";
      InterviewMode: "CHAT" | "VOICE" | "HYBRID";
      ToneLevel: "CASUAL" | "PROFESSIONAL" | "FORMAL" | "FRIENDLY";
      FollowUpDepth: "LIGHT" | "MODERATE" | "DEEP";
      QuestionType:
        | "OPEN_ENDED"
        | "SINGLE_CHOICE"
        | "MULTIPLE_CHOICE"
        | "CODING"
        | "WHITEBOARD"
        | "RESEARCH";
      SessionStatus: "IN_PROGRESS" | "COMPLETED" | "ABANDONED";
      MessageRole: "USER" | "ASSISTANT" | "SYSTEM";
      ContentType:
        | "TEXT"
        | "AUDIO"
        | "FILE"
        | "IMAGE"
        | "WHITEBOARD"
        | "CODE";
    };
    CompositeTypes: Record<string, never>;
  };
};

// Convenience type aliases
export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];
export type Insertable<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Insert"];
export type Updatable<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Update"];
export type Enums<T extends keyof Database["public"]["Enums"]> =
  Database["public"]["Enums"][T];
