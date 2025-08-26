import {useEffect, useRef, useState} from 'react';
import {PermissionsAndroid, Platform} from 'react-native';
import Geolocation from 'react-native-geolocation-service';

const requestLocationPermission = async () => {
  try {
    if (Platform.OS === 'android') {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      );
      return granted === PermissionsAndroid.RESULTS.GRANTED;
    }
    // iOS
    const auth = await Geolocation.requestAuthorization('whenInUse');
    return auth === 'granted' || auth === 'authorized';
  } catch (error) {
    console.error('Ошибка запроса разрешения:', error);
    return false;
  }
};

const getMagneticDeclination = async (lat, lon) => {
  try {
    const apiKey = 'zNEw7';
    const response = await fetch(
      `https://www.ngdc.noaa.gov/geomag-web/calculators/calculateDeclination?lat1=${lat}&lon1=${lon}&key=${apiKey}&resultFormat=json`,
    );
    const data = await response.json();
    if (data.result && data.result.length > 0) {
      return data.result[0].declination;
    } else {
      console.error('Нет данных о склонении');
      return 0;
    }
  } catch (error) {
    console.error('Ошибка при запросе склонения:', error);
    return 0;
  }
};

const distMeters = (lat1, lon1, lat2, lon2) => {
  const toRad = d => (d * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

export const useLocationAndDeclination = () => {
  // Объявляем состояния один раз
  const [coordinates, setCoordinates] = useState(null);
  const [accuracy, setAccuracy] = useState(null);
  const [magneticDeclination, setMagneticDeclinationState] = useState(0);
  const [loadingLocation, setLoadingLocation] = useState(true);

  const watchIdRef = useRef(null);
  const lastDeclRef = useRef({lat: null, lon: null, ts: 0});
  const lastPositionsRef = useRef([]);

  const pushPosition = (lat, lon) => {
    lastPositionsRef.current.push({lat, lon});
    if (lastPositionsRef.current.length > 5) {
      lastPositionsRef.current.shift();
    }
    const len = lastPositionsRef.current.length;
    const avgLat =
      lastPositionsRef.current.reduce((s, p) => s + p.lat, 0) / len;
    const avgLon =
      lastPositionsRef.current.reduce((s, p) => s + p.lon, 0) / len;
    return {latitude: avgLat, longitude: avgLon};
  };

  useEffect(() => {
    let mounted = true;

    const start = async () => {
      const granted = await requestLocationPermission();
      if (!granted) {
        setLoadingLocation(false);
        return;
      }

      const handlePosition = async ({coords}) => {
        const {latitude, longitude, accuracy: acc} = coords || {};
        if (typeof acc === 'number' && acc > 50) {
          return;
        }
        if (!mounted) return;
        const averaged = pushPosition(latitude, longitude);
        setCoordinates(averaged);
        setAccuracy(typeof acc === 'number' ? Math.round(acc) : null);
        setLoadingLocation(false);

        // Update declination only when needed (first fix, >1km move, or >6h elapsed)
        const last = lastDeclRef.current;
        const needDeclination =
          !last.lat ||
          !last.lon ||
          distMeters(latitude, longitude, last.lat, last.lon) > 1000 ||
          Date.now() - last.ts > 6 * 60 * 60 * 1000;

        if (needDeclination) {
          try {
            const decl = await getMagneticDeclination(latitude, longitude);
            if (!mounted) return;
            setMagneticDeclinationState(decl);
            lastDeclRef.current = {
              lat: latitude,
              lon: longitude,
              ts: Date.now(),
            };
          } catch (e) {
            // noop, keep last known declination
          }
        }
      };

      Geolocation.getCurrentPosition(
        handlePosition,
        error => {
          console.log('Ошибка получения позиции:', error);
          setLoadingLocation(false);
        },
        {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 0,
          accuracy: {android: 'high', ios: 'best'},
        },
      );

      // Continuous updates, ~5s, with high accuracy and jitter control
      watchIdRef.current = Geolocation.watchPosition(
        handlePosition,
        error => {
          console.log('Ошибка получения позиции:', error);
          setLoadingLocation(false);
        },
        {
          enableHighAccuracy: true,
          distanceFilter: 13,
          interval: 5000,
          fastestInterval: 2000,
          maximumAge: 0,
          forceRequestLocation: true,
          showLocationDialog: true,
          accuracy: {android: 'high', ios: 'best'},
        },
      );
    };

    start();

    return () => {
      mounted = false;
      if (watchIdRef.current != null) {
        Geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, []);

  return {coordinates, accuracy, magneticDeclination, loadingLocation};
};
