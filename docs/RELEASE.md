# Publier une version de Percival

Le client Windows est distribué par un installateur (`Percival_X.Y.Z_x64-setup.exe`) publié sur les
GitHub Releases du dépôt. Les clients installés cherchent une nouvelle version au démarrage puis
toutes les 6 heures, et se mettent à jour d'un clic. Les mises à jour sont signées : le client
refuse tout fichier dont la signature ne correspond pas à la clé publique intégrée à
`apps/desktop/src-tauri/tauri.conf.json`.

L'installateur s'installe pour l'utilisateur courant (dossier `%LOCALAPPDATA%\Percival`), sans droits
d'administrateur ; la mise à jour automatique n'en demande pas non plus.

## À faire une seule fois

1. **Dépôt GitHub public** : `https://github.com/valinkoo/Percival-releases`. Public, car le client
   télécharge les mises à jour sans s'authentifier. Y relier le dépôt local :

   ```bash
   git remote add origin https://github.com/valinkoo/Percival-releases.git
   ```

   Le dépôt contient déjà un commit initial (un README) : avant le premier push, rapatrier son
   historique (`git fetch origin`, puis fusion avec `--allow-unrelated-histories` en gardant notre
   `README.md`) plutôt que de forcer le push. Puis `git push -u origin main --tags`.

2. **Adresse des mises à jour.** Elle est déjà renseignée dans `plugins.updater.endpoints` de
   `apps/desktop/src-tauri/tauri.conf.json` (`.../valinkoo/Percival-releases/releases/latest/download/latest.json`).
   Si le dépôt est renommé, la modifier et publier une nouvelle version.

3. **Clé de signature.** Elle est générée hors du dépôt, dans `%USERPROFILE%\.tauri\` :
   - `percival-updater.key` : clé privée, sans mot de passe (ne jamais la committer, ni la partager) ;
   - `percival-updater.key.pub` : clé publique, déjà copiée dans `tauri.conf.json`.

   Dans le dépôt GitHub, **Settings → Secrets and variables → Actions → New repository secret**,
   créer le secret `TAURI_SIGNING_PRIVATE_KEY` avec le contenu du fichier `percival-updater.key`.

   Garder une copie du fichier dans un gestionnaire de mots de passe. Si la clé est perdue, les
   installations existantes ne pourront plus se mettre à jour : il faudrait générer une nouvelle
   paire et réinstaller à la main.

## À chaque version

1. Sur la branche `dev/vX.Y.Z`, mettre le même numéro de version dans
   `apps/desktop/src-tauri/tauri.conf.json`, `apps/desktop/src-tauri/Cargo.toml` et
   `apps/desktop/package.json`, puis vérifier : `node scripts/check-version.mjs`.
2. Recette, fusion dans `main`, tag `vX.Y.Z` (voir la méthode de travail du README).
3. Pousser : `git push origin main vX.Y.Z`.
4. Le workflow **Release** (`.github/workflows/release.yml`) compile et signe l'installateur, puis
   publie la release avec l'installateur, sa signature et `latest.json` (10 à 20 minutes). Il refuse
   de publier si le tag ne correspond pas au numéro de version.

Le serveur n'est pas concerné : il se met à jour à part (`docker compose up -d --build`).

## Construire l'installateur en local

Utile pour tester sans passer par GitHub (PowerShell, depuis la racine du projet) :

```powershell
$env:TAURI_SIGNING_PRIVATE_KEY = "$env:USERPROFILE\.tauri\percival-updater.key"
pnpm build
pnpm --filter "@percival/desktop" tauri build
```

L'installateur et sa signature (`.sig`) se trouvent dans
`apps/desktop/src-tauri/target/release/bundle/nsis/`.

## Avertissement SmartScreen

L'installateur n'est pas signé par un certificat de signature de code (payant). Au premier
lancement, Windows SmartScreen affiche « Windows a protégé votre ordinateur » : cliquer sur
**Informations complémentaires** puis **Exécuter quand même**. Les mises à jour automatiques
ne sont pas concernées, leur intégrité étant vérifiée par la signature ci-dessus.
