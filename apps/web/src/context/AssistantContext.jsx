import { useCallback, useMemo, useRef } from "react";
import { AssistantSituationContext } from "./assistantSituation";

/**
 * AssistantProvider — lets a page tell the assistant popup what the person is
 * actually looking at.
 *
 * The popup is mounted in App.jsx, a sibling of the router, so it cannot read
 * page state. Before this existed it scraped an event id out of the URL, which
 * works for the authority consoles (/authority/events/:id/...) but never for the
 * citizen app — /citizen carries no id, so every citizen question reached the
 * model with no idea which event, where the person was standing, or what
 * language they were reading. It answered from nothing, which is exactly why it
 * felt like it "can't access anything".
 *
 * Deliberately ref-backed, with no state and no re-renders. A citizen's GPS fix
 * lands roughly once a second; routing that through setState would re-render the
 * chat panel (and re-run its streaming effects) on every fix. The popup needs
 * the situation at two moments only — when it opens and when a message is sent —
 * and both are user events that can read the ref directly.
 *
 * Pages publish; the assistant reads. Nothing here is persisted, and nothing
 * leaves the browser until the person sends a message.
 */

/** Fields a page may publish. Anything else is ignored. */
const FIELDS = ["eventId", "eventName", "lat", "lng", "heading", "lang", "sharing"];

export function AssistantProvider({ children }) {
  const situationRef = useRef({});

  /**
   * Merge a partial situation. Safe to call from an effect on every render — it
   * never triggers one. Passing null/undefined for a field removes it, so a
   * citizen who turns location sharing back off actually stops being located.
   */
  const publish = useCallback((patch) => {
    if (!patch || typeof patch !== "object") return;
    const next = { ...situationRef.current };
    for (const key of FIELDS) {
      if (key in patch) {
        const value = patch[key];
        if (value === null || value === undefined) delete next[key];
        else next[key] = value;
      }
    }
    situationRef.current = next;
  }, []);

  /** Drop everything — used when the page unmounts or the citizen leaves an event. */
  const clear = useCallback(() => {
    situationRef.current = {};
  }, []);

  /** The newest published situation. Read on open/send, never during render. */
  const getSituation = useCallback(() => situationRef.current, []);

  const value = useMemo(() => ({ publish, clear, getSituation }), [publish, clear, getSituation]);

  return (
    <AssistantSituationContext.Provider value={value}>{children}</AssistantSituationContext.Provider>
  );
}
