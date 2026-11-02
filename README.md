# GuacaBook

Application locale de collecte photographique d’aras avec un parcours guidé, photo par photo. Pas d’IA, de collecte GPS, de backend ou de stockage partagé.

## Démarrer

Node.js 24.19.0 (`.nvmrc`), npm 11. Depuis `/workspace/GuacaBook` :

```sh
npm ci --no-audit --no-fund
npm run dev
```

Validation : `npm test`, `npm run typecheck`, `npm run build`. Production : `npm start` après compilation. Aucun secret ni `.env` requis. Le port par défaut est 3000. Avec un serveur lancé : `npm run smoke` (Chromium système `/usr/bin/chromium`, ou variable `CHROMIUM_PATH` ; `TEST_BASE_URL` permet une autre origine).

## Expérience utilisateur

1. **Identification locale** : pseudonyme mémorisé sur cet appareil. Ce n’est pas une authentification et cela ne protège pas les données d’autres utilisateurs du même navigateur. « Mon profil » permet de modifier ce pseudonyme ; les données de la collection restent les mêmes.
2. **Trois onglets** : Dataset est disponible ; Identification et Jumeau numérique sont des espaces annoncés « À venir ».
3. **Mes animaux** : créer un ou plusieurs aras (UUID stable, nom facultatif, espèce vide si inconnue), puis en choisir un.
4. **Lot** : préciser une séance et sélectionner plusieurs photos. Chaque import crée un lot UUID, affecté à l’animal choisi. Les séances restent des étiquettes distinctes des lots et de l’identité. Formats JPEG/PNG et autres images que le navigateur décode ; convertir les HEIC/RAW si nécessaire.
5. **Protocole photo par photo**, avec sauvegarde automatique à chaque réponse :
   - Qualité nette/exploitable ou floue/à refaire. Date EXIF `DateTimeOriginal` si disponible, corrigible manuellement. Sans EXIF, elle reste vide. Pas de fuseau déduit.
   - Point de vue : ara schématique 3D, caméra déplacée par boutons, huit directions et trois hauteurs, ou inconnu. Le référentiel est provisoire, à remplacer par le modèle fourni par le porteur du projet. Il ne constitue pas une mesure ni un modèle anatomique validé. Si WebGL n’est pas disponible, les sélecteurs textuels restent accessibles.
   - Corps entier, partiel, non visible ou inconnu. Tracer tout le corps visible pour les deux premières réponses.
   - Œil visible, non visible ou inconnu. Si visible, encadrer l’œil lui-même et déclarer son côté anatomique (ou inconnu).
   - Région périoculaire : si l’œil est visible, indiquer si la zone est visible, masquée/coupée ou inconnue. Si visible, encadrer l’œil et les motifs environnants, dans un cadrage comparable entre séances. Sinon, ne pas inventer de boîte. Cette étape est sautée lorsqu’aucun œil n’a été confirmé.
   - Validation : les réponses et boîtes requises doivent être présentes. La photo suivante non terminée du même lot commence à son propre état sauvegardé ; les réponses ne sont pas copiées. Le dernier élément ramène à la collection.

Toutes les étapes peuvent être revisitées ; une modification rouvre la photo en brouillon. On peut quitter et reprendre depuis la collection. « Validée » signifie que le protocole est renseigné, pas que la photo est scientifiquement exploitable. Plusieurs boîtes d’une même catégorie peuvent être tracées, supprimées puis retracées. La latéralité est celle de l’animal, indépendamment du côté de l’image et du point de vue déclaré. Aucun côté inconnu n’est deviné.

Les nouveaux lots ciblent un animal. Pour une photo avec d’autres aras, le parcours annote uniquement l’animal choisi ; ne pas attribuer les autres corps à cette identité. Les annotations multiples des anciens brouillons sont conservées et leurs identités ne sont pas réaffectées. Le panneau d’anciens brouillons permet d’associer leur photo à un animal de lot.

Collecter des photos de chaque côté, à plusieurs dates et moments de la journée, avec des vues entières en complément. La couverture par côté/séance compte les photos annotées, sans évaluer netteté ou diversité temporelle. La fiabilité de la réidentification reste à évaluer.

## Stockage et autorisation

Profil, photos originales et brouillons restent dans IndexedDB de l’origine et du navigateur utilisés, sous la clé historique `guacabook-v1`. Les anciens brouillons sont lisibles : les nouveaux champs optionnels restent non renseignés tant que le protocole n’a pas été suivi. Les onglets ne changent pas ce stockage. Pas de synchronisation entre appareils ni de restauration ZIP : exporter régulièrement avant d’effacer les données du site.

L’export exige une autorisation explicite de disposer des droits et d’utiliser les photos sous **CC BY 4.0**, redistribution et usage commercial avec attribution inclus. Cette licence photo n’affirme aucune licence pour le code ou les datasets tiers. L’archive n’est pas transmise automatiquement. Elle comprend toutes les photos, y compris les brouillons signalés comme tels. Les fichiers originaux conservent leurs métadonnées potentiellement privées, dont GPS : les inspecter avant partage. L’application ne les extrait pas.

## Export COCO — extensions GuacaBook v2

ZIP : `annotations.json`, `README.txt`, `images/<UUID>-<nom assaini>`. Les octets originaux sont inchangés. Aucun recadrage généré. Sections COCO : `images`, `annotations`, `categories`, `licenses`, `info`. IDs COCO numériques, uniques au sein de chaque export, susceptibles de changer entre exports. UUID des photos et individus stables dans le brouillon.

Catégories stables : **1 `macaw`**, **2 `periocular_region`**, nouvelle catégorie **3 `eye`**. `bbox = [x,y,width,height]` et `area` en pixels **après orientation EXIF** ; les lecteurs des originaux doivent appliquer cette orientation avant les boîtes. `iscrowd = 0`, pas de segmentation.

`images[].guacabook` :

- `photo_id`, `individual_id` (animal ciblé ou null), `batch_id` (lot ou null), `session_id` (étiquette ou null).
- `quality` : `unreviewed`, `usable` ou `blurry`.
- `viewpoint` : `{azimuth, elevation}` en degrés, ou null si inconnu/non renseigné. Azimut : avant 0°, trois-quarts droit 45°, droite anatomique 90°, arrière droit 135°, dos 180°, arrière gauche 225°, gauche 270°, trois-quarts gauche 315°. Élévation : à hauteur 0°, dessus +30°, dessous −30°. Angles catégoriels approximatifs déclarés, pas des mesures EXIF. Dans la scène 3D, l’axe +Z pointe vers le bec et +X vers le côté marqué DROITE.
- `body_visibility` : `full`, `partial`, `not_visible`, `unknown`, ou null si non renseigné.
- `eye_visible`, `periocular_visible` : `yes`, `no`, `unknown`, ou null si non renseigné/non applicable.
- `annotation_status` : `complete` ou `draft`.
- `original_file_name` : nom assaini. `images[].date_captured` : date/heure locale sans fuseau ou null.

`annotations[].guacabook` : `individual_id` (UUID ou null), `side` (`left`, `right`, `unknown` pour l’œil et la région périoculaire ; null pour le corps).

`guacabook` : `schema_version = 2`, `contributor` (pseudonyme ou null), `individuals` (`id`, `name`, `species`, chaîne vide si inconnue), `sessions` (liste `{id}`), `crops` (tableau vide réservé aux recadrages futurs, lesquels devront référencer photo et annotation sources).

## Limites

Pas de compte sécurisé, stockage partagé, import COCO/ZIP, réidentification ni jumeau numérique. Taille des lots limitée par le quota navigateur et la mémoire pour l’export ZIP. Dessin au pointeur/toucher, sans dessin au clavier ni zoom de précision pour l’instant. Le référentiel 3D est un schéma procédural, pas encore le modèle de référence final. SeaTurtleID2022 n’est ni téléchargé ni intégré ; vérifier séparément licence et structure avant usage.
