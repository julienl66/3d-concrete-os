# Installation du module Messagerie

Le module a été intégré au projet React et le build Vite a été validé.

## 1. Déployer la nouvelle Edge Function

Depuis la racine du projet :

```bash
supabase functions deploy gmail-actions
```

Les secrets déjà utilisés par `gmail-auth` et `gmail-sync` sont réutilisés :

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` ou `SUPABASE_SECRET_KEY`

## 2. Déployer le frontend

```bash
npm install
npm run build
```

Puis déployer normalement sur Vercel.

## 3. Fonctionnement

Le nouvel onglet **Messagerie** permet de :

- afficher les conversations synchronisées ;
- filtrer par réception, envoyés, favoris, brouillons, corbeille ou tous les messages ;
- rechercher un message ;
- lire une conversation ;
- marquer une conversation comme lue ;
- ajouter ou retirer une étoile ;
- envoyer un nouveau message ;
- répondre dans une conversation ;
- placer une conversation dans la corbeille ;
- relancer manuellement la synchronisation.

La page lit `gmail_threads` et `gmail_messages`. Les actions Gmail passent par `gmail-actions`.
