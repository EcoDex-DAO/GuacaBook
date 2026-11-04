# Espèces et hybridation

Le formulaire distingue les espèces des noms de croisements. `lib/macaws.ts`
répertorie 17 espèces d’aras, sans subdiviser les sous-espèces. Les noms courants
sont traduits ; les noms scientifiques stockés restent identiques dans les quatre
langues. Cette liste peut évoluer. « Autre » accepte une déclaration libre sans
la transformer automatiquement en taxon reconnu. « Espèce inconnue » reste le
choix par défaut. Les identifications sont déclarées par les contributeurs.

Le champ historique `individuals[].species` est conservé : nom scientifique pour
une espèce choisie, texte saisi pour Autre, chaîne vide si inconnue, `hybrid` pour
un hybride. Les anciens animaux restent lisibles sans conversion automatique.

Le nouveau champ facultatif `individuals[].speciesInfo`, stocké sur le compte et
conservé dans les exports COCO personnels et globaux, distingue :

- `{"kind":"species","scientificName":"Ara ararauna"}` ;
- `{"kind":"unknown"}` ;
- `{"kind":"other","label":"texte déclaré"}` ;
- `{"kind":"hybrid","parents":[...,...],"label":"nom facultatif"}`.

Les parents A et B n’indiquent ni le sexe ni l’ordre maternel/paternel. Chaque
parent peut être une espèce du catalogue, inconnu, lui-même hybride, ou Autre
avec un texte. Ils ne créent pas de nouveaux animaux dans le compte. Aucune
proportion génétique ou filiation n’est déduite d’un nom courant tel que Catalina.
Les hybrides multigénérationnels peuvent donc être signalés sans inventer une
ascendance. Une description généalogique complète reste hors du formulaire actuel.

Aucune migration SQL supplémentaire n’est nécessaire : ces attributs sont stockés
dans le JSON existant de la collection.

Le sexe déclaré est stocké dans `individuals[].sex` (`male`, `female` ou
`unknown`). `individuals[].birthYear` est un entier ou `null` si inconnu. L’année
ne peut pas être future. L’âge n’est pas stocké : l’interface calcule chaque fois
l’année courante moins l’année de naissance et affiche un âge approximatif,
puisque le jour et le mois ne sont pas collectés. Les anciens animaux sans ces
champs sont affichés avec des informations inconnues.
