# Compte rendu — TP Pipeline DevSecOps (Master TRC)
Étapes validées : 10/10

## Étape 1 — Préparer son poste
- [x] node -v affiche v22.x
- [x] docker run hello-world fonctionne sans sudo
- [x] Les 7 images sont téléchargées (docker images)
- [x] La base Trivy est téléchargée

## Étape 2 — Mise en place
- [x] npm test affiche 3 tests réussis
- [x] package-lock.json est commité
- [x] Le dépôt tp-notes est visible sur github.com

**Q.** Pourquoi faut-il commiter package-lock.json, et pourquoi utilisera-t-on npm ci plutôt que npm install dans le pipeline ?
Il faut commiter le fichier package-lock.json dans Git pour garantir que tous les développeurs et le pipeline utilisent les mêmes versions des dépendances, ce qui rend les installations reproductibles et évite les différences entre les environnements.

## Étape 3 — CI de base
- Durée du job build-test (secondes) : 8
- [x] Le pipeline passe au vert sur main
- [x] La pull request test-rouge est bloquée (pipeline rouge)
- [x] La pull request est fermée sans merge, branche supprimée

**Q.** Quelle est la différence entre ce que vous venez de faire (Continuous Integration) et le Continuous Delivery ? Que manque-t-il au pipeline pour en faire du Continuous Delivery ?
La CI (ce que nous venons de faire) construit et teste automatiquement le code à chaque push ou PR : pipeline vert = merge possible, rouge = bloqué. Le Continuous Delivery va plus loin : chaque version validée est automatiquement empaquetée et déployée en préproduction, donc toujours prête à partir en production en un clic.

Il manque à notre pipeline : une étape de build/packaging (artefact ou image Docker), un déploiement automatique en staging, des tests complémentaires sur cet environnement, et un déclenchement de la mise en production par simple validation manuelle.

## Étape 4 — Conteneur
- Taille de l'image naïve (Mo) : 1140 (Docker affiche 1.14GB)
- Trivy : HIGH + CRITICAL (naïve) : 709 (677 HIGH + 32 CRITICAL, tableau Debian)
- Checkov : contrôles échoués (naïve) : 2 (CKV_DOCKER_3 : pas d’utilisateur, CKV_DOCKER_2 : pas de HEALTHCHECK)
- Utilisateur affiché par whoami (naïve) : 	root (le Dockerfile n’a pas de USER)                 

**Q.** Repérez trois défauts de la version naïve. Pour chacun, dites quel risque il crée.
Image de base lourde (node:22 complète, 1,14 Go) : elle embarque des centaines de paquets inutiles (compilateurs, ImageMagick, MariaDB, etc.). Risque : une surface d’attaque énorme, avec 709 vulnérabilités HIGH/CRITICAL, plus un déploiement lent.
Exécution en root (pas d’instruction USER) : si l’application est compromise, l’attaquant a les droits root dans le conteneur. Risque : élévation de privilèges et évasion vers l’hôte plus facile.
COPY . . sans .dockerignore : tout le dossier est copié dans l’image (.git, fichiers .env, secrets, node_modules locaux). Risque : fuite de secrets dans l’image, image plus grosse et cache de build inefficace.
- Taille de l'image durcie (Mo) : 1140 (toujours 1.14GB)
- Trivy : HIGH + CRITICAL (durcie) : root
- Checkov : contrôles échoués (durcie) : —
- Utilisateur affiché par whoami (durcie) : —
- [x] L'image durcie démarre et /health répond
- [x] L'état de santé Docker passe à healthy
- [x] Dockerfile et .dockerignore durcis sont commités

**Q.** Une image avec 0 vulnérabilité HIGH/CRITICAL aujourd'hui le sera-t-elle encore dans un mois ? Que faut-il prévoir ?
Non, pas forcément. De nouvelles failles (CVE) sont découvertes chaque jour dans les paquets et dépendances de l’image, alors que l’image, elle, ne change pas : un scan propre n’est valable qu’à un instant donné. Il faut donc prévoir :

un scan Trivy automatique et régulier (à chaque build dans le pipeline CI, et en tâche planifiée sur les images déjà déployées) ;
une reconstruction régulière de l’image pour récupérer les mises à jour de l’image de base ;
la mise à jour automatisée des dépendances (Dependabot/Renovate) et des versions épinglées (tag précis ou digest) ;
un seuil bloquant dans le pipeline (échec si HIGH/CRITICAL) et un processus de correction rapide.

## Étape 5 — Dépendances & SBOM
- Dépendances directes : 	1 (express@4.22.3)
- Paquets dans l'arbre complet : 128
- npm audit : vulnérabilités trouvées : 0 (« found 0 vulnerabilities »)
- Composants dans sbom-src : 69
- Composants dans sbom-image : 681
- [x] Les deux SBOM sont générés (et ignorés par Git)
- [x] dependabot.yml est commité et les alertes sont activées

**Q.** Vous n'avez déclaré qu'une dépendance. Pourquoi l'arbre en contient-il autant ? Et pourquoi le SBOM de l'image est-il plus gros que celui du code source ?
Je n’ai déclaré qu’une seule dépendance directe (express), mais chaque paquet a ses propres dépendances, qui en ont d’autres : ce sont les dépendances transitives. Express entraîne donc 128 paquets dans l’arbre complet (body-parser, accepts, qs, etc.). Chacun est du code que je n’ai pas écrit ni relu, mais qui s’exécute dans mon application : cela agrandit la surface d’attaque et la chaîne d’approvisionnement.

Le SBOM de l’image (681 composants) est plus gros que celui du code source (69) car l’image contient bien plus que mon code : le système d’exploitation de l’image de base (Debian ou Alpine) avec tous ses paquets système (libc, openssl, curl, etc.), l’environnement d’exécution Node.js et npm avec leurs propres modules. Le SBOM du source ne liste que les dépendances du projet. Le SBOM de l’image donne la vraie liste de tout ce qui est livré en production, ce qui est indispensable pour surveiller les vulnérabilités.

## Étape 6 — Secrets
- Gitleaks : fuites trouvées sur le dépôt : 0 (« no leaks found », 3 commits scannés)
- Gitleaks : fuites trouvées avec demo.env : github-pat
- Nom de la règle déclenchée : 1
- [x] Le commit contenant demo.env a été refusé par le hook
- [x] demo.env est supprimé, rien n'a été poussé

**Q.** Le hook pre-commit est sur votre poste. Pourquoi faut-il quand même un scan de secrets dans le pipeline CI ? Et si un vrai secret avait été poussé, quelle serait la première action ?
Le hook pre-commit n’est qu’une protection locale et facultative : il n’existe que sur mon poste, chacun doit l’installer, et il peut être contourné (git commit --no-verify) ou tout simplement oublié sur une autre machine. Le scan de secrets dans le pipeline CI est le filet de sécurité commun : il s’exécute à chaque push et pull request pour tout le monde, sans dépendre de la configuration locale, et il peut bloquer le merge.

Si un vrai secret avait été poussé, la première action est de le révoquer et le régénérer immédiatement (rotation du jeton ou de la clé), car il doit être considéré comme compromis dès qu’il a quitté mon poste. Supprimer le fichier ou faire un nouveau commit ne suffit pas, le secret reste dans l’historique Git. Ensuite seulement, on nettoie l’historique (git filter-repo ou BFG), on vérifie les journaux d’accès pour détecter une utilisation frauduleuse, puis on ajoute les contrôles pour que cela ne se reproduise pas.

## Étape 7 — SAST
- Nombre de règles exécutées : 7 (« Ran 7 rules on 2 files »)
- Alertes (findings) : 	0 (après avoir ajouté USER node)
- Alertes avec le Dockerfile naïf : 1 (dockerfile.security.missing-user.missing-user)

**Q.** Semgrep ne trouve rien (ou presque) sur votre code. Cela prouve-t-il que l'application est sûre ? Citez deux limites du SAST.
Non, l’absence d’alertes ne prouve pas que l’application est sûre : elle prouve seulement que les règles utilisées n’ont pas trouvé de motif dangereux connu dans le code. Mon application est très petite, donc il y a peu de choses à détecter, mais cela ne garantit rien.

Deux limites du SAST :

Il n’analyse que le code source de façon statique, sans l’exécuter. Il ne voit pas les problèmes qui n’apparaissent qu’à l’exécution : mauvaise configuration du serveur, failles d’authentification ou de logique métier, vulnérabilités des dépendances ou de l’image (c’est le rôle du SCA et de Trivy), secrets, problèmes d’infrastructure. Pour cela il faut compléter avec du DAST, des tests et des revues.
Il dépend de ses règles et peut se tromper : il rate ce qu’aucune règle ne décrit (faux négatifs) et signale parfois des alertes sans danger réel (faux positifs), ce qui demande un tri humain.

## Étape 8 — Pipeline & portes
- Durée totale du pipeline (minutes) : —
- Job le plus long : —
- Porte 1 : jobs en échec : devsecops / image (pull_request)Failing after 31s
- Porte 2 : jobs en échec : devsecops / iac (pull_request)Failing after 18s devsecops / iac (push) devsecops / iac (push)Failing after 21s devsecops / sast (pull_request) devsecops / sast (pull_request)Failing after 34s devsecops / sast (push) devsecops / sast (push)Failing after 19s
- [x] Le pipeline complet est vert sur main
- [x] Les deux pull requests de test sont bloquées
- [x] Les branches de test sont fermées sans merge
- [x] Le SBOM est téléchargeable dans les artefacts

**Q.** Le pipeline utilise des images aquasec/trivy:latest, semgrep/semgrep, etc. sans version fixée. Quel risque cela crée-t-il pour la chaîne d'approvisionnement, et comment le réduire ?
Utiliser aquasec/trivy:latest, semgrep/semgrep ou gitleaks:latest sans version fixée signifie que le pipeline télécharge à chaque exécution la dernière image publiée, sans contrôle. Le risque pour la chaîne d’approvisionnement est double : si le compte du fournisseur ou l’image est compromis (image piégée, tag réécrit), du code malveillant s’exécute dans mon pipeline avec accès à mon code, à mes secrets et au GITHUB_TOKEN. De plus, une nouvelle version peut changer le comportement ou les règles et casser ou fausser mes builds, qui ne sont plus reproductibles.

Pour réduire ce risque : épingler des versions précises (ex. aquasec/trivy:0.76.0), idéalement par digest (@sha256:...) qui est immuable, faire de même pour les actions GitHub (par SHA de commit), et mettre à jour ces versions de façon contrôlée avec Dependabot ou Renovate, en privilégiant des sources officielles et vérifiées.

**Q.** Le job Trivy utilise --ignore-unfixed et ne bloque que HIGH et CRITICAL. Justifiez ces deux choix, et dites ce qu'ils laissent passer.
--ignore-unfixed ignore les vulnérabilités pour lesquelles aucun correctif n’existe encore : le développeur ne peut rien y faire, donc bloquer le pipeline pour elles serait inutile et paralyserait les déploiements. Le seuil HIGH et CRITICAL concentre l’effort sur les risques les plus graves et évite le bruit des centaines d’alertes LOW et MEDIUM, ce qui garde un pipeline utilisable et un seuil réaliste.

Ces choix laissent toutefois passer : les vulnérabilités sans correctif disponible (qui restent exploitables et doivent être suivies, atténuées ou acceptées explicitement), les vulnérabilités MEDIUM et LOW qui, combinées, peuvent constituer un risque, ainsi que ce que Trivy ne détecte pas (failles dans mon propre code, mauvaise configuration, vulnérabilités encore inconnues).

## Étape 9 — Tri d'alertes
- Alerte 1 : Vrai positif · Bloquer la livraison maintenant (juste)
- Alerte 2 : Faux positif · Accepter et documenter l'exception (juste)
- Alerte 3 : Vrai positif · Backlog / surveiller (juste)
- Alerte 4 : Faux positif · Accepter et documenter l'exception (juste)
- Alerte 5 : Vrai positif · Bloquer la livraison maintenant (juste)
- Alerte 6 : Vrai positif · Corriger sous quelques jours (juste)
- Alerte 7 : Vrai positif · Backlog / surveiller (juste)
Score : 7/7

**Q.** Pour l'alerte que vous avez trouvée la plus difficile à classer, expliquez votre raisonnement.
’alerte la plus difficile à classer était la 7 (busybox). Le score CVSS de 7.5 pousse à réagir, mais il mesure la gravité théorique, pas le risque réel. Ici il n’existe aucun correctif et l’API n’appelle jamais de commande système, donc le code vulnérable n’est pas atteignable. Bloquer la livraison n’aurait rien réglé, puisqu’on ne peut rien corriger. J’ai donc accepté le risque en le documentant (justification, date de revue) et en surveillant la sortie d’un correctif. Je l’ai comparée à l’alerte 1, où la même gravité s’accompagne d’un correctif disponible et d’une utilisation réelle, ce qui impose de bloquer.

## Bilan

**Q.** Placez chaque contrôle que vous avez mis en place sur la boucle Plan › Code › Build › Test › Release › Deploy › Operate › Monitor. Quelles étapes de la boucle restent sans contrôle dans votre pipeline ?
Plan : aucun contrôle.
Code : Gitleaks (pre-commit + CI), Semgrep (SAST), Dependabot, protection de main.
Build : Dockerfile durci, Checkov, npm ci.
Test : npm test, npm audit (SCA), Trivy avec seuil bloquant.
Release : SBOM de l’image, image taguée par SHA.
Sans contrôle : Plan, Deploy, Operate, Monitor (pas de signature d’image, pas de DAST, pas de surveillance en production, pas de rescan des images déployées).

**Q.** Si vous deviez ajouter un seul contrôle de plus à ce pipeline, lequel choisiriez-vous et pourquoi ?
Un scan Trivy planifié (rescan régulier des images avec alerte), car une image propre aujourd’hui peut devenir vulnérable demain sans qu’aucun push ne déclenche le pipeline. Il couvre Operate et Monitor, pour très peu d’effort (un job schedule).
