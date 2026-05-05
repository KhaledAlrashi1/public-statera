import { useEffect, useMemo, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Landmark, Link2, RefreshCw, ShieldCheck, ShieldX } from "lucide-react"
import { bankApi } from "@/lib/api"
import { cn, formatKD } from "@/lib/utils"
import type { BankProviderCatalogEntry, BankSyncPreviewResult } from "@/types/api"
import PageHeader from "@/components/layout/PageHeader"
import { useToast } from "@/components/ui/toaster"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useAuth } from "@/contexts/AuthContext"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

function statusTone(status: string): string {
  if (status === "active") return "text-success"
  if (status === "revoked") return "text-destructive"
  return "text-muted-foreground"
}

function oauthStatusMessage(code: string, provider: string, fallback?: string | null): string {
  if (fallback && fallback.trim()) return fallback
  switch (code) {
    case "provider_callback_not_ready":
      return `${provider} returned from authorization, but token exchange is not wired yet.`
    case "invalid_state":
      return "Bank authorization state check failed. Start the connection again."
    case "login_required":
      return "Sign in again to continue the bank authorization flow."
    case "missing_code":
      return "The provider callback did not include an authorization code."
    case "provider_error":
      return `${provider} denied the authorization request.`
    case "provider_callback_failed":
      return `${provider} callback handling failed. Check backend logs before retrying.`
    case "feature_disabled":
      return "Open Banking is disabled in this environment."
    default:
      return "Bank authorization did not complete."
  }
}

export default function BankPage() {
  const { flags } = useAuth()
  const toast = useToast()
  const queryClient = useQueryClient()
  const [selectedProvider, setSelectedProvider] = useState("fakebank")
  const [institutionName, setInstitutionName] = useState("FakeBank")
  const [selectedConnectionId, setSelectedConnectionId] = useState<number | null>(null)
  const [preview, setPreview] = useState<BankSyncPreviewResult | null>(null)
  const [previewConnectionId, setPreviewConnectionId] = useState<number | null>(null)
  const [defaultCategory, setDefaultCategory] = useState("Uncategorized")
  const [isConnecting, setIsConnecting] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)
  const [isCommitting, setIsCommitting] = useState(false)
  const [revokingId, setRevokingId] = useState<number | null>(null)
  const [pendingOauthRedirect, setPendingOauthRedirect] = useState<{ providerName: string; authorizationUrl: string } | null>(null)
  const openBankingEnabled = flags.enable_open_banking

  const {
    data: providers = [],
    isLoading: loadingProviders,
    isFetching: fetchingProviders,
    error: providersError,
    refetch: refetchProviders,
  } = useQuery({
    queryKey: ["bank", "providers"],
    queryFn: bankApi.listProviders,
    staleTime: 60_000,
    enabled: openBankingEnabled,
  })

  const {
    data: connections = [],
    isLoading: loadingConnections,
    isFetching: refreshingConnections,
    error: connectionsError,
    refetch: refetchConnections,
  } = useQuery({
    queryKey: ["bank", "connections"],
    queryFn: bankApi.listConnections,
    staleTime: 20_000,
    enabled: openBankingEnabled,
  })

  const {
    data: consents = [],
    isLoading: loadingConsents,
    isFetching: fetchingConsents,
    error: consentsError,
    refetch: refetchConsents,
  } = useQuery({
    queryKey: ["bank", "consents"],
    queryFn: bankApi.listConsents,
    staleTime: 20_000,
    enabled: openBankingEnabled,
  })

  const {
    data: accessLog = [],
    isLoading: loadingAccessLog,
    isFetching: fetchingAccessLog,
    error: accessLogError,
    refetch: refetchAccessLog,
  } = useQuery({
    queryKey: ["bank", "data-access-log", selectedConnectionId],
    queryFn: () =>
      bankApi.getDataAccessLog({
        connection_id: selectedConnectionId ?? undefined,
        limit: 50,
      }),
    enabled: openBankingEnabled && Boolean(selectedConnectionId),
    staleTime: 20_000,
  })

  const selectedProviderInfo = useMemo<BankProviderCatalogEntry | null>(
    () => providers.find((provider) => provider.provider === selectedProvider) ?? null,
    [providers, selectedProvider]
  )
  const canStartConnection = Boolean(
    selectedProviderInfo
      && selectedProviderInfo.ready
      && (selectedProviderInfo.connect_mode === "direct" || selectedProviderInfo.connect_mode === "oauth_redirect")
  )

  useEffect(() => {
    if (providers.length === 0) return
    if (providers.some((provider) => provider.provider === selectedProvider)) return
    const firstDirectReady = providers.find((provider) => provider.ready && provider.connect_mode === "direct")
    setSelectedProvider(firstDirectReady?.provider ?? providers[0].provider)
  }, [providers, selectedProvider])

  useEffect(() => {
    if (!selectedProviderInfo) return
    setInstitutionName((current) => {
      const trimmed = current.trim()
      if (trimmed && trimmed !== "FakeBank") return current
      return selectedProviderInfo.display_name
    })
  }, [selectedProviderInfo])

  useEffect(() => {
    if (connections.length === 0) {
      setSelectedConnectionId(null)
      return
    }
    if (selectedConnectionId && connections.some((c) => c.id === selectedConnectionId)) return
    const firstActive = connections.find((c) => c.status === "active")
    setSelectedConnectionId(firstActive?.id ?? connections[0].id)
  }, [connections, selectedConnectionId])

  const selectedConnection = useMemo(
    () => connections.find((c) => c.id === selectedConnectionId) ?? null,
    [connections, selectedConnectionId]
  )
  const selectedConnectionConsents = useMemo(
    () => consents.filter((c) => c.connection_id === selectedConnectionId),
    [consents, selectedConnectionId]
  )
  const latestSelectedConsent = selectedConnectionConsents[0] ?? null
  const providersErrorMessage = providersError instanceof Error
    ? providersError.message
    : providersError
      ? "We couldn't load the provider catalog right now."
      : null
  const connectionsErrorMessage = connectionsError instanceof Error
    ? connectionsError.message
    : connectionsError
      ? "We couldn't load your bank connections right now."
      : null
  const consentsErrorMessage = consentsError instanceof Error
    ? consentsError.message
    : consentsError
      ? "We couldn't load consent details right now."
      : null
  const accessLogErrorMessage = accessLogError instanceof Error
    ? accessLogError.message
    : accessLogError
      ? "We couldn't load the bank data access log right now."
      : null

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const status = params.get("bank_oauth_status")
    if (!status) return

    const providerKey = params.get("provider") || "provider"
    const providerLabel = providers.find((entry) => entry.provider === providerKey)?.display_name ?? providerKey
    const code = params.get("bank_oauth_code") || status
    const message = oauthStatusMessage(code, providerLabel, params.get("bank_oauth_message"))

    if (status === "success") {
      toast.success(message || `${providerLabel} authorization completed.`)
    } else {
      toast.error(message)
    }

    params.delete("bank_oauth_status")
    params.delete("bank_oauth_code")
    params.delete("bank_oauth_message")
    params.delete("provider")
    const next = params.toString()
    const nextUrl = `${window.location.pathname}${next ? `?${next}` : ""}${window.location.hash}`
    window.history.replaceState({}, document.title, nextUrl)
  }, [providers, toast])

  useEffect(() => {
    if (!pendingOauthRedirect) return
    const timer = window.setTimeout(() => {
      window.location.assign(pendingOauthRedirect.authorizationUrl)
    }, 2500)
    return () => window.clearTimeout(timer)
  }, [pendingOauthRedirect])

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedProviderInfo) {
      toast.error("Select a provider first.")
      return
    }
    if (!selectedProviderInfo.ready) {
      toast.error("This provider is not configured yet.")
      return
    }
    const trimmed = institutionName.trim()
    if (!trimmed && selectedProviderInfo.connect_mode === "direct") {
      toast.error("Institution name is required.")
      return
    }

    if (selectedProviderInfo.connect_mode === "oauth_redirect") {
      setIsConnecting(true)
      try {
        const auth = await bankApi.beginAuthorization({
          provider: selectedProviderInfo.provider,
          institution_name: trimmed || selectedProviderInfo.display_name,
          scopes: ["transactions:read"],
          purpose_of_use: "Personal financial analytics",
        })
        setPendingOauthRedirect({
          providerName: selectedProviderInfo.display_name,
          authorizationUrl: auth.authorization_url,
        })
      } catch (err) {
        const msg = err instanceof Error ? err.message : "We couldn't start bank authorization right now."
        toast.error(msg)
      } finally {
        setIsConnecting(false)
      }
      return
    }

    if (selectedProviderInfo.connect_mode !== "direct") {
      toast.error("This provider uses an unsupported connection flow.")
      return
    }

    setIsConnecting(true)
    try {
      const connection = await bankApi.connect({
        provider: selectedProviderInfo.provider,
        institution_name: trimmed,
        scopes: ["transactions:read"],
        purpose_of_use: "Personal financial analytics",
      })
      setSelectedConnectionId(connection.id)
      setPreview(null)
      setPreviewConnectionId(null)
      setInstitutionName(selectedProviderInfo.display_name)
      await queryClient.invalidateQueries({ queryKey: ["bank", "connections"] })
      await queryClient.invalidateQueries({ queryKey: ["bank", "consents"] })
      toast.success(`Connected ${connection.institution_name}.`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : "We couldn't connect that bank right now."
      toast.error(msg)
    } finally {
      setIsConnecting(false)
    }
  }

  const handleSyncPreview = async () => {
    if (!selectedConnection) {
      toast.error("Select a connection first.")
      return
    }
    if (selectedConnection.status !== "active") {
      toast.error("Only active connections can sync.")
      return
    }
    setIsSyncing(true)
    try {
      const data = await bankApi.syncPreview(selectedConnection.id, { limit: 25 })
      setPreview(data)
      setPreviewConnectionId(selectedConnection.id)
      toast.success(`Staged ${data.staged_count} row(s).`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : "We couldn't run a sync preview right now."
      toast.error(msg)
    } finally {
      setIsSyncing(false)
    }
  }

  const handleCommit = async () => {
    if (!preview || !previewConnectionId) {
      toast.error("Run a sync preview before you commit transactions.")
      return
    }
    setIsCommitting(true)
    try {
      const data = await bankApi.commit(previewConnectionId, preview.sync_run_id, {
        default_category: defaultCategory.trim() || "Uncategorized",
      })
      setPreview(null)
      setPreviewConnectionId(null)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["bank", "connections"] }),
        queryClient.invalidateQueries({ queryKey: ["bank", "consents"] }),
        queryClient.invalidateQueries({ queryKey: ["bank", "data-access-log", previewConnectionId] }),
        queryClient.invalidateQueries({ queryKey: ["transactions"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard-metrics"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard-bundle"] }),
        queryClient.invalidateQueries({ queryKey: ["safe-to-spend"] }),
        queryClient.invalidateQueries({ queryKey: ["budget-metrics"] }),
      ])
      toast.success(
        `Committed ${data.committed_count} transaction(s), skipped ${data.skipped_dup_count} duplicate(s).`
      )
    } catch (err) {
      const msg = err instanceof Error ? err.message : "We couldn't commit those staged transactions right now."
      toast.error(msg)
    } finally {
      setIsCommitting(false)
    }
  }

  const handleRevoke = async (connectionId: number) => {
    setRevokingId(connectionId)
    try {
      await bankApi.revoke(connectionId)
      if (previewConnectionId === connectionId) {
        setPreview(null)
        setPreviewConnectionId(null)
      }
      await queryClient.invalidateQueries({ queryKey: ["bank", "connections"] })
      await queryClient.invalidateQueries({ queryKey: ["bank", "consents"] })
      await queryClient.invalidateQueries({ queryKey: ["bank", "data-access-log", connectionId] })
      toast.success("Connection revoked.")
    } catch (err) {
      const msg = err instanceof Error ? err.message : "We couldn't revoke that connection right now."
      toast.error(msg)
    } finally {
      setRevokingId(null)
    }
  }

  return (
    <div className="space-y-8">
      <PageHeader
        badge="Open Banking"
        badgeDotClassName="bg-primary"
        title="Connect banks, preview transactions, and import safely"
        actions={(
          <Button
            type="button"
            variant="outline"
            onClick={() => queryClient.invalidateQueries({ queryKey: ["bank", "connections"] })}
            disabled={refreshingConnections || !openBankingEnabled}
          >
            <RefreshCw className={cn("h-4 w-4", refreshingConnections && "animate-spin")} />
            Refresh
          </Button>
        )}
      />

      {!openBankingEnabled ? (
        <section className="section-panel float-in stagger-2">
          <div className="section-header justify-start gap-2">
            <ShieldCheck className="h-4 w-4 text-warning" />
            <h2 className="text-lg font-semibold">Open Banking unavailable</h2>
          </div>
          <div className="section-body">
            <div className="inner-card border-warning/30 bg-warning/10 text-sm">
              <p className="font-semibold text-warning">Open Banking is not enabled in this environment.</p>
              <p className="mt-1 text-muted-foreground">
                The bank connection workflow is hidden until the backend feature flag is turned on.
              </p>
            </div>
          </div>
        </section>
      ) : null}

      {!openBankingEnabled ? null : (
        <>
      <Dialog
        open={Boolean(pendingOauthRedirect)}
        onOpenChange={(open) => {
          if (!open) setPendingOauthRedirect(null)
        }}
      >
        <DialogContent className="w-[calc(100vw-1rem)] max-w-md space-y-5 sm:w-full">
          <DialogHeader>
            <DialogTitle>Redirecting to your bank</DialogTitle>
            <DialogDescription>
              {pendingOauthRedirect
                ? `You're being redirected to ${pendingOauthRedirect.providerName} to authorize secure read-only access to your account.`
                : "You're being redirected to your bank to authorize access."}
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-xl border border-border/60 bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
            You'll be returned to Statera automatically after the bank finishes authorization.
          </div>
          <DialogFooter className="flex-col-reverse gap-2 pt-2 sm:flex-row">
            <Button
              type="button"
              variant="outline"
              onClick={() => setPendingOauthRedirect(null)}
              className="w-full sm:w-auto"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => {
                if (pendingOauthRedirect) {
                  window.location.assign(pendingOauthRedirect.authorizationUrl)
                }
              }}
              className="w-full sm:w-auto"
            >
              Continue to {pendingOauthRedirect?.providerName || "provider"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <section className="section-panel panel-featured float-in stagger-2">
        <div className="section-header justify-start gap-2">
          <Link2 className="h-4 w-4 text-primary" />
          <h2 className="text-lg font-semibold">Connections</h2>
        </div>
        <div className="section-body grid gap-4 lg:grid-cols-2">
          <form onSubmit={handleConnect} className="inner-card space-y-3">
            <div className="text-sm font-semibold">Connect a provider</div>
            <p className="text-xs text-muted-foreground">
              Demo and future-provider readiness live in the same bank workflow.
            </p>
            <div className="space-y-2">
              <Label>Provider</Label>
              {loadingProviders ? (
                <div className="space-y-2">
                  <div className="skeleton h-12" />
                  <div className="skeleton h-12" />
                </div>
              ) : providersErrorMessage ? (
                <div className="rounded-xl border border-warning/35 bg-warning/10 px-4 py-3 text-sm">
                  <p className="font-semibold text-warning">Providers unavailable</p>
                  <p className="mt-1 text-muted-foreground">{providersErrorMessage}</p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-3"
                    onClick={() => {
                      void refetchProviders()
                    }}
                    loading={fetchingProviders}
                    disabled={fetchingProviders}
                  >
                    {fetchingProviders ? "Retrying..." : "Retry providers"}
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  {providers.map((provider) => {
                    const selected = provider.provider === selectedProvider
                    return (
                      <button
                        key={provider.provider}
                        type="button"
                        onClick={() => setSelectedProvider(provider.provider)}
                        className={cn(
                          "w-full rounded-xl border border-border bg-muted/20 p-3 text-left transition",
                          selected && "border-primary/50 ring-1 ring-primary/30"
                        )}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="text-sm font-semibold">{provider.display_name}</div>
                            <div className="text-xs text-muted-foreground">
                              {provider.provider} · {provider.connect_mode} · {provider.integration_status}
                            </div>
                          </div>
                          <div className={cn("text-xs font-medium", provider.ready ? "text-success" : "text-muted-foreground")}>
                            {provider.ready ? "Ready" : "Needs setup"}
                          </div>
                        </div>
                        {provider.notes ? (
                          <p className="mt-2 text-xs text-muted-foreground">{provider.notes}</p>
                        ) : null}
                        {provider.missing_config.length > 0 ? (
                          <p className="mt-2 text-xs text-muted-foreground">
                            Missing: {provider.missing_config.join(", ")}
                          </p>
                        ) : null}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="institution_name">Institution name</Label>
              <Input
                id="institution_name"
                value={institutionName}
                onChange={(e) => setInstitutionName(e.target.value)}
                placeholder={selectedProviderInfo?.display_name || "Institution"}
                maxLength={255}
              />
            </div>
            {selectedProviderInfo?.connect_mode === "oauth_redirect" ? (
              <p className="text-xs text-muted-foreground">
                This provider uses OAuth. We'll briefly explain the redirect before sending you to the bank for authorization.
              </p>
            ) : null}
            <Button type="submit" loading={isConnecting} disabled={isConnecting || !canStartConnection}>
              {!isConnecting ? <Landmark className="h-4 w-4" /> : null}
              {isConnecting
                ? (selectedProviderInfo?.connect_mode === "oauth_redirect" ? "Redirecting..." : "Connecting...")
                : (
                    selectedProviderInfo?.connect_mode === "oauth_redirect"
                      ? `Start authorization with ${selectedProviderInfo?.display_name || "provider"}`
                      : `Connect ${selectedProviderInfo?.display_name || "provider"}`
                  )}
            </Button>
          </form>

          <div className="inner-card space-y-3">
            <div className="text-sm font-semibold">Your bank connections</div>
            {loadingConnections ? (
              <div className="space-y-2">
                <div className="skeleton h-10" />
                <div className="skeleton h-10" />
              </div>
            ) : connectionsErrorMessage ? (
              <div className="rounded-xl border border-warning/35 bg-warning/10 px-4 py-3 text-sm">
                <p className="font-semibold text-warning">Connections unavailable</p>
                <p className="mt-1 text-muted-foreground">{connectionsErrorMessage}</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={() => {
                    void refetchConnections()
                  }}
                  loading={refreshingConnections}
                  disabled={refreshingConnections}
                >
                  {refreshingConnections ? "Retrying..." : "Retry connections"}
                </Button>
              </div>
            ) : connections.length === 0 ? (
              <div className="space-y-4 py-1">
                <div className="space-y-1.5">
                  <p className="text-sm font-medium">No banks connected yet</p>
                  <p className="text-xs text-muted-foreground">
                    Connect a bank to pull transactions securely — preview them before
                    anything is saved, then commit when you're satisfied.
                  </p>
                </div>
                <div className="space-y-2 text-xs text-muted-foreground">
                  {[
                    ["Connect", "Authorise read-only access using the form on the left."],
                    ["Preview", "Stage up to 25 rows and review for duplicates before import."],
                    ["Import", "Commit staged rows to your transaction history in one click."],
                  ].map(([step, desc], i) => (
                    <div key={step} className="flex items-start gap-2">
                      <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[10px] font-bold text-primary">
                        {i + 1}
                      </span>
                      <span>
                        <strong className="text-foreground">{step}</strong>
                        {" — "}
                        {desc}
                      </span>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  Access is read-only and can be revoked at any time.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {connections.map((connection) => {
                  const selected = connection.id === selectedConnectionId
                  const revokingThis = revokingId === connection.id
                  return (
                    <div
                      key={connection.id}
                      className={cn(
                        "rounded-xl border border-border bg-muted/30 p-3",
                        selected && "border-primary/50 ring-1 ring-primary/30"
                      )}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <div className="text-sm font-semibold">{connection.institution_name}</div>
                          <div className="text-xs text-muted-foreground">
                            {connection.provider} ·{" "}
                            <span className={statusTone(connection.status)}>{connection.status}</span>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            variant={selected ? "default" : "outline"}
                            size="sm"
                            onClick={() => setSelectedConnectionId(connection.id)}
                          >
                            {selected ? "Selected" : "Select"}
                          </Button>
                          {connection.status === "active" ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              loading={revokingThis}
                              onClick={() => handleRevoke(connection.id)}
                              disabled={revokingThis}
                            >
                              {!revokingThis ? <ShieldX className="h-4 w-4" /> : null}
                              {revokingThis ? "Revoking..." : "Revoke"}
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="section-panel float-in stagger-3">
        <div className="section-header section-header-divider justify-between gap-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" />
            <h2 className="text-lg font-semibold">Sync preview</h2>
          </div>
          <Button
            type="button"
            onClick={handleSyncPreview}
            loading={isSyncing}
            disabled={!selectedConnection || selectedConnection.status !== "active" || isSyncing}
          >
            {isSyncing ? "Staging..." : "Run Sync Preview"}
          </Button>
        </div>
        <div className="section-body space-y-4">
          {!preview ? (
            <p className="text-sm text-muted-foreground">
              Select an active connection and run preview to stage up to 25 provider rows.
            </p>
          ) : (
            <>
              <div className="inner-card grid gap-2 text-sm sm:grid-cols-3">
                <div>
                  <div className="text-xs text-muted-foreground">Staged rows</div>
                  <div className="font-semibold">{preview.staged_count}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Provider duplicates skipped</div>
                  <div className="font-semibold">{preview.provider_dup_count}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Next cursor</div>
                  <div className="font-semibold">{preview.next_cursor || "None"}</div>
                </div>
              </div>

              {preview.rows.some((row) => row.likely_dup) ? (
                <div className="rounded-xl border border-warning/35 bg-warning/10 px-4 py-3 text-sm">
                  <p className="font-semibold text-warning">Likely duplicates detected</p>
                  <p className="mt-1 text-muted-foreground">
                    Rows are flagged when an existing transaction already matches the same date, normalized description, and amount. Flagged rows are reviewed here and skipped during commit if they are true duplicates.
                  </p>
                </div>
              ) : null}

              <div className="space-y-3 md:hidden">
                {preview.rows.map((row) => (
                  <article key={row.raw_tx_id} className="inner-card space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">{row.description}</p>
                        <p className="mt-1 text-xs text-muted-foreground tabular-nums">{row.date}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-base font-semibold tabular-nums">{formatKD(row.amount_kd)}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {row.likely_dup ? "Likely duplicate" : "No duplicate"}
                        </p>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
              <div className="hidden rounded-xl border border-border/60 md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>Likely dup</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {preview.rows.map((row) => (
                      <TableRow key={row.raw_tx_id}>
                        <TableCell className="tabular-nums">{row.date}</TableCell>
                        <TableCell>{row.description}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatKD(row.amount_kd)}</TableCell>
                        <TableCell>{row.likely_dup ? "Yes" : "No"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
                <div className="min-w-[220px] flex-1">
                  <Label htmlFor="default_category">Default category for commit</Label>
                  <Input
                    id="default_category"
                    value={defaultCategory}
                    onChange={(e) => setDefaultCategory(e.target.value)}
                    placeholder="Uncategorized"
                    maxLength={64}
                  />
                </div>
                <Button type="button" variant="outline" onClick={() => setPreview(null)} disabled={isCommitting} className="w-full sm:w-auto">
                  Clear Preview
                </Button>
                <Button type="button" onClick={handleCommit} loading={isCommitting} disabled={isCommitting} className="w-full sm:w-auto">
                  {isCommitting ? "Committing..." : "Commit Staged Transactions"}
                </Button>
              </div>
            </>
          )}
        </div>
      </section>

      <section className="section-panel float-in stagger-4">
        <div className="section-header justify-start gap-2">
          <ShieldCheck className="h-4 w-4 text-primary" />
          <h2 className="text-lg font-semibold">Consent Details & Data Access History</h2>
        </div>
        <div className="section-body grid gap-4 lg:grid-cols-2">
          <div className="inner-card space-y-2">
            <div className="text-sm font-semibold">Consent details</div>
            {loadingConsents ? (
              <div className="skeleton h-16" />
            ) : consentsErrorMessage ? (
              <div className="rounded-xl border border-warning/35 bg-warning/10 px-4 py-3 text-sm">
                <p className="font-semibold text-warning">Consent details unavailable</p>
                <p className="mt-1 text-muted-foreground">{consentsErrorMessage}</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={() => {
                    void refetchConsents()
                  }}
                  loading={fetchingConsents}
                  disabled={fetchingConsents}
                >
                  {fetchingConsents ? "Retrying..." : "Retry consent details"}
                </Button>
              </div>
            ) : !selectedConnection ? (
              <p className="text-sm text-muted-foreground">Select a connection to view consent details.</p>
            ) : !latestSelectedConsent ? (
              <p className="text-sm text-muted-foreground">There is no consent record available for this connection yet.</p>
            ) : (
              <div className="space-y-1 text-sm">
                <p>
                  <span className="text-muted-foreground">Purpose:</span>{" "}
                  {latestSelectedConsent.purpose_of_use}
                </p>
                <p>
                  <span className="text-muted-foreground">Scope:</span>{" "}
                  {latestSelectedConsent.scope_description}
                </p>
                <p>
                  <span className="text-muted-foreground">Granted:</span>{" "}
                  {latestSelectedConsent.granted_at
                    ? new Date(latestSelectedConsent.granted_at).toLocaleString()
                    : "—"}
                </p>
                <p>
                  <span className="text-muted-foreground">Expires:</span>{" "}
                  {latestSelectedConsent.expires_at
                    ? new Date(latestSelectedConsent.expires_at).toLocaleString()
                    : "—"}
                </p>
                <p>
                  <span className="text-muted-foreground">Status:</span> {latestSelectedConsent.status}
                </p>
              </div>
            )}
          </div>

          <div className="inner-card space-y-2">
            <div className="text-sm font-semibold">Data access log</div>
            {loadingAccessLog ? (
              <div className="skeleton h-16" />
            ) : accessLogErrorMessage ? (
              <div className="rounded-xl border border-warning/35 bg-warning/10 px-4 py-3 text-sm">
                <p className="font-semibold text-warning">Access log unavailable</p>
                <p className="mt-1 text-muted-foreground">{accessLogErrorMessage}</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={() => {
                    void refetchAccessLog()
                  }}
                  loading={fetchingAccessLog}
                  disabled={fetchingAccessLog || !selectedConnectionId}
                >
                  {fetchingAccessLog ? "Retrying..." : "Retry access log"}
                </Button>
              </div>
            ) : accessLog.length === 0 ? (
              <p className="text-sm text-muted-foreground">You haven&apos;t shared bank data with any institution yet.</p>
            ) : (
              <div className="max-h-64 space-y-2 overflow-auto">
                {accessLog.map((entry) => (
                  <div key={entry.id} className="rounded-lg border border-border/60 p-2 text-sm">
                    <p className="font-medium">{entry.action}</p>
                    <p className="text-xs text-muted-foreground">
                      {entry.created_at ? new Date(entry.created_at).toLocaleString() : "Unknown time"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Records accessed: {entry.records_accessed}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>
        </>
      )}
    </div>
  )
}
