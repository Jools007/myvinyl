import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  isGuestCrate,
  isPersonalCrate,
  PERSONAL_CRATE_SLUG,
  type CollectionCrate,
} from '../lib/collectionContext';
import {
  createGuestCollection,
  deleteGuestCollection,
  ensurePersonalCollection,
  fetchCollections,
  syncCollectionRecordCount,
} from '../lib/collections';
import { loadActiveCrateSlug, saveActiveCrateSlug } from '../lib/crateStorage';

export function useCollections() {
  const { user, loading: authLoading } = useAuth();
  const [available, setAvailable] = useState(false);
  const [crates, setCrates] = useState<CollectionCrate[]>([]);
  const [personalCrate, setPersonalCrate] = useState<CollectionCrate | null>(null);
  const [activeSlug, setActiveSlugState] = useState<string | null>(() => loadActiveCrateSlug());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadGenRef = useRef(0);

  const refreshCrates = useCallback(async () => {
    if (!user) return;

    const generation = ++loadGenRef.current;
    setLoading(true);
    setError(null);

    const ensured = await ensurePersonalCollection();
    if (generation !== loadGenRef.current) return;

    if (!ensured.available) {
      setAvailable(false);
      setCrates([]);
      setPersonalCrate(null);
      setLoading(false);
      return;
    }

    if (ensured.error) {
      setError(ensured.error.message);
      setLoading(false);
      return;
    }

    if (!ensured.crate) {
      setError('Personal crate could not be loaded.');
      setLoading(false);
      return;
    }

    const fetched = await fetchCollections();
    if (generation !== loadGenRef.current) return;

    setAvailable(fetched.available);
    setCrates(fetched.crates);
    setPersonalCrate(ensured.crate);
    setLoading(false);
  }, [user?.id]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setAvailable(false);
      setCrates([]);
      setPersonalCrate(null);
      setLoading(false);
      return;
    }
    void refreshCrates();
  }, [user?.id, authLoading, refreshCrates]);

  const setActiveSlug = useCallback((slug: string | null) => {
    const normalized = slug === PERSONAL_CRATE_SLUG ? null : slug;
    setActiveSlugState(normalized);
    saveActiveCrateSlug(normalized);
  }, []);

  const activeCrate = useMemo(() => {
    if (!available) return personalCrate;
    const slug = activeSlug ?? PERSONAL_CRATE_SLUG;
    return (
      crates.find((c) => c.slug === slug) ??
      personalCrate ??
      crates.find((c) => isPersonalCrate(c)) ??
      null
    );
  }, [available, activeSlug, crates, personalCrate]);

  const isGuestView = activeCrate != null && isGuestCrate(activeCrate);

  const selectCrate = useCallback(
    (crate: CollectionCrate) => {
      setActiveSlug(isPersonalCrate(crate) ? null : crate.slug);
    },
    [setActiveSlug]
  );

  const selectCrateBySlug = useCallback(
    (slug: string | null | undefined) => {
      if (!slug || slug === PERSONAL_CRATE_SLUG) {
        setActiveSlug(null);
        return;
      }
      const match = crates.find((c) => c.slug === slug);
      if (match) setActiveSlug(match.slug);
    },
    [crates, setActiveSlug]
  );

  const importGuestCrate = useCallback(
    async (discogsUsername: string) => {
      const result = await createGuestCollection(discogsUsername);
      if (result.error) return result;
      await refreshCrates();
      if (result.data) setActiveSlug(result.data.slug);
      return result;
    },
    [refreshCrates, setActiveSlug]
  );

  const removeGuestCrate = useCallback(
    async (collectionId: string) => {
      const result = await deleteGuestCollection(collectionId);
      if (result.error) return result;
      if (activeCrate?.id === collectionId) setActiveSlug(null);
      await refreshCrates();
      return result;
    },
    [activeCrate?.id, refreshCrates, setActiveSlug]
  );

  const bumpRecordCount = useCallback(
    async (collectionId: string) => {
      await syncCollectionRecordCount(collectionId);
      await refreshCrates();
    },
    [refreshCrates]
  );

  const guestCrates = useMemo(
    () => crates.filter((c) => isGuestCrate(c)),
    [crates]
  );

  return {
    available,
    loading,
    error,
    crates,
    guestCrates,
    personalCrate,
    activeCrate,
    activeSlug: activeSlug ?? PERSONAL_CRATE_SLUG,
    isGuestView,
    selectCrate,
    selectCrateBySlug,
    setActiveSlug,
    refreshCrates,
    importGuestCrate,
    removeGuestCrate,
    bumpRecordCount,
  };
}