import { useEffect, useRef, useState, useCallback } from "react";
import { Hands } from "@mediapipe/hands";
import { Camera } from "@mediapipe/camera_utils";

// Fallback is intentionally disabled for gesture-only mode.
// const LOW_QUALITY_LIMIT = 220;
// const RECOVERY_LIMIT = 12;
const UI_UPDATE_INTERVAL_MS = 320;
const CALIBRATION_FRAMES = 72;

const PRESETS = {
  demo: {
    rotationGain: 120,
    zoomGain: 1.35,
    deadZone: 0.007,
    minConfidence: 0.58,
    frameStride: 1,
    smoothing: 0.28,
    pinchThreshold: 0.055,
  },
  precision: {
    rotationGain: 85,
    zoomGain: 1.2,
    deadZone: 0.011,
    minConfidence: 0.68,
    frameStride: 1,
    smoothing: 0.36,
    pinchThreshold: 0.052,
  },
  fast: {
    rotationGain: 145,
    zoomGain: 1.55,
    deadZone: 0.005,
    minConfidence: 0.54,
    frameStride: 2,
    smoothing: 0.22,
    pinchThreshold: 0.058,
  },
  clinical: {
    rotationGain: 75,
    zoomGain: 1.12,
    deadZone: 0.014,
    minConfidence: 0.74,
    frameStride: 1,
    smoothing: 0.44,
    pinchThreshold: 0.05,
  },
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function distance2D(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function pinchDistance(hand) {
  return distance2D(hand[4], hand[8]);
}

function pinchCenter(hand) {
  return {
    x: (hand[4].x + hand[8].x) / 2,
    y: (hand[4].y + hand[8].y) / 2,
  };
}

function smoothValue(prev, next, alpha) {
  if (prev == null) return next;
  return prev + (next - prev) * alpha;
}

function smoothPoint(prev, next, alpha) {
  if (!prev) return next;
  return {
    x: smoothValue(prev.x, next.x, alpha),
    y: smoothValue(prev.y, next.y, alpha),
  };
}

function getConfidence(results, handsCount) {
  const scores = (results.multiHandedness || []).map((h) => h.classification?.[0]?.score || 0);
  // Some MediaPipe builds return landmarks without handedness scores.
  // Treat visible hands as moderate confidence instead of forcing fallback.
  if (!scores.length) return handsCount > 0 ? 0.8 : 0;
  return scores.reduce((sum, v) => sum + v, 0) / scores.length;
}

export function useHandTracking(onGestureDetected, options = {}) {
  const initialPreset = options.initialPreset || "demo";
  const [preset, setPresetState] = useState(initialPreset in PRESETS ? initialPreset : "demo");
  const [settings, setSettings] = useState(PRESETS[preset]);
  const settingsRef = useRef(settings);

  const videoRef = useRef(null);
  const handsRef = useRef(null);
  const cameraRef = useRef(null);
  const frameCountRef = useRef(0);

  const [isTracking, setIsTracking] = useState(false);
  const [isEnabled, setIsEnabled] = useState(false);
  const [trackingStatus, setTrackingStatus] = useState("idle");
  const [calibrationStatus, setCalibrationStatus] = useState("idle");
  const [calibrationProgress, setCalibrationProgress] = useState(0);
  const [fallbackActive, setFallbackActive] = useState(false);
  const [fallbackReason, setFallbackReason] = useState("");
  const [analytics, setAnalytics] = useState({
    averageConfidence: 0,
    droppedFrames: 0,
    gesturesDetected: 0,
    falseActivations: 0,
    activeMode: "idle",
    fallbackEvents: 0,
  });

  const calibrationRef = useRef({
    collecting: false,
    frames: 0,
    pinchSamples: [],
  });

  const stateRef = useRef({
    mode: "idle",
    lastCenter: null,
    lastPinchDistance: null,
    lastIndexDistance: null,
    smoothedCenter: null,
    smoothedPinchDistance: null,
    smoothedIndexDistance: null,
    lowQualityFrames: 0,
    recoveryFrames: 0,
    lastUiUpdateAt: 0,
    avgConfidence: 0,
    droppedFrames: 0,
    gesturesDetected: 0,
    falseActivations: 0,
    fallbackEvents: 0,
  });

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  const setPreset = useCallback((nextPreset) => {
    if (!(nextPreset in PRESETS)) return;
    setPresetState(nextPreset);
    setSettings(PRESETS[nextPreset]);
  }, []);

  const updateSettings = useCallback((partial) => {
    setSettings((prev) => ({ ...prev, ...partial }));
  }, []);

  const resetGestureRefs = () => {
    stateRef.current.mode = "idle";
    stateRef.current.lastCenter = null;
    stateRef.current.lastPinchDistance = null;
    stateRef.current.lastIndexDistance = null;
    stateRef.current.smoothedCenter = null;
    stateRef.current.smoothedPinchDistance = null;
    stateRef.current.smoothedIndexDistance = null;
  };

  const updateAnalyticsState = (force = false) => {
    const now = Date.now();
    if (!force && now - stateRef.current.lastUiUpdateAt < UI_UPDATE_INTERVAL_MS) return;
    stateRef.current.lastUiUpdateAt = now;
    setAnalytics({
      averageConfidence: stateRef.current.avgConfidence,
      droppedFrames: stateRef.current.droppedFrames,
      gesturesDetected: stateRef.current.gesturesDetected,
      falseActivations: stateRef.current.falseActivations,
      activeMode: stateRef.current.mode,
      fallbackEvents: stateRef.current.fallbackEvents,
    });
    setTrackingStatus(stateRef.current.mode);
  };

  const startCalibration = useCallback(() => {
    calibrationRef.current.collecting = true;
    calibrationRef.current.frames = 0;
    calibrationRef.current.pinchSamples = [];
    setCalibrationStatus("calibrating");
    setCalibrationProgress(0);
  }, []);

  const completeCalibration = useCallback(() => {
    const samples = calibrationRef.current.pinchSamples;
    if (samples.length) {
      const sorted = [...samples].sort((a, b) => a - b);
      const p25 = sorted[Math.floor(sorted.length * 0.25)];
      const newThreshold = clamp(p25 * 1.35, 0.038, 0.082);
      updateSettings({ pinchThreshold: newThreshold });
    }
    calibrationRef.current.collecting = false;
    setCalibrationStatus("complete");
    setCalibrationProgress(100);
  }, [updateSettings]);

  const processHandGestures = useCallback((results) => {
    frameCountRef.current += 1;
    const cfg = settingsRef.current;

    if (frameCountRef.current % Math.max(1, cfg.frameStride) !== 0) {
      stateRef.current.droppedFrames += 1;
      updateAnalyticsState();
      return;
    }

    const hands = results.multiHandLandmarks || [];
    const confidence = getConfidence(results, hands.length);
    stateRef.current.avgConfidence = smoothValue(stateRef.current.avgConfidence, confidence, 0.12);

    if (!hands.length) {
      setIsTracking(false);
      resetGestureRefs();
      setTrackingStatus("no_hands");
      updateAnalyticsState(true);
      return;
    }

    setIsTracking(true);

    if (calibrationRef.current.collecting && hands[0]) {
      calibrationRef.current.pinchSamples.push(pinchDistance(hands[0]));
      calibrationRef.current.frames += 1;
      const progress = Math.floor((calibrationRef.current.frames / CALIBRATION_FRAMES) * 100);
      setCalibrationProgress(clamp(progress, 0, 100));
      if (calibrationRef.current.frames >= CALIBRATION_FRAMES) completeCalibration();
    }

    // Fallback logic intentionally commented out for gesture-only mode.
    // We still track low-confidence state for analytics, but do not auto-switch controls.
    if (confidence < cfg.minConfidence) {
      stateRef.current.lowQualityFrames += 1;
      stateRef.current.recoveryFrames = 0;
      stateRef.current.mode = "low_confidence";
    } else {
      stateRef.current.recoveryFrames += 1;
      if (stateRef.current.recoveryFrames > 2) {
        stateRef.current.lowQualityFrames = Math.max(0, stateRef.current.lowQualityFrames - 1);
      }
    }

    // if (!fallbackActive && stateRef.current.lowQualityFrames > LOW_QUALITY_LIMIT) {
    //   setFallbackActive(true);
    //   setFallbackReason("Tracking quality dropped. Mouse fallback enabled.");
    //   stateRef.current.fallbackEvents += 1;
    //   resetGestureRefs();
    //   stateRef.current.mode = "fallback";
    //   updateAnalyticsState(true);
    //   return;
    // }
    //
    // if (fallbackActive && stateRef.current.recoveryFrames > RECOVERY_LIMIT) {
    //   setFallbackActive(false);
    //   setFallbackReason("");
    //   stateRef.current.lowQualityFrames = 0;
    // }
    //
    // if (fallbackActive) {
    //   stateRef.current.mode = "fallback";
    //   updateAnalyticsState();
    //   return;
    // }

    let rotation = { pitch: 0, yaw: 0, roll: 0 };
    let scale = 1.0;

    // Match desktop reference behavior:
    // 1) Always evaluate one-hand pinch-rotate using first detected hand.
    // 2) If a second hand exists, additionally evaluate two-index-finger zoom.
    const hand1 = hands[0];
    const pinch = pinchDistance(hand1);
    const center = pinchCenter(hand1);
    const smoothedCenter = smoothPoint(stateRef.current.smoothedCenter, center, cfg.smoothing);
    const smoothedPinch = smoothValue(stateRef.current.smoothedPinchDistance, pinch, cfg.smoothing);
    stateRef.current.smoothedCenter = smoothedCenter;
    stateRef.current.smoothedPinchDistance = smoothedPinch;

    const pinched = pinch < cfg.pinchThreshold;
    if (pinched) {
      stateRef.current.mode = "rotate";
      if (stateRef.current.lastCenter) {
        const dx = (smoothedCenter.x - stateRef.current.lastCenter.x) * cfg.rotationGain;
        const dy = (smoothedCenter.y - stateRef.current.lastCenter.y) * cfg.rotationGain;
        const dead = cfg.deadZone * 100;
        rotation.yaw = Math.abs(dx) < dead ? 0 : dx;
        rotation.pitch = Math.abs(dy) < dead ? 0 : dy;
      }
      stateRef.current.lastCenter = smoothedCenter;
      // One-hand pinch zoom: opening pinch zooms out/in depending on ratio.
      if (stateRef.current.lastPinchDistance != null && stateRef.current.lastPinchDistance > 0.001) {
        const ratio = smoothedPinch / stateRef.current.lastPinchDistance;
        const adjusted = 1 + (ratio - 1) * (cfg.zoomGain * 0.85);
        const dead = cfg.deadZone * 1.5;
        const pinchScale = Math.abs(adjusted - 1.0) < dead ? 1.0 : clamp(adjusted, 0.88, 1.14);
        scale = pinchScale;
      }
      stateRef.current.lastPinchDistance = smoothedPinch;
    } else {
      stateRef.current.lastCenter = null;
      stateRef.current.lastPinchDistance = null;
    }

    if (hands.length >= 2) {
      const hand2 = hands[1];
      const indexDistance = distance2D(hand1[8], hand2[8]);
      const smoothedDist = smoothValue(stateRef.current.smoothedIndexDistance, indexDistance, cfg.smoothing);
      stateRef.current.smoothedIndexDistance = smoothedDist;
      stateRef.current.mode = pinched ? "rotate+zoom" : "zoom";

      if (stateRef.current.lastIndexDistance != null && stateRef.current.lastIndexDistance > 0.01) {
        const ratio = smoothedDist / stateRef.current.lastIndexDistance;
        const adjusted = 1 + (ratio - 1) * cfg.zoomGain;
        const dead = cfg.deadZone * 1.8;
        scale = Math.abs(adjusted - 1.0) < dead ? 1.0 : clamp(adjusted, 0.86, 1.18);
      }
      stateRef.current.lastIndexDistance = smoothedDist;
    } else {
      stateRef.current.lastIndexDistance = null;
      stateRef.current.smoothedIndexDistance = null;
    }

    if (rotation.pitch !== 0 || rotation.yaw !== 0 || scale !== 1.0) {
      stateRef.current.gesturesDetected += 1;
      onGestureDetected({ rotation, scale });
    }

    updateAnalyticsState();
  }, [onGestureDetected, fallbackActive, completeCalibration]);

  const enableTracking = useCallback(() => {
    if (isEnabled || !videoRef.current) return;
    setIsEnabled(true);
    setTrackingStatus("initializing");
    if (calibrationStatus !== "complete") startCalibration();

    try {
      const hands = new Hands({
        locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
      });

      const cfg = settingsRef.current;
      hands.setOptions({
        maxNumHands: 2,
        modelComplexity: 0,
        minDetectionConfidence: clamp(cfg.minConfidence, 0.45, 0.9),
        minTrackingConfidence: clamp(cfg.minConfidence, 0.45, 0.9),
      });

      hands.onResults((results) => {
        processHandGestures(results);
      });

      const camera = new Camera(videoRef.current, {
        onFrame: async () => {
          if (videoRef.current && videoRef.current.videoWidth > 0) {
            try {
              await hands.send({ image: videoRef.current });
            } catch (error) {
              console.error("Error sending frame to hands:", error);
            }
          }
        },
        width: 640,
        height: 480,
      });

      const startResult = camera.start();
      if (startResult && typeof startResult.catch === "function") {
        startResult.catch((error) => {
          console.error("Camera start failed:", error);
          setIsEnabled(false);
          setTrackingStatus("error");
        });
      }

      handsRef.current = hands;
      cameraRef.current = camera;
      setTrackingStatus("idle");
    } catch (error) {
      console.error("Hand tracking initialization failed:", error);
      setIsEnabled(false);
      setTrackingStatus("error");
    }
  }, [isEnabled, processHandGestures, calibrationStatus, startCalibration]);

  const disableTracking = useCallback(() => {
    if (cameraRef.current) {
      cameraRef.current.stop();
      cameraRef.current = null;
    }
    if (handsRef.current) {
      handsRef.current.close();
      handsRef.current = null;
    }
    setIsEnabled(false);
    setIsTracking(false);
    setFallbackActive(false);
    setFallbackReason("");
    setTrackingStatus("idle");
    resetGestureRefs();
  }, []);

  useEffect(() => {
    return () => {
      disableTracking();
    };
  }, [disableTracking]);

  return {
    videoRef,
    isTracking,
    isEnabled,
    trackingStatus,
    calibrationStatus,
    calibrationProgress,
    fallbackActive,
    fallbackReason,
    analytics,
    preset,
    settings,
    setPreset,
    updateSettings,
    startCalibration,
    enableTracking,
    disableTracking,
    presetOptions: Object.keys(PRESETS),
  };
}
