// MOB-R46 Part B — suggested category and merchant names for the transaction dialogs.
//
// A constant list in the frontend (R2 option (a)). Nothing here is ever saved on its own: a
// category or merchant row is created only when the user saves a transaction that uses the name,
// through the existing getOrCreateCategory / getOrCreateMerchant path (apps/api/src/lib/
// transaction-lib.ts, which matches names with LOWER(name) = LOWER(?) — no LIKE, so "%Arabica" is
// an ordinary string there). Nothing is seeded into any account.

export const SUGGESTED_CATEGORIES: readonly string[] = [
  "Groceries",
  "Dining Out",
  "Food Delivery",
  "Coffee",
  "Transport",
  "Fuel",
  "Car",
  "Rent & Housing",
  "Utilities",
  "Phone & Internet",
  "Shopping",
  "Home",
  "Health & Fitness",
  "Personal Care",
  "Entertainment",
  "Subscriptions",
  "Travel",
  "Education",
  "Gifts & Occasions",
  "Charity",
  "Domestic Help",
  "Family Support",
  // MOB-R59 D1 — the generic savings category (operator's name, MOB-R57). Saved on first use like
  // any suggestion; hidden when the user already owns a savings-kind category (D2).
  "Savings & investing",
]

/** The generic savings category in SUGGESTED_CATEGORIES (MOB-R59 D1). */
export const GENERIC_SAVINGS_CATEGORY = "Savings & investing"

export type SuggestedMerchant = { name: string; category: string }

const byCategory = (category: string, names: string[]): SuggestedMerchant[] =>
  names.map((name) => ({ name, category }))

export const SUGGESTED_MERCHANTS: readonly SuggestedMerchant[] = [
  ...byCategory("Groceries", ["The Sultan Center", "Lulu Hypermarket", "Carrefour", "City Centre", "Oncost", "Co-op"]),
  ...byCategory("Food Delivery", ["Talabat", "Deliveroo", "Jahez"]),
  ...byCategory("Coffee", ["Starbucks", "Caribou Coffee", "Tim Hortons", "%Arabica", "Costa Coffee"]),
  ...byCategory("Dining Out", [
    "McDonald's",
    "KFC",
    "Burger King",
    "Hardee's",
    "Shake Shack",
    "Slider Station",
    "Mais Alghanim",
  ]),
  ...byCategory("Transport", ["Careem"]),
  ...byCategory("Fuel", ["KNPC", "Oula", "Soor Fuel"]),
  ...byCategory("Phone & Internet", ["Zain", "Ooredoo", "stc"]),
  ...byCategory("Utilities", ["MEW"]),
  ...byCategory("Shopping", [
    "H&M",
    "Zara",
    "Centrepoint",
    "Nike",
    "Sephora",
    "Bath & Body Works",
    "Noon",
    "Amazon",
    "X-cite",
    "Eureka",
    "Best Al-Yousifi",
  ]),
  ...byCategory("Home", ["IKEA", "Home Centre"]),
  ...byCategory("Health & Fitness", ["Boots"]),
  ...byCategory("Education", ["Jarir Bookstore"]),
  ...byCategory("Entertainment", ["Cinescape"]),
  ...byCategory("Travel", ["Kuwait Airways", "Jazeera Airways"]),
  ...byCategory("Subscriptions", ["Netflix", "Spotify", "Shahid"]),
]

const norm = (s: string) => s.trim().toLowerCase()

/**
 * The user's own categories first, then the suggestions they do not already own (case-insensitive).
 * MOB-R60 D1 — ownsSavingsCategory comes from the server's category kind (GET /api/categories); when
 * true the generic "Savings & investing" entry is hidden, so two savings entries never sit side by
 * side. There is no frontend copy of the savings rule (D3).
 */
export function categoryOptions(own: readonly string[], ownsSavingsCategory = false): string[] {
  const owned = new Set(own.map(norm))
  return [
    ...own,
    ...SUGGESTED_CATEGORIES.filter(
      (name) => !owned.has(norm(name)) && !(ownsSavingsCategory && name === GENERIC_SAVINGS_CATEGORY),
    ),
  ]
}

/**
 * Suggested merchants whose name contains the query (case-insensitive), leaving out any name the
 * user's own suggestions already show. Empty below two characters, matching the combobox's threshold.
 */
export function suggestedMerchantsFor(query: string, ownNames: readonly string[]): SuggestedMerchant[] {
  const q = norm(query)
  if (q.length < 2) return []
  const owned = new Set(ownNames.map(norm))
  return SUGGESTED_MERCHANTS.filter((m) => norm(m.name).includes(q) && !owned.has(norm(m.name)))
}
