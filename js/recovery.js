// Texte annoncé quand les données enregistrées n'ont pas pu être lues telles quelles (voir loadStateWithReport dans store.js).
const s = (n) => (n > 1 ? 's' : '');

export function recoveryText(report) {
  if (!report) return null;
  const copy = report.saved
    ? 'Une copie des données d\'origine est gardée à part : tu peux la télécharger.'
    : 'La copie des données d\'origine n\'a pas pu être gardée (stockage plein ou indisponible).';
  if (report.kind === 'repaired') {
    const n = report.dropped;
    return { title: `${n} élément${s(n)} illisible${s(n)} ignoré${s(n)} ; le reste de ta progression est conservé.`, body: copy };
  }
  if (report.kind === 'newer') {
    return { title: 'Tes données viennent d\'une version plus récente de l\'application.', body: `Elles ne sont pas utilisées : recharge la page pour obtenir la dernière version. ${copy}` };
  }
  return { title: 'Tes données enregistrées étaient illisibles : l\'application repart de zéro.', body: copy };
}
