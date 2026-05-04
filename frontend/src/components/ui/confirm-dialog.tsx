import { useEffect, useRef, useState } from "react"
import { AlertTriangle } from "lucide-react"
import { Button } from "./button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./dialog"

export function ConfirmDialog({
  open,
  onOpenChange,
  message,
  onConfirm,
  loading,
  title = "Confirm Action",
  confirmLabel = "Delete",
  loadingLabel = "Deleting...",
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  message: string
  onConfirm: () => void | Promise<void>
  loading?: boolean
  title?: string
  confirmLabel?: string
  loadingLabel?: string
}) {
  const [submitting, setSubmitting] = useState(false)
  const confirmLatchRef = useRef(false)
  const resetTimerRef = useRef<number | null>(null)
  const isBusy = Boolean(loading) || submitting

  useEffect(() => {
    if (open) return
    if (resetTimerRef.current !== null) {
      window.clearTimeout(resetTimerRef.current)
      resetTimerRef.current = null
    }
    confirmLatchRef.current = false
    setSubmitting(false)
  }, [open])

  useEffect(() => {
    return () => {
      if (resetTimerRef.current !== null) {
        window.clearTimeout(resetTimerRef.current)
      }
    }
  }, [])

  const handleConfirm = async () => {
    if (confirmLatchRef.current || loading) return
    confirmLatchRef.current = true
    setSubmitting(true)

    try {
      await onConfirm()
    } finally {
      if (resetTimerRef.current !== null) {
        window.clearTimeout(resetTimerRef.current)
      }
      resetTimerRef.current = window.setTimeout(() => {
        confirmLatchRef.current = false
        setSubmitting(false)
        resetTimerRef.current = null
      }, 0)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && isBusy) return
        onOpenChange(nextOpen)
      }}
    >
      <DialogContent className="w-[calc(100vw-1rem)] max-w-md space-y-5 sm:w-full">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col items-center gap-4 py-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10">
            <AlertTriangle className="h-7 w-7 text-destructive" />
          </div>
          <DialogDescription className="text-center text-sm text-muted-foreground">
            {message}
          </DialogDescription>
        </div>
        <DialogFooter className="flex-col-reverse gap-2 pt-2 sm:flex-row">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isBusy}
            className="w-full sm:w-auto"
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() => {
              void handleConfirm()
            }}
            loading={isBusy}
            disabled={isBusy}
            className="w-full sm:w-auto"
          >
            {isBusy ? loadingLabel : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
