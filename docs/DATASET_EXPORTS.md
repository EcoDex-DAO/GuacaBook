# Animaux et exports

La V1 et son format de référence sont décrits dans [V1_DATASET.md](V1_DATASET.md).
Les exports incluent désormais les recadrages et un adaptateur MiewID ; l’acceptation
scientifique est distincte de la fin du parcours contributeur.

## Suppression d’un animal

Dans « Mes animaux », le bouton « Supprimer cet animal » ouvre une fenêtre intégrée
avec les boutons Annuler et Supprimer définitivement. La confirmation native du
navigateur n’est plus utilisée : elle bloquait les mises à jour de l’interface.

La suppression retire l’animal et toutes les photos qui lui sont associées, ou
qui contiennent une de ses annotations, avec tous les cadres de ces photos.
Les photos partagées entre plusieurs animaux sont donc aussi retirées ; la
confirmation le précise. Les autres animaux et leurs autres photos restent intacts.
Les entrées de lots devenus vides sont supprimées.

Les identifiants des fichiers à effacer sont enregistrés avec la collection avant
leur suppression dans Supabase Storage. Cette file persiste en cas de panne ; une
nouvelle tentative ou un rechargement reprend le nettoyage. La suppression n’est
annoncée comme terminée qu’après le retrait des fichiers et de cette file.
Les archives déjà téléchargées par des tiers ne sont pas effacées.

## Accord de participation

Après la connexion, avant le pseudonyme et l’accès à la collection, un écran
explique la recherche, les données collectées, les destinataires et la licence
CC BY 4.0. La case est décochée et une action explicite est requise.
L’acceptation horodatée et la version `guacabook-research-v1` sont conservées dans
le JSON du compte (`researchConsent`) avec `consent: true`. Cet écran réapparaît
pour les anciens comptes qui n’ont pas encore accepté cette version. En cas
d’échec de sauvegarde, l’accès reste sur cet écran pour permettre une nouvelle tentative.

Après acceptation, chaque sauvegarde contenant des photos appelle automatiquement
la fonction existante `submit_dataset` : le statut soumis et sa date sont inscrits
par Supabase. Il n’y a plus de case de licence ni de bouton de soumission en bas
de page. L’export final continue de filtrer les photos validées.

## Export personnel

Le menu replié « Exporter mes données » conserve le téléchargement du compte
courant, avec ses photos et annotations, brouillons compris. L’autorisation CC BY
4.0 reste requise pour cet export COCO.

## Exports globaux

Les comptes autorisés à consulter les contributions (administrateur et réviseur)
trouvent ces actions dans « Administration des contributions ». Les accès restent
contrôlés par les politiques Supabase existantes, sans clé privilégiée côté navigateur.

- « Exporter tous les originaux pour vérification » rassemble les photos de tous
  les comptes accessibles, y compris les collections privées non soumises, dans
  `images/<compte>/<photo>-<nom>`. Cette archive sert à la vérification interne :
  elle ne constitue pas une autorisation de publication des images.
- « Exporter V1 (COCO + Wild Me) » rassemble les annotations terminées des collections
  soumises et autorisées. Son COCO générique conserve les informations déclarées.
  Son CSV Wild Me filtre les régions selon qualité, occlusion, côté, identité et
  revue de la révision. Voir le protocole V1 pour les chemins et découpages.

Les deux archives contiennent un `manifest.json` avec les comptes, révisions,
statuts et autorisations au moment de l’export. Les originaux peuvent contenir des
métadonnées privées. Les archives sont assemblées dans le navigateur ; pour une
collecte volumineuse, il faudra déplacer cette génération vers un traitement serveur.
La revue V1 nécessite la migration 004.
