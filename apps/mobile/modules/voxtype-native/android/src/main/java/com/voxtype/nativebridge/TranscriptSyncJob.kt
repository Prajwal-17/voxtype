package com.voxtype.nativebridge

import android.app.job.JobInfo
import android.app.job.JobParameters
import android.app.job.JobScheduler
import android.app.job.JobService
import android.content.ComponentName
import android.content.Context
import kotlinx.coroutines.*

/** Android owns retry scheduling, including after the app process or device restarts. */
class TranscriptSyncJob : JobService() {
  private var task: Job? = null
  override fun onStartJob(params: JobParameters): Boolean {
    task = CoroutineScope(SupervisorJob() + Dispatchers.IO).launch {
      val retry = try { TranscriptUploads.sync(applicationContext); false }
        catch (_: CancellationException) { return@launch }
        catch (error: Exception) { VoxLog.w("cloud sync will retry", error); true }
      withContext(Dispatchers.Main) { jobFinished(params, retry) }
    }
    return true
  }
  override fun onStopJob(params: JobParameters): Boolean { task?.cancel(); return true }
  companion object {
    private const val JOB_ID = 7342
    fun schedule(context: Context) {
      val scheduler = context.getSystemService(JobScheduler::class.java)
      if (scheduler.getPendingJob(JOB_ID) != null) return
      scheduler.schedule(JobInfo.Builder(JOB_ID, ComponentName(context, TranscriptSyncJob::class.java))
        .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
        .setPersisted(true)
        .setBackoffCriteria(30_000, JobInfo.BACKOFF_POLICY_EXPONENTIAL)
        .build())
    }
  }
}
