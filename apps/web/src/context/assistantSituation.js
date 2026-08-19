import { createContext, useContext } from "react";

/**
 * The situation channel shared between a page and the assistant popup.
 *
 * Split out of AssistantContext.jsx on purpose: that file exports the provider
 * component, and a module which exports both a component and a plain hook
 * breaks React Fast Refresh (eslint react-refresh/only-export-components).
 * Context object + hook live here; the component lives there.
 *
 * Shape published by pages (all optional):
 *   { eventId, eventName, lat, lng, heading, lang, sharing }
 */
export const AssistantSituationContext = createContext(null);

/**
 * Pages call `publish` to describe what the person is looking at; the assistant
 * calls `getSituation` when it opens and when a message is sent.
 *
 * The returned object is stable, so `publish` is safe in an effect's dependency
 * array without re-running the effect.
 */
export function useAssistantSituation() {
  const ctx = useContext(AssistantSituationContext);
  if (!ctx) throw new Error("useAssistantSituation must be used inside an AssistantProvider");
  return ctx;
}
