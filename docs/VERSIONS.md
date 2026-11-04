# Versions et étapes du projet

`V0`, `V1`, `V2` désignent les grandes étapes du projet. Un numéro `MAJEUR.MINEUR.CORRECTIF`
identifie précisément chaque livraison. Un tag stable est un point validé et publié ;
le simple fait de travailler sur « V1 » ne rend pas tous ses états stables.

- `1.0.1` : correction compatible ;
- `1.1.0` : fonctionnalité compatible ;
- `2.0.0` : changement incompatible de comportement, d’API ou de format ;
- `1.0.0-beta.1`, puis `beta.2` : préparation de la première V1 stable ;
- `1.0.0` : première V1 validée sans suffixe bêta.

La V0 est conservée au commit `ae6eb15`, tag `v0.0.0`, branche `release/v0`.
Les versions figurent en bas de toutes les pages et dans les métadonnées COCO et
le rapport d’export. `package.json` est la source de référence, avec la même valeur
dans `package-lock.json`. Le schéma des données possède un numéro indépendant (3).

## Incrémenter avant livraison

Depuis la racine du dépôt :

```sh
npm run version:patch
npm run version:minor
npm run version:major
npm run version:prerelease
```

Une commande choisie met à jour les deux manifests, sans créer de commit ni de tag.
Sur une bêta, `patch`/`prerelease` incrémente son compteur ; `minor` et `major` avancent
le numéro correspondant en conservant le canal bêta. Après tests et vérification
de l’environnement hébergé, `npm run version:stable` retire le suffixe bêta. Publier
ensuite un nouveau tag stable, sans déplacer les tags existants.

L’incrément correspond à une **livraison**, pas à chaque frappe ou sauvegarde de fichier.
Les instructions du dépôt demandent de le faire avant chaque livraison de code.

## Secours automatique GitHub

Le workflow `.github/workflows/version.yml` valide les pushes sur `main`. Si le
numéro n’a pas changé depuis le début de la livraison, il l’incrémente puis publie
un commit de métadonnées. Si le numéro a déjà changé, il ne fait rien de plus.

Les messages Conventional Commits déterminent le niveau automatique :

- `fix: ...` et les autres messages : correctif ;
- `feat: ...` ou `feat(dataset): ...` : mineur ;
- `feat!: ...` ou un bloc `BREAKING CHANGE:` : majeur.

Ce workflow exige **GitHub Actions activé et un droit d’écriture Contents**. Le
fichier demande ce droit ; une politique d’organisation/branche peut le refuser.
L’exécution distante de ce workflow n’est pas vérifiée depuis cet environnement.
S’il est bloqué, les commandes locales restent utilisables. Les contrôles ne
créent pas automatiquement de tag stable : un numéro seul ne prouve pas la validation
scientifique ni la bonne configuration du déploiement.

Un commit automatique peut provoquer un second déploiement Vercel pour afficher le
nouveau numéro. Préférer l’incrément explicite avant livraison pour un seul déploiement.
