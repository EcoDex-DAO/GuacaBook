# GuacaBook V1

La version courante est affichée en bas de l’application et provient de `package.json` · [Gestion des versions](docs/VERSIONS.md).

V0 archivée : tag `v0.0.0`, branche `release/v0`, commit `ae6eb15`.
V1 : export générique et adaptateur de données MiewID. [Format et revue](docs/V1_DATASET.md). [Galerie et activation de la validation des photos (migration 005)](docs/PHOTO_VALIDATION.md).

[English documentation](README.en.md) · Interface : français, anglais, espagnol et portugais.

Application centralisée de collecte photographique d’aras, avec un parcours guidé étape par étape sur tout le lot. **Connexion Supabase par e-mail et mot de passe, sur invitation**, animaux/photos/annotations chargés depuis le compte et sauvegardés automatiquement en ligne. Pas de mode local ni hors ligne. [Configuration Supabase et Vercel](docs/SUPABASE.md).

## Démarrer

Node.js 24.19.0 (`.nvmrc`), npm 11. Depuis `/workspace/GuacaBook` :

```sh
npm ci --no-audit --no-fund
cp .env.example .env.local
# Remplir uniquement les deux paramètres publics Supabase dans .env.local.
npm run dev
```

Sans configuration, l’application affiche un message d’indisponibilité et n’ouvre aucun éditeur local. Validation : `npm test`, `npm run typecheck`, `npm run build`. Production : `npm start`. Les variables `NEXT_PUBLIC_` doivent être définies avant compilation. La gestion des comptes et types nécessite la migration 002 et une clé serveur privée pour les liens d’invitation : [guide](docs/ACCOUNT_MANAGEMENT.md). Ne pas réexécuter la migration 001 déjà installée.

Les tests navigateur utilisent une API simulée ; voir le guide pour la compilation de test, puis `npm run smoke`, `node tests/cloud-browser.mjs` et `node tests/i18n-browser.mjs`. Ils ne doivent pas envoyer d’e-mails réels.

## Expérience utilisateur

1. **Identification** : connexion obligatoire par e-mail et mot de passe, puis accord de participation à la recherche et pseudonyme pour l’attribution. Un administrateur crée le lien d’invitation ; le destinataire choisit son mot de passe. Les administrateurs seuls disposent du gestionnaire de comptes et de types. La collection du compte est chargée automatiquement, y compris depuis un nouvel appareil.
2. **Trois onglets** : Dataset est disponible ; Identification et Jumeau numérique sont des espaces annoncés « À venir ».
3. **Mes animaux** : créer un ou plusieurs aras (UUID stable, nom facultatif, espèce/hybridation, sexe et année de naissance facultatifs), puis en choisir un.
4. **Lot** : préciser une séance et sélectionner plusieurs photos. Chaque import crée un lot UUID, affecté à l’animal choisi. Les séances restent des étiquettes distinctes des lots et de l’identité. Formats JPEG/PNG/WebP ; convertir les HEIC/RAW si nécessaire.
5. **Protocole par étape sur tout le lot**, avec sauvegarde automatique à chaque réponse :
   - Qualité nette/exploitable ou floue/à refaire. Date EXIF `DateTimeOriginal` si disponible, corrigible manuellement. Sans EXIF, elle reste vide. Pas de fuseau déduit.
   - Point de vue : ara schématique 3D, cadré comme une photo selon le point de vue choisi, vignettes générées à partir du même modèle, huit directions et trois hauteurs, ou inconnu. Le référentiel est provisoire, à remplacer par le modèle fourni par le porteur du projet. Il ne constitue pas une mesure ni un modèle anatomique validé. Si WebGL n’est pas disponible, les sélecteurs textuels restent accessibles.
   - Corps entier, partiel, non visible ou inconnu. Tracer tout le corps visible pour les deux premières réponses.
   - Œil visible, non visible ou inconnu. Si visible, choisir un œil gauche, un œil droit, les deux yeux de face ou un côté inconnu à l’aide de cartes illustrées. En mode deux yeux, encadrer séparément chaque œil, avec une boîte de côté gauche et une de côté droit obligatoires.
   - Région périoculaire : si l’œil est visible, indiquer si la zone est visible, masquée/coupée ou inconnue. Si visible, encadrer l’œil et les motifs environnants, dans un cadrage comparable entre séances. Sinon, ne pas inventer de boîte. Renseigner également la netteté et l’occlusion de chaque région. Pour chaque côté déclaré à l’étape des yeux, une réponse et, si visible, son propre cadre sont requis. Une région peut être masquée d’un côté et visible de l’autre. Les photos sans œil visible sont signalées non applicables à cette étape.
   - Validation : les réponses et boîtes requises doivent être présentes. Chaque tâche est réalisée successivement sur les photos du lot, puis la tâche suivante commence sur la première photo concernée. Qualité 1 → qualité 2 → orientation 1 → orientation 2, etc. Les réponses ne sont pas copiées. La validation termine le lot et ramène à la collection. Les étapes déjà confirmées et toujours valides ne sont pas redemandées ; la navigation directe permet les corrections.

Toutes les étapes peuvent être revisitées ; une modification rouvre la photo en brouillon. On peut quitter et reprendre depuis la collection. « Annotation terminée » signifie que le protocole est renseigné ; la validation indépendante se fait dans « Photos et validation ». Plusieurs boîtes d’une même catégorie peuvent être tracées, supprimées puis retracées. « Réinitialiser les cadres de l’étape » efface les boîtes de la catégorie courante pour l’animal ciblé, sans toucher aux autres catégories ni aux autres individus. Pour les yeux et régions, « Réinitialiser ce côté uniquement » conserve les cadres du côté opposé. La latéralité est celle de l’animal, indépendamment du côté de l’image et du point de vue déclaré. Aucun côté inconnu n’est deviné.

Les nouveaux lots ciblent un animal. Pour une photo avec d’autres aras, le parcours annote uniquement l’animal choisi ; ne pas attribuer les autres corps à cette identité. Les annotations multiples des anciens brouillons sont conservées et leurs identités ne sont pas réaffectées. Le panneau d’anciens brouillons permet d’associer leur photo à un animal de lot.

Collecter des photos de chaque côté, à plusieurs dates et moments de la journée, avec des vues entières en complément. La couverture par côté/séance compte les photos annotées, sans évaluer netteté ou diversité temporelle. La fiabilité de la réidentification reste à évaluer.

## Stockage et autorisation

Le zoom (50 % à 800 %), le dézoom, la molette et le pincement permettent de travailler sur les détails. « Déplacer l’image » active le déplacement au pointeur ; « Ajuster à l’écran » revient à la vue entière. Le canevas reste limité à la hauteur de l’écran et les boîtes sont toujours enregistrées en pixels originaux après orientation EXIF, indépendamment du zoom.

Les animaux, les originaux, les annotations et la progression ont Supabase pour source de référence. Ils sont chargés automatiquement à la connexion et après rechargement de la page. Les modifications sont enregistrées après un court délai, avec une file sérialisée : les changements pendant un transfert sont enregistrés à sa suite. Les révisions empêchent d’écraser silencieusement une modification faite sur un autre appareil.

L’application n’écrit plus de photos ni de brouillons dans IndexedDB, et ne propose plus de transfert ou de mode local. Les anciens caches des versions antérieures ne sont ni lus ni effacés silencieusement. Seules les collections déjà envoyées dans Supabase sont reprises automatiquement. Les données encore uniquement présentes dans un ancien navigateur doivent être conservées pour une récupération séparée avant tout nettoyage de ce navigateur.

Le navigateur garde en mémoire les données nécessaires à l’affichage et les modifications en cours, ainsi que la session d’authentification et la préférence de langue. Si un transfert échoue, la page l’indique, suspend les envois automatiques et permet de réessayer ou de télécharger une copie de secours (`recovery.json` + originaux). Aucun enregistrement réussi n’est annoncé pour ces changements. Garder la page ouverte : les modifications non envoyées ne survivent pas à sa fermeture. La déconnexion volontaire attend l’enregistrement ; en cas d’échec, elle est interrompue. Une actualisation depuis le projet avec des changements non enregistrés demande confirmation.

La copie de secours n’est pas un export de recherche ni un import ZIP automatique. L’export COCO reste disponible séparément, avec consentement.

L’export exige une autorisation explicite de disposer des droits et d’utiliser les photos sous **CC BY 4.0**, redistribution et usage commercial avec attribution inclus. Cette licence photo n’affirme aucune licence pour le code ou les datasets tiers. L’archive n’est pas transmise automatiquement. Elle comprend uniquement les photos terminées et approuvées par un autre vérificateur, dont la source et les annotations sont inchangées. Les fichiers originaux conservent leurs métadonnées potentiellement privées, dont GPS : les inspecter avant partage. L’application ne les extrait pas.

## Export V1 — COCO générique et CSV Wild Me

L’archive contient des originaux inchangés, des images PNG orientées, les cadres COCO,
les recadrages périoculaires par individu/côté et des CSV de métadonnées. Le CSV
Wild Me cible MiewID et ne contient que les régions exploitables et acceptées par
une revue de leur révision. Le COCO générique et les CSV n’incluent que les photos
approuvées ; ils peuvent conserver leurs inconnues et régions partielles déclarées. Les découpages fermés et
ouverts regroupent dates, séances et doublons exacts avant attribution.

[Contrat complet, champs, limites et instructions Python](docs/V1_DATASET.md).

## Limites

Comptes et stockage privé Supabase obligatoires. Pas d’import COCO/ZIP, de réidentification ni de jumeau numérique. Taille des lots limitée par les quotas du projet, la mémoire du navigateur et celle nécessaire à l’export ZIP. Dessin au pointeur/toucher, sans dessin au clavier pour l’instant. Le référentiel 3D est un schéma procédural, pas encore le modèle de référence final. SeaTurtleID2022 n’est ni téléchargé ni intégré ; vérifier séparément licence et structure avant usage.

Les huit images de `public/reference/` sont générées depuis le modèle procédural de l’application ; après modification du modèle, lancer `node tests/render-reference.mjs` avec un serveur local démarré pour les régénérer. Ce script utilise un contexte de navigateur isolé, l’API de test simulée et aucune photo réelle.

## Langues

Le sélecteur « Language / Langue » reste accessible sur la page d’accueil et dans l’atelier. Détection initiale depuis les préférences du navigateur (variantes comme pt-BR et es-MX comprises), anglais par défaut si aucune langue n’est prise en charge. Le choix manuel est conservé dans `localStorage` sous `guacabook-language`. Un stockage de préférence indisponible n’empêche pas l’utilisation. L’attribut HTML `lang` suit la langue sélectionnée.

Les catalogues sont dans `lib/i18n/`. Les données saisies par les contributeurs, les UUID, les catégories COCO et les valeurs techniques restent inchangés. Le changement de langue ne modifie ni le brouillon, ni les cadres, ni le consentement. La notice du ZIP est en anglais pour l’échange international. Les traductions sont une première version générale ; faire relire la terminologie par des contributeurs natifs avant une campagne à grande échelle.
