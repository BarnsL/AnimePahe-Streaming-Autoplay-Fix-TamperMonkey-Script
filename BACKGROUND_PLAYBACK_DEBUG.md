# Background Playback Keep-Alive Debug Guide (v2.0.4)

## Problem Statement

When tabbing away from the anime player (Discord streaming scenario), the video was showing a pause/play button UI state change even though background playback attempts were being made.

The user reported seeing the pause state visually update when tabbing out/minimizing, indicating the player UI was reflecting a pause state that needed to be prevented or reversed.

## Root Cause Analysis

### Why v2.0.3 (2-second interval) Wasn't Sufficient

1. **Timing Gap**: Browser pause policies pause the video immediately on visibility change/blur. The 2-second check interval was too slow:
   - Video paused by browser policy → 2-second wait → Check fires → Attempt resume
   - But browser might have already updated UI before next check

2. **Single-Check Loop**: The interval only checked once every 2000ms, missing rapid pause events:
   - Multiple pause events might fire within the 2-second window
   - Only checked conditions at 2-second boundaries
   - No continuous monitoring of pause state

3. **UI Lag**: Player UI (pause button display) might update independently of video state:
   - `video.paused` might be true, but UI shows pause button
   - Clicking play doesn't update pause button without specific UI event

### Why Event-Based Pause Listeners Alone Didn't Work

1. **Race Condition**: Pause event fires, we try to resume, but browser re-pauses during the play() call
2. **internalResumeInProgress Flag**: Once set true, we ignore further pause events, but then loop doesn't know to retry
3. **No Continuous Monitoring**: After pause event handled, we waited for next pause event to fire

## Solution: v2.0.4 Enhanced Approach

### Changes Made

#### 1. **Switched to requestAnimationFrame Loop**

**File**: `animepahe-autonext-v2.user.js` → Background playback loop functions

**Previous Code** (v2.0.3):
```javascript
// 2-second interval - too slow
let backgroundPlaybackLoopTimer = null;
const startBackgroundPlaybackLoop = function () {
  if (backgroundPlaybackLoopTimer !== null) return;
  
  backgroundPlaybackLoopTimer = setInterval(function () {
    // ... checks ...
    if (video.paused) {
      ensureBackgroundPlayback('loop-periodic');
    }
  }, 2000); // Only checks every 2 seconds!
};
```

**New Code** (v2.0.4):
```javascript
// requestAnimationFrame - 60fps continuous monitoring
let backgroundPlaybackLoopActive = false;
let backgroundPlaybackRafId = null;
let lastBackgroundResumeAttempt = 0;
const BACKGROUND_RESUME_THROTTLE_MS = 300; // Throttle to 300ms

const backgroundPlaybackRafLoop = function () {
  if (!backgroundPlaybackLoopActive) return;
  
  // ... checks ...
  if (video.paused) {
    const now = Date.now();
    // Throttle resume attempts to 300ms (not spamming every frame)
    if (now - lastBackgroundResumeAttempt >= BACKGROUND_RESUME_THROTTLE_MS) {
      lastBackgroundResumeAttempt = now;
      ensureBackgroundPlayback('raf-continuous');
    }
  }
  
  // Schedule next frame - continuous monitoring!
  backgroundPlaybackRafId = requestAnimationFrame(backgroundPlaybackRafLoop);
};
```

**Why This Works**:
- Runs at screen refresh rate (typically 60 FPS)
- Detects pause state changes almost immediately
- Throttle prevents spam while allowing rapid response
- Continuous monitoring ensures we catch all pause events

#### 2. **Comprehensive Background Context Detection**

**New Function**: `isInBackgroundContext()`

```javascript
const isInBackgroundContext = function () {
  // Multiple checks for maximum compatibility
  if (typeof document.hidden === 'boolean' && document.hidden) {
    return true;
  }
  
  if (typeof document.visibilityState === 'string' && document.visibilityState === 'hidden') {
    return true;
  }
  
  if (typeof document.hasFocus === 'function' && !document.hasFocus()) {
    return true;
  }
  
  return false;
};
```

**Coverage**:
- `document.hidden`: Page Visibility API - most reliable
- `document.visibilityState`: Standard visibility states (visible/hidden/prerender)
- `!document.hasFocus()`: Window focus state (alt-tab detection)

#### 3. **Verbose Logging for Debugging**

**New Function**: `logBackgroundEvent()`

```javascript
const logBackgroundEvent = function (event, details) {
  if (true) { // Set to false to disable
    console.log('[AnimePahe AutoNext Background] ' + event + ' | ' + JSON.stringify(details));
  }
};
```

**Logged Events**:
- `START_LOOP` - Background loop activated
- `STOP_LOOP` - Background loop deactivated
- `PAUSE_EVENT` - Video pause detected
- `PLAY_EVENT` - Video play detected
- `VISIBILITY_CHANGE` - Tab visibility changed
- `BLUR_EVENT` - Window lost focus
- `FOCUS_EVENT` - Window regained focus
- `ATTEMPTING_RESUME_*` - Resume attempt being made
- `RESUME_BLOCKED_*` - Browser policy blocked resume
- `RAFLoop_RESUME` - RAF loop triggered resume

**How to Debug**:
1. Open browser console (F12) on anime page
2. Tab away from page
3. Watch console for logged events
4. Look for patterns:
   - `PAUSE_EVENT` followed by `ATTEMPTING_RESUME` = normal flow
   - `PAUSE_EVENT` but no `ATTEMPTING_RESUME` = condition prevented it
   - `ATTEMPTING_RESUME` followed by `RESUME_BLOCKED` = browser policy blocking

#### 4. **Enhanced Event Listeners**

Updated all event listeners to:
1. Log when triggered
2. Get `isInBackgroundContext()` state
3. Start/stop RAF loop appropriately

**Before** (v2.0.3):
```javascript
video.addEventListener('pause', function () {
  if (internalResumeInProgress) return;
  const isBackgroundContext = isInBackgroundContext();
  userPausedManually = !isBackgroundContext;
  if (isBackgroundContext) {
    startBackgroundPlaybackLoop();
    ensureBackgroundPlayback('pause');
  }
});
```

**After** (v2.0.4):
```javascript
video.addEventListener('pause', function () {
  const isBackgroundContext = isInBackgroundContext();
  logBackgroundEvent('PAUSE_EVENT', { 
    inProgress: internalResumeInProgress, 
    isBackground: isBackgroundContext,
    duration: video.duration,
    currentTime: video.currentTime
  });
  
  if (internalResumeInProgress) {
    logBackgroundEvent('PAUSE_IGNORED_RESUMING', { });
    return;
  }
  
  userPausedManually = !isBackgroundContext;
  
  if (isBackgroundContext) {
    logBackgroundEvent('PAUSE_TRIGGERED_RECOVERY', { });
    startBackgroundPlaybackLoop();
    ensureBackgroundPlayback('pause');
  }
});
```

#### 5. **Enhanced ensureBackgroundPlayback() with Better Logging**

```javascript
const ensureBackgroundPlayback = function (reason) {
  if (!BACKGROUND_PLAYBACK_GUARD) return;
  
  if (!video || video.ended || video.readyState < 2 || userPausedManually) {
    logBackgroundEvent('SKIP_RESUME_' + reason, { 
      videoExists: !!video, 
      ended: video ? video.ended : null,
      readyState: video ? video.readyState : null,
      userPausedManually: userPausedManually
    });
    return;
  }
  
  const isBackgroundContext = isInBackgroundContext();
  if (!isBackgroundContext) {
    return; // Don't spam logs for non-background context
  }
  
  if (!video.paused) {
    logBackgroundEvent('ALREADY_PLAYING_' + reason, { });
    return;
  }
  
  logBackgroundEvent('ATTEMPTING_RESUME_' + reason, { 
    paused: video.paused, 
    duration: video.duration 
  });
  
  // ... resume logic with better error logging ...
};
```

## How the New System Works

### Flow Diagram

```
User tabs away (Discord streaming)
    ↓
visibilitychange event fires
    ↓
isInBackgroundContext() returns true
    ↓
startBackgroundPlaybackLoop() called
    ↓
requestAnimationFrame loop starts (~60 FPS)
    ↓
Every frame:
  1. Check if still in background
  2. Check if video readyState >= 2
  3. If paused AND 300ms since last attempt:
     → ensureBackgroundPlayback('raf-continuous')
     → video.play() called
    ↓
Browser policy allows/blocks play()
    ↓
If blocked: logged as RESUME_BLOCKED
If allowed: video resumes, play event fires
    ↓
play event listener fires
    ↓
stopBackgroundPlaybackLoop() called
    ↓
RAF loop cancels, continuous monitoring stops
    ↓
When user returns to tab:
    ↓
visibilitychange / focus event fires
    ↓
stopBackgroundPlaybackLoop() called
    ↓
RAF loop stops, normal event-based control resumes
```

## Testing Steps

### 1. **Verify Logging is Working**

1. Install the updated script
2. Go to: https://animepahe.ch/needy-girl-overdose-episode-6-english-subbed/
3. Open browser console (F12)
4. Look for: `[AnimePahe AutoNext Background]` messages
5. Should see `INITIAL_BACKGROUND_DETECTED` and `BRIDGE_ATTACHED`

### 2. **Test Background Playback Keep-Alive**

1. Start video playing
2. Open console to watch logs
3. **Tab away** from browser
4. Watch for:
   - `VISIBILITY_CHANGE` with `isBackground: true`
   - `START_LOOP` (background loop activated)
   - Periodic `RAFLoop_RESUME` attempts
5. **Minimize browser window**
6. Video should continue in background
7. **Alt+Tab away** to another window
8. Video should still play
9. **Switch back to browser**
10. Watch for `FOCUS_EVENT` and `STOP_LOOP`
11. Video should show as playing

### 3. **Check Player UI Updates**

1. Video plays normally
2. Tab out → Pause button might briefly show in UI
3. But video.paused should be false (still playing)
4. Tab back in → Pause button should disappear

### 4. **Discord Streaming Test**

1. Start anime streaming in Discord via screen share
2. Minimize Discord window or switch tabs
3. Video in anime page should continue playing
4. Minimize Discord further / minimize entire browser
5. Video should maintain playback internally
6. Return to Discord → video still in background

## Troubleshooting

### Symptom: Pause button still shows when tabbed out

**Possible Causes**:
1. `userPausedManually` is true
   - Check log for `PAUSE_IGNORED_RESUMING`
   - Means: User manually paused, so we skip background recovery

2. Browser policy is blocking resume
   - Check log for `RESUME_BLOCKED_*`
   - Browser requires user interaction for autoplay
   - Next user interaction should enable

3. `video.readyState < 2`
   - Check log for `SKIP_RESUME_...: readyState: 0`
   - Video not ready yet, wait for CANPLAY event

### Symptom: Frequent pause/resume flickering

**Possible Causes**:
1. Throttle too aggressive (300ms) - some browsers pause immediately
2. Check logs for rapid `PAUSE_EVENT` then `ATTEMPTING_RESUME` then `PAUSE_EVENT` again
3. Try reducing `BACKGROUND_RESUME_THROTTLE_MS` to 200ms or 100ms

### Symptom: RAF loop not starting

**Debug Steps**:
1. Check console for `START_LOOP` event
2. If not appearing: `isInBackgroundContext()` might be returning false
3. Verify: `document.hidden`, `visibilityState`, `hasFocus()` values
4. Run in console: 
   ```javascript
   document.hidden; // Should be true when tabbed out
   document.visibilityState; // Should be "hidden"
   document.hasFocus(); // Should be false
   ```

## Performance Considerations

### CPU/Battery Impact

- **RAF Loop**: Runs at 60 FPS, but only when backgrounded
- **Throttle**: 300ms between resume attempts = max 3.3 attempts/second
- **Impact**: Minimal when in background (one play() attempt every 300ms)
- **Benefit**: Video stays alive for Discord streaming

### Why Not Continuous play() Every Frame?

- **Reason 1**: Browser will reject via autoplay policy
- **Reason 2**: Unnecessary load, 300ms is sufficient
- **Reason 3**: 60 FPS monitoring catches pause immediately, throttle prevents spam

## Browser Autoplay Policies

### Chrome/Chromium

- Muted autoplay: Generally allowed
- Unmuted autoplay: Requires user interaction first
- Exception: After user has interacted, unmuted autoplay more lenient

### Firefox

- Autoplay: Configurable in `about:config`
- Default: Allow for sites user has interacted with
- Video.play() after user interaction: Usually allowed

### Safari

- Autoplay: Requires webkit attribute
- Muted: Generally allowed
- Unmuted: Not allowed without user interaction

### Discord Stream Context

When streaming anime via Discord screen share:
- Browser is visible to Discord, but might lose focus
- `document.hidden` may or may not be true
- hasFocus() will be false
- **Our solution**: Checks all three, so catches Discord tab-away scenario

## Version History

### v2.0.4 Changes

- Replaced 2-second interval with requestAnimationFrame (~60 FPS)
- Added comprehensive logging system
- Added throttle (300ms) to prevent resume spam
- Enhanced event listener logging
- Added `isInBackgroundContext()` comprehensive check
- Updated ensureBackgroundPlayback() with better logging
- Validates syntax passes

### v2.0.3 (Previous)

- Added initial background keep-alive attempt with 2-second interval
- Basic visibility/blur event listeners
- Issue: Too slow, missed rapid pause events

### v2.0.2

- Added basic background playback guard flag
- No actual implementation

## Next Steps if Still Not Working

1. **Collect Console Logs**: 
   - Tab away from page
   - Collect all `[AnimePahe AutoNext Background]` logs
   - Paste in issue report

2. **Check Browser Console Errors**:
   - Any `RESUME_BLOCKED` errors?
   - Browser policy preventing play()?

3. **Verify Video Element**:
   - Run in console: `document.querySelector('video')`
   - Should return video element
   - Check `video.paused`, `video.readyState`

4. **Test on Different Browser**:
   - Firefox vs Chrome vs Safari
   - See if behavior is browser-specific

5. **Discord vs Non-Discord**:
   - Does it work when just tabbing normally?
   - Only fails during Discord screen share?

## Additional Resources

- [Page Visibility API](https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API)
- [HTML5 Video Events](https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement)
- [requestAnimationFrame](https://developer.mozilla.org/en-US/docs/Web/API/window/requestAnimationFrame)
- [Autoplay Policy](https://developers.google.com/web/updates/2017/09/autoplay-policy-changes)
