import { StrictMode, useEffect } from "react"
import { render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { MemoryRouter, Route, Routes } from "react-router-dom"

import MagicLinkPage from "./MagicLinkPage"
import { ApiError } from "@/lib/api"

let mockVerify: ReturnType<typeof vi.fn>
let mockRequest: ReturnType<typeof vi.fn>
let mockRefresh: () => Promise<void>
let authUser: { id: number } | null
let trace: string[]
let replaceSpy: ReturnType<typeof vi.spyOn>

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>()
  return {
    ...actual,
    authApi: {
      magicLinkVerify: (...args: unknown[]) => mockVerify(...args),
      magicLinkRequest: (...args: unknown[]) => mockRequest(...args),
    },
  }
})

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ refreshUser: () => mockRefresh() }),
}))

// Ruled copy (10e-R191), written independently of the component's constants — see
// the note in MagicLinkRequestForm.test.tsx for why they are not imported.
const INVALID_TITLE = "This sign-in link isn't valid."
const INVALID_BODY =
  "Links expire after 15 minutes, are single-use, and requesting a new link replaces any earlier one. Request a fresh link below."
const FAILED_TITLE = "We couldn't complete sign-in."

/**
 * Stands in for ProtectedRoute: renders BOUNCED when auth state is not populated,
 * exactly as ProtectedRoute.tsx:16-18 does. This is what makes the destination
 * assertions POST-CONDITIONS (10e-R190(i)) rather than proof that a spy was called
 * — a refreshUser spy that resolves to nothing satisfies "was invoked" while the
 * user still ends up on the sign-in page.
 */
function Dest({ label }: { label: string }) {
  const authed = authUser !== null
  useEffect(() => {
    trace.push(authed ? `mount:${label}` : `bounced:${label}`)
    // Mount-only trace probe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return <div>{authed ? label : "BOUNCED"}</div>
}

function renderPage(path: string, { strict = false }: { strict?: boolean } = {}) {
  const tree = (
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/auth/magic" element={<MagicLinkPage />} />
        <Route path="/" element={<Dest label="DASHBOARD" />} />
        <Route path="/welcome" element={<Dest label="WELCOME" />} />
        <Route path="/auth/2fa-verify" element={<div>TWO-FACTOR</div>} />
        <Route path="/login" element={<div>LOGIN</div>} />
      </Routes>
    </MemoryRouter>
  )
  return render(strict ? <StrictMode>{tree}</StrictMode> : tree)
}

function invalidLinkError() {
  return new ApiError("This sign-in link isn't valid.", 400, "MAGIC_LINK_INVALID")
}

beforeEach(() => {
  authUser = null
  trace = []
  mockRequest = vi.fn().mockResolvedValue(undefined)
  mockVerify = vi.fn()
  // The await is REAL, and that is load-bearing rather than decorative. A mock whose
  // body is synchronous sets authUser before the very next statement runs, so
  // `void refreshUser(); navigate(...)` would still find auth populated and BOTH the
  // post-condition and the ordering pin would stay GREEN against code that never
  // awaits — the instrument sharing a timing assumption with the thing it measures.
  // Measured: with a synchronous mock, dropping the await reddened only the /me
  // FAILURE case; with the boundary below it reddens the post-condition and the
  // ordering pin too, which is what those cases exist to catch.
  mockRefresh = async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
    authUser = { id: 1 }
    trace.push("refresh:resolved")
  }
  replaceSpy = vi.spyOn(window.history, "replaceState")
})

afterEach(() => {
  replaceSpy.mockRestore()
})

describe("MagicLinkPage — success paths", () => {
  it("an existing user lands on the dashboard AUTHENTICATED, not bounced", async () => {
    mockVerify.mockResolvedValue({ kind: "session", isNewUser: false })
    renderPage("/auth/magic?token=abc")
    await waitFor(() => expect(screen.getByText("DASHBOARD")).toBeInTheDocument())
    expect(screen.queryByText("BOUNCED")).not.toBeInTheDocument()
    expect(mockVerify).toHaveBeenCalledWith("abc")
  })

  it("a new user lands on the welcome workspace choice AUTHENTICATED", async () => {
    mockVerify.mockResolvedValue({ kind: "session", isNewUser: true })
    renderPage("/auth/magic?token=abc")
    await waitFor(() => expect(screen.getByText("WELCOME")).toBeInTheDocument())
    expect(screen.queryByText("BOUNCED")).not.toBeInTheDocument()
  })

  // 10e-R190(ii). "No refetch at all" and "refetch after navigate" both end the user
  // on /login, so the destination assertion above cannot tell them apart — two bugs
  // with one symptom. This pins the ORDER directly: refreshUser must have RESOLVED
  // before the destination mounts.
  it("refreshUser resolves BEFORE the destination mounts", async () => {
    mockVerify.mockResolvedValue({ kind: "session", isNewUser: false })
    renderPage("/auth/magic?token=abc")
    // The trace is awaited rather than read after a text assertion: the probe runs
    // in a passive effect, which can flush a tick after the text is queryable. If
    // the order were wrong the array would read ["bounced:DASHBOARD", …] and never
    // converge, so waiting does not weaken the pin.
    await waitFor(() => expect(trace).toEqual(["refresh:resolved", "mount:DASHBOARD"]))
  })

  it("a TOTP handoff goes to /auth/2fa-verify and does NOT refetch /me", async () => {
    mockVerify.mockResolvedValue({ kind: "pending_2fa" })
    renderPage("/auth/magic?token=abc")
    await waitFor(() => expect(screen.getByText("TWO-FACTOR")).toBeInTheDocument())
    // No session exists yet — /me would 401. The absence is the assertion.
    expect(trace).toEqual([])
  })
})

describe("MagicLinkPage — failure paths", () => {
  // 10e-R177(b), BLOCKING: the request form is on the SAME view, BENEATH the copy.
  it("an invalid link renders the failure copy with the request form beneath it", async () => {
    mockVerify.mockRejectedValue(invalidLinkError())
    renderPage("/auth/magic?token=spent")
    await waitFor(() => expect(screen.getByTestId("magic-link-invalid")).toBeInTheDocument())
    const copy = screen.getByTestId("magic-link-invalid")
    const form = screen.getByTestId("magic-link-form")
    expect(copy.textContent).toContain(INVALID_TITLE)
    // DOCUMENT_POSITION_FOLLOWING === 4: the form follows the copy. A presence-only
    // assertion would pass with the form rendered above it.
    expect(copy.compareDocumentPosition(form) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(4)
  })

  // 10e-R177(a): the string is a constant naming all five causes without
  // distinguishing them. Driving two 400s that carry DIFFERENT server-side `error`
  // text proves the page renders its own literal rather than the server's — a later
  // `{err.message}` render would leak server wording into the uniform surface.
  it("renders the same failure copy regardless of the server's error text", async () => {
    mockVerify.mockRejectedValue(new ApiError("alpha", 400, "MAGIC_LINK_INVALID"))
    const first = renderPage("/auth/magic?token=a")
    await waitFor(() => expect(screen.getByTestId("magic-link-invalid")).toBeInTheDocument())
    const titleA = screen.getByTestId("magic-link-invalid-title").textContent
    const bodyA = screen.getByTestId("magic-link-invalid-body").textContent
    first.unmount()

    mockVerify.mockRejectedValue(new ApiError("omega", 400, "MAGIC_LINK_INVALID"))
    renderPage("/auth/magic?token=b")
    await waitFor(() => expect(screen.getByTestId("magic-link-invalid")).toBeInTheDocument())
    expect(screen.getByTestId("magic-link-invalid-title").textContent).toBe(titleA)
    expect(screen.getByTestId("magic-link-invalid-body").textContent).toBe(bodyA)
    // …and equal to the ruled literal, so "identical" cannot mean "identically wrong".
    expect(titleA).toBe(INVALID_TITLE)
    expect(bodyA).toBe(INVALID_BODY)
  })

  it("a non-token failure renders the generic copy, not the link-invalid copy", async () => {
    mockVerify.mockRejectedValue(new ApiError("nope", 500, undefined))
    renderPage("/auth/magic?token=abc")
    await waitFor(() => expect(screen.getByTestId("magic-link-failed")).toBeInTheDocument())
    expect(screen.getByTestId("magic-link-failed-title").textContent).toBe(FAILED_TITLE)
    expect(screen.queryByTestId("magic-link-invalid")).not.toBeInTheDocument()
  })

  it("a /me failure after a successful consume renders the generic copy and does not navigate", async () => {
    mockVerify.mockResolvedValue({ kind: "session", isNewUser: false })
    mockRefresh = async () => {
      throw new Error("me failed")
    }
    renderPage("/auth/magic?token=abc")
    await waitFor(() => expect(screen.getByTestId("magic-link-failed")).toBeInTheDocument())
    expect(screen.queryByText("BOUNCED")).not.toBeInTheDocument()
    expect(screen.queryByText("DASHBOARD")).not.toBeInTheDocument()
  })
})

describe("MagicLinkPage — token handling", () => {
  // 10e-R176 item 7. StrictMode is ON in main.tsx:27 and double-invokes effects in
  // development; a second POST would consume nothing (the token is already spent)
  // and show the failure copy to a user who just succeeded. App.tsx does NOT wrap in
  // StrictMode, so this case must opt in explicitly or it asserts nothing.
  it("verifies exactly once under a StrictMode double-mount", async () => {
    mockVerify.mockResolvedValue({ kind: "session", isNewUser: false })
    renderPage("/auth/magic?token=abc", { strict: true })
    await waitFor(() => expect(screen.getByText("DASHBOARD")).toBeInTheDocument())
    expect(mockVerify).toHaveBeenCalledTimes(1)
  })

  // 10e-R195(a): BEFORE, not merely "at some point". Scrub-after leaves a window in
  // which a reload re-sends a token the in-flight request is consuming.
  it("scrubs the token from the URL BEFORE issuing the request", async () => {
    let replaceCallsAtRequestTime = -1
    let scrubbedUrl: unknown = null
    mockVerify.mockImplementation(async () => {
      replaceCallsAtRequestTime = replaceSpy.mock.calls.length
      scrubbedUrl = replaceSpy.mock.calls[0]?.[2]
      return { kind: "session", isNewUser: false }
    })
    renderPage("/auth/magic?token=secret-token")
    await waitFor(() => expect(screen.getByText("DASHBOARD")).toBeInTheDocument())
    expect(replaceCallsAtRequestTime).toBeGreaterThanOrEqual(1)
    expect(String(scrubbedUrl)).not.toContain("token")
    expect(String(scrubbedUrl)).not.toContain("secret-token")
  })

  it("with no token, renders the request form and verifies nothing", () => {
    renderPage("/auth/magic")
    expect(screen.getByTestId("magic-link-form")).toBeInTheDocument()
    expect(screen.queryByTestId("magic-link-invalid")).not.toBeInTheDocument()
    expect(mockVerify).not.toHaveBeenCalled()
  })

  // ?token= (present but empty) would be rejected by the server's zod min(1) as a
  // validation_error, spending a rate-limit slot to learn what the client already
  // knows. Treated as absent instead.
  it("treats an empty ?token= as absent", () => {
    renderPage("/auth/magic?token=")
    expect(screen.getByTestId("magic-link-form")).toBeInTheDocument()
    expect(mockVerify).not.toHaveBeenCalled()
  })
})
