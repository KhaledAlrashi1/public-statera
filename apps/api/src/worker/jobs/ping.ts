import type { Job } from "bullmq"

// No-op health signal — confirms the worker is alive and processing jobs.
// The worker_task_runs row (updated by markWorkerTaskStarted/Finished) is the
// observable output; callers polling that table can detect a stalled worker.
export async function handlePing(_job: Job): Promise<void> {}
