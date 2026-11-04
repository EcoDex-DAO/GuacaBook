# Comptes, types et invitations

Cette évolution nécessite **la migration 002** et une **clé privée côté serveur Vercel**. Elle ne remplace pas les deux paramètres publics déjà configurés et ne supprime aucune collection. Le SMTP existant est utilisé pour les invitations envoyées par e-mail et les demandes « mot de passe oublié ».

## 1. Préparer l’administrateur initial

Dans Supabase → Authentication → Users, vérifier qu’un utilisateur **ecodexdao@gmail.com** existe et que son e-mail est confirmé. S’il n’existe pas, le créer avec l’outil d’administration Supabase (avec un mot de passe fort choisi hors du chat et confirmation par le propriétaire du projet). Ne pas utiliser une inscription publique pour attribuer le rôle initial.

Dans SQL Editor, exécuter **une seule fois** [002_account_management.sql](../supabase/migrations/002_account_management.sql), après la migration 001 déjà installée. La transaction échoue sans modification si l’administrateur initial n’existe pas ou n’est pas confirmé. Le rôle est lié à son UUID Auth ; il n’est jamais attribué à partir des métadonnées modifiables du navigateur.

Le compte `ecodexdao@gmail.com` devient administrateur actif et protégé. L’interface ne peut ni le suspendre ni le rétrograder. Les autres administrateurs ne peuvent pas générer un lien de récupération pour ce compte protégé. Le propriétaire peut utiliser « mot de passe oublié » pour recevoir son propre lien par e-mail.

Les comptes déjà présents restent actifs ; les anciens membres de `research_admins` conservent un rôle administrateur. Les nouveaux utilisateurs Auth démarrent **inactifs**, même s’ils déclarent `role=admin` dans leurs métadonnées. Seule une opération autorisée les active.

## 2. Définir la clé serveur dans Vercel

Dans Vercel → Project → Settings → Environment Variables, ajouter pour Production :

| Nom                   | Valeur                                                                 |
| --------------------- | ---------------------------------------------------------------------- |
| `SUPABASE_SECRET_KEY` | Clé **Secret** Supabase du même projet, ou ancienne clé `service_role` |

Cette variable est **privée**, de type **Secret**. Ne jamais la préfixer par `NEXT_PUBLIC_`, la mettre dans un fichier Git, une capture ou le chat. Les variables publiques existantes restent inchangées.

La clé privée sert exclusivement à l’API serveur `/api/admin/invitations` pour générer les liens Auth. Chaque requête vérifie le JWT auprès de Supabase puis les permissions actuelles en base **avant** de créer le client privilégié. Le rôle ne provient pas d’un champ envoyé par le navigateur. Aucun secret serveur n’est renvoyé au client.

Redéployer Vercel une fois les paramètres et la migration en place. Sans clé privée, la connexion et les collections fonctionnent, mais la génération des liens est indisponible. Sans migration 002, l’application refuse d’ouvrir les collections et affiche une demande de configuration.

## 3. Configurer Authentication

- Garder le fournisseur **Email** activé, avec la connexion par mot de passe et la confirmation d’e-mail.
- Désactiver les **nouvelles inscriptions publiques** (« Allow new users to sign up ») dans les réglages de connexion Supabase, une fois l’administrateur initial créé. L’API administrative d’invitation crée les utilisateurs autorisés. L’application ne propose pas de formulaire d’inscription public ; en plus, les créations directes non autorisées restent inactives côté base.
- Dans URL Configuration, garder la Site URL de production et autoriser les redirections exactes vers `https://VOTRE_SITE/auth/invite` et `https://VOTRE_SITE/auth/recover`. Ajouter les mêmes chemins pour localhost uniquement si nécessaire au développement.
- Le modèle **Reset password** doit conserver un lien `{{ .ConfirmationURL }}`. Le modèle **Invite user** doit conserver `{{ .ConfirmationURL }}` pour les invitations envoyées par e-mail. Le bouton **Créer le lien d’invitation** permet aussi une transmission manuelle sans envoi SMTP.

Les anciens utilisateurs sans mot de passe doivent en choisir un lors de leur prochaine ouverture avec une session valide. S’ils sont déconnectés, « Mot de passe oublié ? » leur permet de recevoir un lien pour le définir, sous réserve que leur compte soit actif.

## 4. Utiliser la gestion des comptes

Se connecter avec `ecodexdao@gmail.com` puis ouvrir **Gestion des comptes**.

- **Comptes** : rechercher un e-mail, modifier son type, activer/suspendre son accès et générer un lien pour définir ou réinitialiser son mot de passe.
- **Inviter une personne** : saisir son e-mail, choisir le type et cliquer **Envoyer l’invitation par e-mail**, ou **Créer le lien d’invitation** pour le copier et le transmettre en privé. Il donne accès au compte ciblé et permet de choisir un mot de passe d’au moins 12 caractères. Le lien expire selon la configuration Auth Supabase.
- **Types de compte** : créer des types personnalisés, modifier leur nom et leurs permissions, supprimer un type personnalisé non attribué. Les types intégrés gardent leurs permissions. Réattribuer d’abord les comptes d’un type avant de le supprimer.

Types initiaux :

| Type           | Accès                                                                           |
| -------------- | ------------------------------------------------------------------------------- |
| Administrateur | Gestion des comptes/types et consultation des contributions                     |
| Contributeur   | Sa propre collection uniquement                                                 |
| Réviseur       | Sa propre collection et consultation des contributions, sans gestion de comptes |

Un type personnalisé avec « Administrer les comptes et les types » est un type administrateur et obtient aussi la consultation des contributions. Les noms personnalisés ne sont pas traduits automatiquement.

Les liens sont affichés uniquement en mémoire et ne sont pas stockés dans la collection. Les transmettre par le canal privé de votre choix ; ne pas les publier. La génération d’invitation crée un utilisateur Auth : en cas d’échec après création, l’utilisateur peut rester inactif ou sans mot de passe. Vérifier sa ligne plutôt que multiplier les créations. Pour un compte existant, utiliser **Créer un lien de mot de passe**. Si Supabase refuse un lien pour un compte non confirmé, utiliser l’administration Auth pour renvoyer une invitation et vérifier son e-mail.

## 5. Parcours de l’invité

1. Ouvrir le lien reçu.
2. Choisir et confirmer un mot de passe d’au moins 12 caractères.
3. Accéder à sa collection centralisée.
4. Aux prochaines visites, se connecter avec **e-mail et mot de passe**.

Le mot de passe est géré par Supabase Auth ; il n’est pas enregistré dans les tables de collection, les logs applicatifs ou le navigateur comme brouillon. Une connexion suspendue n’ouvre pas le dataset. Les politiques RLS et les RPC appliquent la suspension aux requêtes avec des JWT encore valides. Les permissions d’interface sont rafraîchies au retour sur la page et périodiquement ; les opérations administratives revérifient les droits à chaque requête.

## Vérifications avant invitation réelle

- Le compte initial voit Gestion des comptes et ses contrôles de rôle/statut sont verrouillés.
- Un contributeur ne voit pas ce menu et ses appels directs aux RPC administratives sont refusés.
- Créer un type et inviter une adresse de test ; le destinataire peut définir un mot de passe puis se reconnecter.
- Suspendre le testeur : il ne peut plus lire/écrire ses données, ni soumettre ou télécharger des photos.
- « Mot de passe oublié » délivre un e-mail et ramène au formulaire de nouveau mot de passe.

`npm test` vérifie les permissions SQL dans PostgreSQL embarqué et les contrôles de l’API serveur par injection de clients simulés. `node tests/accounts-browser.mjs` vérifie l’interface et le parcours invité sur l’API simulée. Les tests navigateur ne créent aucun vrai compte et n’envoient aucun e-mail. La livraison SMTP, les liens Supabase réels et la configuration Vercel restent à vérifier sur le projet hébergé après installation.

## 7. Suspension, bannissement et suppression (migration 003)

Pour activer ces fonctions sur un projet existant :

1. Dans Supabase, ouvrir **SQL Editor**, puis **New query**.
2. Copier tout le fichier `supabase/migrations/003_account_moderation.sql`.
3. Coller le SQL et cliquer sur **Run**. Il doit afficher **Success**.
4. Recharger GuacaBook, puis ouvrir **Gestion des comptes** avec un administrateur.

La clé serveur `SUPABASE_SECRET_KEY` déjà utilisée pour les invitations est également
requise pour le bannissement Auth et la suppression des utilisateurs/fichiers. Elle
reste exclusivement côté serveur. Aucun nouveau secret n’est requis.

Chaque action ouvre une confirmation intégrée. La suppression exige aussi de
recopier l’adresse e-mail du compte ciblé.

- **Suspendre** : coupe immédiatement l’accès aux données, même avec un JWT existant,
  et conserve la collection. Le compte peut encore s’authentifier mais voit un écran
  d’accès bloqué. **Réactiver** rétablit son accès.
- **Bannir** : bloque immédiatement les données et applique un bannissement Auth de
  longue durée (100 ans), jusqu’à sa levée explicite par un administrateur.
  **Lever le bannissement** laisse le compte suspendu : une réactivation distincte
  reste nécessaire. L’identité Auth et son adresse restent réservées. Cela ne bloque
  pas une personne qui tenterait de revenir avec une autre adresse ; les nouvelles
  inscriptions doivent rester sur invitation.
- **Supprimer** : marque d’abord le compte comme bloqué pour suppression, efface tous
  les objets de son dossier Storage, y compris les fichiers devenus orphelins et les
  sous-dossiers, puis supprime définitivement l’utilisateur Auth. Les collections et
  profils sont supprimés par les clés étrangères `ON DELETE CASCADE`.
  En cas d’échec, le compte reste bloqué et le bouton **Terminer la suppression**
  permet de reprendre. Aucune réactivation n’est permise tant que la suppression est
  en attente. Les archives déjà téléchargées restent hors du contrôle du projet.

Les administrateurs peuvent modérer d’autres administrateurs. Le compte initial
protégé et le compte de l’administrateur connecté ne peuvent pas être suspendus,
bannis ou supprimés par ces actions. Les permissions sont relues et contrôlées côté
serveur ; masquer les boutons n’est pas la protection de sécurité.
