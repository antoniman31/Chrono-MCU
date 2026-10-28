// Durées affichées partout dans l'application : « 45 min », « 2 h 06 min », « 15 j 21 h 12 min ».
// Les données sont en minutes entières ; à partir de 24 h on passe aux jours (24 h = 1 j). Les unités à zéro sont omises.
export function formatDuration(totalMin) {
  const total = Math.max(0, Math.round(totalMin));
  const days = Math.floor(total / 1440);
  const hours = Math.floor((total % 1440) / 60);
  const min = total % 60;
  const parts = [];
  if (days) parts.push(`${days} j`);
  if (hours) parts.push(`${hours} h`);
  if (min || !parts.length) parts.push(`${hours || days ? String(min).padStart(2, '0') : min} min`);
  return parts.join(' ');
}
