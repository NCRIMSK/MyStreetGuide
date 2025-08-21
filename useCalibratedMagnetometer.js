import { useEffect, useState, useRef, useCallback } from 'react';
// ~~~ Удаляем старый импорт магнитометра ~~~
// import { magnetometer } from 'react-native-sensors';

// ADD: импортируем библиотеку, которая использует sensor fusion
import CompassHeading from 'react-native-compass-heading';

const NUM_CALIBRATION_SAMPLES = 50; // Количество измерений для калибровки

export const useCalibratedMagnetometer = () => {
  const [calibratedHeading, setCalibratedHeading] = useState(null);
  const [calibrationOffset, setCalibrationOffset] = useState(0);
  const [isCalibrating, setIsCalibrating] = useState(true);
  const [calibrationMessage, setCalibrationMessage] = useState("");
  const [sampleCount, setSampleCount] = useState(0);
  
  const samplesRef = useRef([]);
  const lastAngleRef = useRef(null);
  
  const calibrationSubscriptionRef = useRef(null); // Для хранения текущей подписки
  const calibrationTimeoutRef = useRef(null);      // Для хранения таймаута
  
  const movementThreshold = 2;
  
  const finishCalibration = useCallback(() => {
    if (calibrationSubscriptionRef.current) {
      calibrationSubscriptionRef.current.unsubscribe();
      calibrationSubscriptionRef.current = null;
    }
    if (calibrationTimeoutRef.current) {
      clearTimeout(calibrationTimeoutRef.current);
      calibrationTimeoutRef.current = null;
    }
    if (samplesRef.current.length > 0) {
      const avgOffset = samplesRef.current.reduce((a, b) => a + b, 0) / samplesRef.current.length;
      setCalibrationOffset(avgOffset);
    } else {
      setCalibrationOffset(0);
    }
    setIsCalibrating(false);
    setCalibrationMessage("");
    // STOP sensor fusion when calibration finished
    CompassHeading.stop();
  }, []);
  
  const calibrate = useCallback(() => {
    // Очистка предыдущих подписок, таймаутов и семплов
    if (calibrationSubscriptionRef.current) {
      calibrationSubscriptionRef.current.unsubscribe();
      calibrationSubscriptionRef.current = null;
    }
    if (calibrationTimeoutRef.current) {
      clearTimeout(calibrationTimeoutRef.current);
      calibrationTimeoutRef.current = null;
    }
    samplesRef.current = [];
    lastAngleRef.current = null;
    setSampleCount(0);
    
    setIsCalibrating(true);
    setCalibrationMessage("Калибровка...");
    
    // ~~~ Удаляем старую подписку через magnetometer.subscribe ~~~
    /*
    const subscription = magnetometer.subscribe(({ x, y }) => {
      if (x === 0 && y === 0) return;
      const angle = Math.atan2(y, x) * (180 / Math.PI);
      const adjustedAngle = (angle + 360) % 360;
      // Проверяем, изменился ли угол достаточно
      if (lastAngleRef.current === null || Math.abs(adjustedAngle - lastAngleRef.current) >= movementThreshold) {
        samplesRef.current.push(adjustedAngle);
        lastAngleRef.current = adjustedAngle;
        setSampleCount(samplesRef.current.length);
      }
    });
    calibrationSubscriptionRef.current = subscription;
    */
    
    // ADD: Запускаем подписку через CompassHeading (библиотека sensor fusion)
    // Параметр 3 означает, что callback вызывается при изменении угла более чем на 3 градуса
    const subscription = {
      unsubscribe: () => CompassHeading.stop()
    };
    CompassHeading.start(3, ({ heading }) => {
      // Используем heading, полученный из sensor fusion
      const adjustedAngle = (heading + 360) % 360;
      if (lastAngleRef.current === null || Math.abs(adjustedAngle - lastAngleRef.current) >= movementThreshold) {
        samplesRef.current.push(adjustedAngle);
        lastAngleRef.current = adjustedAngle;
        setSampleCount(samplesRef.current.length);
      }
    });
    calibrationSubscriptionRef.current = subscription;
    
    // Таймаут ровно на 10 секунд для автоматического завершения калибровки
    const timeout = setTimeout(() => {
      finishCalibration();
    }, 10000);
    calibrationTimeoutRef.current = timeout;
  }, [finishCalibration]);
  
  useEffect(() => {
    calibrate(); // Автоматическая калибровка при монтировании
    return () => {
      if (calibrationSubscriptionRef.current) {
        calibrationSubscriptionRef.current.unsubscribe();
      }
      if (calibrationTimeoutRef.current) {
        clearTimeout(calibrationTimeoutRef.current);
      }
    };
  }, [calibrate]);
  
  // Обновление компаса после калибровки можно также осуществлять через CompassHeading
  useEffect(() => {
    if (!isCalibrating) {
      // ~~~ Удаляем старую подписку через magnetometer.subscribe ~~~
      /*
      const compassSubscription = magnetometer.subscribe(({ x, y }) => {
        if (x === 0 && y === 0) return;
        const angle = Math.atan2(y, x) * (180 / Math.PI);
        const adjustedAngle = (angle + 360) % 360;
        setCalibratedHeading(adjustedAngle - calibrationOffset);
      });
      return () => compassSubscription.unsubscribe();
      */
      
      // ADD: Используем CompassHeading для обновления показаний компаса
      const compassSubscription = {
        unsubscribe: () => CompassHeading.stop()
      };
      CompassHeading.start(3, ({heading, accuracy}) => {
        const adjustedAngle = (heading + 360) % 360;
        setCalibratedHeading(adjustedAngle - calibrationOffset);
      });
      return () => compassSubscription.unsubscribe();
    }
  }, [isCalibrating, calibrationOffset]);
  
  return { calibratedHeading, isCalibrating, calibrationMessage, calibrate, finishCalibration, sampleCount };
};
