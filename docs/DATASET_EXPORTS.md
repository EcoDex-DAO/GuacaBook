# Animaux et exports

## Suppression d’un animal

Dans « Mes animaux », le bouton « Supprimer cet animal » demande une confirmation.
La suppression retire l’animal et ses cadres d’annotation. Les originaux restent
sur le compte : ils apparaissent dans « Photos sans animal associé » et peuvent
être associés à un autre animal. Les annotations des autres animaux sont conservées.
La modification est sauvegardée automatiquement. Aucun fichier Storage n’est effacé.

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
- « Exporter le dataset annoté final (COCO) » rassemble uniquement les collections
  soumises avec autorisation CC BY 4.0, et leurs photos marquées terminées dont
  toutes les étapes d’annotation sont valides. Les brouillons sont exclus.
  `annotations.json` et les originaux utilisent les mêmes chemins. Les identifiants
  d’animaux, images, séances et lots sont préfixés par le compte pour éviter les
  collisions. Les boîtes restent exprimées dans les pixels des originaux.

Les deux archives contiennent un `manifest.json` avec les comptes, révisions,
statuts et autorisations au moment de l’export. Les originaux peuvent contenir des
métadonnées privées. Les archives sont assemblées dans le navigateur ; pour une
collecte volumineuse, il faudra déplacer cette génération vers un traitement serveur.
Aucune migration SQL supplémentaire n’est nécessaire pour ces changements.
