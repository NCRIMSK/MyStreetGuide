import React, {useEffect, useState, useRef} from 'react';
import {
  Dimensions,
  View,
  StyleSheet,
  Text,
  Button,
  Linking,
  TouchableOpacity,
  ActivityIndicator,
  AppState,
  AppStateStatus,
} from 'react-native';
import {Camera, useCameraDevice} from 'react-native-vision-camera';
import RNFS from 'react-native-fs';
import {useLocationAndDeclination} from './useLocationAndDeclination';
import {
  useCalibratedMagnetometer,
  NUM_CALIBRATION_SAMPLES,
} from './useCalibratedMagnetometer';

const {width, height} = Dimensions.get('window');
const savePath = `${RNFS.PicturesDirectoryPath}/MyTourGuide`;

type Coordinates = {latitude: number; longitude: number};

const App = () => {
  const [hasPermission, setHasPermission] = useState<null | boolean>(null);
  // Camera device selection via VisionCamera hooks
  const backDevice = useCameraDevice('back');
  const frontDevice = useCameraDevice('front');
  const deviceToUse = backDevice ?? frontDevice ?? null;
  const [isAppActive, setIsAppActive] = useState(true);
  // Хранение направления компаса ведется во внутреннем сглаженном состоянии
  const [address, setAddress] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [showSteps, setShowSteps] = useState(false);
  const [steps, setSteps] = useState<
    Array<{
      id: string;
      label: string;
      status: 'pending' | 'in_progress' | 'done';
    }>
  >([]);

  // Smooth heading animation state
  const [smoothedHeading, setSmoothedHeading] = useState(0);
  const targetHeadingRef = useRef<number>(0);
  const smootherTimerRef = useRef<any>(null);

  const camera = useRef<Camera | null>(null);

  const {coordinates, accuracy, magneticDeclination, loadingLocation} =
    useLocationAndDeclination() as {
      coordinates: Coordinates | null;
      accuracy: number | null;
      magneticDeclination: number;
      loadingLocation: boolean;
    };
  const {
    calibratedHeading,
    isCalibrating,
    calibrationMessage,
    calibrate,
    finishCalibration,
    sampleCount,
  } = useCalibratedMagnetometer();

  const checkCameraPermission = async () => {
    try {
      const status = await Camera.getCameraPermissionStatus();
      if (status !== 'granted') {
        const newStatus = await Camera.requestCameraPermission();
        setHasPermission(newStatus === 'granted');
      } else {
        setHasPermission(true);
      }
    } catch (error) {
      console.error('Ошибка проверки разрешения', error);
      setHasPermission(false);
    }
  };

  function getDestinationPoint(
    startLatitude: number,
    startLongitude: number,
    bearing: number,
    distance: number,
  ) {
    const earthRadius = 6371000; // в метрах
    const angularDistance = distance / earthRadius;
    const bearingRad = (bearing * Math.PI) / 180;

    const lat1 = (startLatitude * Math.PI) / 180;
    const lon1 = (startLongitude * Math.PI) / 180;

    const lat2 = Math.asin(
      Math.sin(lat1) * Math.cos(angularDistance) +
        Math.cos(lat1) * Math.sin(angularDistance) * Math.cos(bearingRad),
    );

    let lon2 =
      lon1 +
      Math.atan2(
        Math.sin(bearingRad) * Math.sin(angularDistance) * Math.cos(lat1),
        Math.cos(angularDistance) - Math.sin(lat1) * Math.sin(lat2),
      );

    // Нормализация долготы до -180…+180
    lon2 = ((lon2 + 3 * Math.PI) % (2 * Math.PI)) - Math.PI;

    return {
      endLatitude: (lat2 * 180) / Math.PI,
      endLongitude: (lon2 * 180) / Math.PI,
    };
  }

  const reverseGeocode = async (lat: number, lon: number) => {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&zoom=18&addressdetails=1`;
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'MyTourGuideApp/0.1 (necrocodil@gmail.com)', // замените на свои данные
        },
      });
      const data = await response.json();
      console.log('Полученный ответ от Nominatim:', data);
      return data;
    } catch (error) {
      console.error('Ошибка обратного геокодирования:', error);
      return null;
    }
  };

  const formatAddress = (geoData: any) => {
    if (!geoData || !geoData.address) return '';
    const {city, town, village, road, house_number} = geoData.address;
    const cityName = city || town || village || '';
    const parts = [cityName, road, house_number].filter(Boolean);
    return parts.join(', ');
  };

  useEffect(() => {
    checkCameraPermission();
  }, []);

  // No custom device selection effect needed with useCameraDevice

  // Manage Camera lifecycle with AppState to avoid device lock and recover on resume
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      const active = next === 'active';
      setIsAppActive(active);
      // VisionCamera hooks will update device automatically; nothing else needed here
    });
    return () => sub.remove();
  }, [hasPermission]);

  // Continuously update true heading in state
  useEffect(() => {
    if (calibratedHeading == null) return;
    const trueHeading =
      (calibratedHeading + (magneticDeclination ?? 0) + 360) % 360;
    targetHeadingRef.current = trueHeading;
  }, [calibratedHeading, magneticDeclination]);

  // Start smoothing loop (EMA toward target) for continuous, smooth rotation
  useEffect(() => {
    if (smootherTimerRef.current) return;
    smootherTimerRef.current = setInterval(() => {
      setSmoothedHeading(prev => {
        const target = targetHeadingRef.current ?? 0;
        let diff = ((target - prev + 540) % 360) - 180; // shortest-arc delta
        const alpha = 0.18; // smoothing factor
        let next = prev + alpha * diff;
        next = ((next % 360) + 360) % 360; // normalize to [0,360)
        return next;
      });
    }, 50); // ~20 FPS
    return () => {
      clearInterval(smootherTimerRef.current);
      smootherTimerRef.current = null;
    };
  }, []);

  if (hasPermission === null) {
    console.log('Запрос разрешения');
    return (
      <View style={styles.center}>
        <Text>Запрос разрешения на камеру...</Text>
      </View>
    );
  }

  if (hasPermission === false) {
    console.log('Доступ к камере отклонён, показываем сообщение об ошибке...');
    return (
      <View style={styles.center}>
        <Text>Доступ отклонён.</Text>
        <Button
          title="Открыть настройки"
          onPress={() => Linking.openSettings()}
        />
        <Button title="Проверить разрешения" onPress={checkCameraPermission} />
      </View>
    );
  }

  if (hasPermission && !deviceToUse) {
    // While devices are loading or temporarily unavailable, show a light placeholder
    return (
      <View style={styles.center}>
        <ActivityIndicator />
        <Text>Инициализация камеры…</Text>
        <Button title="Проверить разрешения" onPress={checkCameraPermission} />
      </View>
    );
  }

  const takePhoto = async () => {
    if (isBusy) return;
    setIsBusy(true);
    setShowSteps(true);
    setAddress(null);
    setSteps([
      {id: 'loc', label: 'getting location', status: 'in_progress'},
      {id: 'dir', label: 'getting direction', status: 'pending'},
      {id: 'calc', label: 'calculated coords', status: 'pending'},
      {id: 'osm', label: 'sending coords to OSM', status: 'pending'},
    ]);
    if (!camera.current) {
      console.log('TakePhoto: ref missing');
      setIsBusy(false);
      setShowSteps(false);
      return;
    }
    if (isCalibrating || calibratedHeading === null) {
      console.log('Компас ещё калибруется, пожалуйста, подождите.');
      setIsBusy(false);
      setShowSteps(false);
      return;
    }
    if (loadingLocation) {
      console.log('Местоположение ещё загружается, пожалуйста, подождите.');
      setIsBusy(false);
      setShowSteps(false);
      return;
    }

    try {
      const photo = await camera.current!.takePhoto();
      await RNFS.mkdir(savePath);
      const filePath = `${savePath}/photo_${Date.now()}.jpg`;
      console.log('PhotoPath:', filePath);
      await RNFS.moveFile(photo.path, filePath);

      // true heading is tracked continuously via effect

      const computeEndCoordinates = async (distance: number) => {
        if (!coordinates) {
          console.log('Сначала нужно получить координаты');
          return null;
        }
        // Steps: mark getting location done, direction in progress/done
        setSteps(prev =>
          prev.map(s => (s.id === 'loc' ? {...s, status: 'done'} : s)),
        );

        const bearing =
          ((calibratedHeading ?? 0) + (magneticDeclination ?? 0) + 360) % 360;
        setSteps(prev =>
          prev.map(s => (s.id === 'dir' ? {...s, status: 'done'} : s)),
        );
        const startLatitude = coordinates.latitude;
        const startLongitude = coordinates.longitude;
        const result = getDestinationPoint(
          startLatitude,
          startLongitude,
          bearing,
          distance,
        );
        setSteps(prev =>
          prev.map(s => (s.id === 'calc' ? {...s, status: 'done'} : s)),
        );

        setSteps(prev =>
          prev.map(s => (s.id === 'osm' ? {...s, status: 'in_progress'} : s)),
        );
        const geoData = await reverseGeocode(
          result.endLatitude,
          result.endLongitude,
        );
        if (geoData && geoData.address) {
          // Например, можно сохранить полный форматированный адрес
          const formatted = formatAddress(geoData);
          setAddress(formatted);
          console.log('Полученный адрес:', formatted);
          setSteps(prev =>
            prev.map(s => (s.id === 'osm' ? {...s, status: 'done'} : s)),
          );
        } else {
          console.log('Адрес не найден');
        }

        return {
          geoData,
          endLatitude: result.endLatitude,
          endLongitude: result.endLongitude,
        };
      };

      const findBuildingAddress = async () => {
        const initialDistance = 1; // Начинаем с 1 метра
        const maxDistance = 64; // Максимальное расстояние поиска
        let distance = initialDistance;
        let found = false;

        while (distance <= maxDistance && !found) {
          const result = await computeEndCoordinates(distance);

          if (result && result.geoData && result.geoData.address) {
            if (result.geoData.address.house_number) {
              console.log(
                `Здание найдено на расстоянии ${distance} м:`,
                result.geoData.display_name,
              );
              setAddress(formatAddress(result.geoData));
              found = true;
              break;
            } else {
              console.log(
                `На расстоянии ${distance} м найден адрес типа "${result.geoData.type}", но без номера дома.`,
              );
            }
          } else {
            console.log(
              `Не удалось получить данные на расстоянии ${distance} м.`,
            );
          }

          distance *= 2; // Увеличиваем расстояние в 2 раза
        }

        if (!found) {
          console.log('Здание не найдено в пределах заданного диапазона.');
        }
        return found;
      };

      // После получения координат и вычисления азимута
      const success = await findBuildingAddress();

      // Hide steps/log only when final address obtained
      if (success) setShowSteps(false);
      setIsBusy(false);
    } catch (err) {
      console.log('takePhoto: error', err);
    }
    setIsBusy(false);
  };

  return (
    <View style={styles.container}>
      {isCalibrating && (
        <View style={styles.calibrationOverlay}>
          <ActivityIndicator size="large" color="#fff" />
          <Text style={styles.calibrationOverlayText}>
            {calibrationMessage || 'Калибровка компаса...'}
          </Text>
          <Text style={styles.calibrationOverlayText}>
            {`Семплов: ${sampleCount} / ${NUM_CALIBRATION_SAMPLES}`}
          </Text>
          <TouchableOpacity
            style={styles.finishButton}
            onPress={finishCalibration}>
            <Text style={styles.finishButtonText}>Завершить калибровку</Text>
          </TouchableOpacity>
        </View>
      )}
      <Camera
        key={deviceToUse?.id}
        ref={camera}
        style={StyleSheet.absoluteFill}
        device={deviceToUse}
        isActive={isAppActive && hasPermission === true}
        photo={true} // Включает возможность съемки фото
        onInitialized={() => console.log('Camera initialized')}
        onError={e => console.log('Camera error', e)}
      />
      <TouchableOpacity style={styles.calibrateButton} onPress={calibrate}>
        <Text style={styles.calibrateButtonText}>Калибровать</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.captureButton, isBusy && styles.captureButtonBusy]}
        onPress={takePhoto}
        disabled={isBusy}></TouchableOpacity>

      {coordinates ? (
        <View style={styles.coordinatesContainer}>
          <Text style={styles.coordinatesText}>
            {`Lat: ${coordinates.latitude.toFixed(6)}`}
          </Text>
          <Text style={styles.coordinatesText}>
            {`Lon: ${coordinates.longitude.toFixed(6)}`}
          </Text>
          <Text style={styles.coordinatesText}>
            {`Acc: ${accuracy != null ? Math.round(accuracy) : '--'} m`}
          </Text>
          <Text style={styles.coordinatesText}>
            {`Dir: ${Math.round(smoothedHeading)}°`}
          </Text>
        </View>
      ) : (
        <View style={styles.coordinatesContainer}>
          <Text style={styles.coordinatesText}>
            {loadingLocation
              ? 'Определяется местоположение...'
              : 'Местоположение недоступно'}
          </Text>
        </View>
      )}

      {address && (
        <View style={styles.addressContainer}>
          <Text style={styles.addressText}>{address}</Text>
        </View>
      )}

      <View style={styles.crosshairContainer}>
        <View style={styles.crosshairHorizontal} />
        <View style={styles.crosshairVertical} />
      </View>

      {/* Centered ellipse compass with smooth arrow */}
      <View style={styles.compassEllipseContainer} pointerEvents="none">
        <View style={styles.ellipseRing} />
        <View
          style={[
            styles.arrowContainer,
            {transform: [{rotate: `${smoothedHeading ?? 0}deg`}]},
          ]}>
          <View style={styles.arrowTriangle} />
          <View style={styles.arrowStem} />
        </View>
      </View>

      {/* Steps overlay */}
      {showSteps && (
        <View style={styles.stepsContainer}>
          {steps.map(step => (
            <Text key={step.id} style={styles.stepsText}>
              {`${step.label} - ${step.status}`}
            </Text>
          ))}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {flex: 1},
  center: {flex: 1, justifyContent: 'center', alignItems: 'center'},

  coordinatesContainer: {
    position: 'absolute',
    top: 50,
    left: 10,
    backgroundColor: 'rgba(0,0,0,0.5)',
    padding: 10,
    borderRadius: 5,
  },
  coordinatesText: {
    color: 'white',
    fontSize: 14,
  },

  addressContainer: {
    position: 'absolute',
    bottom: height * 0.3,
    width: width * 0.5,
    right: 10,
    backgroundColor: 'rgba(0,0,0,0.5)',
    padding: 10,
    borderRadius: 5,
  },
  addressText: {
    color: 'white',
    fontSize: 14,
  },

  captureButton: {
    position: 'absolute',
    bottom: height * 0.1, // 10% от высоты экрана
    alignSelf: 'center',
    width: width * 0.2, // 20% ширины экрана
    height: width * 0.2, // Делаем кнопку круглой
    borderRadius: width * 0.1, // Половина ширины = круг
    borderWidth: width * 0.01, // 1% ширины экрана
    borderColor: 'rgba(255, 255, 255, 0.3)', // Белый с прозрачностью 30%
    backgroundColor: 'transparent',
  },
  captureButtonBusy: {
    backgroundColor: 'rgba(255,0,0,0.4)',
    borderColor: 'rgba(255,0,0,0.8)',
  },

  crosshairContainer: {
    // Добавлено: контейнер для кроссхэйра, центрированный на экране
    position: 'absolute',
    top: '50%',
    left: '50%',
    width: width * 0.15,
    height: width * 0.15,
    transform: [{translateX: -(width * 0.075)}, {translateY: -(width * 0.075)}],
  },
  crosshairHorizontal: {
    // Изменено: горизонтальная линия внутри контейнера
    position: 'absolute',
    backgroundColor: 'white',
    opacity: 0.3,
    width: '100%',
    height: width * 0.01,
    top: '50%',
    transform: [{translateY: -(width * 0.005)}],
  },
  crosshairVertical: {
    // Добавлено: вертикальная линия внутри контейнера
    position: 'absolute',
    backgroundColor: 'white',
    opacity: 0.3,
    height: '100%',
    width: width * 0.01,
    left: '50%',
    transform: [{translateX: -(width * 0.005)}],
  },

  calibrateButton: {
    position: 'absolute',
    top: 10,
    right: 10,
    padding: 8,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 5,
    zIndex: 10,
  },
  calibrateButtonText: {
    color: '#fff',
    fontSize: 14,
  },
  finishButton: {
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 6,
  },
  finishButtonText: {
    color: '#fff',
    fontSize: 14,
  },
  // Centered ellipse compass styles
  compassEllipseContainer: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    width: width * 0.5,
    height: width * 0.32,
    transform: [{translateX: -(width * 0.25)}, {translateY: -(width * 0.16)}],
    justifyContent: 'center',
    alignItems: 'center',
  },
  ellipseRing: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.35)',
    borderRadius: width, // large radius to create oval edges
    backgroundColor: 'rgba(0,0,0,0.15)',
  },
  arrowContainer: {
    width: width * 0.5,
    height: width * 0.32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  arrowTriangle: {
    width: 0,
    height: 0,
    borderLeftWidth: 10,
    borderRightWidth: 10,
    borderBottomWidth: 36,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: '#ff5252',
  },
  arrowStem: {
    width: 3,
    height: 38,
    backgroundColor: '#ff5252',
    marginTop: 6,
    borderRadius: 2,
  },
  stepsContainer: {
    position: 'absolute',
    bottom: height * 0.22,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    padding: 10,
    borderRadius: 6,
    minWidth: width * 0.6,
  },
  stepsText: {
    color: '#fff',
    fontSize: 14,
    marginVertical: 2,
  },
  calibrationOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    zIndex: 5,
  },
  calibrationOverlayText: {
    color: '#fff',
    fontSize: 16,
    marginTop: 10,
  },
});

export default App;
