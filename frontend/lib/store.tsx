"use client";

/**
 * lib/store.tsx — Globálny dátový store
 *
 * Drží všetky Garmin dáta v pamäti počas celej session.
 * Preklikávanie medzi stránkami NEVYVOLÁ nové API volania.
 * Refresh button zavolá invalidateAll() → načíta znovu.
 *
 * Cache TTL:
 *  - dashboard: 10 minút
 *  - plan:      30 minút
 *  - report:    60 minút
 */

import React, { createContext, useContext, useRef, useState, useCallback, ReactNode, useEffect } from "react";
import {
  fetchDashboard,
  fetchScheduledPlan,
  fetchWeeklyReport,
  fetchDashboardAdvice,
} from "@/lib/api";

const TTL = {
  dashboard: 10 * 60 * 1000,
  plan: 30 * 60 * 1000,
  report: 60 * 60 * 1000,
};

export interface ChatSeed {
  userText: string;      // úvodná „správa od zverenca" (zhrnutie plánu) — viditeľná v chate
  coachMessage: string;  // pôvodná správa trénera z generátora (zobrazí sa ako odpoveď trénera)
}

interface StoreState {
  // Dashboard
  dashboard: any | null;
  dashboardLoadedAt: number | null;
  dashboardLoading: boolean;
  dashboardError: string | null;
  advice: string | null;

  // Handoff z generátora plánu do chatu (jednorazový seed konverzácie)
  chatSeed: ChatSeed | null;

  // Plan
  plan: any[] | null;
  planCancelledSos: any[] | null;   // SOS zrušené (odstránené z kalendára), z /api/plan/scheduled
  planLoadedAt: number | null;
  planLoading: boolean;
  planError: string | null;

  // Report
  report: any | null;
  reportLoadedAt: number | null;
  reportLoading: boolean;
  reportError: string | null;
}

interface StoreActions {
  loadDashboard: (force?: boolean) => Promise<void>;
  loadPlan: (force?: boolean) => Promise<void>;
  loadReport: (force?: boolean) => Promise<void>;
  invalidateAll: () => void;
  setPlanWorkouts: (workouts: any[]) => void;
  setChatSeed: (seed: ChatSeed | null) => void;
}

type StoreContextType = StoreState & StoreActions;

const StoreContext = createContext<StoreContextType | null>(null);

const initialState: StoreState = {
  dashboard: null,
  dashboardLoadedAt: null,
  dashboardLoading: false,
  dashboardError: null,
  advice: null,

  chatSeed: null,

  plan: null,
  planCancelledSos: null,
  planLoadedAt: null,
  planLoading: false,
  planError: null,

  report: null,
  reportLoadedAt: null,
  reportLoading: false,
  reportError: null,
};

export function AppStoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<StoreState>(initialState);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(console.error);
    }
  }, []);

  // Track in-flight requests to avoid duplicate calls
  const loadingRef = useRef({ dashboard: false, plan: false, report: false });

  const isStale = (loadedAt: number | null, ttl: number) => {
    if (!loadedAt) return true;
    return Date.now() - loadedAt > ttl;
  };

  const loadDashboard = useCallback(async (force = false) => {
    if (loadingRef.current.dashboard) return;
    if (!force && !isStale(state.dashboardLoadedAt, TTL.dashboard)) return;

    loadingRef.current.dashboard = true;
    setState((s) => ({ ...s, dashboardLoading: true, dashboardError: null }));

    try {
      const data = await fetchDashboard(force);
      setState((s) => ({
        ...s,
        dashboard: data,
        dashboardLoadedAt: Date.now(),
        dashboardLoading: false,
        advice: null, // reset advice on refresh
      }));

      // Načítaj advice na pozadí
      if (data) {
        try {
          const adviceData = await fetchDashboardAdvice({
            sleep_score: data.sleep?.score,
            hrv_status: data.hrv?.status,
            body_battery: data.stats?.body_battery,
            readiness: data.readiness?.readiness_score,
          });
          setState((s) => ({ ...s, advice: adviceData.advice }));
        } catch {
          // Advice je bonus, ignorujeme chybu
        }
      }
    } catch (err: any) {
      setState((s) => ({
        ...s,
        dashboardLoading: false,
        dashboardError: err.message || "Nepodarilo sa načítať dáta z Garminu.",
      }));
    } finally {
      loadingRef.current.dashboard = false;
    }
  }, [state.dashboardLoadedAt]);

  const loadPlan = useCallback(async (force = false) => {
    if (loadingRef.current.plan) return;
    if (!force && !isStale(state.planLoadedAt, TTL.plan)) return;

    loadingRef.current.plan = true;
    setState((s) => ({ ...s, planLoading: true, planError: null }));

    try {
      const data = await fetchScheduledPlan();
      const sorted = (data?.workouts || []).sort(
        (a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime()
      );
      setState((s) => ({
        ...s,
        plan: sorted,
        planCancelledSos: data?.cancelled_sos ?? [],
        planLoadedAt: Date.now(),
        planLoading: false,
      }));
    } catch (err: any) {
      setState((s) => ({
        ...s,
        planLoading: false,
        planError: err.message || "Nepodarilo sa načítať plán.",
      }));
    } finally {
      loadingRef.current.plan = false;
    }
  }, [state.planLoadedAt]);

  const loadReport = useCallback(async (force = false) => {
    if (loadingRef.current.report) return;
    if (!force && !isStale(state.reportLoadedAt, TTL.report)) return;

    loadingRef.current.report = true;
    setState((s) => ({ ...s, reportLoading: true, reportError: null }));

    try {
      const data = await fetchWeeklyReport(force);
      setState((s) => ({
        ...s,
        report: data,
        reportLoadedAt: Date.now(),
        reportLoading: false,
      }));
    } catch (err: any) {
      setState((s) => ({
        ...s,
        reportLoading: false,
        reportError: err.message || "Nepodarilo sa načítať report.",
      }));
    } finally {
      loadingRef.current.report = false;
    }
  }, [state.reportLoadedAt]);

  const invalidateAll = useCallback(() => {
    setState((s) => ({
      ...s,
      dashboardLoadedAt: null,
      planLoadedAt: null,
      reportLoadedAt: null,
      advice: null,
    }));
  }, []);

  const setPlanWorkouts = useCallback((workouts: any[]) => {
    setState((s) => ({ ...s, plan: workouts }));
  }, []);

  const setChatSeed = useCallback((seed: ChatSeed | null) => {
    setState((s) => ({ ...s, chatSeed: seed }));
  }, []);

  return (
    <StoreContext.Provider
      value={{
        ...state,
        loadDashboard,
        loadPlan,
        loadReport,
        invalidateAll,
        setPlanWorkouts,
        setChatSeed,
      }}
    >
      {children}
    </StoreContext.Provider>
  );
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used inside AppStoreProvider");
  return ctx;
}
