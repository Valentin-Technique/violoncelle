-- ═══════════════════════════════════════════════════════════════════════════
-- SUPABASE — Configuration initiale
-- À exécuter dans : Dashboard → SQL Editor
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── Table profiles ───────────────────────────────────────────────────────────
-- Étend la table auth.users de Supabase
CREATE TABLE public.profiles (
  id       UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  prenom   TEXT NOT NULL,
  nom      TEXT NOT NULL,
  email    TEXT NOT NULL,
  role     TEXT NOT NULL DEFAULT 'eleve' CHECK (role IN ('eleve', 'prof')),
  statut   TEXT NOT NULL DEFAULT 'en_attente' CHECK (statut IN ('actif', 'en_attente'))
);

-- ─── Table repertoire ─────────────────────────────────────────────────────────
CREATE TABLE public.repertoire (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  titre      TEXT NOT NULL,
  auteur     TEXT,
  recueil    TEXT,
  epoque     TEXT NOT NULL,
  type       TEXT NOT NULL CHECK (type IN ('gammes', 'exercice', 'etude', 'repertoire')),
  instrument TEXT NOT NULL DEFAULT 'Violoncelle',
  objectifs  TEXT,      -- valeurs séparées par des virgules
  pdf_url    TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Table seances ────────────────────────────────────────────────────────────
CREATE TABLE public.seances (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  date         TIMESTAMPTZ DEFAULT NOW(),
  duree_reelle INT,
  blocs        TEXT,    -- JSON stringifié
  note         TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.profiles  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.repertoire ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seances    ENABLE ROW LEVEL SECURITY;

-- Fonction helper : rôle de l'utilisateur courant
CREATE OR REPLACE FUNCTION public.current_role_is(r TEXT)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = r AND statut = 'actif'
  );
$$ LANGUAGE sql SECURITY DEFINER;

-- ─── Politiques profiles ──────────────────────────────────────────────────────

-- Chaque utilisateur lit son propre profil ; le prof lit tous les profils élèves
CREATE POLICY "profiles_select" ON public.profiles
  FOR SELECT USING (
    id = auth.uid()
    OR public.current_role_is('prof')
  );

-- Insertion uniquement lors de l'inscription (via service role côté client)
CREATE POLICY "profiles_insert" ON public.profiles
  FOR INSERT WITH CHECK (id = auth.uid());

-- Le prof peut mettre à jour le statut des élèves
CREATE POLICY "profiles_update" ON public.profiles
  FOR UPDATE USING (
    id = auth.uid()
    OR public.current_role_is('prof')
  );

-- ─── Politiques repertoire ────────────────────────────────────────────────────

-- Tout utilisateur actif peut lire la bibliothèque
CREATE POLICY "repertoire_select" ON public.repertoire
  FOR SELECT USING (public.current_role_is('eleve') OR public.current_role_is('prof'));

-- Seul le prof peut modifier la bibliothèque
CREATE POLICY "repertoire_insert" ON public.repertoire
  FOR INSERT WITH CHECK (public.current_role_is('prof'));

CREATE POLICY "repertoire_update" ON public.repertoire
  FOR UPDATE USING (public.current_role_is('prof'));

CREATE POLICY "repertoire_delete" ON public.repertoire
  FOR DELETE USING (public.current_role_is('prof'));

-- ─── Politiques seances ───────────────────────────────────────────────────────

-- Élève voit ses séances ; prof voit toutes les séances
CREATE POLICY "seances_select" ON public.seances
  FOR SELECT USING (
    user_id = auth.uid()
    OR public.current_role_is('prof')
  );

-- Chaque utilisateur insère ses propres séances
CREATE POLICY "seances_insert" ON public.seances
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- ═══════════════════════════════════════════════════════════════════════════
-- STORAGE — Bucket partitions
-- ═══════════════════════════════════════════════════════════════════════════
-- À faire dans Dashboard → Storage → New bucket
-- Nom : partitions
-- Public : OUI (pour que les PDFs soient lisibles sans auth)

-- Politique d'upload : prof uniquement
INSERT INTO storage.policies (name, bucket_id, definition)
VALUES (
  'partitions_upload_prof',
  'partitions',
  '(public.current_role_is(''prof''))'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- PREMIER COMPTE PROFESSEUR
-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Créer le compte via l'interface de l'app (inscription normale)
-- 2. Aller dans : Dashboard → Authentication → Users → trouver l'email
-- 3. Copier l'UUID
-- 4. Exécuter :
--
-- UPDATE public.profiles
-- SET role = 'prof', statut = 'actif'
-- WHERE id = 'COLLER-UUID-ICI';
--
-- ═══════════════════════════════════════════════════════════════════════════
