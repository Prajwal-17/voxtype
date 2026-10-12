package com.voxtype.nativebridge

import android.content.ComponentName
import android.content.Context
import android.provider.Settings
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class BubbleHealthTest {
  private val context: Context get() = RuntimeEnvironment.getApplication()

  @Test fun componentMatchingAcceptsShortNamesAndRejectsSubstringMatches() {
    val expected = ComponentName("com.voxtype", "com.voxtype.Bubble")
    assertTrue(BubbleHealth.matchesService("other/.Service:com.voxtype/.Bubble", expected))
    assertTrue(BubbleHealth.matchesService(expected.flattenToString(), expected))
    assertFalse(BubbleHealth.matchesService("com.voxtype/com.voxtype.BubbleOther", expected))
    assertFalse(BubbleHealth.matchesService(null, expected))
  }

  @Test fun reportsAnObservedDisablementWithoutReenablingAccessibility() {
    val component = ComponentName(context, VoxTypeAccessibilityService::class.java).flattenToString()
    Settings.Secure.putString(context.contentResolver, Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES, component)
    assertTrue(BubbleHealth.observeAccessibility(context))
    Settings.Secure.putString(context.contentResolver, Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES, "")
    assertFalse(BubbleHealth.observeAccessibility(context))
    val events = BubbleHealth.snapshot(context)["events"] as List<*>
    assertEquals("accessibility_disabled", (events.last() as Map<*, *>)["event"])
    assertEquals("", Settings.Secure.getString(context.contentResolver, Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES))
  }

  @Test fun localHistoryIsBoundedAndDoesNotIncludeSessionOrTranscriptContents() {
    context.getSharedPreferences("voxtype_session", Context.MODE_PRIVATE).edit()
      .putString("token", "private-token-sentinel").apply()
    VoxTypeStore(context).use { it.save("private-user", "private-transcript-sentinel", "private-original", 100, null, null) }
    repeat(25) { BubbleHealth.record(context, "event_$it") }
    val snapshot = BubbleHealth.snapshot(context)
    val events = snapshot["events"] as List<*>
    assertEquals(20, events.size)
    assertEquals("event_5", (events.first() as Map<*, *>)["event"])
    assertFalse(snapshot.toString().contains("private-"))
  }
}
