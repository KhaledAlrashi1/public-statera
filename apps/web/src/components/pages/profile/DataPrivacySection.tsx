import { useState } from "react"
import { Link } from "react-router-dom"
import { Download, FileText, Trash2 } from "lucide-react"
import { accountApi, ApiError } from "@/lib/api"
import { cn } from "@/lib/utils"
import { useToast } from "@/components/ui/toaster"
import { Button, buttonVariants } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { panelSection } from "@/components/ui/patterns"

/*
 * ProfilePage "Data & privacy" section (10c-3).
 *   - Download your data  → GDPR right-to-access (accountApi.dataExport), standalone.
 *   - In-app legal links  → /privacy, /terms (the public 10c-2 pages).
 *   - Delete account      → opens a dialog that offers the data export BEFORE the
 *                            destructive step (the only point with a live session —
 *                            export requires auth; after delete-reauth there is none),
 *                            then hands off to the delete-reauth OIDC flow.
 *
 * "Continue to verification" is a plain <a href> (full-document navigation), the same
 * pattern as LoginPage's Google link — the OIDC redirect chain can't be driven by XHR.
 */

const DELETE_REAUTH_URL = "/api/auth/delete-reauth"

export default function DataPrivacySection() {
  const toast = useToast()
  const [exporting, setExporting] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)

  const handleExport = async () => {
    setExporting(true)
    try {
      await accountApi.dataExport()
      toast.success("Your data export has started downloading.")
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) {
        toast.error("You've reached the data-export limit. Please try again later.")
      } else {
        toast.error("We couldn't export your data right now. Please try again.")
      }
    } finally {
      setExporting(false)
    }
  }

  return (
    <section className={panelSection({ animated: true, stagger: "6", className: "p-5" })}>
      <h2 className="text-lg font-semibold">Data &amp; privacy</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Download a copy of your data, review our policies, or delete your account.
      </p>

      {/* Download your data (standalone right-to-access) */}
      <div className="mt-4 surface-row-card flex flex-col items-start gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium">Download your data</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Export everything we hold for your account as a JSON file.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => void handleExport()}
          loading={exporting}
          disabled={exporting}
          className="flex items-center gap-2"
        >
          <Download className="h-4 w-4" />
          {exporting ? "Preparing..." : "Download"}
        </Button>
      </div>

      {/* In-app legal links */}
      <div className="mt-3 surface-row-card flex flex-col items-start gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium">Policies</p>
          <p className="mt-0.5 text-xs text-muted-foreground">Our privacy and terms.</p>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <Link to="/privacy" className="flex items-center gap-1.5 font-medium text-primary hover:underline">
            <FileText className="h-4 w-4" />
            Privacy Policy
          </Link>
          <Link to="/terms" className="flex items-center gap-1.5 font-medium text-primary hover:underline">
            <FileText className="h-4 w-4" />
            Terms
          </Link>
        </div>
      </div>

      {/* Danger zone */}
      <div className="mt-5 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
        <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-destructive">Delete account</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Permanently delete your account and all associated data. This cannot be undone.
            </p>
          </div>
          <Button
            type="button"
            variant="destructive"
            onClick={() => setDialogOpen(true)}
            className="flex items-center gap-2"
          >
            <Trash2 className="h-4 w-4" />
            Delete account
          </Button>
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="w-[calc(100vw-1rem)] max-w-md space-y-5 sm:w-full">
          <DialogHeader>
            <DialogTitle>Delete your account</DialogTitle>
            <DialogDescription>
              This permanently deletes your account and all associated data. This action cannot be
              undone. See our{" "}
              <Link to="/privacy" className="font-medium text-primary hover:underline">
                Privacy Policy
              </Link>{" "}
              for details on data retention.
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-lg border border-border/60 bg-muted/30 p-3">
            <p className="text-sm font-medium">Before you go</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              You can download a copy of your data first. You won't be able to after deletion.
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void handleExport()}
              loading={exporting}
              disabled={exporting}
              className="mt-3 flex items-center gap-2"
            >
              <Download className="h-4 w-4" />
              {exporting ? "Preparing..." : "Download your data"}
            </Button>
          </div>

          <DialogFooter className="flex-col-reverse gap-2 pt-2 sm:flex-row">
            <Button
              type="button"
              variant="outline"
              onClick={() => setDialogOpen(false)}
              className="w-full sm:w-auto"
            >
              Cancel
            </Button>
            {/* Full-document navigation to the OIDC delete-reauth endpoint — a plain
                styled <a> (same pattern as LoginPage's Google link); XHR can't drive
                the OIDC redirect chain. */}
            <a
              href={DELETE_REAUTH_URL}
              className={cn(buttonVariants({ variant: "destructive" }), "w-full sm:w-auto")}
            >
              Continue to verification
            </a>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}
