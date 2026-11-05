# Scénarios d’annotation d’un ara

Les branches ci-dessous décrivent des axes indépendants, à combiner. Elles évitent
une longue liste répétitive de toutes les combinaisons. La visibilité du corps ne
permet de déduire ni celle de l’œil, ni celle de la région périoculaire.

```text
Photo d’un individu
├── Corps : entier / partiellement hors cadre / non visible / inconnu
├── Point de vue : angle + hauteur / inconnu
└── Yeux
    ├── Aucun œil identifiable visible, réponse validée
    │   └── Étape périoculaire sautée, sans fabriquer de cadre
    ├── Présence incertaine
    │   └── Garder l’incertitude ; ne pas conclure « absent »
    └── Au moins un œil identifiable visible
        ├── Gauche / droite / les deux / côté inconnu
        └── Pour CHAQUE côté concerné, indépendamment
            ├── Région dans la photo
            │   ├── Entière : cadre de la région observable
            │   ├── Coupée ou partielle : cadre de la portion observable
            │   ├── Non visible : aucun cadre périoculaire
            │   └── Inconnue : pas de visibilité complète déduite
            ├── Masquage par plumes, objet, autre animal…
            │   ├── Complètement visible : aucune occlusion
            │   ├── Partiellement : occlusion déclarée
            │   ├── Cachée : région non visible, cadre retiré
            │   └── Je ne sais pas : occlusion inconnue
            └── Netteté de la région observable
                ├── Net
                ├── Flou
                ├── Pixelisé
                └── Je ne sais pas
```

Exemples cohérents :

| Corps | Œil | Région | Netteté | Conséquence |
| --- | --- | --- | --- | --- |
| Entier | Gauche visible | Partiellement masquée | Net | Conserver la portion visible, exclure de l’export Wild Me strict |
| Partiel | Deux visibles | Gauche entière, droite cachée | Net à gauche | Annoter chaque côté indépendamment, aucun cadre pour la région droite cachée |
| Gros plan, corps absent | Droit visible | Entière et dégagée | Net | Région potentiellement admissible, sous réserve des autres critères et de la revue |
| Entier | Aucun visible | Non applicable | Sans objet | Sauter l’étape périoculaire |
| Entier | Gauche visible | Entière | Pixelisé | Conserver dans le dataset générique, exclure du Wild Me strict |
| Inconnu | Incertain | Inconnue | Inconnue | Conserver les inconnues, ne pas inventer d’absence ni de qualité |

Un œil fermé peut rester identifiable : « visible » ne signifie pas « pupille
ouverte ». Ne pas confondre œil fermé et œil entièrement caché ou hors champ.
Un cadrage partiel et une occlusion sont distincts : choisir « Complètement visible »
dans le groupe de masquage signifie « aucune obstruction », sans annuler un cadrage
partiel déjà déclaré. Les deux réponses restent visibles et modifiables séparément.
Une région nette peut être masquée ; une région dégagée peut être floue.

# Données conservées

`Box.sharpness` distingue `sharp`, `blurry`, `pixelated` et `unknown`. Les anciens
champs `usability` restent synchronisés : net → usable, flou/pixelisé → unusable,
inconnu → unknown. Une ancienne annotation simplement « inexploitable » ne devient
pas automatiquement « floue » : sa cause reste non précisée.

L’occlusion reste `false`, `true` ou `null` pour une région annotable. Une région
complètement cachée est enregistrée comme non visible pour son côté, sans cadre.
Les champs existants de visibilité du corps, des yeux et des régions restent séparés.
La netteté est exportée dans les attributs COCO et dans la colonne `sharpness` de
`regions.csv`. Aucune migration SQL n’est nécessaire : les annotations sont dans
le document de collection déjà stocké sur Supabase.

Le dataset générique conserve les annotations terminées, même partielles ou
inexploitables. L’export Wild Me strict requiert une région nette, entièrement
visible, non masquée, un œil confirmé visible, un côté et une identité connus,
ainsi que les autres contrôles existants et l’acceptation par la revue scientifique.
Les inconnues, contradictions, régions partielles, floues ou pixelisées en sont exclues.

# Précision proposée pour une prochaine étape

Le formulaire actuel distingue la présence d’un œil et son côté ; il n’a pas
encore de champ décrivant un œil seulement partiellement visible. Pour couvrir
ce cas explicitement, le modèle à viser est, pour chaque côté : œil entier / œil
partiel / œil non visible / visibilité inconnue, indépendamment de la visibilité
de sa région périoculaire. Un éventuel état ouvert / fermé / inconnu serait encore
une autre information. Ces champs supplémentaires ne sont pas créés par le
remplacement des menus par des boutons.
