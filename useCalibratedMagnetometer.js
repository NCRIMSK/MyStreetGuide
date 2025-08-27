import {useEffect, useState, useRef, useCallback} from 'react';
import CompassHeading from 'react-native-compass-heading';
import {
  accelerometer,
  setUpdateIntervalForType,
  SensorTypes,
} from 'react-native-sensors';

export const NUM_CALIBRATION_SAMPLES = 50;

export const useCalibratedMagnetometer = () => {
  const [calibratedHeading, setCalibratedHeading] = useState(null);
  const [calibrationOffset, setCalibrationOffset] = useState(0);
  const [isCalibrating, setIsCalibrating] = useState(true);
  const [calibrationMessage, setCalibrationMessage] = useState('');
  const [sampleCount, setSampleCount] = useState(0);

  const samplesRef = useRef([]);
  const lastAngleRef = useRef(null);
  const stableHeadingRef = useRef(null);
  const isCalibratingRef = useRef(true);
  const calibrationTimeoutRef = useRef(null);
  const calibrationOffsetRef = useRef(0);
  const isTiltedRef = useRef(false);

  const movementThreshold = 2;

  useEffect(() => {
    calibrationOffsetRef.current = calibrationOffset;
  }, [calibrationOffset]);

  const finishCalibration = useCallback(() => {
    isCalibratingRef.current = false;
    if (calibrationTimeoutRef.current) {
      clearTimeout(calibrationTimeoutRef.current);
      calibrationTimeoutRef.current = null;
    }
    if (samplesRef.current.length > 0) {
      const avgOffset =
        samplesRef.current.reduce((a, b) => a + b, 0) /
        samplesRef.current.length;
      setCalibrationOffset(avgOffset);
    } else {
      setCalibrationOffset(0);
    }
    setIsCalibrating(false);
    setCalibrationMessage('');
  }, []);

  const calibrate = useCallback(() => {
    if (calibrationTimeoutRef.current) {
      clearTimeout(calibrationTimeoutRef.current);
      calibrationTimeoutRef.current = null;
    }
    samplesRef.current = [];
    lastAngleRef.current = null;
    stableHeadingRef.current = null;
    setSampleCount(0);

    setIsCalibrating(true);
    isCalibratingRef.current = true;
    setCalibrationMessage('Двигайте телефон восьмерками');

    const timeout = setTimeout(() => {
      finishCalibration();
    }, 10000);
    calibrationTimeoutRef.current = timeout;
  }, [finishCalibration]);

  useEffect(() => {
    calibrate();
    return () => {
      if (calibrationTimeoutRef.current) {
        clearTimeout(calibrationTimeoutRef.current);
      }
    };
  }, [calibrate]);

  useEffect(() => {
    setUpdateIntervalForType(SensorTypes.accelerometer, 100);
    const subscription = accelerometer.subscribe(({x, y, z}) => {
      const magnitude = Math.sqrt(x * x + y * y + z * z) || 1;
      const normalizedZ = z / magnitude;
      isTiltedRef.current = Math.abs(normalizedZ) > 0.5;
    });
    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const handleHeading = useCallback(
    ({heading}) => {
      const adjustedAngle = (heading + 360) % 360;
      if (isCalibratingRef.current) {
        if (
          lastAngleRef.current === null ||
          Math.abs(adjustedAngle - lastAngleRef.current) >= movementThreshold
        ) {
          samplesRef.current.push(adjustedAngle);
          lastAngleRef.current = adjustedAngle;
          setSampleCount(samplesRef.current.length);
          if (samplesRef.current.length >= NUM_CALIBRATION_SAMPLES) {
            finishCalibration();
          }
        }
      } else {
        if (isTiltedRef.current) {
          return;
        }
        if (stableHeadingRef.current == null) {
          stableHeadingRef.current = adjustedAngle;
        } else {
          let diff =
            ((adjustedAngle - stableHeadingRef.current + 540) % 360) - 180;
          if (Math.abs(diff) > 150) {
            return;
          }
          stableHeadingRef.current =
            (stableHeadingRef.current + diff * 0.1 + 360) % 360;
        }
        setCalibratedHeading(
          stableHeadingRef.current - calibrationOffsetRef.current,
        );
      }
    },
    [finishCalibration],
  );

  useEffect(() => {
    CompassHeading.stop();
    CompassHeading.start(1, handleHeading);
    return () => {
      CompassHeading.stop();
    };
  }, [handleHeading, isCalibrating]);

  return {
    calibratedHeading,
    isCalibrating,
    calibrationMessage,
    calibrate,
    finishCalibration,
    sampleCount,
  };
};
