// Toute date de l'appli est une date de Paris (règle commune « Heure de Paris ») : le jour d'une coche ne dépend ni du fuseau
// du téléphone ni d'UTC. Intl gère les changements d'heure (journées de 23 h et de 25 h) ; `now` sert aux tests.
const jourDeParis = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' });

export const parisToday = (now = new Date()) => jourDeParis.format(now);
