import { useEffect, useState } from 'react';
import { PermissionsAndroid } from 'react-native';
import Geolocation from 'react-native-geolocation-service';

const requestLocationPermission = async () => {
  try {
    const granted = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
    );
    return granted === PermissionsAndroid.RESULTS.GRANTED;
  } catch (error) {
    console.error("Ошибка запроса разрешения:", error);
    return false;
  }
};

const getMagneticDeclination = async (lat, lon) => {
  try {
    const apiKey = "zNEw7"; 
    const response = await fetch(`https://www.ngdc.noaa.gov/geomag-web/calculators/calculateDeclination?lat1=${lat}&lon1=${lon}&key=${apiKey}&resultFormat=json`);
    const data = await response.json();
    if (data.result && data.result.length > 0) {
      return data.result[0].declination;
    } else {
      console.error("Нет данных о склонении");
      return 0;
    }
  } catch (error) {
    console.error("Ошибка при запросе склонения:", error);
    return 0;
  }
};

export const useLocationAndDeclination = () => {
  // Объявляем состояния один раз
  const [coordinates, setCoordinates] = useState(null);
  const [magneticDeclination, setMagneticDeclinationState] = useState(0);
  const [loadingLocation, setLoadingLocation] = useState(true);

  const requestAndUpdateLocation = () => {
    Geolocation.getCurrentPosition(
      async ({ coords: { latitude, longitude } }) => {
        setCoordinates({ latitude, longitude });
        const declination = await getMagneticDeclination(latitude, longitude);
        setMagneticDeclinationState(declination);
        setLoadingLocation(false);
      },
      (error) => {
        console.log("Ошибка получения позиции:", error);
        setLoadingLocation(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 }
    );
  };

  useEffect(() => {
    requestLocationPermission().then(granted => {
      if (granted) {
        // Вызываем корректную функцию обновления
        requestAndUpdateLocation();
        const interval = setInterval(requestAndUpdateLocation, 60000); // обновление каждую минуту
        return () => clearInterval(interval);
      }
    });
  }, []);

  return { coordinates, magneticDeclination, loadingLocation };
};
