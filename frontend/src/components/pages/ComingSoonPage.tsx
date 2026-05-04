import { useNavigate } from "react-router-dom"
import { type LucideIcon, Clock } from "lucide-react"
import PageHeader from "@/components/layout/PageHeader"
import { Button } from "@/components/ui/button"

type ComingSoonPageProps = {
  title: string
  description: string
  badge?: string
  icon?: LucideIcon
}

export default function ComingSoonPage({
  title,
  description,
  badge = "Coming Soon",
  icon: Icon = Clock,
}: ComingSoonPageProps) {
  const navigate = useNavigate()

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-6 sm:px-6">
      <PageHeader badge={badge} badgeDotClassName="bg-muted-foreground" title={title} />

      <div className="section-panel">
        <div className="section-body flex flex-col items-center gap-6 py-12 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full border border-border bg-muted/60">
            <Icon className="h-8 w-8 text-muted-foreground" />
          </div>
          <div className="space-y-2">
            <p className="text-base font-medium">This feature is coming soon</p>
            <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
          </div>
          <Button variant="outline" onClick={() => navigate(-1)}>
            Go back
          </Button>
        </div>
      </div>
    </div>
  )
}
