package com.voxtype.nativebridge

import android.os.Handler
import android.os.Looper
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config
import java.time.Duration

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class BubbleRefreshTest {
  @Test fun retriesLateEditorReadinessAndStopsAfterSuccess() {
    var attempts = 0
    val recovery = BubbleRefresh(Handler(Looper.getMainLooper())) { ++attempts < 3 }
    recovery.request()
    shadowOf(Looper.getMainLooper()).idleFor(Duration.ofSeconds(20))
    assertEquals(3, attempts)
  }

  @Test fun repeatedWindowEventsCannotPostponeTheFirstAttempt() {
    var attempts = 0
    val recovery = BubbleRefresh(Handler(Looper.getMainLooper())) { attempts++; false }
    recovery.request()
    repeat(4) {
      shadowOf(Looper.getMainLooper()).idleFor(Duration.ofMillis(50))
      recovery.request()
    }
    shadowOf(Looper.getMainLooper()).idleFor(Duration.ofMillis(50))
    assertEquals(1, attempts)
  }

  @Test fun persistentFailureHasABoundedRetryBudget() {
    var attempts = 0
    val recovery = BubbleRefresh(Handler(Looper.getMainLooper())) { attempts++; true }
    recovery.request()
    shadowOf(Looper.getMainLooper()).idleFor(Duration.ofMinutes(1))
    assertEquals(VoxConstants.BUBBLE_REFRESH_ATTEMPTS, attempts)
  }

  @Test fun cancellationPreventsPendingRetries() {
    var attempts = 0
    val recovery = BubbleRefresh(Handler(Looper.getMainLooper())) { attempts++; true }
    recovery.request()
    recovery.cancel()
    shadowOf(Looper.getMainLooper()).idleFor(Duration.ofSeconds(20))
    assertEquals(0, attempts)
  }

  @Test fun aRefreshThatRequestsRecoveryDoesNotCreateDuplicateLoops() {
    var attempts = 0
    lateinit var recovery: BubbleRefresh
    recovery = BubbleRefresh(Handler(Looper.getMainLooper())) { attempts++; recovery.request(); true }
    recovery.request()
    shadowOf(Looper.getMainLooper()).idleFor(Duration.ofMinutes(1))
    assertEquals(VoxConstants.BUBBLE_REFRESH_ATTEMPTS, attempts)
  }
}
