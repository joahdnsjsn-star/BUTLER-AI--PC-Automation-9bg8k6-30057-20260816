/**
 * PurchaseContext — Global subscription tier state
 * Provides tier info, purchase actions, and saved PC profiles
 * to any component tree without prop drilling.
 *
 * Wrap the app root with <PurchaseProvider> in app/_layout.tsx.
 */

import React, {
  createContext, useContext, useEffect, useState,
  useCallback, ReactNode,
} from 'react';
import { remoteAccessTiers, TierID, TIERS, Tier, SavedPC } from '@/services/remoteAccessTiers';

interface PurchaseContextValue {
  tier:          TierID;
  tierData:      Tier;
  isLoaded:      boolean;
  isRemote:      boolean;
  isPro:         boolean;
  isElite:       boolean;
  isTeam:        boolean;
  canMultiPC:    boolean;
  maxPCs:        number;
  savedPCs:      SavedPC[];
  purchase:      (tier: TierID, isYearly?: boolean) => Promise<{ success: boolean; error?: string }>;
  restore:       () => Promise<{ success: boolean; tier: TierID; error?: string }>;
  downgrade:     () => Promise<void>;
  savePCProfile: (pc: Omit<SavedPC, 'id'>) => Promise<SavedPC>;
  deletePCProfile:(id: string) => Promise<void>;
  setPrimary:    (id: string) => Promise<void>;
  refresh:       () => void;
}

const PurchaseContext = createContext<PurchaseContextValue | undefined>(undefined);

export function PurchaseProvider({ children }: { children: ReactNode }) {
  const [tier,    setTier]    = useState<TierID>('free');
  const [loaded,  setLoaded]  = useState(false);
  const [savedPCs, setSavedPCs] = useState<SavedPC[]>([]);

  const syncState = useCallback(() => {
    setTier(remoteAccessTiers.getTier());
    setSavedPCs(remoteAccessTiers.getSavedPCs());
    setLoaded(remoteAccessTiers.isLoaded());
  }, []);

  useEffect(() => {
    const unsub = remoteAccessTiers.subscribe(() => syncState());
    remoteAccessTiers.init().then(syncState);
    return unsub;
  }, []);

  const purchase = useCallback(async (t: TierID, isYearly = false) => {
    const result = await remoteAccessTiers.purchase(t, isYearly);
    syncState();
    return result;
  }, []);

  const restore = useCallback(async () => {
    const result = await remoteAccessTiers.restore();
    syncState();
    return result;
  }, []);

  const downgrade = useCallback(async () => {
    await remoteAccessTiers.downgrade();
    syncState();
  }, []);

  const savePCProfile = useCallback(async (pc: Omit<SavedPC, 'id'>) => {
    const saved = await remoteAccessTiers.savePCProfile(pc);
    syncState();
    return saved;
  }, []);

  const deletePCProfile = useCallback(async (id: string) => {
    await remoteAccessTiers.deletePCProfile(id);
    syncState();
  }, []);

  const setPrimary = useCallback(async (id: string) => {
    await remoteAccessTiers.setPrimary(id);
    syncState();
  }, []);

  return (
    <PurchaseContext.Provider value={{
      tier,
      tierData:   TIERS[tier],
      isLoaded:   loaded,
      isRemote:   remoteAccessTiers.isRemote(),
      isPro:      remoteAccessTiers.isPro(),
      isElite:    remoteAccessTiers.isElite(),
      isTeam:     remoteAccessTiers.isTeam(),
      canMultiPC: remoteAccessTiers.canMultiPC(),
      maxPCs:     remoteAccessTiers.maxPCs(),
      savedPCs,
      purchase,
      restore,
      downgrade,
      savePCProfile,
      deletePCProfile,
      setPrimary,
      refresh: syncState,
    }}>
      {children}
    </PurchaseContext.Provider>
  );
}

export function usePurchase(): PurchaseContextValue {
  const ctx = useContext(PurchaseContext);
  if (!ctx) throw new Error('usePurchase must be used within PurchaseProvider');
  return ctx;
}
