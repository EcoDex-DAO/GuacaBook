# GuacaBook V1 : collecte générique et adaptation MiewID

## Versions

La V0 est figée au commit `ae6eb15`, tag `v0.0.0`, branche `release/v0`.
La V1 continue sur `main`, version applicative `1.0.0-beta.1` (préversion ; le tag stable sera publié après validation), schéma d’export **3**.
Le numéro du schéma n’est pas le numéro de version de l’application.
La V0 reste consultable sans réinstaller ni modifier la base existante.

## Activation Supabase

Les migrations 001–003 déjà exécutées restent en place. Dans **SQL Editor → New
query**, copier uniquement `supabase/migrations/004_annotation_reviews.sql`, puis
cliquer **Run**. Après Success, recharger GuacaBook. Aucun nouveau secret requis.

Les décisions sont stockées dans `annotation_reviews`, séparément du JSON que le
contributeur peut modifier. Les comptes autorisés à examiner les contributions
peuvent accepter/rejeter une région via `review_annotation`. Les autres comptes
peuvent lire leurs propres décisions mais ne peuvent ni les écrire ni s’approuver.
La décision est liée à la **révision exacte de la collection** et au SHA-256 des octets sources examinés. Un remplacement du fichier invalide aussi la décision, même sans changement de révision. Toute nouvelle
sauvegarde/inclusion de photos invalide les décisions précédentes pour l’export ;
elles sont conservées comme historique et ne sont pas réappliquées automatiquement.

## Parcours de collecte

Le parcours en série sur tout le lot conserve ses six étapes. Lors du cadrage de
chaque région périoculaire, renseigner aussi :

- la netteté : nette/exploitable, inexploitable ou inconnue ;
- l’occlusion : dégagée, masquée par un objet/des plumes ou inconnue.

Laisser une réponse inconnue est permis. Cela termine la saisie sans rendre cette
région éligible à l’entraînement. Les anciennes annotations ne sont pas inventées
ou approuvées lors du passage à V1 : les informations manquantes restent inconnues.
L’édition d’une ancienne photo active les contrôles V1 pour cette photo.

Dans **Administration des contributions → Actualiser les contributions → Examiner
les régions**, vérifier le crop, l’identité déclarée, la photo source et le côté
anatomique. Une région avec des contrôles incomplets ne peut pas être acceptée
par l’interface. La revue valide une déclaration et un cadrage ; elle ne constitue
pas une preuve biométrique de l’identité de l’animal.

## Deux usages dans une même archive

L’export personnel V1 contient le compte courant (brouillons inclus et étiquetés).
L’export global V1 rassemble les annotations terminées des collections soumises
et autorisées. Les UUID de chaque collection sont préfixés par le compte pour
éviter les collisions. Les révisions et pseudonymes d’attribution figurent dans
`manifest.json`. Aucun e-mail d’authentification n’est exporté.

```
annotations.json
metadata.csv
individuals.csv
regions.csv
crops.csv
report.json
manifest.json
README.txt
originals/<photo-id>/upload.jpg
images/<animal-principal>/<photo-id>.png
individuals/<animal>/<left|right|unknown>/<photo-id>-<annotation-id>.png
wildme/metadata.csv
wildme/prepare.py
```

### Générique

COCO conserve les catégories stables `macaw` (1), `periocular_region` (2), `eye` (3),
les cadres `[x,y,width,height]`, les identités par annotation, et les informations
espèce/hybridation/sexe/année de naissance des individus. `attributes.occluded`
vaut `true`, `false` ou `null` ; `attributes.usability` est explicitement déclarée.
`images[].identity` est null si plusieurs identités sont déclarées pour l’image ;
la vérité par région reste `annotations[].attributes.identity`.

Les images référencées par COCO sont des PNG sans redimensionnement, normalisés
selon l’orientation EXIF. Les cadres et les crops correspondent donc à leurs pixels
sans demander au lecteur tiers de réinterpréter l’EXIF. Les octets uploadés restent
inchangés dans `originals/`. Les originaux peuvent contenir des métadonnées privées.
Leur SHA-256 figure dans les métadonnées, avec le chemin original et le chemin normalisé.

Les crops sont des PNG, rangés par identité et côté anatomique. Les coordonnées
fractionnaires sont arrondies vers l’extérieur, sans sortir de l’image ; le rectangle
entier réellement extrait est enregistré dans `crops.csv` et `guacabook.crops`.
Chaque crop référence le UUID et l’ID COCO numérique de son image et de son annotation.
Les originaux multi-animaux ne sont pas dupliqués : des crops différents pointent
vers le même original. Le formulaire actuel annote l’animal choisi à l’import ;
il ne faut pas attribuer un second animal à la même identité.

Il s’agit de **boîtes**, sans segmentation : `area` est l’aire du rectangle,
`iscrowd=0`. Aucun masque n’est inventé. Les cadres géométriquement invalides ou
identifiants dupliqués font échouer l’export plutôt que produire une archive incohérente.
Les CSV sont UTF-8, avec en-têtes et échappement RFC 4180. Les inconnues sont vides
ou explicites ; les dates ne reçoivent ni date fictive ni fuseau supposé.

### Wild Me : contrat ciblé MiewID CSV

Référence : [format CSV documenté du plugin MiewID](https://github.com/WildMeOrg/wbia-plugin-miew-id#expected-csv-data-format).
Les colonnes attendues sont `theta,viewpoint,name,file_name,species,file_path,x,y,w,h`.
Des colonnes supplémentaires conservent provenance, séance, date, angles caméra et splits.

Une ligne correspond à **une région périoculaire**, et non au corps ou au petit cadre
strict de l’œil. Elle entre dans ce CSV seulement si :

1. la collection a l’autorisation de recherche ;
2. le parcours de la photo est terminé et valide ;
3. la photo et la région sont déclarées exploitables ;
4. l’identité existe, le côté est gauche/droit et l’occlusion est explicitement absente ;
5. le cadre est valide et la région est acceptée par une revue de la révision exportée.

Les crops identiques (même hash original, cadre et côté) sont dédupliqués. Si une
même région identique acceptée porte des identités contradictoires, toutes les
occurrences concernées sont écartées. `regions.csv` donne les motifs d’exclusion,
y compris absence de revue, flou, inconnues et doublons. `report.json` donne les comptes.

- `name` : UUID individuel global, identique pour les deux côtés.
- `species` : nom scientifique ou déclaration conservée ; `unknown` si absent.
- `viewpoint` : côté anatomique de la **région périoculaire**, `left`/`right`, pour
  grouper les comparaisons MiewID. Ce n’est pas un label d’orientation globale WBIA.
- `theta=0` : le rectangle extrait est aligné aux axes. Ne jamais utiliser l’azimut
  de la caméra comme rotation 2D de la boîte.
- `x=y=0,w,h` : coordonnées du crop entier ; `file_path` est relatif à la racine
  de l’archive, puis rendu absolu par le script de préparation.

Après extraction, Python 3.9+ (bibliothèque standard seulement) :

```sh
python wildme/prepare.py /chemin/absolu/du/dataset --protocol closed
python wildme/prepare.py /chemin/absolu/du/dataset --protocol open
```

Le script produit `wildme/<protocole>/{train,valid,test,unsplit}.csv` avec des chemins
absolus vérifiés. Brancher ces CSV sur la configuration correspondant à la version
MiewID installée. Le contrat des CSV et le script sont testés ; le moteur MiewID,
ses poids et son entraînement ne sont pas installés ou exécutés par GuacaBook.
Il ne s’agit pas d’un import natif de base Wildbook ni d’une intégration universelle
de tous les plugins WBIA/PIE. Vérifier séparément les licences du code et des poids.

## Découpages reproductibles

Tous les crops d’une même photo, d’un original de hash identique, d’une même
séance d’un individu ou du même jour d’un individu sont groupés avant découpage.
Une séance est la chaîne déclarée par le contributeur : réutiliser le même nom
peut regrouper plus de photos, ce qui est conservateur contre les fuites.

- `split_closed` : groupes ordonnés par capture, avec séance/ID en repli si la date
  manque. Environ 70/15/15 par individu. Un groupe partagé reçoit la priorité train,
  puis valid, puis test, pour garder chaque identité évaluée connue à l’entraînement.
- `split_open` : identités disjointes, avec regroupement des identités apparaissant
  dans une même photo/groupe de doublons. Environ 70/15/15 par composante, dans
  l’ordre des identifiants stables. Ce n’est pas le même protocole que `split_open`
  du CSV SeaTurtleID fourni, lequel mélange identités connues et inconnues.
- Moins de trois groupes/composantes : tous restent dans train. Sans séance ni
  date pour un membre, tout son groupe reste `unsplit` pour les deux protocoles.

Les proportions sont indicatives et peuvent varier selon les groupes. Les jeux
minuscules ou sans test ne deviennent pas un benchmark par leur simple export.
Il reste à définir/configurer galerie, requêtes, seuil de rejet et métriques pour
les essais biométriques. Aucun résultat de reconnaissance n’est annoncé.

Seuls les doublons de fichiers exacts sont détectés. Les photos réencodées, quasi
doublons et animaux enregistrés sous plusieurs comptes doivent encore être rapprochés
manuellement. Les identités open-set disjointes ne garantissent pas, à elles seules,
que tous les propriétaires ou arrière-plans sont disjoints.

## Limites opérationnelles

ZIP, décodage et PNG sont construits en série dans le navigateur, avec libération
des bitmaps. Les petites collectes peuvent être testées ainsi ; un traitement serveur
ou par lots sera nécessaire pour des volumes importants. Le moteur d’identification,
la segmentation et la mesure de fiabilité sur aras restent des étapes distinctes.

## Réutilisation de la date et de la séance pendant la saisie

À l’étape Qualité, les valeurs date-heure/séance servent de valeurs de reprise pour
les photos suivantes du même `batchId`. Elles sont stockées dans le JSON du compte
(`batchMetadataDefaults`) et restaurées après rechargement. Seuls les champs vides
et non explicitement effacés de photos dont l’annotation n’est pas terminée sont complétés. Les
valeurs EXIF, valeurs déjà renseignées et choix Nette/Floue ne sont pas remplacés.
Les lots sont isolés ; les anciens enregistrements sans batchId ne sont pas regroupés
artificiellement. Les valeurs reprises sont signalées dans l’interface et tracées
par `metadataOrigin` (`exif`, `manual`, `batch`) dans la photo, le COCO et le CSV générique.
L’utilisateur doit les vérifier, notamment pour ne pas attribuer une heure commune
à tort. La suppression des dernières photos d’un lot supprime aussi ses valeurs de reprise.
Aucune migration SQL supplémentaire n’est nécessaire.

La hauteur de prise de vue se choisit avec trois boutons illustrant la position
de l’appareil (au-dessus, à hauteur, en dessous), après le choix d’une orientation.
Les valeurs restent +30°, 0° et −30° ; le bouton illustré « Point de vue inconnu »
conserve une valeur nulle et ne déduit pas une hauteur ni un azimut.

## Navigation et correction des cadres

Le sélecteur du lot affiche le numéro courant, les noms et jusqu’à cinq vignettes
voisines. Les boutons **Photo précédente/suivante** changent de photo dans la même
étape ; **Étape précédente/suivante** consultent une autre tâche pour la même photo.
Ces navigations ne valident rien. **Valider et continuer** confirme la tâche et
avance selon le parcours en série ; la validation finale confirme la photo.

**Enregistrer et reprendre plus tard** attend la sauvegarde en ligne avant de
retourner au lot. En cas d’échec, l’éditeur reste ouvert. Le compte conserve
`annotationResume` (photo/étape) ; **Reprendre le travail enregistré** restaure cet
endroit après reconnexion ou rechargement. La fin d’un lot ou la suppression de
la photo concernée retire le repère devenu inutile. Aucun nouveau stockage local
ou migration SQL n’est introduit.

Chaque cadre modifiable de l’étape/côté courant présente quatre poignées rondes.
Les déplacer ajuste ses coins dans les pixels originaux, en respectant les bords
de l’image et une taille minimale. Zoom, souris, tactile et flèches du clavier
(Maj pour dix pixels) sont pris en charge. L’annulation d’un geste restaure le
cadre ; un redimensionnement conserve son identifiant, sa catégorie et son animal,
rend la photo à vérifier et est sauvegardé à la fin du geste. En mode déplacement
de l’image, les poignées sont masquées pour ne pas confondre les deux actions.

À l’étape des yeux, cinq choix directs remplacent les sélecteurs successifs :
gauche, droit, face/deux yeux, inconnu, aucun œil. Le choix d’un côté de tracé
réapparaît uniquement en mode deux yeux. Pour une seule région, le reset du canevas
suffit ; les contrôles de reset par côté restent réservés au cas deux yeux.

Le zoom à la molette garde le point visé par la souris comme ancrage, avec des
limites pour conserver l’image accessible. Les boutons +/− utilisent le dernier
point visé dans l’image (sinon le centre). « Ajuster à l’écran » recentre la vue
entière. Le bouton « Déplacer l’image » reste disponible.

Tracer une région périoculaire renseigne automatiquement sa visibilité. Le reset
de toute l’étape efface les cadres et les réponses de visibilité ; le reset d’un
seul côté préserve l’autre. Une région peut être déclarée **partiellement masquée
ou coupée** (`partial`) et encadrée sur sa portion visible : tracer ou redimensionner
ne remplace pas cette déclaration par une visibilité complète. « Non visible »
est un choix distinct. Le COCO et le CSV générique conservent ce statut ; les régions
partielles sont exclues du CSV Wild Me strict, même si la partie restante est nette.
