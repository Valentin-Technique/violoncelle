// ─── Configuration Supabase ───────────────────────────────────────────────────
// Remplacer ces deux valeurs par celles de ton projet Supabase
// Dashboard → Settings → API
const SUPABASE_URL = "https://ijfurwdakcjnjkfhlhug.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlqZnVyd2Rha2NqbmprZmhsaHVnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA0MDUzMTgsImV4cCI6MjA5NTk4MTMxOH0.b4J8XwDXjWoWV8i5Kz8OZl6Pp_0NJJca9lCd0OWtPok";


// Client Supabase (via CDN, chargé dans chaque page HTML)
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ─── Auth helpers ─────────────────────────────────────────────────────────────

async function getSession() {
  const { data } = await db.auth.getSession();
  return data.session;
}

async function getCurrentUser() {
  const session = await getSession();
  if (!session) return null;
  const { data } = await db
    .from("profiles")
    .select("*")
    .eq("id", session.user.id)
    .single();
  return data;
}

async function requireAuth(allowedRoles = []) {
  const session = await getSession();
  if (!session) {
    window.location.href = "login.html";
    return null;
  }
  const user = await getCurrentUser();
  if (!user || user.statut !== "actif") {
    window.location.href = "login.html?raison=inactif";
    return null;
  }
  if (allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
    window.location.href = "index.html";
    return null;
  }
  return user;
}

async function signOut() {
  await db.auth.signOut();
  window.location.href = "login.html";
}
