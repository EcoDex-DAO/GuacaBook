# Configurer la bêta Supabase + Vercel

Aucun VPS requis. L’application reste sur Vercel. Supabase fournit la connexion par e-mail, PostgreSQL et le stockage privé. La sauvegarde cloud est **manuelle** ; les brouillons continuent de se sauvegarder automatiquement sur l’appareil.

## 1. Créer le projet

Créer un projet gratuit neuf sur https://supabase.com/dashboard, de préférence dans une région européenne. Conserver le mot de passe PostgreSQL dans un gestionnaire de mots de passe : l’application n’en a pas besoin. Vérifier les quotas actuels du plan gratuit avant d’inviter des testeurs ; photos, trafic sortant et e-mails peuvent les consommer rapidement. Les limites applicatives de 100 photos et 15 Mo par photo ne garantissent pas le respect du quota global.

## 2. Installer le SQL

Dans **SQL Editor → New query**, copier le contenu complet de [001_private_collection.sql](../supabase/migrations/001_private_collection.sql) et cliquer sur **Run**. L’exécuter **une seule fois**. La migration est transactionnelle : en cas d’erreur, ne pas ajouter des tables à la main ni retirer les règles RLS pour la faire passer ; noter le message d’erreur.

Le SQL crée :

- `contributor_datasets` : une collection JSON versionnée par compte (animaux, lots et annotations), adaptée à une petite bêta ;
- `research_admins` : liste des responsables, modifiable uniquement par l’administration SQL ;
- le bucket **privé** `guacabook-photos`, JPEG/PNG/WebP, 15 Mo par objet ;
- les règles RLS : chaque contributeur lit/écrit sa propre collection et ses photos ; un responsable autorisé peut lire les contributions, sans modifier celles d’un autre compte ;
- une fonction de soumission qui vérifie l’autorisation et enregistre côté serveur date, licence et version du consentement.

Ne pas rendre le bucket public. Ne pas ajouter de politique globale du type « everyone can read all files ». Sur un projet existant, faire examiner les autres politiques avant usage : les politiques permissives PostgreSQL se combinent avec OR. Un projet neuf évite de réutiliser accidentellement une règle trop large.

## 3. Régler les e-mails

Dans **Authentication**, activer le fournisseur **Email**. La connexion est sans mot de passe. Dans les modèles d’e-mail **Confirm signup** et **Magic Link**, inclure le code :

```html
<h2>GuacaBook</h2>
<p>Code / Código: <strong>{{ .Token }}</strong></p>
```

Conserver éventuellement aussi le lien de confirmation fourni par Supabase. Le formulaire accepte le code reçu. Ne pas confondre ce code temporaire avec une clé API.

**Pour des testeurs externes : configurer un SMTP personnalisé** dans les réglages d’e-mail/SMTP de Supabase. Le service d’e-mail fourni par défaut restreint les destinataires et les envois ; il ne suffit pas pour une bêta avec des personnes extérieures à votre équipe. Utiliser un prestataire SMTP et vérifier le domaine/adresse d’expédition selon ses instructions. Ses identifiants restent dans les réglages Supabase, jamais dans le code ni dans le chat.

Cette première intégration permet la création de comptes par connexion e-mail lorsque Supabase autorise les inscriptions. Elle ne met pas en place de liste d’invitations applicative. Garder le lien de test dans un groupe restreint et régler les inscriptions/limites dans Supabase avant une diffusion publique.

## 4. Régler les URL

Dans **Authentication → URL Configuration** :

- **Site URL** : URL HTTPS de production GuacaBook sur Vercel ;
- **Redirect URLs** : URL de production, et `http://localhost:3000/**` pour le développement ;
- ajouter explicitement l’adresse d’un déploiement Preview uniquement si vous comptez tester la connexion dessus.

Éviter d’autoriser indistinctement tous les domaines Vercel. En cas de problème de lien, vérifier l’origine exacte et utiliser le code plutôt qu’un lien ouvert dans un autre navigateur.

## 5. Relier Vercel

Dans Supabase, relever le **Project URL** et la clé **Publishable** (ou ancienne clé publique `anon`). Dans **Vercel → Project → Settings → Environment Variables**, ajouter :

| Nom                                    | Valeur                                         |
| -------------------------------------- | ---------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`             | `https://VOTRE_REFERENCE.supabase.co`          |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Clé publique Publishable, ou ancienne clé anon |

Ces deux paramètres sont publics et utilisés par le navigateur. **Jamais de clé `service_role`, `sb_secret_…` ni de mot de passe PostgreSQL.** Les règles RLS assurent la séparation des comptes. La compilation refuse les clés privilégiées reconnues.

Enregistrer pour l’environnement Production, puis **redéployer** : les variables `NEXT_PUBLIC_` sont intégrées à la compilation. Sans ces deux paramètres, le site reste en démonstration locale et l’indique dans un bandeau. Pour développer localement, copier `.env.example` vers `.env.local` et remplir les deux paramètres ; `.env.local` est ignoré par Git.

## 6. Créer votre accès responsable

Se connecter une première fois à GuacaBook avec votre e-mail. Ensuite, dans SQL Editor, remplacer l’adresse ci-dessous par celle de votre compte :

```sql
insert into public.research_admins(user_id)
select id from auth.users where lower(email)=lower('VOTRE_EMAIL')
on conflict do nothing;
```

La requête doit ajouter une ligne (ou le compte existe déjà). Si aucune ligne n’est ajoutée et que la liste est vide, vérifier que le compte a bien été créé. Recharger GuacaBook : la section **Administration des contributions** apparaît. On peut voir les collections et télécharger en COCO celles soumises avec consentement. Ces données ne sont pas chargées dans votre propre collection, ce qui évite une sauvegarde accidentelle dans le mauvais compte.

## 7. Test à deux comptes et deux appareils

1. Compte A : créer un animal, importer 2–3 photos, annoter, cocher l’autorisation CC BY 4.0, cliquer **Sauvegarder en ligne**, puis **Soumettre ma collection à la recherche**.
2. Sur un autre appareil avec A : cliquer **Charger la version en ligne**. Les photos et cadres doivent revenir. La copie locale actuelle sera remplacée après confirmation.
3. Compte B : vérifier que la collection de A est absente. Chaque compte utilise une clé IndexedDB distincte sur l’appareil.
4. Responsable : **Actualiser les contributions**, puis exporter la collection soumise de A. Vérifier les photos et le JSON COCO.
5. Deux appareils ouverts avec A : charger la même version sur les deux, sauvegarder sur le premier, puis tenter de sauvegarder sur le second. Un conflit doit empêcher l’écrasement silencieux. Exporter les modifications locales avant de recharger la version distante.

Une collection existante en ligne doit d’abord être chargée avant de pouvoir sauvegarder sur un nouvel appareil. Le transfert d’anciens brouillons locaux est volontaire et distinct ; il ne supprime pas l’ancien brouillon, réinitialise son consentement et ne l’envoie pas tant que vous ne cliquez pas sur Sauvegarder.

## Fonctionnement et limites de cette bêta

- Une collection par compte, contenant plusieurs animaux et lots ; chaque sauvegarde remplace la version courante avec contrôle de révision, pas de fusion automatique ni d’historique complet.
- Envoi séquentiel des originaux ; objets immuables nommés `UUID-compte/UUID-photo`. Une sauvegarde interrompue peut laisser des objets sans référence, à nettoyer via Storage après vérification. Aucun original n’est effacé automatiquement.
- Le tableau cloud est distinct du brouillon local. Une modification pendant un transfert ne doit pas être considérée comme déjà sauvegardée : sauvegarder à nouveau.
- Les responsables autorisés peuvent consulter les brouillons en ligne ; seules les collections soumises sont exportables par l’interface d’administration.
- L’envoi conserve les originaux, donc potentiellement leurs métadonnées privées. Pas d’extraction GPS dans l’application, mais **pas de nettoyage EXIF automatique**. Pour cette bêta, envoyer des images sans métadonnées sensibles. Avant recrutement public, prévoir une politique de confidentialité et décider de la suppression des métadonnées.
- Pas encore de suppression autonome du compte, de stockage objet externe ni de modération par lot. Une demande de suppression doit être traitée par l’administrateur : supprimer les objets via Storage, la collection, puis le compte dans Authentication. Supprimer seulement une ligne `storage.objects` en SQL ne supprime pas nécessairement les fichiers physiques.
- Le plan gratuit n’est pas une stratégie de sauvegarde : prévoir des exports et examiner les options de restauration avant une collecte réelle.

Les tests PostgreSQL embarqués vérifient les politiques avec deux contributeurs et un responsable. Les tests navigateur utilisent un serveur Supabase simulé pour les cas d’interface ; ils ne prouvent pas la livraison d’e-mails ni le fonctionnement de votre projet hébergé. Le test réel ci-dessus reste nécessaire après configuration.

## Reproduire les tests de développement

Le test connecté utilise exclusivement des réponses HTTP simulées et bloque les destinations externes. Depuis la racine du dépôt, sur une instance de développement :

```sh
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_test_only npm run build
PORT=3001 npm start
```

Dans un second terminal : `node tests/cloud-browser.mjs`. Arrêter ce serveur après le test. Recompiler ensuite avec `npm run build` sans ces variables factices pour retrouver la démo locale, puis lancer `npm start` et `npm run smoke`. Ne jamais publier une compilation de test avec ces paramètres factices. Pour tester le service hébergé, suivre le parcours à deux comptes ci-dessus avec les vrais paramètres publics de votre projet.
