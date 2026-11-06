// The one place that adds or removes a title from the plan, so every page behaves
// the same way (same messages, same Undo).

import { addToDraft, clearDraft, getDraft, isInDraft, removeFromDraft, saveDraft } from "./storage.js";
import { showToast } from "./layout.js";

/**
 * Toggles a title in the plan and shows a toast with Undo.
 * @param {{id: number, title: string}} item
 * @returns {{ok: boolean, added: boolean}} ok is false when storage is blocked or full
 */
export function togglePlan(item) {
  if (isInDraft(item.id)) {
    const result = removeFromDraft(item.id);
    if (!result.ok) return { ok: false, added: false };
    // Undo puts the title back in the same position, so the watch order is unchanged.
    showToast(`Removed ${item.title} from your plan`, { tone: "removed", action: { label: "Undo", onClick: () => addToDraft(item.id, { index: result.index }) } });
    return { ok: true, added: false };
  }
  const result = addToDraft(item.id);
  if (!result.ok) return { ok: false, added: false };
  showToast(`Added ${item.title} to your plan`, { action: { label: "Undo", onClick: () => removeFromDraft(item.id) } });
  return { ok: true, added: true };
}

/**
 * Empties the plan (keeping the chosen evenings and hours) and offers Undo, which
 * puts every title back in its original order.
 * @returns {{ok: boolean, cleared: boolean}}
 */
export function clearPlan() {
  const previous = getDraft().titleIds;
  if (previous.length === 0) return { ok: true, cleared: false };
  if (!clearDraft().ok) return { ok: false, cleared: false };
  showToast("Plan cleared", {
    tone: "removed",
    duration: 6000,
    action: { label: "Undo", onClick: () => saveDraft({ ...getDraft(), titleIds: previous }) },
  });
  return { ok: true, cleared: true };
}
