// ============================================================
// API Response Types — matches Flask backend exactly
// ============================================================

export interface Category {
  id: number
  name: string
  is_income?: boolean
  is_system?: boolean
  transaction_count?: number
}

export interface CategoryRemapResult {
  remapped_count: number
  budget_count: number
  goal_count: number
  memorized_count: number
}

export interface MerchantRemapResult {
  remapped_count: number
  memorized_count: number
}

export interface CategoryDependentCounts {
  transactions: number
  budgets: number
  goals: number
  memorized: number
}

export interface MerchantDependentCounts {
  transactions: number
  memorized: number
}

export interface Merchant {
  id: number
  name: string
}

export interface Transaction {
  id: number
  transaction_id?: number
  date: string
  name: string
  category: string
  merchant: string | null
  amount_kd: string
  memo: string | null
  source?: "manual" | "bank_import" | "csv_import" | string
  source_label?: string
}

export interface TransactionSearchResult {
  items: Transaction[]
  total: number
  offset: number
  limit: number
  has_more: boolean
}

export interface SpendByMonth {
  month: string
  total_kd: number
}

export interface SpendByCategory {
  [category: string]: number
}

export interface BudgetMetricsResponse {
  ok: boolean
  month: string
  range: "month" | "30" | "90" | "365" | "all"
  spent_by_category: Record<string, number>
  range_spent_by_category: Record<string, number>
  avg12_by_category: Record<string, number>
  cycle_enabled?: boolean
  cycle_start?: string | null
  cycle_end?: string | null
}

export interface DashboardMetricsResponse {
  ok: boolean
  months: string[]
  monthly: Array<{
    month: string
    income_kd: number
    expense_kd: number
  }>
  expense_by_category: Record<string, Record<string, number>>
  cycle_enabled?: boolean
  cycle_start?: string | null
  cycle_end?: string | null
  updated_at?: string | null
  cache_warning?: string | null
}

export interface AccountOverviewConnectedAccount {
  connection_id: number
  institution_name: string
  last_synced_at: string | null
  status: "active" | "revoked" | string
  transactions_mtd: number
  spend_mtd: string
}

export interface AccountOverviewResponse {
  month: string
  total_spend_mtd: string
  total_income_mtd: string
  connected_accounts: AccountOverviewConnectedAccount[]
  manual_entry_summary: {
    transactions_mtd: number
    spend_mtd: string
  }
  top_categories: Array<{
    category: string
    amount_kd: string
    pct: number
  }>
  month_trend: Array<{
    month: string
    spend: string
    income: string
  }>
}

export interface SafeToSpendResponse {
  month: string
  cycle_start: string
  cycle_end: string
  days_elapsed: number
  days_remaining: number
  monthly_income_kd: string | null
  income_auto_detected: boolean
  income_source: 'detected_from_transactions' | 'declared_in_profile' | null
  total_budget_kd: string
  debt_minimum_total_kd: string
  savings_goal_count: number
  savings_goal_unscheduled_count: number
  savings_goal_monthly_total_kd: string
  savings_goal_budget_covered_kd: string
  savings_goal_reserve_kd: string
  committed_kd: string
  committed_breakdown_kd: {
    budget_allocations: string
    debt_minimums: string
    savings_goal_reserve: string
    savings_goal_budget_covered: string
  }
  actual_spend_kd: string
  remaining_budget_kd: string
  daily_rate_kd: string
  data_complete: boolean
  warnings: string[]
}

export interface DashboardBundleResponse {
  month: string
  snapshot_computed_at: string | null
  safe_to_spend: SafeToSpendResponse
  debt_summary: DebtAccountSummary
  budget: BudgetResponse
  budget_alerts: {
    month: string | null
    items: BudgetAlertNotification[]
  }
  account_overview: AccountOverviewResponse
}

export interface IncomePatternResponse {
  detected: boolean
  monthly_income_kd: string | null
  income_source: 'detected_from_transactions' | 'declared_in_profile' | null
  income_auto_detected: boolean
  suggested_monthly_income_kd: string | null
  suggested_payday_day: number | null
  confidence: "high" | "medium" | "low"
  evidence_months: number
  largest_income_name: string | null
}

export interface BudgetAlertNotification {
  id: number
  type: "budget_alert"
  alert_key: string
  month: string
  category: string
  category_id: number | null
  budget_kd: string
  spent_kd: string
  ratio: number
  threshold: number
  created_at: string | null
}

export interface ExpenseBreakdownResponse {
  ok: boolean
  dimension: "category" | "merchant" | "transaction"
  range: "month" | "12m" | "all"
  month: string
  source?: "manual" | "bank_import" | "csv_import" | null
  total_kd: number
  items: Array<{
    name: string
    amount_kd: number
  }>
}

export interface ExpenseMerchantTrendResponse {
  ok: boolean
  merchant: string
  months: string[]
  series: Array<{
    month: string
    total_kd: number
  }>
}

export interface RecurringPattern {
  name: string
  frequency: "monthly" | "weekly" | "bi-weekly" | "irregular" | string
  avg_amount_kd: string
  last_seen: string
  confidence: "high" | "medium" | "low" | string
  occurrences: number
  group: "Subscriptions" | "Utilities" | "Loan Payments" | "Other"
}

export interface RecurringPatternsResponse {
  patterns: RecurringPattern[]
}

export interface WeeklyDigestResponse {
  week_start: string
  week_end: string
  this_week_expense_kd: string
  last_week_expense_kd: string
  delta_pct: number
  top_categories: Array<{
    name: string
    amount_kd: string
  }>
  days_until_payday: number | null
  safe_to_spend_today_kd: string
  days_observed?: number
}

export interface BudgetItem {
  id: number
  month: string
  category: string
  amount_kd: string
}

export interface BudgetResponse {
  ok: boolean
  month: string
  items: BudgetItem[]
  profile_context?: {
    budget_total_kd: number
    monthly_income_kd: number | null
    income_source: 'detected_from_transactions' | 'declared_in_profile' | null
    budget_to_income_pct: number | null
    payday_day: number | null
  }
}

export interface MemorizedCategoryRef {
  id: number
  name: string
}

export interface MemorizedMerchantRef {
  id: number
  name: string
}

export interface MemorizedTransaction {
  id: number
  canonical: string
  category: MemorizedCategoryRef | null
  merchant: MemorizedMerchantRef | null
  count: number
  last_seen: string | null
  is_pinned: boolean
  pinned_at: string | null
}

export interface TransactionSuggestion {
  name: string
  category: MemorizedCategoryRef | null
  merchant: MemorizedMerchantRef | null
}

export interface TransactionTemplateItem {
  name: string
  category: string
  amount_kd: string
}

export interface TransactionTemplateSuggestion {
  transaction_id: number
  date: string
  name: string
  merchant: string
  amount_kd: string
  items: TransactionTemplateItem[]
  feedback_key?: string
  feedback?: {
    accepted_count: number
    rejected_count: number
    score: number
  }
}

export interface BankConnection {
  id: number
  provider: string
  account_number_masked?: string | null
  institution_name: string
  status: "active" | "revoked" | string
  last_synced_at: string | null
  created_at: string | null
  revoked_at: string | null
}

export interface BankProviderCatalogEntry {
  provider: string
  display_name: string
  connect_mode: "direct" | "oauth_redirect" | string
  integration_status: string
  ready: boolean
  supports_sync_preview: boolean
  default_limit: number
  missing_config: string[]
  supported_scopes: string[]
  notes?: string | null
  setup_doc?: string | null
}

export interface BankAuthorizationStartResult {
  provider: string
  display_name: string
  authorization_url: string
  redirect_uri: string | null
  state: string
  expires_in_seconds: number
}

export interface BankConsentRecord {
  id: number
  connection_id: number
  institution_name?: string | null
  purpose_of_use: string
  scope_description: string
  scopes: string[]
  data_recipient_name: string
  consent_reference?: string | null
  ip_address_granted?: string | null
  user_agent_granted?: string | null
  granted_at: string | null
  expires_at: string | null
  revoked_at: string | null
  status: string
}

export interface DataAccessLogRecord {
  id: number
  user_id: number
  connection_id: number | null
  consent_id: number | null
  action: string
  records_accessed: number
  date_range_start: string | null
  date_range_end: string | null
  ip_address: string | null
  created_at: string | null
}

export interface BankSyncPreviewRow {
  raw_tx_id: number
  provider_tx_id: string
  date: string
  description: string
  amount_kd: string
  likely_dup: boolean
}

export interface BankSyncPreviewResult {
  sync_run_id: number
  connection_id: number
  next_cursor: string | null
  staged_count: number
  provider_dup_count: number
  rows: BankSyncPreviewRow[]
}

export interface BankCommitResult {
  sync_run_id: number
  committed_count: number
  skipped_dup_count: number
  transaction_ids: number[]
}

export interface DemoDataLoadResult {
  month: string
  transactions_created: number
  budgets_created: number
  debt_accounts_created: number
  savings_goals_created: number
  months_seeded: number
}

export interface DemoWorkspaceState {
  active: boolean
  clearable: boolean
  loaded_at: string | null
  month: string
  months_seeded: number
  transactions: number
  budgets: number
  debt_accounts: number
  savings_goals: number
  profile_seeded_fields: string[]
}

export interface DemoDataClearResult {
  transactions_cleared: number
  budgets_cleared: number
  debt_accounts_cleared: number
  savings_goals_cleared: number
  profile_fields_cleared: string[]
}

export interface DebtAccount {
  id: number
  name: string
  debt_type: "credit_card" | "personal_loan" | "car_loan" | "other" | string
  balance_kd: string
  minimum_payment_kd: string
  apr_pct: string | null
  due_day: number | null
  is_active: boolean
  notes: string | null
  created_at: string | null
  updated_at: string | null
}

export interface DebtAccountSummary {
  total_balance_kd: string
  total_minimum_kd: string
  account_count: number
}

export interface DebtPayoffPlanItem {
  debt_id: number
  name: string
  balance: string
  rate: string
  months_to_payoff: number
  interest_paid: string
  payoff_date: string
}

export interface DebtPayoffPlan {
  strategy: "avalanche" | "snowball" | string
  total_months: number
  total_interest_paid: string
  debt_free_date: string
  payoff_order: DebtPayoffPlanItem[]
  debt_free_impossible?: boolean
}

export interface DebtPayoffPlansResponse {
  avalanche: DebtPayoffPlan
  snowball: DebtPayoffPlan
  minimum_required: string
}

export interface SavingsGoal {
  id: number
  name: string
  goal_type: "starter_buffer" | "emergency_fund" | "custom" | string
  target_kd: string
  current_kd: string
  target_date: string | null
  linked_category: string | null
  is_active: boolean
  notes: string | null
  created_at: string | null
  updated_at: string | null
  projection?: SavingsGoalProjection | null
}

export interface SavingsGoalProjection {
  projected_date: string | null
  months_remaining: number | null
  required_monthly: string | null
  current_pace_monthly: string
  on_track: boolean
  shortfall_per_month: string | null
}

// ============================================================
// Spending Intelligence
// ============================================================

export interface SpendingIntelligenceMerchant {
  merchant: string
  total_kd: number
  transaction_count: number
}

export interface SpendingIntelligenceDelta {
  category: string
  current_kd: number
  previous_kd: number
  delta_kd: number
  delta_pct: number
}

export interface SpendingIntelligenceBenchmark {
  category: string
  current_kd: number
  average_kd: number
  delta_kd: number
  delta_pct: number
}

export interface SpendingIntelligenceRecurringBill {
  name: string
  frequency: string
  avg_amount_kd: string
  confidence: string
  occurrences: number
}

export interface SpendingIntelligenceResponse {
  month: string
  prev_month: string
  top_merchants: SpendingIntelligenceMerchant[]
  category_benchmarks: SpendingIntelligenceBenchmark[]
  category_deltas: SpendingIntelligenceDelta[]
  recurring_bills: SpendingIntelligenceRecurringBill[]
  generated_at: string
}

// ============================================================
// Financial Snapshot
// ============================================================

export interface SnapshotCashFlowWindow {
  income_kd: number
  expense_kd: number
  net_kd: number
}

export interface SnapshotConsentInfo {
  id: number
  status: string
  granted_at: string | null
  expires_at: string | null
  expires_in_days: number | null
  expiry_warning: boolean
}

export interface SnapshotAccount {
  id: number
  institution_name: string
  provider: string
  account_number_masked: string | null
  status: string
  last_synced_at: string | null
  consent: SnapshotConsentInfo | null
}

export interface SnapshotResponse {
  net_position: {
    income_total_kd: number
    expense_total_kd: number
    net_kd: number
    total_debt_kd: number
    total_savings_kd: number
  }
  cash_flow: {
    "30d": SnapshotCashFlowWindow
    "60d": SnapshotCashFlowWindow
    "90d": SnapshotCashFlowWindow
  }
  accounts: SnapshotAccount[]
  generated_at: string
}

// ============================================================
// Common API wrapper types
// ============================================================

export type ApiMeta = Record<string, unknown>

export interface ApiEnvelope<TData = unknown> {
  ok: boolean
  data: TData | null
  error: string | null
  meta: ApiMeta
  [key: string]: unknown
}

export interface ApiPagedMeta extends ApiMeta {
  total?: number
  offset?: number
  limit?: number
  has_more?: boolean
}

// ============================================================
// Auth types
// ============================================================

export interface User {
  id: number
  email: string
  display_name: string | null
  first_name: string | null
  last_name: string | null
  totp_enabled?: boolean
  created_at: string
}

export interface UserProfile {
  monthly_income_kd: string | null
  payday_day: number | null
  country: string | null
  timezone: string
  email_notifications_enabled: boolean
  has_debt_choice: boolean | null
  setup_guide_seen?: boolean
  setup_guide_dismissed?: boolean
}

export interface AuthProfileResponse {
  ok: boolean
  user: User
  profile: UserProfile
  demo_workspace?: DemoWorkspaceState
}

export interface AuthResponse {
  ok: boolean
  user: User | null
  requires_2fa?: boolean
  flags?: {
    enable_template_suggestions?: boolean
    enable_open_banking?: boolean
  }
  code?: string
  warning?: string
  backup_codes_remaining?: number
  error?: string
  errors?: string[]
}

export interface SecurityEvent {
  id: number
  event_type: string
  ip_address: string | null
  user_agent: string | null
  created_at: string | null
  details: Record<string, unknown>
}
