// Personnages et équipes pour les succès et le filtre. Le champ `heroes` de data/mcu.json liste leurs identifiants
// (rôle principal ou co-principal seulement, pas les caméos). Un identifiant inconnu fait échouer la validation des données.
export const HEROES = [
  { id: 'iron-man', label: 'Iron Man' },
  { id: 'captain-america', label: 'Captain America' },
  { id: 'thor', label: 'Thor' },
  { id: 'hulk', label: 'Hulk' },
  { id: 'black-widow', label: 'Black Widow' },
  { id: 'hawkeye', label: 'Hawkeye' },
  { id: 'spider-man', label: 'Spider-Man' },
  { id: 'black-panther', label: 'Black Panther' },
  { id: 'doctor-strange', label: 'Doctor Strange' },
  { id: 'ant-man', label: 'Ant-Man' },
  { id: 'captain-marvel', label: 'Captain Marvel' },
  { id: 'loki', label: 'Loki' },
  { id: 'scarlet-witch', label: 'Scarlet Witch' },
  { id: 'avengers', label: 'Les Avengers', team: true },
  { id: 'guardians', label: 'Les Gardiens de la Galaxie', team: true },
];
export const HERO_IDS = HEROES.map((h) => h.id);
export const heroLabel = (id) => HEROES.find((h) => h.id === id)?.label ?? id;
