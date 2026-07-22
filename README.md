# Ascension — Suivi personnel hybride

Application web progressive (PWA) sans API, sans compte et sans installation de Node.js.

Cette version est volontairement générique : aucun nom, projet ou objectif personnel n’est inscrit dans le code public. Les informations saisies restent dans le stockage local de l’appareil, sauf export volontaire.

## Ce que fait la V1

- Suivi quotidien : autonomie, concentration, action seul, activité physique, initiative sociale, tâche terminée.
- Humeur, énergie, stress, difficulté anticipée et réelle.
- Objectifs par cycle avec cible hebdomadaire et date de révision.
- Journal libre.
- Analyse locale simple et prudente.
- Export Markdown pour analyse dans ChatGPT.
- Export CSV pour Excel.
- Sauvegarde/restauration JSON.
- Import d’une mise à jour structurée générée après analyse.
- Fonctionnement hors ligne après la première ouverture en HTTPS.

## Hébergement gratuit recommandé

### GitHub Pages

1. Créer un dépôt GitHub.
2. Envoyer tous les fichiers de ce dossier à la racine du dépôt.
3. Ouvrir **Settings > Pages**.
4. Choisir **Deploy from a branch**, branche `main`, dossier `/root`.
5. Ouvrir l’adresse fournie par GitHub.

### Cloudflare Pages

1. Créer un projet Pages relié au dépôt GitHub.
2. Framework preset : **None**.
3. Build command : laisser vide.
4. Build output directory : `/` ou laisser la racine selon l’interface.
5. Déployer.

## Installation sur Android

1. Ouvrir l’adresse HTTPS dans Chrome.
2. Menu ⋮.
3. Choisir **Installer l’application** ou **Ajouter à l’écran d’accueil**.

## Données

Les données sont enregistrées localement dans IndexedDB sur l’appareil. Elles ne sont pas envoyées à un serveur par l’application.

Une suppression des données du navigateur peut les effacer. Exporter régulièrement le fichier JSON.

## Format de mise à jour ChatGPT

L’application accepte un fichier JSON de ce type :

```json
{
  "kind": "ascension-update",
  "version": "1.0.1",
  "generatedAt": "2026-07-22T12:00:00Z",
  "changes": {
    "settings": {
      "activeProject": "Projet principal",
      "guidingSentence": "Avancer avant d'optimiser."
    },
    "addGoals": [
      {
        "titre": "Action hebdomadaire",
        "categorie": "Constance",
        "definition": "Réaliser une action observable définie à l'avance.",
        "cible": 1,
        "dateDebut": "2026-07-22",
        "dateRevision": "2026-08-19",
        "principal": true
      }
    ],
    "updateGoals": [],
    "archiveGoalIds": [],
    "addJournalEntries": []
  }
}
```

Avant d’appliquer une mise à jour structurée, l’application télécharge automatiquement une sauvegarde JSON.
