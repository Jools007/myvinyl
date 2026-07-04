import { useCallback, useEffect, useState } from 'react';
import type { GeolocationState } from '../types';

export function useGeolocation(enabled: boolean) {
  const [state, setState] = useState<GeolocationState>({ status: 'idle' });

  const requestLocation = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setState({
        status: 'error',
        message: 'Geolocation is not supported in this browser.',
      });
      return;
    }

    setState({ status: 'requesting' });

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setState({
          status: 'granted',
          position: {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          },
          accuracyMeters: position.coords.accuracy,
        });
      },
      (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          setState({
            status: 'denied',
            message:
              'Location access was denied. Enable location in your browser settings to find nearby record stores.',
          });
          return;
        }
        setState({
          status: 'error',
          message: error.message || 'Could not determine your location.',
        });
      },
      { enableHighAccuracy: true, timeout: 20_000, maximumAge: 0 }
    );
  }, []);

  useEffect(() => {
    if (!enabled) return;
    requestLocation();
  }, [enabled, requestLocation]);

  return { state, requestLocation };
}