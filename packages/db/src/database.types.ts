
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "carteiras": {
                  Row: {
                    "created_at": string,"id": string,"nome": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"nome": string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"nome"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"cliente_documentos": {
                  Row: {
                    "caminho": string,"carteira_id": string,"cliente_id": string,"created_at": string,"id": string,"nome_arquivo": string,"origem": Database["public"]['Enums']["origem_lancamento"],"removido_em": string | null,"tamanho_bytes": number,"tipo_mime": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "caminho": string,"carteira_id": string,"cliente_id": string,"created_at"?: string,"id"?: string,"nome_arquivo": string,"origem"?: Database["public"]['Enums']["origem_lancamento"],"removido_em"?: string | null,"tamanho_bytes": number,"tipo_mime": string,"updated_at"?: string
                  }
                  Update: {
                    "caminho"?: string,"carteira_id"?: string,"cliente_id"?: string,"created_at"?: string,"id"?: string,"nome_arquivo"?: string,"origem"?: Database["public"]['Enums']["origem_lancamento"],"removido_em"?: string | null,"tamanho_bytes"?: number,"tipo_mime"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "cliente_documentos_carteira_id_fkey"
      columns: ["carteira_id"]
isOneToOne: false
      referencedRelation: "carteiras"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "cliente_documentos_cliente_id_fkey"
      columns: ["cliente_id"]
isOneToOne: false
      referencedRelation: "clientes"
      referencedColumns: ["id"]
    }
                  ]
                },"clientes": {
                  Row: {
                    "apelidos": (string)[],"ativo": boolean,"carteira_id": string,"created_at": string,"documento": string | null,"documento_tipo": Database["public"]['Enums']["tipo_documento"] | null,"id": string,"nome": string,"observacoes": string | null,"telefone": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "apelidos"?: (string)[],"ativo"?: boolean,"carteira_id"?: string,"created_at"?: string,"documento"?: string | null,"documento_tipo"?: Database["public"]['Enums']["tipo_documento"] | null,"id"?: string,"nome": string,"observacoes"?: string | null,"telefone"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "apelidos"?: (string)[],"ativo"?: boolean,"carteira_id"?: string,"created_at"?: string,"documento"?: string | null,"documento_tipo"?: Database["public"]['Enums']["tipo_documento"] | null,"id"?: string,"nome"?: string,"observacoes"?: string | null,"telefone"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "clientes_carteira_id_fkey"
      columns: ["carteira_id"]
isOneToOne: false
      referencedRelation: "carteiras"
      referencedColumns: ["id"]
    }
                  ]
                },"codigos_vinculo": {
                  Row: {
                    "carteira_id": string,"codigo": string,"created_at": string,"expira_em": string,"updated_at": string,"usado_em": string | null,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "carteira_id": string,"codigo": string,"created_at"?: string,"expira_em": string,"updated_at"?: string,"usado_em"?: string | null,"user_id": string
                  }
                  Update: {
                    "carteira_id"?: string,"codigo"?: string,"created_at"?: string,"expira_em"?: string,"updated_at"?: string,"usado_em"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "codigos_vinculo_carteira_id_fkey"
      columns: ["carteira_id"]
isOneToOne: false
      referencedRelation: "carteiras"
      referencedColumns: ["id"]
    }
                  ]
                },"configuracoes": {
                  Row: {
                    "carteira_id": string,"chave": string,"created_at": string,"updated_at": string,"valor": NonNullable<Json>
                  }
                  ComputedFields: never
                  Insert: {
                    "carteira_id"?: string,"chave": string,"created_at"?: string,"updated_at"?: string,"valor": NonNullable<Json>
                  }
                  Update: {
                    "carteira_id"?: string,"chave"?: string,"created_at"?: string,"updated_at"?: string,"valor"?: NonNullable<Json>
                  }
                  Relationships: [
                    {
      foreignKeyName: "configuracoes_carteira_id_fkey"
      columns: ["carteira_id"]
isOneToOne: false
      referencedRelation: "carteiras"
      referencedColumns: ["id"]
    }
                  ]
                },"eventos": {
                  Row: {
                    "acao": string,"carteira_id": string,"created_at": string,"entidade": string,"entidade_id": string,"id": string,"mensagem_telegram": string | null,"payload": NonNullable<Json>,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "acao": string,"carteira_id"?: string,"created_at"?: string,"entidade": string,"entidade_id": string,"id"?: string,"mensagem_telegram"?: string | null,"payload"?: NonNullable<Json>,"updated_at"?: string
                  }
                  Update: {
                    "acao"?: string,"carteira_id"?: string,"created_at"?: string,"entidade"?: string,"entidade_id"?: string,"id"?: string,"mensagem_telegram"?: string | null,"payload"?: NonNullable<Json>,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "eventos_carteira_id_fkey"
      columns: ["carteira_id"]
isOneToOne: false
      referencedRelation: "carteiras"
      referencedColumns: ["id"]
    }
                  ]
                },"membros": {
                  Row: {
                    "carteira_id": string,"created_at": string,"email": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "carteira_id": string,"created_at"?: string,"email": string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "carteira_id"?: string,"created_at"?: string,"email"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "membros_carteira_id_fkey"
      columns: ["carteira_id"]
isOneToOne: false
      referencedRelation: "carteiras"
      referencedColumns: ["id"]
    }
                  ]
                },"notificacoes_enviadas": {
                  Row: {
                    "carteira_id": string,"created_at": string,"data_referencia": string,"enviada_em": string,"id": string,"parcela_id": string | null,"regra_id": string,"telegram_message_id": number | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "carteira_id": string,"created_at"?: string,"data_referencia": string,"enviada_em"?: string,"id"?: string,"parcela_id"?: string | null,"regra_id": string,"telegram_message_id"?: number | null,"updated_at"?: string
                  }
                  Update: {
                    "carteira_id"?: string,"created_at"?: string,"data_referencia"?: string,"enviada_em"?: string,"id"?: string,"parcela_id"?: string | null,"regra_id"?: string,"telegram_message_id"?: number | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "notificacoes_enviadas_carteira_id_fkey"
      columns: ["carteira_id"]
isOneToOne: false
      referencedRelation: "carteiras"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "notificacoes_enviadas_parcela_id_fkey"
      columns: ["parcela_id"]
isOneToOne: false
      referencedRelation: "parcelas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "notificacoes_enviadas_regra_id_fkey"
      columns: ["regra_id"]
isOneToOne: false
      referencedRelation: "regras_notificacao"
      referencedColumns: ["id"]
    }
                  ]
                },"operacoes": {
                  Row: {
                    "cancelado_em": string | null,"carteira_id": string,"cliente_id": string,"created_at": string,"data_emprestimo": string,"id": string,"juros_total": number,"mensagem_origem_id": number | null,"observacoes": string | null,"origem": Database["public"]['Enums']["origem_lancamento"],"perdida_em": string | null,"periodicidade": Database["public"]['Enums']["periodicidade"] | null,"renegociacoes": number,"status": Database["public"]['Enums']["status_operacao"],"taxa_efetiva_mensal": number,"taxa_periodo": number,"tipo": Database["public"]['Enums']["tipo_operacao"],"updated_at": string,"valor_prejuizo": number,"valor_principal": number,"valor_total_receber": number
                  }
                  ComputedFields: never
                  Insert: {
                    "cancelado_em"?: string | null,"carteira_id": string,"cliente_id": string,"created_at"?: string,"data_emprestimo": string,"id"?: string,"juros_total": number,"mensagem_origem_id"?: number | null,"observacoes"?: string | null,"origem": Database["public"]['Enums']["origem_lancamento"],"perdida_em"?: string | null,"periodicidade"?: Database["public"]['Enums']["periodicidade"] | null,"renegociacoes"?: number,"status"?: Database["public"]['Enums']["status_operacao"],"taxa_efetiva_mensal": number,"taxa_periodo": number,"tipo": Database["public"]['Enums']["tipo_operacao"],"updated_at"?: string,"valor_prejuizo"?: number,"valor_principal": number,"valor_total_receber": number
                  }
                  Update: {
                    "cancelado_em"?: string | null,"carteira_id"?: string,"cliente_id"?: string,"created_at"?: string,"data_emprestimo"?: string,"id"?: string,"juros_total"?: number,"mensagem_origem_id"?: number | null,"observacoes"?: string | null,"origem"?: Database["public"]['Enums']["origem_lancamento"],"perdida_em"?: string | null,"periodicidade"?: Database["public"]['Enums']["periodicidade"] | null,"renegociacoes"?: number,"status"?: Database["public"]['Enums']["status_operacao"],"taxa_efetiva_mensal"?: number,"taxa_periodo"?: number,"tipo"?: Database["public"]['Enums']["tipo_operacao"],"updated_at"?: string,"valor_prejuizo"?: number,"valor_principal"?: number,"valor_total_receber"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "operacoes_carteira_id_fkey"
      columns: ["carteira_id"]
isOneToOne: false
      referencedRelation: "carteiras"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "operacoes_cliente_id_fkey"
      columns: ["cliente_id"]
isOneToOne: false
      referencedRelation: "clientes"
      referencedColumns: ["id"]
    }
                  ]
                },"pagamentos": {
                  Row: {
                    "cancelado_em": string | null,"carteira_id": string,"created_at": string,"data": string,"forma": string | null,"id": string,"lote_id": string,"observacoes": string | null,"origem": Database["public"]['Enums']["origem_lancamento"],"parcela_id": string,"updated_at": string,"valor": number,"valor_juros_alocado": number,"valor_principal_alocado": number
                  }
                  ComputedFields: never
                  Insert: {
                    "cancelado_em"?: string | null,"carteira_id": string,"created_at"?: string,"data": string,"forma"?: string | null,"id"?: string,"lote_id": string,"observacoes"?: string | null,"origem": Database["public"]['Enums']["origem_lancamento"],"parcela_id": string,"updated_at"?: string,"valor": number,"valor_juros_alocado": number,"valor_principal_alocado": number
                  }
                  Update: {
                    "cancelado_em"?: string | null,"carteira_id"?: string,"created_at"?: string,"data"?: string,"forma"?: string | null,"id"?: string,"lote_id"?: string,"observacoes"?: string | null,"origem"?: Database["public"]['Enums']["origem_lancamento"],"parcela_id"?: string,"updated_at"?: string,"valor"?: number,"valor_juros_alocado"?: number,"valor_principal_alocado"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "pagamentos_carteira_id_fkey"
      columns: ["carteira_id"]
isOneToOne: false
      referencedRelation: "carteiras"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pagamentos_parcela_id_fkey"
      columns: ["parcela_id"]
isOneToOne: false
      referencedRelation: "parcelas"
      referencedColumns: ["id"]
    }
                  ]
                },"parcelas": {
                  Row: {
                    "cancelado_em": string | null,"carteira_id": string,"created_at": string,"id": string,"juros_pago": number,"numero": number,"operacao_id": string,"principal_pago": number,"status": Database["public"]['Enums']["status_parcela"],"updated_at": string,"valor": number,"valor_juros": number,"valor_pago": number,"valor_principal": number,"vencimento": string
                  }
                  ComputedFields: never
                  Insert: {
                    "cancelado_em"?: string | null,"carteira_id": string,"created_at"?: string,"id"?: string,"juros_pago"?: number,"numero": number,"operacao_id": string,"principal_pago"?: number,"status"?: Database["public"]['Enums']["status_parcela"],"updated_at"?: string,"valor": number,"valor_juros": number,"valor_pago"?: number,"valor_principal": number,"vencimento": string
                  }
                  Update: {
                    "cancelado_em"?: string | null,"carteira_id"?: string,"created_at"?: string,"id"?: string,"juros_pago"?: number,"numero"?: number,"operacao_id"?: string,"principal_pago"?: number,"status"?: Database["public"]['Enums']["status_parcela"],"updated_at"?: string,"valor"?: number,"valor_juros"?: number,"valor_pago"?: number,"valor_principal"?: number,"vencimento"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "parcelas_carteira_id_fkey"
      columns: ["carteira_id"]
isOneToOne: false
      referencedRelation: "carteiras"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "parcelas_operacao_id_fkey"
      columns: ["operacao_id"]
isOneToOne: false
      referencedRelation: "operacoes"
      referencedColumns: ["id"]
    }
                  ]
                },"regras_notificacao": {
                  Row: {
                    "ativo": boolean,"carteira_id": string,"created_at": string,"dia_semana": number | null,"horario": string,"id": string,"offset_dias": number,"silenciar_clientes": (string)[],"tipo": Database["public"]['Enums']["tipo_regra_notificacao"],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "ativo"?: boolean,"carteira_id"?: string,"created_at"?: string,"dia_semana"?: number | null,"horario": string,"id"?: string,"offset_dias"?: number,"silenciar_clientes"?: (string)[],"tipo": Database["public"]['Enums']["tipo_regra_notificacao"],"updated_at"?: string
                  }
                  Update: {
                    "ativo"?: boolean,"carteira_id"?: string,"created_at"?: string,"dia_semana"?: number | null,"horario"?: string,"id"?: string,"offset_dias"?: number,"silenciar_clientes"?: (string)[],"tipo"?: Database["public"]['Enums']["tipo_regra_notificacao"],"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "regras_notificacao_carteira_id_fkey"
      columns: ["carteira_id"]
isOneToOne: false
      referencedRelation: "carteiras"
      referencedColumns: ["id"]
    }
                  ]
                },"sessoes_bot": {
                  Row: {
                    "created_at": string,"estado": string,"expira_em": string,"id": string,"payload": NonNullable<Json>,"telegram_user_id": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"estado": string,"expira_em": string,"id"?: string,"payload"?: NonNullable<Json>,"telegram_user_id": number,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"estado"?: string,"expira_em"?: string,"id"?: string,"payload"?: NonNullable<Json>,"telegram_user_id"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"vinculos_telegram": {
                  Row: {
                    "carteira_id": string,"created_at": string,"nome": string | null,"telegram_user_id": number,"updated_at": string,"user_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "carteira_id": string,"created_at"?: string,"nome"?: string | null,"telegram_user_id": number,"updated_at"?: string,"user_id"?: string | null
                  }
                  Update: {
                    "carteira_id"?: string,"created_at"?: string,"nome"?: string | null,"telegram_user_id"?: number,"updated_at"?: string,"user_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "vinculos_telegram_carteira_id_fkey"
      columns: ["carteira_id"]
isOneToOne: false
      referencedRelation: "carteiras"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "_carteira":
{ Args: { "p": Json }; Returns: string
                           },
"_exigir_autenticado":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"buscar_clientes":
{ Args: { "p_carteira"?: string,"p_limite"?: number,"p_termo": string }; Returns: {
              "apelidos": (string)[],"documento": string,"documento_tipo": Database["public"]['Enums']["tipo_documento"],"id": string,"nome": string,"similaridade": number
            }[]
                           },
"criar_carteira":
{ Args: { "p_nome": string }; Returns: string
                           },
"gerar_codigo_vinculo":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"minha_carteira":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"rpc_atualizar_status":
{ Args: { "p": Json }; Returns: number
                           },
"rpc_cancelar_operacao":
{ Args: { "p": Json }; Returns: undefined
                           },
"rpc_criar_operacao":
{ Args: { "p": Json }; Returns: string
                           },
"rpc_marcar_perda":
{ Args: { "p": Json }; Returns: undefined
                           },
"rpc_registrar_pagamento":
{ Args: { "p": Json }; Returns: string
                           },
"rpc_renegociar_parcela":
{ Args: { "p": Json }; Returns: undefined
                           },
"rpc_renovar_parcela":
{ Args: { "p": Json }; Returns: string
                           },
"vincular_telegram":
{ Args: { "p_codigo": string,"p_nome": string,"p_telegram_user_id": number }; Returns: string
                           }
          }
          Enums: {
            "origem_lancamento": "telegram"|"web","periodicidade": "semanal"|"quinzenal"|"mensal","status_operacao": "ativa"|"quitada"|"atrasada"|"renegociada"|"perdida"|"cancelada","status_parcela": "aberta"|"parcial"|"paga"|"atrasada"|"cancelada","tipo_documento": "cpf"|"cnpj"|"rg"|"outro","tipo_operacao": "unica"|"parcelada","tipo_regra_notificacao": "lembrete_antes"|"no_dia"|"atraso"|"resumo_diario"|"resumo_semanal"|"lista_atrasados"|"lista_amanha"
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
  "public": {
          Enums: {
            "origem_lancamento": ["telegram", "web"],"periodicidade": ["semanal", "quinzenal", "mensal"],"status_operacao": ["ativa", "quitada", "atrasada", "renegociada", "perdida", "cancelada"],"status_parcela": ["aberta", "parcial", "paga", "atrasada", "cancelada"],"tipo_documento": ["cpf", "cnpj", "rg", "outro"],"tipo_operacao": ["unica", "parcelada"],"tipo_regra_notificacao": ["lembrete_antes", "no_dia", "atraso", "resumo_diario", "resumo_semanal", "lista_atrasados", "lista_amanha"]
          }
        }
} as const
