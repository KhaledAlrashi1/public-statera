import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import MagicLinkRequestForm from "./MagicLinkRequestForm"
import { ApiError } from "@/lib/api"

let mockRequest: ReturnType<typeof vi.fn>

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>()
  return {
    ...actual,
    authApi: { magicLinkRequest: (...args: unknown[]) => mockRequest(...args) },
  }
})

// Ruled copy (10e-R191, 2026-08-21), written out INDEPENDENTLY of the component's
// own constants on purpose. Importing the component's literals would make the
// assertion `render(CONST) === CONST` for the wording — the degenerate shape
// 10e-R167 retired. Two independent artifacts means a silent copy edit goes red,
// and any interpolation into the rendered string goes red too.
const SENT_TITLE = "Check your email."
const SENT_BODY =
  "If that address has an account — or is ready to have one — we've sent a sign-in link. It expires in 15 minutes."
const EMPTY_EMAIL = "Enter your email address."
const THROTTLED = "Too many sign-in link requests. Please wait a few minutes and try again."
const SEND_FAILED = "We couldn't send the sign-in link. Please try again."

function type(value: string) {
  fireEvent.change(screen.getByLabelText(/email address/i), { target: { value } })
}

function submit() {
  fireEvent.click(screen.getByRole("button", { name: /email me a sign-in link/i }))
}

beforeEach(() => {
  mockRequest = vi.fn().mockResolvedValue(undefined)
})

describe("MagicLinkRequestForm", () => {
  it("submits the trimmed address and shows the confirmation", async () => {
    render(<MagicLinkRequestForm />)
    type("  khaled@example.com  ")
    submit()
    await waitFor(() => expect(screen.getByTestId("magic-link-sent")).toBeInTheDocument())
    expect(mockRequest).toHaveBeenCalledTimes(1)
    expect(mockRequest).toHaveBeenCalledWith("khaled@example.com")
  })

  // 10e-R194: RE-POINTED. The original proposal pinned "the confirmation is
  // byte-identical for two different addresses", which is DEGENERATE — the server
  // returns one fixed 200 envelope built outside every branch, so that assertion
  // feeds one code path the same input twice and holds by construction. The
  // cross-address property lives on the SERVER and is pinned there by 10e-2.
  //
  // What this pins instead is INDEPENDENCE FROM THE RESPONSE AND THE INPUT: the
  // rendered text is byte-equal to the ruled literal, so interpolating anything —
  // a response field, the address the user typed — breaks it.
  it("renders the confirmation byte-equal to the ruled copy, interpolating nothing", async () => {
    render(<MagicLinkRequestForm />)
    type("khaled@example.com")
    submit()
    await waitFor(() => expect(screen.getByTestId("magic-link-sent")).toBeInTheDocument())
    expect(screen.getByTestId("magic-link-sent-title").textContent).toBe(SENT_TITLE)
    expect(screen.getByTestId("magic-link-sent-body").textContent).toBe(SENT_BODY)
  })

  it("rejects an empty address client-side and issues no request", () => {
    render(<MagicLinkRequestForm />)
    type("   ")
    submit()
    expect(screen.getByTestId("magic-link-error").textContent).toBe(EMPTY_EMAIL)
    expect(mockRequest).not.toHaveBeenCalled()
  })

  it("shows the throttle message on rate_limit_exceeded", async () => {
    mockRequest.mockRejectedValue(
      new ApiError("Too many requests. Please try again later.", 429, "rate_limit_exceeded"),
    )
    render(<MagicLinkRequestForm />)
    type("khaled@example.com")
    submit()
    await waitFor(() =>
      expect(screen.getByTestId("magic-link-error").textContent).toBe(THROTTLED),
    )
  })

  // The form is submitted DIRECTLY here, bypassing HTML5 constraint validation.
  // That is not a convenience: measured against this repo's jsdom 26.1.0,
  // <input type="email"> gives "not-an-email" validity.typeMismatch === true and
  // form.checkValidity() === false, so a click on the submit button never reaches
  // this handler and the branch would be untestable through the UI — and an
  // unexercised branch is the defect the gate-3 omission demonstrated once already.
  // The branch is a genuine fallback: the server is the authority on format, and
  // when its rejection does arrive it must be shown rather than swallowed into the
  // generic failure string.
  it("surfaces the server's validation message verbatim when its rejection arrives", async () => {
    mockRequest.mockRejectedValue(
      new ApiError("Enter a valid email address.", 400, "validation_error"),
    )
    render(<MagicLinkRequestForm />)
    type("not-an-email")
    fireEvent.submit(screen.getByTestId("magic-link-form"))
    await waitFor(() =>
      expect(screen.getByTestId("magic-link-error").textContent).toBe(
        "Enter a valid email address.",
      ),
    )
  })

  it("shows the generic failure on any other error and does NOT show the confirmation", async () => {
    mockRequest.mockRejectedValue(new ApiError("boom", 502, "MAGIC_LINK_SEND_FAILED"))
    render(<MagicLinkRequestForm />)
    type("khaled@example.com")
    submit()
    await waitFor(() =>
      expect(screen.getByTestId("magic-link-error").textContent).toBe(SEND_FAILED),
    )
    expect(screen.queryByTestId("magic-link-sent")).not.toBeInTheDocument()
  })
})
