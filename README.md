# GuacaBook

Première version locale de collecte photographique d’aras. Aucun service distant, compte, modèle IA ou traitement GPS. Les données sont conservées dans IndexedDB, sur le navigateur et l’origine utilisés. Elles ne sont pas synchronisées entre appareils. L’export ZIP est indispensable pour sauvegarder et transmettre la collection ; la réimportation d’un ZIP n’est pas encore proposée.

## Développer

Node.js 24, npm 11. Depuis `/workspace/GuacaBook` :

```sh
npm ci --no-audit --no-fund
npm run dev
```

Validation : `npm test`, `npm run typecheck`, `npm run build`. Avec le serveur démarré, `npm run smoke` teste le parcours navigateur (Chromium système `/usr/bin/chromium`, ou variable `CHROMIUM_PATH` pour un autre chemin). Production : `npm start` après compilation. Le port par défaut est 3000. Aucun secret ni fichier `.env` nécessaire.

## Parcours

1. Saisir un pseudonyme (facultatif) pour l’attribution.
2. Créer un ara : identifiant UUID stable, nom et espèce facultatifs. Une valeur vide signifie inconnue.
3. Nommer une séance puis importer plusieurs photos. L’application lit uniquement `DateTimeOriginal` lorsqu’il existe et permet sa correction manuelle ; elle n’invente pas de date à partir du fichier. Les heures sont locales sans fuseau, la précision/fuseau EXIF n’est pas interprétée. HEIC/RAW doivent être convertis si le navigateur ne les décode pas.
4. Choisir un ara ou « identité inconnue », une catégorie et un côté anatomique. Tracer les boîtes au pointeur ou au toucher. Supprimer et retracer pour corriger une boîte. Plusieurs aras et régions peuvent figurer dans une photo. Les boîtes ne sont pas automatiquement associées entre elles.
5. Vérifier la qualité et la couverture par côté/séance. Cette couverture compte les photos annotées, sans garantie de qualité ni de diversité temporelle. Recueillir des séances à différentes dates et heures, et des vues de l’animal entier.
6. Autoriser explicitement l’utilisation sous CC BY 4.0 avant export. L’outil prépare une archive ; aucune publication ni transmission automatique n’a lieu.

Le guide de cadrage propose l’œil entier et les motifs environnants, avec un cadrage comparable entre séances. La fiabilité de la réidentification est à évaluer. Aucune identité, espèce, latéralité ou date inconnue n’est inférée.

## Format d’export — GuacaBook v1

ZIP contenant `annotations.json`, `README.txt` et `images/<UUID>-<nom original assaini>`. Les octets des originaux restent inchangés. Ils peuvent contenir des métadonnées privées, notamment GPS : les inspecter avant de partager. Aucun recadrage n’est généré dans cette version.

Sections COCO standard : `images`, `annotations`, `categories`, `licenses`, `info`. IDs numériques uniques pour les images et annotations dans chaque export. Catégories : 1 = `macaw`, 2 = `periocular_region`. Les boîtes `[x,y,width,height]` et `area` sont en pixels dans l’image affichée **après orientation EXIF**. Les lecteurs des originaux doivent appliquer l’orientation EXIF avant les boîtes. `iscrowd` vaut 0 ; aucune segmentation n’est fournie.

Extensions :

- `images[].guacabook` : `photo_id` UUID stable, `session_id` (texte ou null), `quality` (`unreviewed`, `usable`, `blurry`), `original_file_name` (nom assaini).
- `annotations[].guacabook` : `individual_id` (UUID ou null) et `side` (`left`, `right`, `unknown` pour la région périoculaire ; null pour l’ara entier). Le côté est anatomique.
- `guacabook.individuals` : `id`, `name`, `species` (chaîne vide si inconnue).
- `guacabook.sessions` : liste des identifiants de séances, renseignés manuellement. Une séance n’est pas déduite de la date.
- `guacabook.contributor` : pseudonyme ou null ; `schema_version` = 1 ; `crops` = tableau vide réservé aux recadrages futurs, lesquels devront référencer la photo source et l’annotation.
- `images[].date_captured` : date/heure locale sans fuseau ou null si inconnue.

L’identité, l’espèce et la séance sont distinctes. Les IDs COCO peuvent changer entre exports ; les UUID des photos et individus restent stables dans le brouillon. CC BY 4.0 est la licence des photos autorisées par le contributeur, pas une affirmation de licence du code ni des datasets tiers.

## Limites

Pas de stockage partagé, d’authentification, de backend, de réidentification, de recadrages ou d’import COCO. Les gros jeux de données sont limités par la mémoire (ZIP) et le quota navigateur (photos). L’annotation utilise actuellement le pointeur/toucher, sans outil de dessin au clavier. SeaTurtleID2022 n’est ni téléchargé ni intégré ; vérifier séparément sa structure et sa licence avant usage.
