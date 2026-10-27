// Rappel de sauvegarde : fonctions pures (aucun accès au DOM ni au stockage).
export const NUDGE_AFTER_CHECKS = 20; // nouvelles coches depuis la dernière sauvegarde (ou depuis le début)
export const NUDGE_AFTER_DAYS = 30; // jours écoulés depuis la dernière sauvegarde, s'il y a eu des changements
export const SNOOZE_DAYS = 14;

const DAY_MS = 86_400_000;
const dayNumber = (day) => Math.floor(Date.parse(`${day}T00:00:00Z`) / DAY_MS);

export const daysBetween = (from, to) => dayNumber(to) - dayNumber(from);

export function addDays(day, n) {
  return new Date((dayNumber(day) + n) * DAY_MS).toISOString().slice(0, 10);
}

// lastBackup : { day, seenCount } ou null ; snoozeUntil : jour 'AAAA-MM-JJ' ou null ; seenCount : nombre de coches actuel.
export function backupStatus({ lastBackup, snoozeUntil }, seenCount, today) {
  const sinceChecks = seenCount - (lastBackup?.seenCount ?? 0);
  const days = lastBackup ? daysBetween(lastBackup.day, today) : null;
  const changed = lastBackup ? seenCount !== lastBackup.seenCount : seenCount > 0;
  const snoozed = Boolean(snoozeUntil) && snoozeUntil > today;
  const due = !snoozed && changed && (sinceChecks >= NUDGE_AFTER_CHECKS || (days !== null && days >= NUDGE_AFTER_DAYS));
  return { due, days, sinceChecks: Math.max(0, sinceChecks), neverBackedUp: !lastBackup };
}

export function daysAgoLabel(days) {
  if (days <= 0) return "aujourd'hui";
  if (days === 1) return 'hier';
  return `il y a ${days} jours`;
}
