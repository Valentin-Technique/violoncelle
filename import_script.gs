// ═══════════════════════════════════════════════════════════════════
// CONFIGURATION — à remplir avant de lancer
// ═══════════════════════════════════════════════════════════════════
const SUPABASE_URL      = "https://ijfurwdakcjnjkfhlhug.supabase.co";
const SUPABASE_SERVICE_KEY = "COLLER_TA_SERVICE_ROLE_KEY_ICI";

// ═══════════════════════════════════════════════════════════════════
// COLONNES DU SHEET (ordre exact)
// titre | auteur | recueil | epoque | type | instrument | niveau | tonalite | objectifs | pdf_drive_url
// ═══════════════════════════════════════════════════════════════════

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("🎻 Importer")
    .addItem("Importer toutes les lignes", "importerTout")
    .addItem("Importer la ligne sélectionnée", "importerLigne")
    .addToUi();
}

function importerTout() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const rows  = sheet.getDataRange().getValues();
  const headers = rows[0];
  
  let ok = 0, erreurs = 0;
  
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row[0]) continue; // ligne vide
    
    const resultat = importerRow(row, i + 1);
    if (resultat) ok++;
    else erreurs++;
  }
  
  SpreadsheetApp.getUi().alert(
    `Import terminé\n✅ ${ok} pièce(s) importée(s)\n❌ ${erreurs} erreur(s)`
  );
}

function importerLigne() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const row   = sheet.getActiveRange().getRow();
  if (row <= 1) {
    SpreadsheetApp.getUi().alert("Sélectionne une ligne de données (pas l'en-tête).");
    return;
  }
  const data = sheet.getRange(row, 1, 1, 10).getValues()[0];
  const ok   = importerRow(data, row);
  SpreadsheetApp.getUi().alert(ok ? "✅ Importé avec succès" : "❌ Erreur — vérifie les logs");
}

function importerRow(row, rowNum) {
  const [titre, auteur, recueil, epoque, type, instrument, niveau, tonalite, objectifs, pdfUrl] = row;
  
  // Validation minimale
  if (!titre || !epoque || !type) {
    Logger.log(`Ligne ${rowNum} ignorée — titre, époque ou type manquant`);
    return false;
  }
  
  const TYPES_VALIDES = ["gammes", "exercice", "etude", "repertoire"];
  if (!TYPES_VALIDES.includes(type.toLowerCase().trim())) {
    Logger.log(`Ligne ${rowNum} — type invalide : "${type}". Valeurs acceptées : ${TYPES_VALIDES.join(", ")}`);
    return false;
  }

  const NIVEAUX_VALIDES = ["B1", "B2", "B3", "M1", "M2", ""];
  if (niveau && !NIVEAUX_VALIDES.includes(niveau.toString().trim())) {
    Logger.log(`Ligne ${rowNum} — niveau invalide : "${niveau}". Valeurs acceptées : B1, B2, B3, M1, M2`);
    return false;
  }

  // Upload PDF si URL Drive fournie
  let pdf_url = null;
  if (pdfUrl && pdfUrl.toString().includes("drive.google.com")) {
    pdf_url = uploadPdfDepuisDrive(pdfUrl.toString(), titre.toString(), rowNum);
  }
  
  // Insertion dans Supabase
  const payload = {
    titre:      titre.toString().trim(),
    auteur:     auteur?.toString().trim() || null,
    recueil:    recueil?.toString().trim() || null,
    epoque:     epoque.toString().trim(),
    type:       type.toString().toLowerCase().trim(),
    instrument: instrument?.toString().trim() || "Violoncelle",
    niveau:     niveau?.toString().trim() || null,
    tonalite:   tonalite?.toString().trim() || null,
    objectifs:  objectifs?.toString().trim() || null,
    pdf_url:    pdf_url,
  };
  
  const response = UrlFetchApp.fetch(
    `${SUPABASE_URL}/rest/v1/repertoire?on_conflict=titre,auteur`,
    {
      method:  "POST",
      headers: {
        "Content-Type":  "application/json",
        "apikey":        SUPABASE_SERVICE_KEY,
        "Authorization": `Bearer ${SUPABASE_SERVICE_KEY}`,
        "Prefer":        "resolution=merge-duplicates,return=minimal",
      },
      payload:            JSON.stringify(payload),
      muteHttpExceptions: true,
    }
  );
  
  // 200 = mis à jour, 201 = créé — les deux sont OK
  if (response.getResponseCode() !== 200 && response.getResponseCode() !== 201) {
    Logger.log(`Ligne ${rowNum} — erreur Supabase : ${response.getContentText()}`);
    return false;
  }
  
  Logger.log(`Ligne ${rowNum} — ✅ "${titre}" importé`);
  return true;
}

function uploadPdfDepuisDrive(driveUrl, titre, rowNum) {
  try {
    // Extraire l'ID du fichier Drive depuis l'URL
    const match = driveUrl.match(/[-\w]{25,}/);
    if (!match) {
      Logger.log(`Ligne ${rowNum} — URL Drive invalide`);
      return null;
    }
    
    const fileId   = match[0];
    const file     = DriveApp.getFileById(fileId);
    const blob     = file.getBlob();
    const filename = `${Date.now()}-${titre.replace(/[^a-zA-Z0-9]/g, "_")}.pdf`;
    
    // Upload vers Supabase Storage
    const response = UrlFetchApp.fetch(
      `${SUPABASE_URL}/storage/v1/object/partitions/${filename}`,
      {
        method:  "POST",
        headers: {
          "Authorization": `Bearer ${SUPABASE_SERVICE_KEY}`,
          "Content-Type":  "application/pdf",
        },
        payload:            blob.getBytes(),
        muteHttpExceptions: true,
      }
    );
    
    if (response.getResponseCode() !== 200) {
      Logger.log(`Ligne ${rowNum} — erreur upload PDF : ${response.getContentText()}`);
      return null;
    }
    
    // Construire l'URL publique
    return `${SUPABASE_URL}/storage/v1/object/public/partitions/${filename}`;
    
  } catch (e) {
    Logger.log(`Ligne ${rowNum} — exception PDF : ${e.message}`);
    return null;
  }
}
