// ─── session.js — Unique source de vérité pour la logique de séance ──────────

// ─── Shuffle non biaisé (Fisher-Yates) ───────────────────────────────────────
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ─── Niveaux ordonnés ────────────────────────────────────────────────────────
const NIVEAUX = ["B1", "B2", "B3", "M1", "M2"];

// Retourne true si la pièce est compatible avec le niveau de l'élève (± 1 niveau)
// Si l'élève n'a pas de niveau, ou si la pièce n'a pas de niveau → toujours compatible
function niveauCompatible(pieceNiveau, eleveNiveau) {
  if (!eleveNiveau || !pieceNiveau) return true;
  const iEleve = NIVEAUX.indexOf(eleveNiveau);
  const iPiece = NIVEAUX.indexOf(pieceNiveau);
  if (iEleve === -1 || iPiece === -1) return true;
  return Math.abs(iPiece - iEleve) <= 1;
}

// ─── Répartition par défaut ───────────────────────────────────────────────────
const REPARTITION_DEFAUT = [
  { type: "gammes",     part: 0.10 },
  { type: "exercice",   part: 0.30 },
  { type: "etude",      part: 0.30 },
  { type: "repertoire", part: 0.30 },
];

// ─── Construire une session ───────────────────────────────────────────────────
// Paramètres :
//   repertoire   : tableau complet des items depuis Supabase
//   options      : { instrument, epoque, objectifs[], duree, sonsFiles, recentIds[], niveauEleve }
//   repartition  : tableau optionnel pour surcharger REPARTITION_DEFAUT
//
// Retourne un tableau de blocs ordonnés, pauses incluses.
function construireSession(repertoire, options, repartition = REPARTITION_DEFAUT) {
  const { instrument, epoque, objectifs, duree, sonsFiles, recentIds = [], niveauEleve } = options;

  // Filtrage de la bibliothèque
  const filtered = repertoire.filter(item => {
    const instrMatch  = item.instrument?.toLowerCase().includes(instrument.toLowerCase());
    const epqMatch    = item.epoque?.toLowerCase().includes(epoque.toLowerCase());
    const objMatch    = objectifs.some(obj =>
      item.objectifs?.toLowerCase().includes(obj.toLowerCase())
    );
    const niveauMatch = niveauCompatible(item.niveau, niveauEleve);
    return instrMatch && epqMatch && objMatch && niveauMatch;
  });

  // Sélection aléatoire d'un item par type, en évitant les récents
  const getItem = (type, exclusions = []) => {
    const pool = filtered.filter(e =>
      e.type === type && !exclusions.includes(e.id)
    );
    // Si pool vide après exclusion des récents, on lève l'exclusion
    const fallback = filtered.filter(e => e.type === type);
    const candidates = pool.length > 0 ? pool : fallback;
    if (!candidates.length) return null;
    return shuffle(candidates)[0];
  };

  const blocs = [];

  // Bloc sons filés
  if (sonsFiles) {
    blocs.push({ type: "sons-files", duree: 10 });
  }

  // Blocs de travail
  let dureeRestante = sonsFiles ? duree - 10 : duree;

  for (const section of repartition) {
    const item = getItem(section.type, recentIds);
    if (!item) continue;

    const dureeBloc = Math.max(5, Math.round(dureeRestante * section.part));

    blocs.push({
      id:        item.id,
      type:      section.type,
      titre:     item.titre,
      auteur:    item.auteur    || "",
      recueil:   item.recueil   || "",
      epoque:    item.epoque    || "",
      niveau:    item.niveau    || "",
      tonalite:  item.tonalite  || "",
      objectifs: item.objectifs || "",
      pdf_url:   item.pdf_url   || null,
      duree:     dureeBloc,
    });
  }

  // Insertion des pauses entre blocs de travail
  return insererPauses(blocs);
}

// ─── Insérer les pauses (appelée une seule fois) ──────────────────────────────
function insererPauses(blocs) {
  const result = [];
  for (let i = 0; i < blocs.length; i++) {
    result.push(blocs[i]);
    const estTravail = b => b.type !== "sons-files" && b.type !== "pause";
    if (estTravail(blocs[i]) && blocs[i + 1] && estTravail(blocs[i + 1])) {
      result.push({ type: "pause", duree: 2 });
    }
  }
  return result;
}

// ─── Remplacer un bloc spécifique ────────────────────────────────────────────
function remplacerBloc(blocs, index, repertoire, options) {
  const blocActuel = blocs[index];
  if (!blocActuel || blocActuel.type === "pause" || blocActuel.type === "sons-files") {
    return blocs;
  }

  const idsUtilises = blocs
    .filter(b => b.id && b.id !== blocActuel.id)
    .map(b => b.id);

  const { instrument, epoque, objectifs, niveauEleve } = options;
  const pool = repertoire.filter(item => {
    const instrMatch  = item.instrument?.toLowerCase().includes(instrument.toLowerCase());
    const epqMatch    = item.epoque?.toLowerCase().includes(epoque.toLowerCase());
    const objMatch    = objectifs.some(obj =>
      item.objectifs?.toLowerCase().includes(obj.toLowerCase())
    );
    const niveauMatch = niveauCompatible(item.niveau, niveauEleve);
    return instrMatch && epqMatch && objMatch && niveauMatch
      && item.type === blocActuel.type
      && !idsUtilises.includes(item.id)
      && item.id !== blocActuel.id;
  });

  if (!pool.length) return blocs;

  const newItem = shuffle(pool)[0];
  const newBloc = {
    ...blocActuel,
    id:        newItem.id,
    titre:     newItem.titre,
    auteur:    newItem.auteur    || "",
    recueil:   newItem.recueil   || "",
    niveau:    newItem.niveau    || "",
    tonalite:  newItem.tonalite  || "",
    objectifs: newItem.objectifs || "",
    pdf_url:   newItem.pdf_url   || null,
  };

  const result = [...blocs];
  result[index] = newBloc;
  return result;
}

// ─── Sauvegarder la session en Supabase ──────────────────────────────────────
async function sauvegarderSession(userId, blocs, dureeReelle, note = "") {
  const { error } = await db.from("seances").insert({
    user_id:      userId,
    date:         new Date().toISOString(),
    duree_reelle: dureeReelle,
    blocs:        JSON.stringify(blocs),
    note:         note,
  });
  if (error) console.error("Erreur sauvegarde séance:", error);
}

// ─── Récupérer les IDs joués récemment (7 derniers jours) ────────────────────
async function getRecentIds(userId) {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data } = await db
    .from("seances")
    .select("blocs")
    .eq("user_id", userId)
    .gte("date", since);

  if (!data) return [];
  return data.flatMap(s => {
    try {
      return JSON.parse(s.blocs)
        .filter(b => b.id)
        .map(b => b.id);
    } catch { return []; }
  });
}

// ─── Formatage du temps ───────────────────────────────────────────────────────
function formatTime(secondes) {
  const m = Math.floor(secondes / 60);
  const s = secondes % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// ─── Session en mémoire de travail (entre les pages) ────────────────────────
function sauvegarderSessionLocale(blocs, options) {
  sessionStorage.setItem("seance_blocs", JSON.stringify(blocs));
  sessionStorage.setItem("seance_options", JSON.stringify(options));
}

function chargerSessionLocale() {
  const blocs   = JSON.parse(sessionStorage.getItem("seance_blocs") || "null");
  const options = JSON.parse(sessionStorage.getItem("seance_options") || "null");
  return { blocs, options };
}
