import { useEffect } from "react"
import { useQuery } from "@tanstack/react-query"

import { authApi } from "@/lib/api"
import { setPayday } from "@/lib/payday-months"

/**
 * MOB-R91 C3 — tells the month helpers her payday, from the profile. Under the "auth-profile" key, so saving the
 * Income and payday sheet (which refetches every query when the payday changes) brings the new day here. Until the
 * profile answers, and if it cannot, months are calendar months, as before.
 */
export function PaydaySync() {
  const { data } = useQuery({
    queryKey: ["auth-profile", "payday"],
    queryFn: () => authApi.profile(),
    staleTime: 5 * 60 * 1000,
  })
  useEffect(() => {
    if (data) setPayday(data.profile?.payday_day ?? null)
  }, [data])
  return null
}
