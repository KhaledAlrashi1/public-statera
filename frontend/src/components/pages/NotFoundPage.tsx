import { ArrowLeft, Compass, House } from "lucide-react"
import { useLocation, useNavigate } from "react-router-dom"

import { Button } from "@/components/ui/button"

export default function NotFoundPage() {
  const navigate = useNavigate()
  const location = useLocation()

  return (
    <div className="flex min-h-[calc(100vh-2rem)] items-center justify-center p-6">
      <section className="section-panel w-full max-w-xl text-center">
        <div className="section-body space-y-5 py-10">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Compass className="h-7 w-7" />
          </div>
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-muted-foreground">404</p>
            <h1 className="text-2xl font-semibold">Page not found</h1>
            <p className="mx-auto max-w-md text-sm text-muted-foreground">
              We couldn&apos;t find anything at <span className="font-medium text-foreground">{location.pathname}</span>.
            </p>
          </div>
          <div className="flex flex-col justify-center gap-2 sm:flex-row">
            <Button type="button" onClick={() => navigate("/")}>
              <House className="mr-2 h-4 w-4" />
              Go Home
            </Button>
            <Button type="button" variant="outline" onClick={() => navigate(-1)}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Go Back
            </Button>
          </div>
        </div>
      </section>
    </div>
  )
}
