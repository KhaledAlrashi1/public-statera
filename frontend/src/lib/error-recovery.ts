import { ApiError } from "@/lib/api"

export function getDeletedRecordMessage(error: unknown, entityLabel = "record"): string | null {
  if (error instanceof ApiError && error.status === 404) {
    return `This ${entityLabel} was deleted. Please refresh the page.`
  }
  return null
}
