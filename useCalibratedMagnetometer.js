import {useEffect, useState, useRef, useCallback} from 'react';
import CompassHeading from 'react-native-compass-heading';
import {accelerometer} from 'react-native-sensors';

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
  const isTiltedRef = useRef(false);
  const isCalibratingRef = useRef(true);
  const calibrationTimeoutRef = useRef(null);
  const calibrationOffsetRef = useRef(0);

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
    setSampleCount(0);

    setIsCalibrating(true);
    isCalibratingRef.current = true;
    setCalibrationMessage('Двигайте телефон горизонтально восьмерками');

    const timeout = setTimeout(() => {
      finishCalibration();
    }, 10000);
    calibrationTimeoutRef.current = timeout;
  }, [finishCalibration]);

  useEffect(() => {
    const accelSub = accelerometer.subscribe(({x, y, z}) => {
      const pitch = Math.atan2(-x, Math.sqrt(y * y + z * z)) * (180 / Math.PI);
      const roll = Math.atan2(y, z) * (180 / Math.PI);
      if (isCalibratingRef.current) {
        const horizontal = Math.abs(pitch) <= 30 && Math.abs(roll) <= 30;
        isTiltedRef.current = !horizontal;
        setCalibrationMessage(
          horizontal
            ? 'Двигайте телефон горизонтально восьмерками'
            : 'Держите телефон горизонтально',
        );
      } else {
        const vertical =
          Math.abs(pitch) >= 60 &&
          Math.abs(pitch) <= 120 &&
          Math.abs(roll) <= 45;
        isTiltedRef.current = !vertical;
      }
    });
    calibrate();
    return () => {
      accelSub.unsubscribe();
      if (calibrationTimeoutRef.current) {
        clearTimeout(calibrationTimeoutRef.current);
      }
    };
  }, [calibrate]);

  const handleHeading = useCallback(
    ({heading}) => {
      if (isTiltedRef.current) {
        return;
      }
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
        if (stableHeadingRef.current == null) {
          stableHeadingRef.current = adjustedAngle;
        } else {
          let diff =
            ((adjustedAngle - stableHeadingRef.current + 540) % 360) - 180;
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
    CompassHeading.start(1, handleHeading);
    return () => {
      CompassHeading.stop();
    };
  }, [handleHeading]);

  return {
    calibratedHeading,
    isCalibrating,
    calibrationMessage,
    calibrate,
    finishCalibration,
    sampleCount,
  };
};

