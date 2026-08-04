/** Known equipment values for Install / Removal / Site Survey tasks. */
export const EQUIPMENT_OPTIONS = ["Lift", "Ladder"];

export const EQUIPMENT_OPTION_SET = new Set(EQUIPMENT_OPTIONS);

/** Task types that use the equipment field. */
export const EQUIPMENT_TASK_TYPES = new Set([
  "Install",
  "Removal",
  "Site Survey",
]);

/**
 * @param {string} taskType
 * @returns {boolean}
 */
export function taskTypeUsesEquipment(taskType) {
  return EQUIPMENT_TASK_TYPES.has(taskType);
}

/**
 * Map a raw value to its canonical option label (case-insensitive).
 * @param {string} value
 * @returns {string | null}
 */
function canonicalizeEquipment(value) {
  const lower = value.toLowerCase();
  return EQUIPMENT_OPTIONS.find((o) => o.toLowerCase() === lower) ?? null;
}

/**
 * Normalize and validate equipment from a create/update body.
 * Unknown values are rejected. Non-equipment task types always store [].
 * Empty array means none.
 *
 * @param {unknown} raw
 * @param {string} taskType
 * @returns {string[]}
 */
export function parseEquipment(raw, taskType) {
  if (!taskTypeUsesEquipment(taskType)) return [];
  if (raw == null) return [];
  if (!Array.isArray(raw)) {
    throw Object.assign(new Error("equipment must be an array"), {
      status: 400,
    });
  }
  /** @type {string[]} */
  const out = [];
  const seen = new Set();
  for (const item of raw) {
    const trimmed = String(item ?? "").trim();
    if (!trimmed) continue;
    // "None" is not a selectable value — treat as empty.
    if (trimmed.toLowerCase() === "none") continue;
    const value = canonicalizeEquipment(trimmed);
    if (!value) {
      throw Object.assign(
        new Error(
          `Invalid equipment: ${trimmed}. Allowed: ${EQUIPMENT_OPTIONS.join(", ")}`,
        ),
        { status: 400 },
      );
    }
    if (seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}
