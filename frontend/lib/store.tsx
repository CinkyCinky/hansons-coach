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
  errorStatus,
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
  adviceError: string | null;

  // Handoff z generátora plánu do chatu (jednorazový seed konverzácie)
  chatSeed: ChatSeed | null;

  // Plan
  plan: any[] | null;
  planConsistency: any | null;   // scorecard kľúčových SOS (odbehnuté/vynechané/zrušené), z /api/plan/scheduled
  planLoadedAt: number | null;
  planLoading: boolean;
  planError: string | null;

  // Report
  report: any | null;
  reportLoadedAt: number | null;
  reportLoading: boolean;
  reportError: string | null;
  // HTTP stav chyby — Reporty podľa neho rozlíšia vypršané prihlásenie od chyby Garminu
  // spoľahlivo, namiesto hľadania reťazca „401“ v texte hlášky.
  reportErrorStatus: number | null;
}

interface StoreActions {
  loadDashboard: (force?: boolean) => Promise<void>;
  loadAdvice: () => Promise<void>;
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
  adviceError: null,

  chatSeed: null,

  plan: null,
  planConsistency: null,
  planLoadedAt: null,
  planLoading: false,
  planError: null,

  report: null,
  reportLoadedAt: null,
  reportLoading: false,
  reportError: null,
  reportErrorStatus: null,
};

export function AppStoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<StoreState>(initialState);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(console.error);
    }
  }, []);

  // Track in-flight requests to avoid duplicate calls
  const loadingRef = useRef({ dashboard: false, advice: false, plan: false, report: false });

  // Poradové číslo poslednej požiadavky o radu. Boolean guard nestačil: keď zverenec
  // počas generovania rady dal Refresh, staré volanie dobehlo neskôr a zapísalo do stavu
  // radu vypočítanú zo STARÝCH dát dashboardu. Zapisuje len najnovšia požiadavka.
  const adviceSeqRef = useRef(0);

  const isStale = (loadedAt: number | null, ttl: number) => {
    if (!loadedAt) return true;
    return Date.now() - loadedAt > ttl;
  };

  // Rada trénera ide zvlášť od dashboardu: jej výpadok nesmie zhodiť prehľad, ale
  // musí byť viditeľný — inak sa karta „Tréner radí" točí donekonečna.
  const fetchAdviceFor = useCallback(async (data: any) => {
    if (!data) return;

    // Novšia požiadavka prebíja staršiu — žiadne zahadzovanie kliknutí na Refresh.
    const seq = ++adviceSeqRef.current;
    loadingRef.current.advice = true;
    setState((s) => ({ ...s, advice: null, adviceError: null }));

    try {
      const adviceData = await fetchDashboardAdvice({
        sleep_score: data.sleep?.score,
        hrv_status: data.hrv?.status,
        // Živá hodnota — rada má reflektovať aktuálny stav (napr. večer pred behom).
        body_battery: data.stats?.body_battery_now ?? data.stats?.body_battery,
        readiness: data.readiness?.readiness_score,
      });
      // Medzitým bežíme už za novšiu požiadavku → túto (starú) odpoveď zahoď.
      if (seq !== adviceSeqRef.current) return;
      // Prázdna odpoveď je pre používateľa to isté ako chyba — inak by čakal navždy.
      if (!adviceData?.advice) throw new Error("Tréner zatiaľ nevrátil žiadnu radu.");
      setState((s) => ({ ...s, advice: adviceData.advice, adviceError: null }));
    } catch (err: any) {
      if (seq !== adviceSeqRef.current) return;
      setState((s) => ({
        ...s,
        adviceError: err?.message || "Nepodarilo sa načítať radu trénera.",
      }));
    } finally {
      // Príznak zhasína len najnovšia požiadavka — inak by dobiehajúce staré volanie
      // označilo za dokončené aj to, čo ešte beží.
      if (seq === adviceSeqRef.current) loadingRef.current.advice = false;
    }
  }, []);

  const loadDashboard = useCallback(async (force = false) => {
    if (loadingRef.current.dashboard) return;
    if (!force && !isStale(state.dashboardLoadedAt, TTL.dashboard)) return;

    loadingRef.current.dashboard = true;
    setState((s) => ({ ...s, dashboardLoading: true, dashboardError: null }));

    let data: any = null;
    try {
      data = await fetchDashboard(force);
      setState((s) => ({
        ...s,
        dashboard: data,
        dashboardLoadedAt: Date.now(),
        dashboardLoading: false,
        advice: null, // reset advice on refresh
        adviceError: null,
      }));
    } catch (err: any) {
      setState((s) => ({
        ...s,
        dashboardLoading: false,
        dashboardError: err.message || "Nepodarilo sa načítať dáta z Garminu.",
      }));
      return;
    } finally {
      loadingRef.current.dashboard = false;
    }

    // Radu načítavame AŽ ZA in-flight guardom. Kým bola vnútri, guard držal dashboard
    // „zamknutý" po celý čas generovania rady a ďalší Refresh sa ticho zahodil,
    // hoci tlačidlo bolo aktívne.
    await fetchAdviceFor(data);
  }, [state.dashboardLoadedAt, fetchAdviceFor]);

  // Opakovaný pokus z UI (tlačidlo „Skúsiť znova") — dashboard sa nenačítava odznova.
  const loadAdvice = useCallback(async () => {
    await fetchAdviceFor(state.dashboard);
  }, [fetchAdviceFor, state.dashboard]);

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
        planConsistency: data?.consistency ?? null,
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
    setState((s) => ({ ...s, reportLoading: true, reportError: null, reportErrorStatus: null }));

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
        reportErrorStatus: errorStatus(err),
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
      adviceError: null,
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
        loadAdvice,
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
