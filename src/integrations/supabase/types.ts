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
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      audit_events: {
        Row: {
          action: string
          actor_user_id: string | null
          created_at: string
          entity_id: string | null
          entity_table: string
          id: string
          payload: Json
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_table: string
          id?: string
          payload?: Json
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_table?: string
          id?: string
          payload?: Json
        }
        Relationships: []
      }
      cash_movements: {
        Row: {
          amount_cents: number
          correlation_id: string
          created_at: string
          created_by: string | null
          description: string | null
          direction: string
          employee_id: string | null
          id: string
          idempotency_key: string | null
          occurred_on: string
          reconciled: boolean
          reconciled_at: string | null
          reconciled_by: string | null
          reference_id: string | null
          reference_table: string | null
          reverses_movement_id: string | null
          source: string
        }
        Insert: {
          amount_cents: number
          correlation_id?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          direction: string
          employee_id?: string | null
          id?: string
          idempotency_key?: string | null
          occurred_on?: string
          reconciled?: boolean
          reconciled_at?: string | null
          reconciled_by?: string | null
          reference_id?: string | null
          reference_table?: string | null
          reverses_movement_id?: string | null
          source: string
        }
        Update: {
          amount_cents?: number
          correlation_id?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          direction?: string
          employee_id?: string | null
          id?: string
          idempotency_key?: string | null
          occurred_on?: string
          reconciled?: boolean
          reconciled_at?: string | null
          reconciled_by?: string | null
          reference_id?: string | null
          reference_table?: string | null
          reverses_movement_id?: string | null
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "cash_movements_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_movements_reverses_movement_id_fkey"
            columns: ["reverses_movement_id"]
            isOneToOne: false
            referencedRelation: "cash_movements"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          address: string | null
          address_proof_url: string | null
          birth_date: string | null
          cpf: string | null
          created_at: string
          delay_interest_kind: string
          delay_interest_rate: number
          document_files_urls: string[] | null
          email: string | null
          employee_id: string
          full_name: string
          id: string
          notes: string | null
          penalty_grace_days: number
          penalty_kind: Database["public"]["Enums"]["penalty_kind"]
          penalty_value: number
          phone: string
          photo_url: string | null
          pix_key: string | null
          profession: string | null
          reference_contacts: Json | null
          reported_income: number | null
          rg: string | null
          secondary_phone: string | null
          status: Database["public"]["Enums"]["client_status"]
          updated_at: string
          whatsapp: string | null
          workplace: string | null
        }
        Insert: {
          address?: string | null
          address_proof_url?: string | null
          birth_date?: string | null
          cpf?: string | null
          created_at?: string
          delay_interest_kind?: string
          delay_interest_rate?: number
          document_files_urls?: string[] | null
          email?: string | null
          employee_id: string
          full_name: string
          id?: string
          notes?: string | null
          penalty_grace_days?: number
          penalty_kind?: Database["public"]["Enums"]["penalty_kind"]
          penalty_value?: number
          phone: string
          photo_url?: string | null
          pix_key?: string | null
          profession?: string | null
          reference_contacts?: Json | null
          reported_income?: number | null
          rg?: string | null
          secondary_phone?: string | null
          status?: Database["public"]["Enums"]["client_status"]
          updated_at?: string
          whatsapp?: string | null
          workplace?: string | null
        }
        Update: {
          address?: string | null
          address_proof_url?: string | null
          birth_date?: string | null
          cpf?: string | null
          created_at?: string
          delay_interest_kind?: string
          delay_interest_rate?: number
          document_files_urls?: string[] | null
          email?: string | null
          employee_id?: string
          full_name?: string
          id?: string
          notes?: string | null
          penalty_grace_days?: number
          penalty_kind?: Database["public"]["Enums"]["penalty_kind"]
          penalty_value?: number
          phone?: string
          photo_url?: string | null
          pix_key?: string | null
          profession?: string | null
          reference_contacts?: Json | null
          reported_income?: number | null
          rg?: string | null
          secondary_phone?: string | null
          status?: Database["public"]["Enums"]["client_status"]
          updated_at?: string
          whatsapp?: string | null
          workplace?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clients_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_debt_installments: {
        Row: {
          amount_cents: number
          created_at: string
          debt_id: string
          due_date: string
          id: string
          number: number
          paid_cents: number
          status: string
          updated_at: string
        }
        Insert: {
          amount_cents: number
          created_at?: string
          debt_id: string
          due_date: string
          id?: string
          number: number
          paid_cents?: number
          status?: string
          updated_at?: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          debt_id?: string
          due_date?: string
          id?: string
          number?: number
          paid_cents?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_debt_installments_debt_id_fkey"
            columns: ["debt_id"]
            isOneToOne: false
            referencedRelation: "employee_debts"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_debts: {
        Row: {
          created_at: string
          created_by: string | null
          employee_id: string
          id: string
          idempotency_key: string | null
          loan_id: string | null
          outstanding_cents: number
          principal_lost_cents: number
          reason: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          employee_id: string
          id?: string
          idempotency_key?: string | null
          loan_id?: string | null
          outstanding_cents: number
          principal_lost_cents: number
          reason?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          employee_id?: string
          id?: string
          idempotency_key?: string | null
          loan_id?: string | null
          outstanding_cents?: number
          principal_lost_cents?: number
          reason?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_debts_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_debts_loan_id_fkey"
            columns: ["loan_id"]
            isOneToOne: false
            referencedRelation: "loans"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_notifications: {
        Row: {
          employee_id: string
          id: string
          idempotency_key: string
          installment_ids: string[]
          loan_id: string | null
          notification_type: string
          payload: Json | null
          sent_at: string
          sent_by: string | null
          status: string
        }
        Insert: {
          employee_id: string
          id?: string
          idempotency_key: string
          installment_ids: string[]
          loan_id?: string | null
          notification_type: string
          payload?: Json | null
          sent_at?: string
          sent_by?: string | null
          status?: string
        }
        Update: {
          employee_id?: string
          id?: string
          idempotency_key?: string
          installment_ids?: string[]
          loan_id?: string | null
          notification_type?: string
          payload?: Json | null
          sent_at?: string
          sent_by?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_notifications_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_notifications_loan_id_fkey"
            columns: ["loan_id"]
            isOneToOne: false
            referencedRelation: "loans"
            referencedColumns: ["id"]
          },
        ]
      }
      employees: {
        Row: {
          access_email: string | null
          cpf: string | null
          created_at: string
          full_name: string
          id: string
          is_active: boolean | null
          managed_team_ids: string[] | null
          notes: string | null
          notification_preference: string | null
          phone: string
          pix_key: string | null
          role: Database["public"]["Enums"]["user_role"] | null
          status: Database["public"]["Enums"]["employee_status"]
          updated_at: string
          whatsapp: string
          commission_rate_percent: number
          penalty_split_percent: number
        }
        Insert: {
          access_email?: string | null
          cpf?: string | null
          created_at?: string
          full_name: string
          id?: string
          is_active?: boolean | null
          managed_team_ids?: string[] | null
          notes?: string | null
          notification_preference?: string | null
          phone: string
          pix_key?: string | null
          role?: Database["public"]["Enums"]["user_role"] | null
          status?: Database["public"]["Enums"]["employee_status"]
          updated_at?: string
          whatsapp: string
          commission_rate_percent?: number
          penalty_split_percent?: number
        }
        Update: {
          access_email?: string | null
          cpf?: string | null
          created_at?: string
          full_name?: string
          id?: string
          is_active?: boolean | null
          managed_team_ids?: string[] | null
          notes?: string | null
          notification_preference?: string | null
          phone?: string
          pix_key?: string | null
          role?: Database["public"]["Enums"]["user_role"] | null
          status?: Database["public"]["Enums"]["employee_status"]
          updated_at?: string
          whatsapp?: string
          commission_rate_percent?: number
          penalty_split_percent?: number
        }
        Relationships: []
      }
      installments: {
        Row: {
          created_at: string
          due_date: string
          employee_profit_amount: number
          fr_profit_amount: number
          id: string
          loan_id: string
          number: number
          outstanding_amount: number
          paid_amount: number
          penalty_amount: number
          principal_amount: number
          status: Database["public"]["Enums"]["installment_status"]
          total_amount: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          due_date: string
          employee_profit_amount: number
          fr_profit_amount: number
          id?: string
          loan_id: string
          number: number
          outstanding_amount: number
          paid_amount?: number
          penalty_amount?: number
          principal_amount: number
          status?: Database["public"]["Enums"]["installment_status"]
          total_amount: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          due_date?: string
          employee_profit_amount?: number
          fr_profit_amount?: number
          id?: string
          loan_id?: string
          number?: number
          outstanding_amount?: number
          paid_amount?: number
          penalty_amount?: number
          principal_amount?: number
          status?: Database["public"]["Enums"]["installment_status"]
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "installments_loan_id_fkey"
            columns: ["loan_id"]
            isOneToOne: false
            referencedRelation: "loans"
            referencedColumns: ["id"]
          },
        ]
      }
      loan_renegotiations: {
        Row: {
          decided_at: string | null
          decided_by: string | null
          decision_notes: string | null
          id: string
          idempotency_key: string
          new_loan_id: string | null
          original_loan_id: string
          original_snapshot: Json
          proposed_terms: Json
          reason: string
          requested_at: string
          requested_by: string
          status: Database["public"]["Enums"]["approval_status"]
        }
        Insert: {
          decided_at?: string | null
          decided_by?: string | null
          decision_notes?: string | null
          id?: string
          idempotency_key: string
          new_loan_id?: string | null
          original_loan_id: string
          original_snapshot: Json
          proposed_terms: Json
          reason: string
          requested_at?: string
          requested_by: string
          status?: Database["public"]["Enums"]["approval_status"]
        }
        Update: {
          decided_at?: string | null
          decided_by?: string | null
          decision_notes?: string | null
          id?: string
          idempotency_key?: string
          new_loan_id?: string | null
          original_loan_id?: string
          original_snapshot?: Json
          proposed_terms?: Json
          reason?: string
          requested_at?: string
          requested_by?: string
          status?: Database["public"]["Enums"]["approval_status"]
        }
        Relationships: [
          {
            foreignKeyName: "loan_renegotiations_new_loan_id_fkey"
            columns: ["new_loan_id"]
            isOneToOne: false
            referencedRelation: "loans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loan_renegotiations_original_loan_id_fkey"
            columns: ["original_loan_id"]
            isOneToOne: false
            referencedRelation: "loans"
            referencedColumns: ["id"]
          },
        ]
      }
      loans: {
        Row: {
          approval_snapshot: Json | null
          approval_status: Database["public"]["Enums"]["loan_approval_status"]
          approved_at: string | null
          approved_by: string | null
          client_id: string
          created_at: string
          delay_interest_kind_snapshot: string | null
          delay_interest_rate_snapshot: number | null
          employee_id: string
          employee_profit_amount: number
          employee_profit_input: number
          employee_profit_kind: Database["public"]["Enums"]["employee_profit_kind"]
          fr_profit_amount: number
          fr_rate: number
          fr_rate_is_exceptional: boolean
          frequency: Database["public"]["Enums"]["loan_frequency"]
          id: string
          idempotency_key: string | null
          installments_count: number
          loss_capital_amount: number
          notes: string | null
          penalty_grace_days_snapshot: number | null
          penalty_kind_snapshot:
            | Database["public"]["Enums"]["penalty_kind"]
            | null
          penalty_value_snapshot: number | null
          principal_amount: number
          rejection_reason: string | null
          requested_by: string | null
          start_date: string
          status: Database["public"]["Enums"]["loan_status"]
          total_amount: number
          updated_at: string
        }
        Insert: {
          approval_snapshot?: Json | null
          approval_status?: Database["public"]["Enums"]["loan_approval_status"]
          approved_at?: string | null
          approved_by?: string | null
          client_id: string
          created_at?: string
          delay_interest_kind_snapshot?: string | null
          delay_interest_rate_snapshot?: number | null
          employee_id: string
          employee_profit_amount: number
          employee_profit_input: number
          employee_profit_kind: Database["public"]["Enums"]["employee_profit_kind"]
          fr_profit_amount: number
          fr_rate: number
          fr_rate_is_exceptional?: boolean
          frequency: Database["public"]["Enums"]["loan_frequency"]
          id?: string
          idempotency_key?: string | null
          installments_count: number
          loss_capital_amount?: number
          notes?: string | null
          penalty_grace_days_snapshot?: number | null
          penalty_kind_snapshot?:
            | Database["public"]["Enums"]["penalty_kind"]
            | null
          penalty_value_snapshot?: number | null
          principal_amount: number
          rejection_reason?: string | null
          requested_by?: string | null
          start_date: string
          status?: Database["public"]["Enums"]["loan_status"]
          total_amount: number
          updated_at?: string
        }
        Update: {
          approval_snapshot?: Json | null
          approval_status?: Database["public"]["Enums"]["loan_approval_status"]
          approved_at?: string | null
          approved_by?: string | null
          client_id?: string
          created_at?: string
          delay_interest_kind_snapshot?: string | null
          delay_interest_rate_snapshot?: number | null
          employee_id?: string
          employee_profit_amount?: number
          employee_profit_input?: number
          employee_profit_kind?: Database["public"]["Enums"]["employee_profit_kind"]
          fr_profit_amount?: number
          fr_rate?: number
          fr_rate_is_exceptional?: boolean
          frequency?: Database["public"]["Enums"]["loan_frequency"]
          id?: string
          idempotency_key?: string | null
          installments_count?: number
          loss_capital_amount?: number
          notes?: string | null
          penalty_grace_days_snapshot?: number | null
          penalty_kind_snapshot?:
            | Database["public"]["Enums"]["penalty_kind"]
            | null
          penalty_value_snapshot?: number | null
          principal_amount?: number
          rejection_reason?: string | null
          requested_by?: string | null
          start_date?: string
          status?: Database["public"]["Enums"]["loan_status"]
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "loans_client_employee_fk"
            columns: ["client_id", "employee_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id", "employee_id"]
          },
        ]
      }
      owner_access: {
        Row: {
          access_type: Database["public"]["Enums"]["owner_access_type"]
          auth_user_id: string | null
          created_at: string
          deactivated_at: string | null
          deactivated_reason: string | null
          email: string
          expires_at: string | null
          id: string
          is_active: boolean
          is_temporary: boolean
          linked_at: string | null
          notes: string | null
          updated_at: string
        }
        Insert: {
          access_type?: Database["public"]["Enums"]["owner_access_type"]
          auth_user_id?: string | null
          created_at?: string
          deactivated_at?: string | null
          deactivated_reason?: string | null
          email: string
          expires_at?: string | null
          id?: string
          is_active?: boolean
          is_temporary?: boolean
          linked_at?: string | null
          notes?: string | null
          updated_at?: string
        }
        Update: {
          access_type?: Database["public"]["Enums"]["owner_access_type"]
          auth_user_id?: string | null
          created_at?: string
          deactivated_at?: string | null
          deactivated_reason?: string | null
          email?: string
          expires_at?: string | null
          id?: string
          is_active?: boolean
          is_temporary?: boolean
          linked_at?: string | null
          notes?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      payment_allocations: {
        Row: {
          created_at: string
          employee_penalty_amount: number
          employee_profit_amount: number
          fr_penalty_amount: number
          fr_profit_amount: number
          id: string
          installment_id: string
          payment_id: string
          principal_amount: number
        }
        Insert: {
          created_at?: string
          employee_penalty_amount?: number
          employee_profit_amount?: number
          fr_penalty_amount?: number
          fr_profit_amount?: number
          id?: string
          installment_id: string
          payment_id: string
          principal_amount?: number
        }
        Update: {
          created_at?: string
          employee_penalty_amount?: number
          employee_profit_amount?: number
          fr_penalty_amount?: number
          fr_profit_amount?: number
          id?: string
          installment_id?: string
          payment_id?: string
          principal_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "payment_allocations_installment_id_fkey"
            columns: ["installment_id"]
            isOneToOne: false
            referencedRelation: "installments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_allocations_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_authorizations: {
        Row: {
          amount_cents: number
          decided_at: string | null
          decided_by: string | null
          decision_notes: string | null
          id: string
          idempotency_key: string
          installment_id: string
          metadata: Json | null
          notes: string | null
          processed_at: string | null
          reason: string
          requested_at: string
          requested_by: string
          status: Database["public"]["Enums"]["approval_status"]
        }
        Insert: {
          amount_cents: number
          decided_at?: string | null
          decided_by?: string | null
          decision_notes?: string | null
          id?: string
          idempotency_key: string
          installment_id: string
          metadata?: Json | null
          notes?: string | null
          processed_at?: string | null
          reason: string
          requested_at?: string
          requested_by: string
          status?: Database["public"]["Enums"]["approval_status"]
        }
        Update: {
          amount_cents?: number
          decided_at?: string | null
          decided_by?: string | null
          decision_notes?: string | null
          id?: string
          idempotency_key?: string
          installment_id?: string
          metadata?: Json | null
          notes?: string | null
          processed_at?: string | null
          reason?: string
          requested_at?: string
          requested_by?: string
          status?: Database["public"]["Enums"]["approval_status"]
        }
        Relationships: [
          {
            foreignKeyName: "payment_authorizations_installment_id_fkey"
            columns: ["installment_id"]
            isOneToOne: false
            referencedRelation: "installments"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          client_id: string
          created_at: string
          created_by: string | null
          employee_id: string
          id: string
          idempotency_key: string | null
          installment_id: string
          kind: Database["public"]["Enums"]["payment_kind"]
          loan_id: string
          method: Database["public"]["Enums"]["payment_method"]
          notes: string | null
          paid_at: string
          penalty_amount: number
          receipt_url: string | null
          reverses_payment_id: string | null
          status: Database["public"]["Enums"]["payment_status"]
        }
        Insert: {
          amount: number
          client_id: string
          created_at?: string
          created_by?: string | null
          employee_id: string
          id?: string
          idempotency_key?: string | null
          installment_id: string
          kind: Database["public"]["Enums"]["payment_kind"]
          loan_id: string
          method: Database["public"]["Enums"]["payment_method"]
          notes?: string | null
          paid_at: string
          penalty_amount?: number
          receipt_url?: string | null
          reverses_payment_id?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
        }
        Update: {
          amount?: number
          client_id?: string
          created_at?: string
          created_by?: string | null
          employee_id?: string
          id?: string
          idempotency_key?: string | null
          installment_id?: string
          kind?: Database["public"]["Enums"]["payment_kind"]
          loan_id?: string
          method?: Database["public"]["Enums"]["payment_method"]
          notes?: string | null
          paid_at?: string
          penalty_amount?: number
          receipt_url?: string | null
          reverses_payment_id?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
        }
        Relationships: [
          {
            foreignKeyName: "payments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_installment_id_fkey"
            columns: ["installment_id"]
            isOneToOne: false
            referencedRelation: "installments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_loan_id_fkey"
            columns: ["loan_id"]
            isOneToOne: false
            referencedRelation: "loans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_reverses_payment_id_fkey"
            columns: ["reverses_payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
        ]
      }
      settlement_items: {
        Row: {
          amount_cents: number
          created_at: string
          created_by: string | null
          description: string
          id: string
          idempotency_key: string | null
          is_active: boolean
          kind: string
          reference_id: string | null
          reference_table: string | null
          settlement_id: string
          superseded_at: string | null
          superseded_by: string | null
          updated_at: string
        }
        Insert: {
          amount_cents: number
          created_at?: string
          created_by?: string | null
          description: string
          id?: string
          idempotency_key?: string | null
          is_active?: boolean
          kind: string
          reference_id?: string | null
          reference_table?: string | null
          settlement_id: string
          superseded_at?: string | null
          superseded_by?: string | null
          updated_at?: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          created_by?: string | null
          description?: string
          id?: string
          idempotency_key?: string | null
          is_active?: boolean
          kind?: string
          reference_id?: string | null
          reference_table?: string | null
          settlement_id?: string
          superseded_at?: string | null
          superseded_by?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "settlement_items_settlement_id_fkey"
            columns: ["settlement_id"]
            isOneToOne: false
            referencedRelation: "settlements"
            referencedColumns: ["id"]
          },
        ]
      }
      settlements: {
        Row: {
          capital_recovered_cents: number
          closed_at: string | null
          closed_by: string | null
          correlation_id: string
          created_at: string
          deductions_cents: number
          employee_id: string
          employee_penalty_cents: number
          fr_penalty_cents: number
          fr_profit_cents: number
          gross_cents: number
          id: string
          net_cents: number
          opened_by: string | null
          period_end: string
          period_start: string
          status: string
          updated_at: string
        }
        Insert: {
          capital_recovered_cents?: number
          closed_at?: string | null
          closed_by?: string | null
          correlation_id?: string
          created_at?: string
          deductions_cents?: number
          employee_id: string
          employee_penalty_cents?: number
          fr_penalty_cents?: number
          fr_profit_cents?: number
          gross_cents?: number
          id?: string
          net_cents?: number
          opened_by?: string | null
          period_end: string
          period_start: string
          status?: string
          updated_at?: string
        }
        Update: {
          capital_recovered_cents?: number
          closed_at?: string | null
          closed_by?: string | null
          correlation_id?: string
          created_at?: string
          deductions_cents?: number
          employee_id?: string
          employee_penalty_cents?: number
          fr_penalty_cents?: number
          fr_profit_cents?: number
          gross_cents?: number
          id?: string
          net_cents?: number
          opened_by?: string | null
          period_end?: string
          period_start?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "settlements_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      add_settlement_adjustment: {
        Args: {
          p_amount_cents: number
          p_description: string
          p_idempotency_key: string
          p_kind: string
          p_settlement_id: string
        }
        Returns: Json
      }
      claim_owner_access: {
        Args: never
        Returns: {
          access_type: Database["public"]["Enums"]["owner_access_type"]
          authorized: boolean
          is_temporary: boolean
        }[]
      }
      close_settlement: {
        Args: { p_idempotency_key: string; p_settlement_id: string }
        Returns: Json
      }
      decide_loan_approval: {
        Args: { p_decision: string; p_loan_id: string; p_reason?: string }
        Returns: Json
      }
      decide_loan_renegotiation: {
        Args: {
          p_decision: string
          p_notes?: string
          p_renegotiation_id: string
        }
        Returns: Json
      }
      decide_payment_authorization: {
        Args: {
          p_authorization_id: string
          p_decision: string
          p_notes?: string
        }
        Returns: Json
      }
      get_current_user_role: { Args: never; Returns: string }
      get_settlement: { Args: { p_settlement_id: string }; Returns: Json }
      get_user_role: {
        Args: { user_id: string }
        Returns: Database["public"]["Enums"]["user_role"]
      }
      list_audit_events: {
        Args: {
          p_entity: string
          p_from: string
          p_limit: number
          p_to: string
        }
        Returns: Json
      }
      list_cash_movements: {
        Args: { p_from: string; p_to: string }
        Returns: Json
      }
      list_employee_debts: { Args: never; Returns: Json }
      list_settlements: {
        Args: { p_from: string; p_to: string }
        Returns: Json
      }
      prepare_settlement: {
        Args: {
          p_employee_id: string
          p_period_end: string
          p_period_start: string
        }
        Returns: Json
      }
      process_payment_atomic: {
        Args: {
          p_amount_cents: number
          p_idempotency_key: string
          p_installment_id: string
          p_method: string
          p_notes: string
          p_paid_at: string
          p_penalty_cents: number
          p_user_id: string
        }
        Returns: Json
      }
      reconcile_cash_movement: {
        Args: { p_movement_id: string; p_reconciled: boolean }
        Returns: Json
      }
      record_report_export: {
        Args: { p_filters: Json; p_report: string }
        Returns: Json
      }
      register_cash_movement: {
        Args: {
          p_amount_cents: number
          p_description: string
          p_direction: string
          p_employee_id: string
          p_idempotency_key: string
          p_occurred_on: string
          p_reference_id: string
          p_reference_table: string
          p_source: string
        }
        Returns: Json
      }
      register_employee_debt: {
        Args: {
          p_first_due: string
          p_idempotency_key: string
          p_installments: number
          p_loan_id: string
          p_reason: string
        }
        Returns: Json
      }
      report_period_totals: {
        Args: { p_from: string; p_to: string }
        Returns: Json
      }
      request_loan_approval: {
        Args: {
          p_client_id: string
          p_idempotency_key: string
          p_reason: string
          p_terms: Json
        }
        Returns: Json
      }
      request_loan_renegotiation: {
        Args: {
          p_idempotency_key: string
          p_loan_id: string
          p_proposed_terms: Json
          p_reason: string
        }
        Returns: Json
      }
      request_payment_authorization: {
        Args: {
          p_amount_cents: number
          p_idempotency_key?: string
          p_installment_id: string
          p_notes?: string
          p_reason: string
        }
        Returns: Json
      }
      reverse_cash_movement: {
        Args: {
          p_idempotency_key: string
          p_movement_id: string
          p_reason: string
        }
        Returns: Json
      }
      reverse_payment: {
        Args: {
          p_idempotency_key: string
          p_payment_id: string
          p_reason: string
        }
        Returns: Json
      }
    }
    Enums: {
      approval_status:
        | "pending_approval"
        | "approved"
        | "rejected"
        | "processed"
        | "cancelled"
      client_status: "ativo" | "inativo" | "bloqueado" | "arquivado"
      employee_profit_kind: "percentual" | "fixo"
      employee_status: "ativo" | "inativo"
      installment_status:
        | "pendente"
        | "parcial"
        | "pago"
        | "atrasado"
        | "renegociado"
        | "prejuizo"
      loan_approval_status:
        | "draft"
        | "pending_approval"
        | "approved"
        | "rejected"
        | "active"
        | "cancelled"
      loan_frequency: "diario" | "semanal" | "quinzenal" | "mensal"
      loan_status:
        | "rascunho"
        | "aguardando_aprovacao"
        | "ativo"
        | "quitado"
        | "renegociado"
        | "prejuizo"
        | "cancelado"
      owner_access_type: "proprietario_definitivo" | "acesso_tecnico"
      payment_kind: "integral" | "parcial"
      payment_method: "dinheiro" | "pix" | "transferencia" | "outro"
      payment_status: "confirmado" | "estornado"
      penalty_kind:
        | "nenhuma"
        | "percentual_dia"
        | "percentual_fixo"
        | "valor_fixo"
      user_role: "owner" | "manager" | "employee"
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
      approval_status: [
        "pending_approval",
        "approved",
        "rejected",
        "processed",
        "cancelled",
      ],
      client_status: ["ativo", "inativo", "bloqueado", "arquivado"],
      employee_profit_kind: ["percentual", "fixo"],
      employee_status: ["ativo", "inativo"],
      installment_status: [
        "pendente",
        "parcial",
        "pago",
        "atrasado",
        "renegociado",
        "prejuizo",
      ],
      loan_approval_status: [
        "draft",
        "pending_approval",
        "approved",
        "rejected",
        "active",
        "cancelled",
      ],
      loan_frequency: ["diario", "semanal", "quinzenal", "mensal"],
      loan_status: [
        "rascunho",
        "aguardando_aprovacao",
        "ativo",
        "quitado",
        "renegociado",
        "prejuizo",
        "cancelado",
      ],
      owner_access_type: ["proprietario_definitivo", "acesso_tecnico"],
      payment_kind: ["integral", "parcial"],
      payment_method: ["dinheiro", "pix", "transferencia", "outro"],
      payment_status: ["confirmado", "estornado"],
      penalty_kind: [
        "nenhuma",
        "percentual_dia",
        "percentual_fixo",
        "valor_fixo",
      ],
      user_role: ["owner", "manager", "employee"],
    },
  },
} as const
