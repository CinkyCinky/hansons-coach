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

// ── Chat: perzistentná história konverzácie ────────────────────────────────────
// Appka je PWA a medzi Plánom a Trénerom sa preklikáva neustále. Keď história žila
// len v stave stránky, každé prepnutie záložky ju zmazalo a zverenec stratil kontext.
// Preto ju držíme v store (prežije prepnutie záložky) a zrkadlíme do sessionStorage
// (prežije aj obnovenie stránky).
const CHAT_KEY = "hansons_chat_v1";
// Strop histórie — konverzácia nesmie rásť donekonečna (pamäť aj kvóta sessionStorage).
// Do backendu sa aj tak posiela len história z aktuálne zobrazených správ.
const CHAT_MAX_MESSAGES = 100;
// Po 12 hodinách je stará konverzácia už len mätúci kontext — vtedy začíname načisto
// (a zverenec dostane nový pozdrav s aktuálnym tréningom).
const CHAT_MAX_AGE = 12 * 60 * 60 * 1000;

export interface ChatMessage {
  id: string;
  role: "user" | "model";
  content: string;
  ts: number;   // čas správy (Date.now())
}

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

  // Chat
  chatMessages: ChatMessage[];
  chatUpdatedAt: number | null;   // čas poslednej správy — podľa neho vieme, či je história ešte aktuálna
  // Bola už sessionStorage prečítaná? Kým nie, chat nesmie nasadiť pozdrav —
  // inak by sa prilepil nad konverzáciu, ktorá sa o chvíľu obnoví.
  chatRestored: boolean;

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
  // Prijíma pole aj updater — updater je bezpečnejší počas streamovania odpovede.
  setChatMessages: (next: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => void;
  clearChatMessages: () => void;
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

  chatMessages: [],
  chatUpdatedAt: null,
  chatRestored: false,

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

  const setChatMessages = useCallback(
    (next: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => {
      setState((s) => {
        const resolved = typeof next === "function" ? next(s.chatMessages) : next;
        // Strop histórie: najstaršie správy zahadzujeme, novšie (a teda relevantné) ostávajú.
        const trimmed =
          resolved.length > CHAT_MAX_MESSAGES ? resolved.slice(resolved.length - CHAT_MAX_MESSAGES) : resolved;
        return { ...s, chatMessages: trimmed, chatUpdatedAt: trimmed.length ? Date.now() : null };
      });
    },
    []
  );

  // „Nová konverzácia" — vymaže históriu aj jej kópiu v sessionStorage.
  const clearChatMessages = useCallback(() => {
    setState((s) => ({ ...s, chatMessages: [], chatUpdatedAt: null }));
    try {
      sessionStorage.removeItem(CHAT_KEY);
    } catch {
      /* sessionStorage nedostupná (privátny režim) — v pamäti je konverzácia už zmazaná */
    }
  }, []);

  // Obnova histórie zo sessionStorage — raz pri štarte appky.
  // Beží AŽ po efektoch detí (tak to React robí), takže ak medzitým chat dostal seed
  // z generátora alebo zverenec stihol odoslať prvú správu, obnovu preskočíme —
  // prepísali by sme živú konverzáciu.
  const chatRestoreRef = useRef(false);
  useEffect(() => {
    if (chatRestoreRef.current) return;
    chatRestoreRef.current = true;

    let restored: ChatMessage[] = [];
    let updatedAt: number | null = null;
    try {
      const raw = sessionStorage.getItem(CHAT_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        const savedAt = Number(parsed?.updatedAt) || 0;
        if (savedAt && Date.now() - savedAt <= CHAT_MAX_AGE) {
          // Obsah storage môže byť po zmene formátu čokoľvek — preto tvrdá kontrola tvaru.
          restored = (Array.isArray(parsed?.messages) ? parsed.messages : [])
            .filter(
              (m: any) =>
                m && (m.role === "user" || m.role === "model") && typeof m.content === "string" && m.content !== ""
            )
            .map((m: any, i: number) => ({
              id: typeof m.id === "string" && m.id ? m.id : `restored-${i}`,
              role: m.role as "user" | "model",
              content: m.content as string,
              ts: Number(m.ts) || savedAt,
            }))
            .slice(-CHAT_MAX_MESSAGES);
          // Konverzáciu, v ktorej zverenec nič nenapísal, NEobnovujeme. Bol by to len
          // automatický pozdrav — a ten nesie dnešný tréning a aktuálnu Body Battery.
          // Po refreshi (aj cez polnoc) by tvrdil „Dnes ťa čaká…" o včerajšku a nový,
          // správny pozdrav by sa už nenasadil.
          if (!restored.some((m) => m.role === "user")) {
            restored = [];
            sessionStorage.removeItem(CHAT_KEY);
          }
          updatedAt = restored.length ? savedAt : null;
        } else {
          sessionStorage.removeItem(CHAT_KEY);
        }
      }
    } catch {
      /* nečitateľná alebo nedostupná sessionStorage — pokračujeme s prázdnou históriou */
    }

    setState((s) =>
      s.chatMessages.length > 0
        ? { ...s, chatRestored: true }
        : { ...s, chatMessages: restored, chatUpdatedAt: updatedAt, chatRestored: true }
    );
  }, []);

  // Zrkadlenie do sessionStorage. Odložené o 300 ms, lebo počas streamovania odpovede
  // sa stav mení pri každom tokene a zapisovať pri každom by bolo zbytočne drahé.
  useEffect(() => {
    if (!state.chatRestored) return; // kým sme storage neprečítali, nemáme čo prepisovať
    const t = setTimeout(() => {
      try {
        if (!state.chatMessages.length) {
          sessionStorage.removeItem(CHAT_KEY);
          return;
        }
        const payload = {
          v: 1,
          updatedAt: state.chatUpdatedAt ?? Date.now(),
          messages: state.chatMessages,
        };
        try {
          sessionStorage.setItem(CHAT_KEY, JSON.stringify(payload));
        } catch {
          // Plná kvóta (dlhé odpovede trénera sa vedia nazbierať) — radšej ulož aspoň
          // posledných 20 správ, než by sme prišli o históriu celú.
          sessionStorage.setItem(
            CHAT_KEY,
            JSON.stringify({ ...payload, messages: state.chatMessages.slice(-20) })
          );
        }
      } catch {
        /* privátny režim alebo trvalo plná kvóta — appka funguje aj bez perzistencie */
      }
    }, 300);
    return () => clearTimeout(t);
  }, [state.chatMessages, state.chatUpdatedAt, state.chatRestored]);

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
        setChatMessages,
        clearChatMessages,
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
