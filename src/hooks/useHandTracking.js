import { useEffect, useRef, useState, useCallback } from 'react';
import { Hands } from '@mediapipe/hands';
import { Camera } from '@mediapipe/camera_utils';

const PINCH_THRESHOLD = 0.05;
const ROTATION_SENSITIVITY = 120;
const SCALE_SENSITIVITY = 1.5;

export function useHandTracking(onGestureDetected) {
  const videoRef = useRef(null);
  const handsRef = useRef(null);
  const cameraRef = useRef(null);
  const [isTracking, setIsTracking] = useState(false);
  const [isEnabled, setIsEnabled] = useState(false);
  
  // Store last positions for delta calculation
  const lastPinchPosRef = useRef(null);
  const lastPinchDistRef = useRef(null);

  const processHandGestures = useCallback((results) => {
    if (!results.multiHandLandmarks || results.multiHandLandmarks.length === 0) {
      setIsTracking(false);
      lastPinchPosRef.current = null;
      lastPinchDistRef.current = null;
      return;
    }

    setIsTracking(true);
    
    let rotation = { pitch: 0, yaw: 0, roll: 0 };
    let scale = 1.0;

    if (results.multiHandLandmarks.length === 1) {
      // One hand - pinch to rotate
      const hand = results.multiHandLandmarks[0];
      const thumb = hand[4];
      const index = hand[8];
      
      const distance = Math.sqrt(
        Math.pow(thumb.x - index.x, 2) + 
        Math.pow(thumb.y - index.y, 2)
      );
      
      if (distance < PINCH_THRESHOLD) {
        const centerX = (thumb.x + index.x) / 2;
        const centerY = (thumb.y + index.y) / 2;
        
        if (lastPinchPosRef.current) {
          // Calculate rotation delta based on movement
          const dx = (centerX - lastPinchPosRef.current.x) * ROTATION_SENSITIVITY;
          const dy = (centerY - lastPinchPosRef.current.y) * ROTATION_SENSITIVITY;
          
          rotation.pitch = dy;
          rotation.yaw = dx;
        }
        
        lastPinchPosRef.current = { x: centerX, y: centerY };
      } else {
        lastPinchPosRef.current = null;
      }
    } else if (results.multiHandLandmarks.length === 2) {
      // Two hands - zoom
      const hand1 = results.multiHandLandmarks[0];
      const hand2 = results.multiHandLandmarks[1];
      
      // Use index fingers (landmark 8) for distance calculation
      const h1Index = hand1[8];
      const h2Index = hand2[8];
      
      const dist = Math.sqrt(
        Math.pow(h1Index.x - h2Index.x, 2) + 
        Math.pow(h1Index.y - h2Index.y, 2)
      );
      
      if (lastPinchDistRef.current !== null && lastPinchDistRef.current > 0.01) {
        // Calculate scale multiplier based on distance change
        scale = dist / lastPinchDistRef.current;
        // Clamp scale to reasonable values
        scale = Math.max(0.5, Math.min(2.0, scale));
      }
      
      lastPinchDistRef.current = dist;
    } else {
      lastPinchDistRef.current = null;
    }

    // Only call callback if there's actual gesture data
    if (rotation.pitch !== 0 || rotation.yaw !== 0 || scale !== 1.0) {
      onGestureDetected({ rotation, scale });
    }
  }, [onGestureDetected]);

  const enableTracking = useCallback(() => {
    if (isEnabled || !videoRef.current) return;
    
    setIsEnabled(true);

    try {
      const hands = new Hands({
        locateFile: (file) => {
          return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
        }
      });

      hands.setOptions({
        maxNumHands: 2,
        modelComplexity: 0,
        minDetectionConfidence: 0.7,
        minTrackingConfidence: 0.7
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
              console.error('Error sending frame to hands:', error);
            }
          }
        },
        width: 640,
        height: 480
      });
      
      // Camera.start() might return a promise or throw synchronously
      const startResult = camera.start();
      if (startResult && typeof startResult.catch === 'function') {
        startResult.catch((error) => {
          console.error('Camera start failed:', error);
          setIsEnabled(false);
          // Don't show alert immediately, let user see the error in console
        });
      }
      
      handsRef.current = hands;
      cameraRef.current = camera;
    } catch (error) {
      console.error('Hand tracking initialization failed:', error);
      setIsEnabled(false);
    }
  }, [isEnabled, processHandGestures]);

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
    lastPinchPosRef.current = null;
    lastPinchDistRef.current = null;
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
    enableTracking, 
    disableTracking 
  };
}
