import { describe, expect, it } from "vitest"

import { ApiError } from "@/lib/api"

import { getDeletedRecordMessage } from "./error-recovery"

describe("getDeletedRecordMessage", () => {
  it("returns a stale-record message for API 404 errors", () => {
    const error = new ApiError("Savings goal not found.", 404, "not_found")

    expect(getDeletedRecordMessage(error, "goal")).toBe(
      "This goal was deleted. Please refresh the page."
    )
  })

  it("returns null for non-404 errors", () => {
    const error = new ApiError("Validation failed.", 400, "validation_error")

    expect(getDeletedRecordMessage(error, "transaction")).toBeNull()
    expect(getDeletedRecordMessage(new Error("boom"), "transaction")).toBeNull()
  })
})
