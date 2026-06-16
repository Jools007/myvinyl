import { useCallback, useEffect, useRef, useState } from 'react';
import type { NavPage } from '../components/Navigation';
import {
  buildAppHref,
  currentAppHref,
  locationsEqual,
  readAppLocation,
  type AppLocation,
} from '../lib/appRoute';

type NavigateOptions = {
  replace?: boolean;
};

export function useAppRouter() {
  const [location, setLocation] = useState<AppLocation>(() => readAppLocation());
  const locationRef = useRef(location);
  locationRef.current = location;

  const commit = useCallback((next: AppLocation, options?: NavigateOptions) => {
    if (locationsEqual(locationRef.current, next)) return;

    const href = buildAppHref(next);
    const currentHref = currentAppHref();
    if (href === currentHref) {
      setLocation(next);
      return;
    }
    if (options?.replace) {
      history.replaceState(null, '', href);
    } else {
      history.pushState(null, '', href);
    }
    setLocation(next);
  }, []);

  useEffect(() => {
    const onPopState = () => {
      setLocation(readAppLocation());
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => {
    const parsed = readAppLocation();
    const canonical = buildAppHref(parsed);
    const current = currentAppHref();
    if (current !== canonical) {
      history.replaceState(null, '', canonical);
    }
    if (!locationsEqual(locationRef.current, parsed)) {
      setLocation(parsed);
    }
  }, []);

  const push = useCallback(
    (next: AppLocation) => {
      commit(next);
    },
    [commit]
  );

  const replace = useCallback(
    (next: AppLocation) => {
      commit(next, { replace: true });
    },
    [commit]
  );

  const goToPage = useCallback(
    (
      page: NavPage,
      playSelection?: AppLocation['playSelection'],
      options?: { crateSlug?: string | null }
    ) => {
      const current = locationRef.current;
      push({
        page,
        playSelection: page === 'play' ? (playSelection ?? current.playSelection) : null,
        releaseId: null,
        releaseEdit: false,
        crateSlug: options?.crateSlug ?? current.crateSlug,
      });
    },
    [push]
  );

  const goToPlay = useCallback(
    (playSelection: AppLocation['playSelection'], options?: NavigateOptions) => {
      const current = locationRef.current;
      commit(
        {
          page: 'play',
          playSelection,
          releaseId: null,
          releaseEdit: false,
          crateSlug: current.crateSlug,
        },
        options
      );
    },
    [commit]
  );

  const openRelease = useCallback(
    (recordId: string, edit = false) => {
      const current = locationRef.current;
      push({
        ...current,
        releaseId: recordId,
        releaseEdit: edit,
      });
    },
    [push]
  );

  const closeRelease = useCallback(() => {
    const current = locationRef.current;
    if (!current.releaseId) return;
    replace({
      ...current,
      releaseId: null,
      releaseEdit: false,
    });
  }, [replace]);

  const goToCrate = useCallback(
    (crateSlug: string | null, options?: NavigateOptions) => {
      commit(
        {
          page: 'collection',
          playSelection: null,
          releaseId: null,
          releaseEdit: false,
          crateSlug,
        },
        options
      );
    },
    [commit]
  );

  return {
    location,
    push,
    replace,
    goToPage,
    goToPlay,
    openRelease,
    closeRelease,
    goToCrate,
  };
}