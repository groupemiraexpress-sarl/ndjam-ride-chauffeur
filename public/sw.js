// Service worker volontairement minimal : il ne met RIEN en cache.
// Son seul rôle est de rendre l'app installable (Chrome exige un service
// worker actif avec un gestionnaire "fetch" pour proposer l'installation).
// Aucune mise en cache = aucun risque de données périmées affichées
// (positions GPS, courses en cours, etc. restent toujours en temps réel).

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", () => {
  // Ne rien faire : le navigateur traite la requête normalement (réseau).
});