package com.voxtype.nativebridge

import android.app.job.JobScheduler
import android.content.Context
import android.content.ContextWrapper
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [33, 35])
class TranscriptSyncJobTest {
  @Test fun schedulingFailureDoesNotEscapeStartup() {
    val context = object : ContextWrapper(RuntimeEnvironment.getApplication()) {
      override fun getSystemService(name: String): Any? {
        if (name == Context.JOB_SCHEDULER_SERVICE) throw SecurityException("Background jobs restricted")
        return super.getSystemService(name)
      }
    }
    assertFalse(TranscriptSyncJob.schedule(context))
  }

  @Test fun unavailableSchedulerDoesNotEscapeStartup() {
    val context = object : ContextWrapper(RuntimeEnvironment.getApplication()) {
      override fun getSystemService(name: String): Any? =
        if (name == Context.JOB_SCHEDULER_SERVICE) null else super.getSystemService(name)
    }
    assertFalse(TranscriptSyncJob.schedule(context))
  }

  @Test fun retryJobIsPersistentAndDuplicateRequestsReuseIt() {
    val context = RuntimeEnvironment.getApplication()
    val scheduler = context.getSystemService(JobScheduler::class.java)
    assertTrue(TranscriptSyncJob.schedule(context))
    assertTrue(TranscriptSyncJob.schedule(context))
    val job = scheduler.allPendingJobs.single()
    assertEquals(TranscriptSyncJob::class.java.name, job.service.className)
    assertTrue(job.isPersisted)
    assertEquals(JobScheduler.RESULT_SUCCESS, scheduler.schedule(job))
  }
}
