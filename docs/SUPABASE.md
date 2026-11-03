# Configuration centralisée Supabase + Vercel

La connexion est obligatoire. Animaux, photos et annotations sont chargés depuis Supabase et enregistrés automatiquement. Il n’existe plus de mode de démonstration locale, de bouton de sauvegarde manuelle ou de transfert dans l’interface. Aucun nouveau brouillon n’est enregistré dans IndexedDB.

**Si la migration 001 a déjà été exécutée avec succès, aucune nouvelle modification SQL n’est nécessaire pour cette mise à jour.** Les deux variables Vercel existantes restent valables. Un redéploiement de l’application suffit.

## Installation initiale seulement

1. Créer un projet Supabase, de préférence dans une région européenne. Vérifier les quotas actuels avant d’inviter les testeurs.
2. Dans SQL Editor, exécuter une seule fois [001_private_collection.sql](../supabase/migrations/001_private_collection.sql). Ne pas supprimer les tables ni désactiver RLS pour contourner une erreur.
3. Activer le fournisseur Email dans Authentication. Configurer un SMTP personnalisé pour les destinataires externes à votre équipe Supabase. Les identifiants SMTP restent uniquement dans Supabase.
4. Dans les modèles **Confirm sign up** et **Magic link or OTP**, inclure `{{ .Token }}` pour le code et éventuellement `{{ .ConfirmationURL }}` pour le lien.
5. Dans URL Configuration, mettre l’URL HTTPS de production comme Site URL et dans Redirect URLs. Ajouter `http://localhost:3000/**` uniquement pour le développement et les origines Preview précises si utilisées.
6. Dans Vercel, ajouter pour Production les valeurs publiques :

| Variable                               | Valeur                                                 |
| -------------------------------------- | ------------------------------------------------------ |
| `NEXT_PUBLIC_SUPABASE_URL`             | URL `https://VOTRE_PROJET.supabase.co`                 |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Clé publique Publishable ou ancienne clé publique anon |

**Jamais de clé `service_role`, de `sb_secret_…` ou de mot de passe PostgreSQL dans ces variables.** La compilation refuse les clés privilégiées reconnues. Redéployer après modification : les paramètres publics sont intégrés à la compilation. En développement, copier `.env.example` vers `.env.local`, ignoré par Git.

## Accès et données

Le bucket `guacabook-photos` reste privé. Chaque compte accède à sa propre collection et à ses photos. Les administrateurs explicitement autorisés peuvent consulter les contributions. Ne pas ajouter de règle globale de lecture : les politiques permissives RLS se combinent avec OR. Sur un projet existant, examiner les autres politiques.

Une collection par compte regroupe plusieurs animaux et lots. `contributor_datasets` conserve la collection JSON, sa révision et son statut. Les originaux sont des objets immuables `UUID-compte/UUID-photo`. Les fichiers déjà transférés ne sont pas renvoyés à chaque changement d’annotation.

Après une première connexion, donner accès à votre compte responsable via SQL Editor :

```sql
insert into public.research_admins(user_id)
select id from auth.users where lower(email)=lower('VOTRE_EMAIL')
on conflict do nothing;
```

Recharger ensuite la page. **Administration des contributions** permet de consulter les collections et d’exporter celles soumises avec consentement. Ces données ne sont pas chargées dans votre collection personnelle.

## Sauvegarde et soumission

Les changements sont envoyés automatiquement après un court délai. Une file sérialisée poursuit l’enregistrement si l’utilisateur modifie les données pendant un transfert. Le statut indique les modifications en attente, l’enregistrement en cours ou sa réussite. Les révisions empêchent les écrasements silencieux entre appareils.

Une panne interrompt l’enregistrement et affiche une erreur ; les changements restent en mémoire dans l’onglet, sans copie persistante. Garder la page ouverte et utiliser **Réessayer la sauvegarde**. **Télécharger une copie de secours** enregistre un ZIP de récupération sur demande ; il ne s’agit pas d’une publication de recherche. Une actualisation avec modifications non envoyées demande confirmation. La déconnexion volontaire attend la sauvegarde et reste bloquée si elle échoue.

Pour soumettre une collection, cocher l’autorisation CC BY 4.0 puis cliquer **Soumettre ma collection à la recherche**. La sauvegarde est terminée avant la soumission. Date, licence et version du consentement sont enregistrées côté serveur. Une modification ultérieure remet la collection en brouillon.

## Test réel à deux comptes

1. Compte A : se connecter, créer un animal, importer 2–3 photos et annoter. Attendre **Toutes les modifications sont enregistrées en ligne** sans cliquer sur un bouton de sauvegarde.
2. Recharger la page, puis se connecter avec A sur un autre appareil : la collection doit revenir automatiquement.
3. Compte B : vérifier que la collection de A est absente.
4. Cocher le consentement et soumettre A. Depuis le compte responsable, actualiser la liste et exporter sa contribution COCO.
5. Deux appareils A ouverts sur la même révision : modifier le premier, attendre son enregistrement, puis modifier le second. Un conflit doit empêcher l’écrasement. Télécharger une copie des changements non enregistrés avant de choisir **Actualiser depuis le projet**.
6. Simuler une panne réseau, modifier, vérifier l’erreur puis rétablir la connexion et réessayer la sauvegarde. Ne pas fermer l’onglet pendant l’échec.

## Limites de la bêta

- 100 photos par collection, 15 Mo par photo, JPEG/PNG/WebP. Ce sont des limites applicatives, pas une garantie de respect du quota global gratuit.
- Pas de fusion automatique entre appareils ni d’historique complet des révisions.
- Les anciens caches des versions précédentes ne sont plus lus et ne sont pas effacés silencieusement. Seules les collections déjà envoyées à Supabase sont reprises automatiquement. Conserver les anciennes données non envoyées pour une récupération séparée avant de nettoyer le navigateur.
- La session d’authentification et la langue restent mémorisées ; aucune photo ni annotation n’est écrite comme nouveau brouillon persistant dans le navigateur.
- Les administrateurs peuvent consulter les brouillons en ligne ; seuls les dossiers soumis sont exportables par l’interface d’administration.
- Les originaux peuvent conserver des métadonnées privées, dont GPS. Aucun nettoyage EXIF automatique : vérifier les fichiers avant l’envoi.
- Une sauvegarde interrompue peut laisser des objets sans référence. Les nettoyer via Storage seulement après vérification. Ne pas supprimer directement des lignes `storage.objects` en pensant effacer les fichiers physiques.
- Pas de suppression autonome du compte ni de modération par lot. Traiter les demandes de suppression via Storage, la collection et Authentication.
- Examiner sauvegardes, restauration, confidentialité, inscriptions et quotas avant recrutement public. Le plan gratuit ne constitue pas une stratégie de sauvegarde.

## Tests de développement

`npm test` exécute les tests PostgreSQL embarqués (isolation, privilèges, consentement), les règles COCO et les catalogues de traduction. Les navigateurs utilisent une API Supabase simulée ; aucun vrai e-mail n’est envoyé et les destinations externes sont bloquées.

```sh
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_test_only npm run build
npm start
```

Dans un autre terminal : `npm run smoke`, `node tests/cloud-browser.mjs`, `node tests/i18n-browser.mjs`. `CHROMIUM_PATH` et `TEST_BASE_URL` permettent un autre exécutable/origine. Ces simulations ne prouvent pas la livraison d’e-mails ni la configuration de votre projet hébergé : effectuer ensuite le test réel à deux comptes.

Ne pas déployer une compilation contenant les paramètres factices. Compiler avec les paramètres publics du vrai projet pour le déploiement ; sans paramètres, une page d’indisponibilité s’affiche et aucun éditeur n’est proposé.

Pour vérifier l’absence de repli local, compiler sans les deux variables, démarrer le serveur puis lancer `node tests/unconfigured-browser.mjs`. Cette vérification doit afficher une indisponibilité sans formulaire ni éditeur.
