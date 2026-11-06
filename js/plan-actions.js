// The one place that adds or removes a title from the plan, so every page behaves
// the same way (same messages, same Undo).

import { addToDraft, removeFromDraft, isInDraft } from "./storage.js";
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
    showToast(`Removed ${item.title} from your plan`, { tone: "removed", action: { label: "Undo", onClick: () => addToDraft(item.id) } });
    return { ok: true, added: false };
  }
  const result = addToDraft(item.id);
  if (!result.ok) return { ok: false, added: false };
  showToast(`Added ${item.title} to your plan`, { action: { label: "Undo", onClick: () => removeFromDraft(item.id) } });
  return { ok: true, added: true };
}
