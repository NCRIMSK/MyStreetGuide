import React, { useEffect, useState, useRef } from 'react';
import { Dimensions, View, StyleSheet, Text, Button, Linking, TouchableOpacity, ActivityIndicator  } from 'react-native';
import { Camera, useCameraDevices } from 'react-native-vision-camera';
import RNFS from 'react-native-fs';
import { useLocationAndDeclination } from './useLocationAndDeclination';
import { useCalibratedMagnetometer } from './useCalibratedMagnetometer';

const { width, height } = Dimensions.get('window');
const savePath = `${RNFS.PicturesDirectoryPath}/MyTourGuide`;
const saveTextPath = `${RNFS.DocumentDirectoryPath}/MyTourGuideText`;

const App = () => {
  const [hasPermission, setHasPermission] = useState<null | boolean>(null);
  const [deviceToUse, setDeviceToUse] = useState<any>(null);
  const [compassDirection, setCompassDirection] = useState<number | null>(null);
  const [address, setAddress] = useState(null);

  const devices = useCameraDevices();
  const camera = useRef(null);
  const NUM_CALIBRATION_SAMPLES = 50;
  
  const { coordinates, magneticDeclination, loadingLocation } = useLocationAndDeclination();
  const { calibratedHeading, isCalibrating, calibrationMessage, calibrate, finishCalibration, sampleCount  } = useCalibratedMagnetometer();

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


function getDestinationPoint(startLatitude, startLongitude, bearing, distance) {
  const earthRadius = 6371000; // в метрах
  const angularDistance = distance / earthRadius;
  const bearingRad = bearing * Math.PI / 180;

  const lat1 = startLatitude * Math.PI / 180;
  const lon1 = startLongitude * Math.PI / 180;

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angularDistance) +
    Math.cos(lat1) * Math.sin(angularDistance) * Math.cos(bearingRad)
  );

  let lon2 = lon1 + Math.atan2(
    Math.sin(bearingRad) * Math.sin(angularDistance) * Math.cos(lat1),
    Math.cos(angularDistance) - Math.sin(lat1) * Math.sin(lat2)
  );

  // Нормализация долготы до -180…+180
  lon2 = (lon2 + 3 * Math.PI) % (2 * Math.PI) - Math.PI;

  return {
    endLatitude: lat2 * 180 / Math.PI,
    endLongitude: lon2 * 180 / Math.PI,
  };
}

const reverseGeocode = async (lat, lon) => {
  const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&zoom=18`;
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'MyTourGuideApp/0.1 (necrocodil@gmail.com)' // замените на свои данные
      }
    });
    const data = await response.json();
    console.log("Полученный ответ от Nominatim:", data);
    return data;
  } catch (error) {
    console.error("Ошибка обратного геокодирования:", error);
    return null;
  }
};

useEffect(() => {
      checkCameraPermission();
  }, []);


  useEffect(() => {
    // Prefer back camera, fallback to front
    // @ts-ignore vision-camera types differ across versions
    const chosen = (devices as any)?.back || (devices as any)?.front || null;
    setDeviceToUse(chosen);
  }, [devices]);

  // Continuously update true heading in state
  useEffect(() => {
    if (calibratedHeading == null) return;
    const trueHeading = (calibratedHeading + (magneticDeclination ?? 0) + 360) % 360;
    setCompassDirection(trueHeading);
  }, [calibratedHeading, magneticDeclination]);

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
        <Button title="Открыть настройки" onPress={() => Linking.openSettings()} />
        <Button title="Проверить разрешения" onPress={checkCameraPermission} />
      </View>
    );
  }

 if (!deviceToUse) {
    console.log('Нет доступных камер, показываем сообщение...');
    return (
      <View style={styles.center}>
        <Text>Нет доступных камер.</Text>
      </View>
    );
  }

  
  
const takePhoto = async () => {
  if (!camera.current) {
    console.log('TakePhoto: ref missing');
    return;
  }
  if (isCalibrating || calibratedHeading === null) {
  console.log("Компас ещё калибруется, пожалуйста, подождите.");
  return;
  }
  if (loadingLocation) {
    console.log("Местоположение ещё загружается, пожалуйста, подождите.");
    return;
  }
  
  try {
    const photo = await camera.current.takePhoto();
    await RNFS.mkdir(savePath);
    const filePath = `${savePath}/photo_${Date.now()}.jpg`;
    console.log('PhotoPath:', filePath);
    await RNFS.moveFile(photo.path, filePath);
    

    // true heading is tracked continuously via effect

	
	const computeEndCoordinates = async (distance) => {
        if (!coordinates) {
    console.log("Сначала нужно получить координаты");
        return null;
	}
	const bearing = ((calibratedHeading ?? 0) + (magneticDeclination ?? 0) + 360) % 360;
	const startLatitude = coordinates.latitude
	const startLongitude = coordinates.longitude
	const result = getDestinationPoint(startLatitude, startLongitude, bearing, distance);
	
	
	const geoData = await reverseGeocode(result.endLatitude, result.endLongitude);
        if (geoData && geoData.address) {
          // Например, можно сохранить полный форматированный адрес
          setAddress(geoData.display_name);
          console.log("Полученный адрес:", geoData.display_name);
        } else {
          console.log("Адрес не найден");
        }
		
		return {
    geoData,
    endLatitude: result.endLatitude,
    endLongitude: result.endLongitude,
  };
		
	};

const findBuildingAddress = async () => {
  const initialDistance = 1;  // Начинаем с 1 метра
  const maxDistance = 64;     // Максимальное расстояние поиска
  let distance = initialDistance;
  let found = false;

  while (distance <= maxDistance && !found) {
    const result = await computeEndCoordinates(distance);

    if (result && result.geoData && result.geoData.address) {
      if (result.geoData.address.house_number) {
        console.log(`Здание найдено на расстоянии ${distance} м:`, result.geoData.display_name);
        setAddress(result.geoData.display_name);
        found = true;
        break;
      } else {
        console.log(`На расстоянии ${distance} м найден адрес типа "${result.geoData.type}", но без номера дома.`);
      }
    } else {
      console.log(`Не удалось получить данные на расстоянии ${distance} м.`);
    }

    distance *= 2; // Увеличиваем расстояние в 2 раза
  }

  if (!found) {
    console.log("Здание не найдено в пределах заданного диапазона.");
  }
};

	// После того как вы получили координаты и compassDirection...
await findBuildingAddress();

  } catch (err) {
    console.log('takePhoto: error', err);
  }
};
  
return (

    <View style={styles.container}>
{isCalibrating && (
  <View style={styles.calibrationOverlay}>
    <ActivityIndicator size="large" color="#fff" />
    <Text style={styles.calibrationOverlayText}>
      {calibrationMessage || "Калибровка компаса..."}
    </Text>
    <Text style={styles.calibrationOverlayText}>
      {`Семплов: ${sampleCount} / ${NUM_CALIBRATION_SAMPLES}`}
    </Text>
    <TouchableOpacity style={styles.finishButton} onPress={finishCalibration}>
      <Text style={styles.finishButtonText}>Завершить калибровку</Text>
    </TouchableOpacity>
  </View>
)}
<Camera
        key={deviceToUse.id}
        ref={camera}
        style={StyleSheet.absoluteFill}
        device={deviceToUse}
        isActive={true}
		photo={true} // Включает возможность съемки фото
      />
<TouchableOpacity style={styles.calibrateButton} onPress={calibrate}>
         <Text style={styles.calibrateButtonText}>Калибровать</Text>
      </TouchableOpacity>
	  
<TouchableOpacity style={styles.captureButton} onPress={takePhoto}>
      </TouchableOpacity>
	  
{coordinates ? (
	<View style={styles.coordinatesContainer}>
        <Text style={styles.coordinatesText}>
          {`Lat: ${coordinates.latitude.toFixed(6)}`}
        </Text>
        <Text style={styles.coordinatesText}>
          {`Lon: ${coordinates.longitude.toFixed(6)}`}
        </Text>
        <Text style={styles.coordinatesText}>
                {`Dir: ${compassDirection}°`}
              </Text>
      </View>
	  ) : (
  <View style={styles.coordinatesContainer}>
    <Text style={styles.coordinatesText}>Определяется местоположение...</Text>
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

    {/* Simple compass visualization */}
    <View style={styles.compassContainer}>
      <View style={styles.compassCircle}>
        <View
          style={[
            styles.compassNeedle,
            { transform: [{ rotate: `${Math.round(compassDirection ?? 0)}deg` }] },
          ]}
        />
        <Text style={styles.compassText}>{`${Math.round(compassDirection ?? 0)}°`}</Text>
      </View>
    </View>
    </View>
  );
};

 
const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center'},
  
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
  width: width * 0.50,
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
  width: width * 0.20, // 20% ширины экрана
  height: width * 0.20, // Делаем кнопку круглой
  borderRadius: width * 0.1, // Половина ширины = круг
  borderWidth: width * 0.01, // 1% ширины экрана
  borderColor: 'rgba(255, 255, 255, 0.3)', // Белый с прозрачностью 30%
  backgroundColor: 'transparent',
},
   
crosshairContainer: {
  // Добавлено: контейнер для кроссхэйра, центрированный на экране
  position: 'absolute',
  top: '50%',
  left: '50%',
  width: width * 0.15,
  height: width * 0.15,
  transform: [{ translateX: -(width * 0.075) }, { translateY: -(width * 0.075) }],
},
crosshairHorizontal: {
  // Изменено: горизонтальная линия внутри контейнера
  position: 'absolute',
  backgroundColor: 'white',
  opacity: 0.3,
  width: '100%',
  height: width * 0.01,
  top: '50%',
  transform: [{ translateY: -(width * 0.005) }],
},
crosshairVertical: {
  // Добавлено: вертикальная линия внутри контейнера
  position: 'absolute',
  backgroundColor: 'white',
  opacity: 0.3,
  height: '100%',
  width: width * 0.01,
  left: '50%',
  transform: [{ translateX: -(width * 0.005) }],
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
// Compass styles
compassContainer: {
  position: 'absolute',
  top: 10,
  left: 10,
},
compassCircle: {
  width: 80,
  height: 80,
  borderRadius: 40,
  backgroundColor: 'rgba(0,0,0,0.4)',
  borderWidth: 1,
  borderColor: 'rgba(255,255,255,0.25)',
  justifyContent: 'center',
  alignItems: 'center',
},
compassNeedle: {
  position: 'absolute',
  width: 2,
  height: 34,
  backgroundColor: '#ff5252',
  top: 6,
  borderRadius: 1,
},
compassText: {
  position: 'absolute',
  bottom: 6,
  color: '#fff',
  fontSize: 12,
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
