// MOB-R89 E — app.onError: a 5xx never carries the thrown error's text (it can be MySQL's raw text, as Activity's search
// showed); the body is the same shape with a fixed message and code "internal_error". A 4xx keeps its message.
import { describe, it, expect } from "vitest"
import { HTTPException } from "hono/http-exception"
import { createApp } from "./app"

const SQL_TEXT = "You have an error in your SQL syntax; check the manual near '\\' or `merchants`.`name` LIKE ? ESCAPE '\\'))"

const app = createApp()
app.get("/__mob_r89_throw_sql", () => {
  throw new Error(SQL_TEXT)
})
app.get("/__mob_r89_throw_400", () => {
  throw new HTTPException(400, { message: "That month is not valid." })
})

describe("server error bodies (MOB-R89 E)", () => {
  it("a 500 carries none of the thrown text, only the fixed message and its code", async () => {
    const res = await app.request("/__mob_r89_throw_sql")
    expect(res.status).toBe(500)
    const raw = await res.text()
    expect(raw).not.toContain("SQL syntax")
    expect(raw).not.toContain("ESCAPE")
    expect(JSON.parse(raw)).toEqual({ ok: false, error: "Something went wrong on our side. Try again.", code: "internal_error" })
  })

  it("a 4xx keeps its message", async () => {
    const res = await app.request("/__mob_r89_throw_400")
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ ok: false, error: "That month is not valid." })
  })
})
