package com.voxtype.nativebridge

import android.content.Context
import android.content.ContextWrapper
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [33, 35])
class AppHealthTest {
  @Test fun versionComesFromTheInstalledPackageIncludingDevelopmentSuffixAndCode() {
    val context = RuntimeEnvironment.getApplication()
    val info = context.packageManager.getPackageInfo(context.packageName, 0)
    info.versionName = "1.2.3-dev.abcdef0"
    info.setLongVersionCode(42L)
    org.robolectric.Shadows.shadowOf(context.packageManager).installPackage(info)
    val report = AppHealth.snapshot(context)
    assertEquals("1.2.3-dev.abcdef0", report["appVersion"])
    assertEquals(42L, report["versionCode"])
  }

  @Test fun diagnosticsRemainAvailableWithoutSystemExitHistory() {
    val context = object : ContextWrapper(RuntimeEnvironment.getApplication()) {
      override fun getSystemService(name: String): Any? {
        if (name == Context.ACTIVITY_SERVICE) throw SecurityException("Exit history unavailable")
        return super.getSystemService(name)
      }
    }
    val report = AppHealth.snapshot(context)
    assertEquals(context.packageName, report["packageName"])
    assertNull(report["lastExit"])
  }

  @Test fun diagnosticIssueExcludesExceptionMessagesAndPrivateContent() {
    val context = RuntimeEnvironment.getApplication()
    AppHealth.recordIssue(context, "sync_scheduler", IllegalStateException("private transcript / bearer secret"))
    val report = AppHealth.snapshot(context)
    val issue = report["lastNativeIssue"] as Map<*, *>
    assertEquals("sync_scheduler", issue["stage"])
    assertEquals("IllegalStateException", issue["exception"])
    assertTrue(issue["timestamp"] as Long > 0)
    assertFalse(report.toString().contains("private transcript"))
    assertFalse(report.toString().contains("bearer secret"))
  }

  @Test fun failedAccessibilityTaskIsRecordedAndScopeCanRunAgain() {
    val controller = Robolectric.buildService(VoxTypeAccessibilityService::class.java).create()
    val service = controller.get()
    try {
      val field = service.javaClass.getDeclaredField("serviceScope").apply { isAccessible = true }
      val scope = field.get(service) as CoroutineScope
      scope.launch(Dispatchers.Unconfined) { throw IllegalStateException("simulated background failure") }
      val issue = AppHealth.snapshot(service)["lastNativeIssue"] as Map<*, *>
      assertEquals("accessibility_task", issue["stage"])
      assertEquals("IllegalStateException", issue["exception"])
      var ran = false
      scope.launch(Dispatchers.Unconfined) { ran = true }
      assertTrue(ran)
    } finally { controller.destroy() }
  }
}
