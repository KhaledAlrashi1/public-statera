const PENDING_WORKSPACE_CHOICE_KEY = "pending-workspace-choice"

export function markPendingWorkspaceChoice() {
  try {
    window.sessionStorage.setItem(PENDING_WORKSPACE_CHOICE_KEY, "1")
  } catch {
    // Ignore storage failures and fall back to the normal dashboard flow.
  }
}

export function hasPendingWorkspaceChoice(): boolean {
  try {
    return window.sessionStorage.getItem(PENDING_WORKSPACE_CHOICE_KEY) === "1"
  } catch {
    return false
  }
}

export function clearPendingWorkspaceChoice() {
  try {
    window.sessionStorage.removeItem(PENDING_WORKSPACE_CHOICE_KEY)
  } catch {
    // Ignore storage failures and continue.
  }
}
