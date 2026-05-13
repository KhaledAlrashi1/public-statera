import type { Job } from "bullmq"
import { eq } from "drizzle-orm"
import { getDb } from "../../db/connection"
import { users, userProfiles } from "../../db/schema/users"
import { Sentry } from "../../lib/sentry"
import { sendTemplatedEmail } from "../../lib/email-templates"

export async function handleSendGoalMilestoneEmail(
  job: Job,
): Promise<{ status: "sent" | "failed" | "skipped" }> {
  const data = job.data as {
    userId: number
    goalId: number
    goalName: string
    milestonePct: number
    currentKd: string
    targetKd: string
  }
  const { userId, goalId, goalName, milestonePct, currentKd, targetKd } = data

  try {
    const db = getDb()
    const [profile] = await db
      .select({
        email: users.email,
        emailNotificationsEnabled: userProfiles.emailNotificationsEnabled,
      })
      .from(users)
      .innerJoin(userProfiles, eq(userProfiles.userId, users.id))
      .where(eq(users.id, userId))
      .limit(1)

    if (!profile || !profile.emailNotificationsEnabled) return { status: "skipped" }

    const subject = `Savings Goal Milestone: ${goalName} (${milestonePct}%)`

    const ok = await sendTemplatedEmail(profile.email, subject, "goal_milestone", {
      milestone_pct: milestonePct,
      goal_name: goalName,
      current_kd: currentKd,
      target_kd: targetKd,
    })

    if (!ok) {
      Sentry.captureException(
        new Error(
          `sendTemplatedEmail returned false for userId=${userId} goalId=${goalId} milestone=${milestonePct}`,
        ),
        { tags: { handler: "send-goal-milestone-email", userId } },
      )
    }

    return { status: ok ? "sent" : "failed" }
  } catch (err) {
    Sentry.captureException(err, { tags: { handler: "send-goal-milestone-email", userId } })
    return { status: "failed" }
  }
}
