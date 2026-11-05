# Activer la galerie et la validation des photos

Le code de cette fonctionnalité est livré en V1.1 bêta. Il ajoute une validation
par photo, distincte de la fin du parcours d’annotation. Les anciennes revues de
régions ne valident pas automatiquement les photos.

## Une seule opération à faire dans Supabase

Les migrations 001 à 004 doivent déjà être appliquées. Ne les réexécutez pas si
elles l’ont déjà été.

1. Dans le projet Supabase GuacaBook, ouvrez **SQL Editor**.
2. Créez une requête avec **New query**.
3. Copiez tout le contenu de `supabase/migrations/005_photo_validation.sql`.
4. Collez-le dans la requête, puis cliquez sur **Run**.
5. Après **Success**, rechargez GuacaBook.

La migration est transactionnelle : une erreur annule son ensemble. Elle doit
être exécutée une seule fois, sans supprimer les tables ni les données existantes.
Aucun nouveau secret ni réglage SMTP n’est nécessaire. L’assistant ne peut pas
l’appliquer à distance dans cette session ; sa validation locale PostgreSQL ne
signifie pas qu’elle est déjà appliquée à votre projet Supabase.

## Inviter et vérifier

1. Un administrateur ouvre **Gestion des comptes**.
2. Dans **Inviter une personne**, **Contributeur de photos** est coché par défaut.
3. Pour donner les droits de revue, cochez **Vérificateur** : un seul profil est
   attribué par invitation. Le profil administrateur protégé reste séparé.
4. Envoyez l’invitation par e-mail comme auparavant.
5. Ouvrez **Photos et validation** dans GuacaBook.
6. Un contributeur voit ses propres photos, leurs annotations et leur état. Il
   peut revenir à l’annotation avec **Revérifier mes annotations**.
7. Un vérificateur voit toutes les contributions. Il sélectionne une photo,
   examine les cadres et les informations, puis choisit **Valider cette photo
   pour le dataset** ou **Demander une correction**.

Une photo doit avoir terminé le parcours d’annotation pour pouvoir être acceptée.
Le vérificateur ne peut pas accepter ses propres photos : un autre vérificateur
est nécessaire. Il ne peut pas modifier les photos ou les annotations des autres.
Les validations sont enregistrées avec l’identité du vérificateur et la date.

## Export et modifications

Tous les exports de dataset — personnel, contribution et global — incluent
uniquement les photos acceptées, avec des annotations et des métadonnées d’animal
identiques à celles relues, et dont les octets source correspondent à l’empreinte
SHA-256 validée. Les fichiers COCO, CSV, originaux, recadrages et individus suivent
le même filtre. Une erreur de lecture des validations bloque l’export ; elle ne
permet jamais de revenir à un export non filtré.

Une modification de la photo, de ses annotations ou d’une fiche d’animal associée
rend sa validation obsolète. Elle repasse en attente. Modifier une autre photo de
la collection n’invalide pas les photos restées identiques. Une collection n’a
plus besoin d’être soumise en bloc : le consentement et la revue de chaque photo
font foi.

Accepter une photo accepte aussi atomiquement ses annotations périoculaires pour
la même révision et la même empreinte source. Si une autre photo change ensuite,
la validation par photo toujours à jour reste la preuve de revue de ses régions ;
une décision de région explicite de la révision courante reste prioritaire. Le COCO générique conserve les
caractéristiques des photos acceptées même si elles ne conviennent pas à Wild Me.
Le CSV Wild Me conserve ses contrôles supplémentaires : qualité, latéralité,
identité, géométrie, visibilité, absence d’occlusion et absence de doublons.
Une copie de secours en cas d’échec de sauvegarde reste un mécanisme privé de
récupération ; ce n’est pas un dataset de recherche.

## Sécurité et limites

La table `photo_reviews` est en lecture seule pour les clients authentifiés.
L’écriture passe par `review_photo`, qui vérifie les permissions actives, interdit
l’auto-validation et contrôle la révision de la contribution. La confidentialité
des photos et collections reste assurée par leurs politiques RLS existantes.

La galerie affiche douze vignettes par page ; elle charge les métadonnées par
pages et les images de la page affichée. L’empreinte source est vérifiée à
l’ouverture de la photo et lors de l’export. La carte de galerie peut donc montrer
une décision basée sur les métadonnées avant qu’une modification des seuls octets
source soit détectée à l’ouverture. Une telle photo est exclue à l’export.

## Lire les annotations dans la galerie

Le tableau sépare zone, côté anatomique, visibilité, netteté et masquage. Un tiret
signifie non applicable : le corps n’a pas de côté gauche/droit à renseigner ici.
Les couleurs et numéros correspondent aux cadres sur la photo. Cliquer sur une
zone du tableau centre la vue sur son cadre ; « Vue complète » restaure la photo.
Les coordonnées brutes restent disponibles dans les détails techniques, repliés
par défaut. La consultation et le zoom ne modifient pas les annotations stockées.
Les dimensions du fichier sont contrôlées au chargement ; leur incohérence avec
les métadonnées bloque l’acceptation de la photo.
