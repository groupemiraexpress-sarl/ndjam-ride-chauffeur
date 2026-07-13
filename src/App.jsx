import { useEffect, useRef, useState } from "react";
import { MapContainer, TileLayer, Marker, Polyline, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { supabase } from "./supabase";
import "./App.css";

const PAY_NOMS = { airtel: "Airtel Money", moov: "Moov Money", cash: "Espèces" };
const NDJAMENA = [12.1348, 15.0557];
const MOTIFS_CHAUFFEUR = [
  "Client trop loin",
  "Problème de véhicule",
  "Trafic / route bloquée",
  "Client ne répond pas",
  "Autre",
];
const CATEGORIES = [
  { id: "moto", nom: "Moto", ic: "🛵" },
  { id: "eco", nom: "Éco", ic: "🚗" },
  { id: "confort", nom: "Confort", ic: "🚙" },
  { id: "confortplus", nom: "Confort+", ic: "🚘" },
];
const NOM_CATEGORIE = { moto: "Moto", eco: "Éco", confort: "Confort", confortplus: "Confort+" };
const BUCKET = "pieces-identite";

function icone(couleur) {
  return L.divIcon({
    className: "",
    html: `<svg width="30" height="40" viewBox="0 0 36 48"><path d="M18 0C8 0 0 8 0 18c0 13 18 30 18 30s18-17 18-30C36 8 28 0 18 0z" fill="${couleur}"/><circle cx="18" cy="18" r="6" fill="#fff"/></svg>`,
    iconSize: [30, 40], iconAnchor: [15, 40],
  });
}
// Distance à vol d'oiseau entre deux points (km)
function distanceKm(a, b) {
  const R = 6371, toRad = (x) => (x * Math.PI) / 180;
  const dLat = toRad(b[0] - a[0]), dLng = toRad(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}
// Convertit un nom de couleur (texte libre) en code couleur.
function couleurVers(nomCouleur) {
  if (!nomCouleur) return "#002664";
  const c = nomCouleur.toLowerCase().trim();
  const table = {
    "noir": "#1a1a1a", "noire": "#1a1a1a", "black": "#1a1a1a",
    "blanc": "#e8e8e8", "blanche": "#e8e8e8", "white": "#e8e8e8",
    "gris": "#7a7a7a", "grise": "#7a7a7a", "gray": "#7a7a7a", "grey": "#7a7a7a", "argent": "#b0b0b0", "argenté": "#b0b0b0",
    "rouge": "#c0392b", "red": "#c0392b",
    "bleu": "#2563eb", "bleue": "#2563eb", "blue": "#2563eb",
    "vert": "#16a34a", "verte": "#16a34a", "green": "#16a34a",
    "jaune": "#eab308", "yellow": "#eab308",
    "orange": "#ea580c",
    "marron": "#92400e", "brun": "#92400e", "brown": "#92400e",
    "beige": "#d6c9a8",
    "violet": "#7c3aed", "mauve": "#7c3aed",
    "or": "#d4af37", "doré": "#d4af37", "dorée": "#d4af37",
  };
  for (const mot in table) {
    if (c.includes(mot)) return table[mot];
  }
  return "#002664";
}

function iconeVoiture(couleur) {
  const fill = couleur || "#002664";
  return L.divIcon({
    className: "",
    html: `<svg width="34" height="34" viewBox="0 0 48 48">
      <rect x="14" y="6" width="20" height="36" rx="7" fill="${fill}" stroke="#fff" stroke-width="1.5"/>
      <rect x="16" y="13" width="16" height="9" rx="3" fill="#9fc0e8"/>
      <rect x="16" y="27" width="16" height="8" rx="3" fill="#9fc0e8"/>
      <rect x="17" y="23" width="14" height="4" rx="2" fill="#FECB00"/>
      <circle cx="19" cy="9" r="1.4" fill="#fff7cc"/>
      <circle cx="29" cy="9" r="1.4" fill="#fff7cc"/>
    </svg>`,
    iconSize: [34, 34], iconAnchor: [17, 17],
  });
}
function AjusterVue({ points }) {
  const map = useMap();
  const dernierNombre = useRef(0);
  useEffect(() => {
    const t1 = setTimeout(() => map.invalidateSize(), 100);
    const t2 = setTimeout(() => map.invalidateSize(), 400);
    const valides = points.filter(Boolean);
    // On recadre seulement quand le nombre de points change, pas à chaque mise à jour GPS.
    if (valides.length >= 2 && valides.length !== dernierNombre.current) {
      map.fitBounds(valides, { padding: [50, 50] });
      dernierNombre.current = valides.length;
    } else if (valides.length < 2) {
      dernierNombre.current = valides.length;
    }
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [points, map]);
  return null;
}

// Calcule le vrai trajet par les routes via OSRM (gratuit, OpenStreetMap).
// Renvoie [[lat,lng],...] ou null si échec.
async function calculerRoute(a, b) {
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${a[1]},${a[0]};${b[1]},${b[0]}?overview=full&geometries=geojson`;
    const rep = await fetch(url);
    if (!rep.ok) return null;
    const data = await rep.json();
    if (!data.routes || data.routes.length === 0) return null;
    return data.routes[0].geometry.coordinates.map((c) => [c[1], c[0]]);
  } catch (e) {
    return null;
  }
}

/* ===================== ÉCRAN D'ACCUEIL / AUTH ===================== */
function Accueil() {
  // mode : "connexion" | "inscription" | "oubli"
  const [mode, setMode] = useState("connexion");
  const [email, setEmail] = useState("");
  const [mdp, setMdp] = useState("");
  const [chargement, setChargement] = useState(false);
  const [erreur, setErreur] = useState(null);
  const [info, setInfo] = useState(null);

  function traduireErreur(msg) {
    if (msg.includes("Invalid login")) return "Email ou mot de passe incorrect.";
    if (msg.includes("already registered")) return "Cet email a déjà un compte. Connectez-vous.";
    if (msg.includes("at least 6")) return "Le mot de passe doit faire au moins 6 caractères.";
    if (msg.includes("rate limit") || msg.includes("Email rate")) {
      return "Trop de demandes. Patientez quelques minutes avant de réessayer.";
    }
    return msg;
  }

  async function soumettre() {
    setErreur(null); setInfo(null);
    if (!email.trim() || !mdp.trim()) { setErreur("Email et mot de passe requis."); return; }
    setChargement(true);
    if (mode === "connexion") {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: mdp });
      if (error) setErreur(traduireErreur(error.message));
    } else {
      const { error } = await supabase.auth.signUp({ email: email.trim(), password: mdp });
      if (error) setErreur(traduireErreur(error.message));
      else setInfo("Compte créé ! Connexion en cours...");
    }
    setChargement(false);
  }

  // Envoie l'email de réinitialisation du mot de passe.
  async function envoyerLienReinit() {
    setErreur(null); setInfo(null);
    if (!email.trim()) { setErreur("Entrez votre adresse email."); return; }
    setChargement(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: window.location.origin,
    });
    setChargement(false);
    if (error) { setErreur(traduireErreur(error.message)); return; }
    setInfo("Email envoyé ! Consultez votre boîte de réception (pensez aux spams) et cliquez sur le lien pour choisir un nouveau mot de passe.");
  }

  /* ---------- ÉCRAN : MOT DE PASSE OUBLIÉ ---------- */
  if (mode === "oubli") {
    return (
      <div className="accueil">
        <div className="accueil-logo">
          <div id="logo-badge" style={{ width: 60, height: 60, borderRadius: "50%" }}></div>
          <h1>Mira<span>Express</span></h1>
          <p>Espace Chauffeur</p>
        </div>
        <div className="accueil-carte">
          <h2 className="oubli-titre">Mot de passe oublié</h2>
          <p className="oubli-txt">
            Entrez l'adresse email de votre compte. Nous vous enverrons un lien
            pour choisir un nouveau mot de passe.
          </p>

          <input type="email" placeholder="Adresse email" value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") envoyerLienReinit(); }}
            className="accueil-input" />

          {erreur && <div className="accueil-erreur">{erreur}</div>}
          {info && <div className="accueil-info">{info}</div>}

          <button className="accueil-btn" onClick={envoyerLienReinit} disabled={chargement}>
            {chargement ? "Envoi en cours..." : "Envoyer le lien"}
          </button>

          <div className="oubli-lien"
            onClick={() => { setMode("connexion"); setErreur(null); setInfo(null); }}>
            ← Retour à la connexion
          </div>
        </div>
      </div>
    );
  }

  /* ---------- ÉCRAN : CONNEXION / INSCRIPTION ---------- */
  return (
    <div className="accueil">
      <div className="accueil-logo">
        <div id="logo-badge" style={{ width: 60, height: 60, borderRadius: "50%" }}></div>
        <h1>Mira<span>Express</span></h1>
        <p>Espace Chauffeur</p>
      </div>
      <div className="accueil-carte">
        <div className="accueil-tabs">
          <button className={mode === "connexion" ? "tab-actif" : ""}
            onClick={() => { setMode("connexion"); setErreur(null); setInfo(null); }}>Se connecter</button>
          <button className={mode === "inscription" ? "tab-actif" : ""}
            onClick={() => { setMode("inscription"); setErreur(null); setInfo(null); }}>Créer un compte</button>
        </div>
        <input type="email" placeholder="Adresse email" value={email}
          onChange={(e) => setEmail(e.target.value)} className="accueil-input" />
        <input type="password" placeholder="Mot de passe" value={mdp}
          onChange={(e) => setMdp(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") soumettre(); }} className="accueil-input" />

        {erreur && <div className="accueil-erreur">{erreur}</div>}
        {info && <div className="accueil-info">{info}</div>}

        <button className="accueil-btn" onClick={soumettre} disabled={chargement}>
          {chargement ? "Patientez..." : mode === "connexion" ? "Se connecter" : "Créer mon compte"}
        </button>

        {/* Lien mot de passe oublié : sous le bouton, en mode connexion seulement */}
        {mode === "connexion" && (
          <div className="oubli-lien"
            onClick={() => { setMode("oubli"); setErreur(null); setInfo(null); setMdp(""); }}>
            Mot de passe oublié ?
          </div>
        )}
      </div>
    </div>
  );
}

/* ===================== ÉCRAN NOUVEAU MOT DE PASSE ===================== */
function NouveauMotDePasse({ onTermine }) {
  const [mdp, setMdp] = useState("");
  const [mdp2, setMdp2] = useState("");
  const [chargement, setChargement] = useState(false);
  const [erreur, setErreur] = useState(null);
  const [succes, setSucces] = useState(false);

  async function enregistrer() {
    setErreur(null);
    if (mdp.length < 6) { setErreur("Le mot de passe doit faire au moins 6 caractères."); return; }
    if (mdp !== mdp2) { setErreur("Les deux mots de passe ne sont pas identiques."); return; }
    setChargement(true);
    const { error } = await supabase.auth.updateUser({ password: mdp });
    setChargement(false);
    if (error) { setErreur(error.message); return; }
    setSucces(true);
  }

  if (succes) {
    return (
      <div className="accueil">
        <div className="accueil-logo">
          <div id="logo-badge" style={{ width: 60, height: 60, borderRadius: "50%" }}></div>
          <h1>Mira<span>Express</span></h1>
        </div>
        <div className="accueil-carte" style={{ textAlign: "center" }}>
          <div style={{ fontSize: "48px", marginBottom: "10px" }}>✅</div>
          <h2 className="oubli-titre" style={{ color: "#16a34a" }}>Mot de passe modifié</h2>
          <p className="oubli-txt">
            Votre nouveau mot de passe a bien été enregistré.
            Vous pouvez maintenant utiliser l'application.
          </p>
          <button className="accueil-btn" onClick={onTermine}>Continuer</button>
        </div>
      </div>
    );
  }

  return (
    <div className="accueil">
      <div className="accueil-logo">
        <div id="logo-badge" style={{ width: 60, height: 60, borderRadius: "50%" }}></div>
        <h1>Mira<span>Express</span></h1>
        <p>Espace Chauffeur</p>
      </div>
      <div className="accueil-carte">
        <h2 className="oubli-titre">Nouveau mot de passe</h2>
        <p className="oubli-txt">Choisissez un nouveau mot de passe pour votre compte.</p>

        <input type="password" placeholder="Nouveau mot de passe" value={mdp}
          onChange={(e) => setMdp(e.target.value)} className="accueil-input" />
        <input type="password" placeholder="Confirmez le mot de passe" value={mdp2}
          onChange={(e) => setMdp2(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") enregistrer(); }}
          className="accueil-input" />

        {erreur && <div className="accueil-erreur">{erreur}</div>}

        <button className="accueil-btn" onClick={enregistrer} disabled={chargement}>
          {chargement ? "Enregistrement..." : "Enregistrer le mot de passe"}
        </button>
      </div>
    </div>
  );
}


/* ===================== PAGE MON PROFIL ===================== */
function MonProfil({ userId, profilExistant, onEnregistre, onAnnuler }) {
  const [nom, setNom] = useState(profilExistant?.nom || "");
  const [telephone, setTelephone] = useState(profilExistant?.telephone || "");
  const [plaque, setPlaque] = useState(profilExistant?.plaque || "");
  const [vehicule, setVehicule] = useState(profilExistant?.vehicule || "");
  const [couleur, setCouleur] = useState(profilExistant?.couleur || "");
  const [categorie, setCategorie] = useState(profilExistant?.categorie || "eco");
  const [pieceChemin, setPieceChemin] = useState(profilExistant?.piece_identite_url || null);
  const [selfieChemin, setSelfieChemin] = useState(profilExistant?.selfie_url || null);
  const [apercuPiece, setApercuPiece] = useState(null);
  const [apercuSelfie, setApercuSelfie] = useState(null);
  const [chargement, setChargement] = useState(false);
  const [uploadPiece, setUploadPiece] = useState(false);
  const [uploadSelfie, setUploadSelfie] = useState(false);
  const [erreur, setErreur] = useState(null);
  const pieceRef = useRef(null);
  const selfieRef = useRef(null);

  useEffect(() => {
    if (!pieceChemin) { setApercuPiece(null); return; }
    (async () => {
      const { data } = await supabase.storage.from(BUCKET).createSignedUrl(pieceChemin, 300);
      if (data) setApercuPiece(data.signedUrl);
    })();
  }, [pieceChemin]);

  useEffect(() => {
    if (!selfieChemin) { setApercuSelfie(null); return; }
    (async () => {
      const { data } = await supabase.storage.from(BUCKET).createSignedUrl(selfieChemin, 300);
      if (data) setApercuSelfie(data.signedUrl);
    })();
  }, [selfieChemin]);

  async function televerser(e, type) {
    const fichier = e.target.files?.[0];
    if (!fichier) return;
    setErreur(null);
    if (fichier.size > 5 * 1024 * 1024) { setErreur("Le fichier est trop lourd (max 5 Mo)."); return; }
    const ext = fichier.name.split(".").pop() || "jpg";
    if (type === "piece") {
      setUploadPiece(true);
      const chemin = `${userId}/piece.${ext}`;
      const { error } = await supabase.storage.from(BUCKET).upload(chemin, fichier, { upsert: true });
      setUploadPiece(false);
      if (error) { setErreur("Échec du téléversement de la pièce : " + error.message); return; }
      setPieceChemin(chemin);
    } else {
      setUploadSelfie(true);
      const chemin = `${userId}/selfie.${ext}`;
      const { error } = await supabase.storage.from(BUCKET).upload(chemin, fichier, { upsert: true });
      setUploadSelfie(false);
      if (error) { setErreur("Échec du téléversement du selfie : " + error.message); return; }
      setSelfieChemin(chemin);
    }
  }

  async function enregistrer() {
    setErreur(null);
    if (!nom.trim() || !telephone.trim() || !plaque.trim() || !vehicule.trim() || !couleur.trim()) {
      setErreur("Tous les champs sont obligatoires."); return;
    }
    if (!pieceChemin) { setErreur("Veuillez téléverser votre pièce d'identité."); return; }
    if (!selfieChemin) { setErreur("Veuillez prendre votre photo (selfie)."); return; }
    setChargement(true);
    const { error } = await supabase.from("chauffeurs").upsert({
      user_id: userId, nom: nom.trim(), telephone: telephone.trim(),
      plaque: plaque.trim(), vehicule: vehicule.trim(), couleur: couleur.trim(), categorie,
      piece_identite_url: pieceChemin, selfie_url: selfieChemin,
    });
    setChargement(false);
    if (error) { setErreur(error.message); return; }
    onEnregistre();
  }

  return (
    <div className="profil-wrap">
      <h2 className="profil-titre">{profilExistant ? "Modifier mon profil" : "Complétez votre profil"}</h2>
      <p className="profil-sous">Documents acceptés : passeport, permis de conduire ou CNI délivrés par le gouvernement. Votre compte sera vérifié avant activation.</p>
      <label className="profil-label">Nom complet</label>
      <input className="accueil-input" value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Ex : Mahamat Ali" />
      <label className="profil-label">Téléphone</label>
      <input className="accueil-input" value={telephone} onChange={(e) => setTelephone(e.target.value)} placeholder="Ex : +235 66 12 34 56" />
      <label className="profil-label">Plaque d'immatriculation</label>
      <input className="accueil-input" value={plaque} onChange={(e) => setPlaque(e.target.value)} placeholder="Ex : TD 4271" />
      <label className="profil-label">Véhicule (marque et modèle)</label>
      <input className="accueil-input" value={vehicule} onChange={(e) => setVehicule(e.target.value)} placeholder="Ex : Toyota Corolla" />
      <label className="profil-label">Couleur du véhicule</label>
      <input className="accueil-input" value={couleur} onChange={(e) => setCouleur(e.target.value)} placeholder="Ex : Blanche" />

      <label className="profil-label">Catégorie de véhicule</label>
      <div className="profil-cats">
        {CATEGORIES.map((c) => (
          <div key={c.id} className={"profil-cat" + (categorie === c.id ? " sel" : "")} onClick={() => setCategorie(c.id)}>
            <div className="profil-cat-ic">{c.ic}</div>
            <div className="profil-cat-nom">{c.nom}</div>
          </div>
        ))}
      </div>

      <label className="profil-label">Pièce d'identité (passeport, permis ou CNI)</label>
      <div className="piece-zone">
        {apercuPiece ? (
          <div style={{ textAlign: "center" }}>
            <img src={apercuPiece} alt="Pièce d'identité" className="piece-apercu" />
            <div style={{ fontSize: "12px", color: "#16a34a", fontWeight: 700, marginTop: "6px" }}>✓ Pièce déposée</div>
          </div>
        ) : (
          <div style={{ textAlign: "center", color: "#9ca3af", fontSize: "13px", padding: "20px 0" }}>Aucune pièce déposée</div>
        )}
        <input ref={pieceRef} type="file" accept="image/*" capture="environment"
          onChange={(e) => televerser(e, "piece")} style={{ display: "none" }} />
        <button type="button" className="piece-btn" onClick={() => pieceRef.current && pieceRef.current.click()} disabled={uploadPiece}>
          {uploadPiece ? "Téléversement..." : apercuPiece ? "Changer la pièce" : "📷 Photographier ma pièce"}
        </button>
      </div>

      <label className="profil-label">Votre photo (selfie)</label>
      <div className="piece-zone">
        {apercuSelfie ? (
          <div style={{ textAlign: "center" }}>
            <img src={apercuSelfie} alt="Selfie" className="piece-apercu" />
            <div style={{ fontSize: "12px", color: "#16a34a", fontWeight: 700, marginTop: "6px" }}>✓ Photo prise</div>
          </div>
        ) : (
          <div style={{ textAlign: "center", color: "#9ca3af", fontSize: "13px", padding: "20px 0" }}>Aucune photo prise</div>
        )}
        <input ref={selfieRef} type="file" accept="image/*" capture="user"
          onChange={(e) => televerser(e, "selfie")} style={{ display: "none" }} />
        <button type="button" className="piece-btn" onClick={() => selfieRef.current && selfieRef.current.click()} disabled={uploadSelfie}>
          {uploadSelfie ? "Téléversement..." : apercuSelfie ? "Reprendre la photo" : "🤳 Prendre mon selfie"}
        </button>
      </div>

      {erreur && <div className="accueil-erreur" style={{ marginTop: 12 }}>{erreur}</div>}

      <button className="accueil-btn" onClick={enregistrer} disabled={chargement} style={{ marginTop: 14 }}>
        {chargement ? "Enregistrement..." : "Enregistrer"}
      </button>
      {profilExistant && onAnnuler && (
        <button className="motif-retour" onClick={onAnnuler} style={{ marginTop: 8 }}>Retour</button>
      )}
    </div>
  );
}

/* ===================== ÉCRAN STATUT (attente / rejet) ===================== */
function EcranStatut({ statut, onDeconnexion, onRafraichir }) {
  const enAttente = statut === "en_attente";
  return (
    <div style={{ position: "absolute", top: 62, left: 0, right: 0, bottom: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "#f3f4f6", padding: "24px" }}>
      <div style={{ background: "#fff", borderRadius: "18px", padding: "30px", maxWidth: "380px", width: "100%", textAlign: "center", boxShadow: "0 8px 30px rgba(0,0,0,.1)" }}>
        <div style={{ fontSize: "48px", marginBottom: "10px" }}>{enAttente ? "⏳" : "❌"}</div>
        <h2 style={{ color: enAttente ? "#92400e" : "#991b1b", marginBottom: "12px" }}>
          {enAttente ? "Vérification en cours" : "Inscription non validée"}
        </h2>
        <p style={{ color: "#6b7280", fontSize: "14px", marginBottom: "20px", lineHeight: 1.6 }}>
          {enAttente
            ? "Merci pour votre inscription chez Mira Express ! Nos équipes examinent actuellement vos documents afin de garantir la sécurité de tous les utilisateurs. Cette vérification prend généralement moins de 24 heures. Dès que votre compte sera validé, vous pourrez commencer à recevoir des courses. Vous pouvez actualiser votre statut à tout moment."
            : "Votre inscription n'a malheureusement pas pu être validée. Cela peut être dû à des documents illisibles, incomplets ou non conformes — un passeport, un permis de conduire ou une CNI délivrés par le gouvernement sont requis. Nous vous invitons à vérifier vos documents et à contacter notre support pour plus d'informations."}
        </p>
        <button onClick={onRafraichir}
          style={{ width: "100%", border: "none", borderRadius: "11px", background: "#002664", color: "#fff", fontWeight: 700, padding: "13px", cursor: "pointer", marginBottom: "8px" }}>
          Actualiser mon statut
        </button>
        <button onClick={onDeconnexion}
          style={{ width: "100%", border: "none", borderRadius: "11px", background: "#e5e7eb", color: "#6b7280", fontWeight: 700, padding: "13px", cursor: "pointer" }}>
          Déconnexion
        </button>
      </div>
    </div>
  );
}

/* ===================== ÉCRAN FÉLICITATIONS ===================== */
function EcranFelicitations({ nom, onContinuer }) {
  return (
    <div style={{ position: "absolute", top: 62, left: 0, right: 0, bottom: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "#f3f4f6", padding: "24px" }}>
      <div style={{ background: "#fff", borderRadius: "18px", padding: "34px 30px", maxWidth: "380px", width: "100%", textAlign: "center", boxShadow: "0 8px 30px rgba(0,0,0,.1)" }}>
        <div style={{ fontSize: "56px", marginBottom: "10px" }}>🎉</div>
        <h2 style={{ color: "#16a34a", marginBottom: "12px" }}>Félicitations, {nom} !</h2>
        <p style={{ color: "#6b7280", fontSize: "14px", marginBottom: "22px", lineHeight: 1.6 }}>
          Votre compte chauffeur a été vérifié et approuvé avec succès. Vous faites désormais partie de Mira Express et pouvez commencer à recevoir des courses dès maintenant. Bonne route !
        </p>
        <button onClick={onContinuer}
          style={{ width: "100%", border: "none", borderRadius: "11px", background: "#16a34a", color: "#fff", fontWeight: 800, padding: "14px", cursor: "pointer", fontSize: "15px" }}>
          Commencer à recevoir des courses
        </button>
      </div>
    </div>
  );
}

/* ===================== MES COURSES (historique) ===================== */
/* Affiche au chauffeur les courses et colis qu'il a menés à bien, avec sa
   part réelle : le prix payé par le client moins la commission Mira Express. */
function MesCourses({ profil, onRetour }) {
  const [courses, setCourses] = useState([]);
  const [colis, setColis] = useState([]);
  const [tarifs, setTarifs] = useState({ commission_course: 12, commission_colis: 15 });
  const [chargement, setChargement] = useState(true);

  useEffect(() => {
    (async () => {
      if (!profil?.nom) { setChargement(false); return; }
      const [coRes, clRes, tfRes] = await Promise.all([
        supabase.from("courses").select("*")
          .eq("chauffeur_nom", profil.nom).eq("statut", "terminee")
          .order("cree_le", { ascending: false }).limit(50),
        supabase.from("colis").select("*")
          .eq("chauffeur_nom", profil.nom).eq("statut", "livre")
          .order("cree_le", { ascending: false }).limit(50),
        supabase.from("tarifs").select("commission_course, commission_colis").eq("id", 1).maybeSingle(),
      ]);
      setCourses(coRes.data || []);
      setColis(clRes.data || []);
      if (tfRes.data) setTarifs(tfRes.data);
      setChargement(false);
    })();
  }, [profil]);

  const comCourse = parseFloat(tarifs.commission_course) || 0;
  const comColis = parseFloat(tarifs.commission_colis) || 0;

  // Part du chauffeur = prix payé par le client - commission de la plateforme
  const partCourse = (prix) => Math.round((prix || 0) * (100 - comCourse) / 100);
  const partColis = (prix) => Math.round((prix || 0) * (100 - comColis) / 100);

  const gainCourses = courses.reduce((s, c) => s + partCourse(c.prix_fcfa), 0);
  const gainColis = colis.reduce((s, c) => s + partColis(c.prix_fcfa), 0);
  const gainTotal = gainCourses + gainColis;
  const nbTotal = courses.length + colis.length;

  function dateCourte(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })
      + " · " + d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  }

  if (chargement) {
    return (
      <div className="chauffeur-body">
        <div className="hist-titre">Mes courses</div>
        <div className="aucune-course">Chargement…</div>
      </div>
    );
  }

  return (
    <div className="chauffeur-body">
      <button className="hist-retour" onClick={onRetour}>← Retour</button>

      <div className="hist-titre">Mes courses</div>

      {/* Résumé des gains */}
      <div className="hist-resume">
        <div className="hist-resume-bloc">
          <div className="hist-resume-val">{gainTotal.toLocaleString("fr-FR")} F</div>
          <div className="hist-resume-lib">Total gagné</div>
        </div>
        <div className="hist-resume-bloc">
          <div className="hist-resume-val">{nbTotal}</div>
          <div className="hist-resume-lib">Missions</div>
        </div>
      </div>

      <div className="hist-note">
        Les montants affichés sont votre part, après la commission Mira Express
        ({comCourse}% sur les courses, {comColis}% sur les colis).
      </div>

      {nbTotal === 0 ? (
        <div className="aucune-course">
          Vous n'avez pas encore de course terminée.<br />
          Passez en ligne pour recevoir des demandes.
        </div>
      ) : (
        <>
          {courses.length > 0 && (
            <>
              <div className="hist-section">🚗 Courses ({courses.length})</div>
              {courses.map((c) => (
                <div key={c.id} className="hist-item">
                  <div className="hist-item-haut">
                    <div className="hist-gain">{partCourse(c.prix_fcfa).toLocaleString("fr-FR")} F</div>
                    <div className="hist-date">{dateCourte(c.cree_le)}</div>
                  </div>
                  <div className="hist-meta">
                    Client a payé {(c.prix_fcfa || 0).toLocaleString("fr-FR")} F
                    {c.distance_km ? ` · ${c.distance_km} km` : ""}
                  </div>
                  {c.note && (
                    <div className="hist-note-client">
                      {"⭐".repeat(c.note)} {c.tags ? "· " + c.tags : ""}
                    </div>
                  )}
                </div>
              ))}
            </>
          )}

          {colis.length > 0 && (
            <>
              <div className="hist-section">📦 Colis livrés ({colis.length})</div>
              {colis.map((c) => (
                <div key={c.id} className="hist-item" style={{ borderLeftColor: "#FECB00" }}>
                  <div className="hist-item-haut">
                    <div className="hist-gain">{partColis(c.prix_fcfa).toLocaleString("fr-FR")} F</div>
                    <div className="hist-date">{dateCourte(c.cree_le)}</div>
                  </div>
                  <div className="hist-meta">
                    Client a payé {(c.prix_fcfa || 0).toLocaleString("fr-FR")} F
                    {c.distance_km ? ` · ${c.distance_km} km` : ""} · Colis {c.taille}
                  </div>
                </div>
              ))}
            </>
          )}
        </>
      )}
    </div>
  );
}

/* ===================== APP PRINCIPALE ===================== */
export default function App() {
  const [session, setSession] = useState(null);
  const [authPrete, setAuthPrete] = useState(false);
  const [profil, setProfil] = useState(null);
  const [profilCharge, setProfilCharge] = useState(false);
  const [editionProfil, setEditionProfil] = useState(false);
  const [montrerFelicitations, setMontrerFelicitations] = useState(false);
  const [codeSaisi, setCodeSaisi] = useState("");
  const [erreurCode, setErreurCode] = useState(null);
  const [modeRecuperation, setModeRecuperation] = useState(false);
  const [voirHistorique, setVoirHistorique] = useState(false);

  const [courses, setCourses] = useState([]);
  const [colis, setColis] = useState([]);
  const [colisActif, setColisActif] = useState(null);
  const [colisPhase, setColisPhase] = useState("ramassage"); // ramassage -> livraison
  const [colisPosition, setColisPosition] = useState(null);
  const [colisRoute, setColisRoute] = useState(null);
  const [codeColis, setCodeColis] = useState("");
  const [erreurCodeColis, setErreurCodeColis] = useState(null);
  const [enLigne, setEnLigne] = useState(true);
  const [courseActive, setCourseActive] = useState(null);
  const [maPosition, setMaPosition] = useState(null);
  const [maPositionLive, setMaPositionLive] = useState(null);
  const [routeTrace, setRouteTrace] = useState(null);
  const [gpsErreur, setGpsErreur] = useState(null);
  const [annuleParClient, setAnnuleParClient] = useState(null);
  const [showMotifs, setShowMotifs] = useState(false);
  const [chatOuvert, setChatOuvert] = useState(false);
  const [messages, setMessages] = useState([]);
  const [nouveauMsg, setNouveauMsg] = useState("");
  const finChatRef = useRef(null);
  const watchId = useRef(null);
  const courseActiveRef = useRef(null);
  const profilRef = useRef(null);
  const maPositionLiveRef = useRef(null);
  const colisActifRef = useRef(null);
  useEffect(() => { colisActifRef.current = colisActif; }, [colisActif]);
  useEffect(() => { courseActiveRef.current = courseActive; }, [courseActive]);
  useEffect(() => { profilRef.current = profil; }, [profil]);
  useEffect(() => { maPositionLiveRef.current = maPositionLive; }, [maPositionLive]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthPrete(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, sess) => {
      setSession(sess); setProfilCharge(false); setProfil(null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);
  // Détecte le retour depuis l'email de réinitialisation du mot de passe.
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((evenement) => {
      if (evenement === "PASSWORD_RECOVERY") setModeRecuperation(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function rechargerProfil() {
    if (!session) return;
    const ancienStatut = profilRef.current ? profilRef.current.statut_verif : null;
    const { data } = await supabase.from("chauffeurs").select("*").eq("user_id", session.user.id).maybeSingle();
    if (data && data.statut_verif === "approuve" && ancienStatut && ancienStatut !== "approuve") {
      setMontrerFelicitations(true);
    }
    // Libération auto : si marqué occupé mais aucune course/colis réellement en cours
    // (cas du rechargement de page), on remet le chauffeur disponible.
    if (data && data.en_course) {
      const monId = session.user.id;
      const { data: coursesEnCours } = await supabase.from("courses")
        .select("id").eq("chauffeur_nom", data.nom).in("statut", ["acceptee"]).limit(1);
      const { data: colisEnCours } = await supabase.from("colis")
        .select("id").eq("chauffeur_nom", data.nom).in("statut", ["acceptee"]).limit(1);
      const aUneMission = (coursesEnCours && coursesEnCours.length > 0) || (colisEnCours && colisEnCours.length > 0);
      if (!aUneMission) {
        await supabase.from("chauffeurs").update({ en_course: false }).eq("user_id", monId);
        data.en_course = false;
      }
    }
    setProfil(data || null);
    setProfilCharge(true);
  }

  useEffect(() => {
    if (!session) return;
    rechargerProfil();
  }, [session]);

// REPRISE DE MISSION : au démarrage uniquement (ou après un rechargement de
  // page), on retrouve dans la base la course ou le colis encore en cours pour
  // ce chauffeur, et on le restaure. Le verrou "repriseFaite" garantit que cet
  // effet ne s'exécute qu'UNE SEULE FOIS : sans lui, il se redéclencherait
  // après chaque acceptation et entrerait en conflit avec la carte Leaflet
  // (erreur "removeChild", écran noir).
  const repriseFaite = useRef(false);
  useEffect(() => {
    if (repriseFaite.current) return;          // déjà fait : on ne refait rien
    if (!session || !profil || !profil.nom) return;
    repriseFaite.current = true;               // on verrouille tout de suite

    let annule = false;
    (async () => {
      // 1) Une course encore acceptée ?
      const { data: courses } = await supabase
        .from("courses").select("*")
        .eq("chauffeur_nom", profil.nom)
        .eq("statut", "acceptee")
        .order("cree_le", { ascending: false })
        .limit(1);

      if (annule) return;
      if (courses && courses.length > 0) {
        setCourseActive(courses[0]);
        return; // une seule mission à la fois
      }

      // 2) Sinon, un colis encore accepté ?
      const { data: colisEnCours } = await supabase
        .from("colis").select("*")
        .eq("chauffeur_nom", profil.nom)
        .eq("statut", "acceptee")
        .order("cree_le", { ascending: false })
        .limit(1);

      if (annule) return;
      if (colisEnCours && colisEnCours.length > 0) {
        const c = colisEnCours[0];
        setColisActif(c);
        // On restaure aussi la phase : si le colis est déjà récupéré,
        // le chauffeur est en train de le livrer.
        setColisPhase(c.recupere ? "livraison" : "ramassage");
      }
    })();

    return () => { annule = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, profil]);

  async function seLibererManuellement() {
    if (!session) return;
    await supabase.from("chauffeurs").update({ en_course: false }).eq("user_id", session.user.id);
    setColisActif(null); setCourseActive(null); setColisPhase("ramassage");
    chargerCourses(); chargerColis();
  }

  async function deconnexion() {
    if (session) {
      await supabase.from("chauffeurs").update({ en_ligne: false, en_course: false }).eq("user_id", session.user.id);
    }
    await supabase.auth.signOut();
    setCourseActive(null);
    setCourses([]);
    setMontrerFelicitations(false);
  }

  function profilComplet(p) {
    return p && p.nom && p.telephone && p.plaque && p.vehicule && p.couleur && p.categorie && p.piece_identite_url && p.selfie_url;
  }
  function estApprouve(p) {
    return p && p.statut_verif === "approuve";
  }
  function compteBloque(p) {
    return p && (p.statut_compte === "suspendu" || p.statut_compte === "bloque");
  }

  useEffect(() => {
    if (!session || !profilComplet(profil) || !estApprouve(profil)) return;
    chargerCourses();
    chargerColis();
    const canal = supabase
      .channel("courses-chauffeur")
      .on("postgres_changes", { event: "*", schema: "public", table: "courses" }, (payload) => {
        chargerCourses();
        const active = courseActiveRef.current;
        if (active && payload.new && payload.new.id === active.id) {
          if (payload.new.statut === "annulee" && payload.new.annule_par === "client") {
            setAnnuleParClient(payload.new.motif_annulation || "Annulée par le client");
            setCourseActive(null);
            if (session) supabase.from("chauffeurs").update({ en_course: false }).eq("user_id", session.user.id);
          }
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "colis" }, (payload) => {
        chargerColis();
        // Si le passager a annulé le colis qui est ma mission active
        const actif = colisActifRef.current;
        if (actif && payload.new && payload.new.id === actif.id && payload.new.statut === "annulee") {
          setAnnuleParClient("Le client a annulé le colis.");
          setColisActif(null);
          setColisPhase("ramassage");
          if (session) supabase.from("chauffeurs").update({ en_course: false }).eq("user_id", session.user.id);
        }
      })
      .subscribe();
    // BRIQUE 4 : on revérifie toutes les 8 s. Si une cible a expiré (20 s sans réponse),
    // le chauffeur suivant le plus proche pourra se désigner automatiquement.
    const minuterie = setInterval(() => { chargerCourses(); chargerColis(); }, 3000);
    return () => { supabase.removeChannel(canal); clearInterval(minuterie); };
  }, [session, profil]);

  async function chargerCourses() {
    const p = profilRef.current;
    if (!p || !p.categorie || !session) return;
    const monId = session.user.id;
    // Position : on prend le GPS live, sinon la position enregistrée dans le profil (secours mobile)
    const pos = maPositionLiveRef.current || (p.position_lat != null ? [p.position_lat, p.position_lng] : null);

    // Expirer les courses trop vieilles (plus de 5 min en recherche) — fait côté Supabase
    const ilYa5min = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    await supabase.from("courses").update({ statut: "expiree" })
      .eq("statut", "recherche").lt("cree_le", ilYa5min);

    // 1) Charger les courses encore en recherche de ma catégorie
    // (les vieilles ont déjà été expirées ci-dessus, donc pas de filtre d'horloge local)
    const { data, error } = await supabase
      .from("courses").select("*")
      .eq("statut", "recherche")
      .eq("classe", p.categorie)
      .order("cree_le", { ascending: false });
    if (error || !data) return;

    // 2) Charger les chauffeurs EN LIGNE et DISPONIBLES (pas en course) de ma catégorie
    const { data: chauffeurs } = await supabase
      .from("chauffeurs").select("user_id, position_lat, position_lng, en_ligne, en_course, categorie")
      .eq("categorie", p.categorie)
      .eq("en_ligne", true);
    // BRIQUE 5 : on ne garde que les chauffeurs disponibles (pas en course)
    const enLigneAvecPos = (chauffeurs || []).filter(
      (c) => c.position_lat != null && c.position_lng != null && !c.en_course
    );

    const maintenant = Date.now();
    const DELAI_CIBLE_MS = 12000; // 12 s avant de passer au suivant (Brique 4)

    // 3) Pour chaque course, déterminer si JE dois la voir
    const visibles = [];
    for (const c of data) {
      const refuses = (c.chauffeurs_refuses || "").split(",").filter(Boolean);
      if (refuses.includes(monId)) continue; // j'ai déjà refusé : je ne la revois pas

      const cibleExpiree = c.cible_depuis && (maintenant - new Date(c.cible_depuis).getTime() > DELAI_CIBLE_MS);

      // a) La course m'est déjà attribuée et la cible n'a pas expiré -> je la vois
      if (c.chauffeur_cible === monId && !cibleExpiree) {
        visibles.push(c);
        continue;
      }

      // b) La course a une cible (un autre) encore valide -> je ne la vois pas
      if (c.chauffeur_cible && c.chauffeur_cible !== monId && !cibleExpiree) {
        continue;
      }

      // c) Pas de cible, ou cible expirée : on calcule qui est le plus proche
      //    parmi les chauffeurs en ligne qui n'ont PAS refusé.
      if (!pos) { continue; }
      const candidats = enLigneAvecPos.filter((ch) => !refuses.includes(ch.user_id));
      if (candidats.length === 0) continue;
      // distance de chaque candidat au départ de la course
      let plusProche = null, distMin = Infinity;
      for (const ch of candidats) {
        const d = distanceKm([ch.position_lat, ch.position_lng], [c.depart_lat, c.depart_lng]);
        if (d < distMin) { distMin = d; plusProche = ch.user_id; }
      }
      // Si JE suis le plus proche, je me désigne comme cible dans la base
      if (plusProche === monId) {
        await supabase.from("courses").update({
          chauffeur_cible: monId,
          cible_depuis: new Date().toISOString(),
        }).eq("id", c.id).eq("statut", "recherche");
        visibles.push({ ...c, chauffeur_cible: monId });
      }
    }

    // 4) Calculer la distance et trier pour l'affichage
    let liste = visibles;
    if (pos) {
      liste = visibles
        .map((c) => ({ ...c, _distChauffeur: distanceKm(pos, [c.depart_lat, c.depart_lng]) }))
        .sort((a, b) => a._distChauffeur - b._distChauffeur);
    }
    setCourses(liste);
  }

  // ÉTAPE B : attribution des colis au chauffeur le plus proche du RAMASSAGE.
  // Même logique que les courses (briques 1 à 5), mais sur la table colis.
  // Tous les chauffeurs en ligne peuvent livrer un colis (pas de filtre catégorie).
  async function chargerColis() {
    const p = profilRef.current;
    if (!p || !session) return;
    const monId = session.user.id;
    // Position : GPS live, sinon position du profil Supabase (secours mobile)
    const pos = maPositionLiveRef.current || (p.position_lat != null ? [p.position_lat, p.position_lng] : null);

    // Expirer les colis trop vieux (plus de 5 min en recherche) — fait côté Supabase
    const ilYa5minC = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    await supabase.from("colis").update({ statut: "expiree" })
      .eq("statut", "recherche").lt("cree_le", ilYa5minC);

    const { data, error } = await supabase
      .from("colis").select("*")
      .eq("statut", "recherche")
      .order("cree_le", { ascending: false });
    if (error || !data) return;

    // Chauffeurs en ligne et disponibles (tous, peu importe la catégorie)
    const { data: chauffeurs } = await supabase
      .from("chauffeurs").select("user_id, position_lat, position_lng, en_ligne, en_course")
      .eq("en_ligne", true);
    const enLigneAvecPos = (chauffeurs || []).filter(
      (c) => c.position_lat != null && c.position_lng != null && !c.en_course
    );

    const maintenant = Date.now();
    const DELAI_CIBLE_MS = 12000;

    const visibles = [];
    for (const c of data) {
      const refuses = (c.chauffeurs_refuses || "").split(",").filter(Boolean);
      if (refuses.includes(monId)) continue;
      const cibleExpiree = c.cible_depuis && (maintenant - new Date(c.cible_depuis).getTime() > DELAI_CIBLE_MS);

      if (c.chauffeur_cible === monId && !cibleExpiree) { visibles.push(c); continue; }
      if (c.chauffeur_cible && c.chauffeur_cible !== monId && !cibleExpiree) continue;

      if (!pos) continue;
      const candidats = enLigneAvecPos.filter((ch) => !refuses.includes(ch.user_id));
      if (candidats.length === 0) continue;
      let plusProche = null, distMin = Infinity;
      for (const ch of candidats) {
        const d = distanceKm([ch.position_lat, ch.position_lng], [c.ramassage_lat, c.ramassage_lng]);
        if (d < distMin) { distMin = d; plusProche = ch.user_id; }
      }
      if (plusProche === monId) {
        await supabase.from("colis").update({
          chauffeur_cible: monId,
          cible_depuis: new Date().toISOString(),
        }).eq("id", c.id).eq("statut", "recherche");
        visibles.push({ ...c, chauffeur_cible: monId });
      }
    }

    let liste = visibles;
    if (pos) {
      liste = visibles
        .map((c) => ({ ...c, _distChauffeur: distanceKm(pos, [c.ramassage_lat, c.ramassage_lng]) }))
        .sort((a, b) => a._distChauffeur - b._distChauffeur);
    }
    setColis(liste);
  }

  async function accepter(course) {
    const { error } = await supabase
      .from("courses")
      .update({
        statut: "acceptee",
        chauffeur_nom: profil.nom,
        chauffeur_plaque: profil.plaque,
        chauffeur_vehicule: profil.vehicule + (profil.couleur ? " · " + profil.couleur : ""),
        chauffeur_tel: profil.telephone,
      })
      .eq("id", course.id);
    if (!error) {
      // BRIQUE 5 : se marquer occupé pour ne plus être ciblé par d'autres courses
      await supabase.from("chauffeurs").update({ en_course: true }).eq("user_id", session.user.id);
      setCourseActive(course); setAnnuleParClient(null); setCodeSaisi(""); setErreurCode(null);
    }
  }

  // BRIQUE 4 : le chauffeur refuse -> on l'ajoute aux refusés et on libère la cible.
  // La commande NE s'annule PAS : un autre chauffeur (le suivant le plus proche) sera ciblé.
  async function refuser(course) {
    if (!session) return;
    const monId = session.user.id;
    const refuses = (course.chauffeurs_refuses || "").split(",").filter(Boolean);
    if (!refuses.includes(monId)) refuses.push(monId);
    await supabase.from("courses").update({
      chauffeur_cible: null,
      cible_depuis: null,
      chauffeurs_refuses: refuses.join(","),
    }).eq("id", course.id).eq("statut", "recherche");
    // Retirer la course de ma liste tout de suite
    setCourses((prev) => prev.filter((c) => c.id !== course.id));
    chargerCourses();
  }

  // ÉTAPE B : accepter un colis
  async function accepterColis(c) {
    const { error } = await supabase
      .from("colis")
      .update({
        statut: "acceptee",
        chauffeur_nom: profil.nom,
        chauffeur_plaque: profil.plaque,
        chauffeur_tel: profil.telephone,
      })
      .eq("id", c.id);
    if (!error) {
      await supabase.from("chauffeurs").update({ en_course: true }).eq("user_id", session.user.id);
      setColisActif(c); setColisPhase("ramassage");
    }
  }

  // ÉTAPE B : refuser un colis -> passe au suivant le plus proche
  async function refuserColis(c) {
    if (!session) return;
    const monId = session.user.id;
    const refuses = (c.chauffeurs_refuses || "").split(",").filter(Boolean);
    if (!refuses.includes(monId)) refuses.push(monId);
    await supabase.from("colis").update({
      chauffeur_cible: null, cible_depuis: null, chauffeurs_refuses: refuses.join(","),
    }).eq("id", c.id).eq("statut", "recherche");
    setColis((prev) => prev.filter((x) => x.id !== c.id));
    chargerColis();
  }

  async function demarrerCourse() {
    setErreurCode(null);
    if (codeSaisi.trim() !== courseActive.code_demarrage) {
      setErreurCode("Code incorrect. Demandez le bon code au client.");
      return;
    }
    await supabase.from("courses").update({ demarree: true }).eq("id", courseActive.id);
    setCourseActive({ ...courseActive, demarree: true });
    setCodeSaisi("");
  }

  async function terminer() {
    if (courseActive) {
      await supabase.from("courses").update({ statut: "terminee" }).eq("id", courseActive.id);
    }
    // BRIQUE 5 : redevenir disponible
    if (session) await supabase.from("chauffeurs").update({ en_course: false }).eq("user_id", session.user.id);
    fermerChat();
    setCourseActive(null);
  }

  async function annulerChauffeur(motif) {
    if (!courseActive) return;
    await supabase.from("courses")
      .update({ statut: "annulee", annule_par: "chauffeur", motif_annulation: motif })
      .eq("id", courseActive.id);
    // BRIQUE 5 : redevenir disponible
    if (session) await supabase.from("chauffeurs").update({ en_course: false }).eq("user_id", session.user.id);
    fermerChat();
    setShowMotifs(false);
    setCourseActive(null);
  }

  useEffect(() => {
    if (!courseActive) { setMessages([]); return; }
    const id = courseActive.id;
    (async () => {
      const { data } = await supabase.from("messages").select("*").eq("course_id", id).order("created_at", { ascending: true });
      if (data) setMessages(data);
    })();
    const canalChat = supabase
      .channel("chat-ch-" + id)
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: "course_id=eq." + id },
        (payload) => { setMessages((prev) => [...prev, payload.new]); }
      ).subscribe();
    return () => supabase.removeChannel(canalChat);
  }, [courseActive]);

  useEffect(() => {
    if (chatOuvert && finChatRef.current) finChatRef.current.scrollIntoView({ behavior: "smooth" });
  }, [messages, chatOuvert]);

  async function envoyerMessage() {
    const texte = nouveauMsg.trim();
    if (!texte || !courseActive) return;
    setNouveauMsg("");
    await supabase.from("messages").insert({ course_id: courseActive.id, expediteur: "chauffeur", contenu: texte });
  }
  function fermerChat() { setChatOuvert(false); setNouveauMsg(""); }

  useEffect(() => {
    if (!courseActive) {
      if (watchId.current !== null) { navigator.geolocation.clearWatch(watchId.current); watchId.current = null; }
      return;
    }
    if (!navigator.geolocation) { setGpsErreur("GPS non disponible."); return; }
    watchId.current = navigator.geolocation.watchPosition(
      async (pos) => {
        const lat = pos.coords.latitude, lng = pos.coords.longitude;
        setMaPosition([lat, lng]); setGpsErreur(null);
        await supabase.from("courses").update({ chauffeur_lat: lat, chauffeur_lng: lng }).eq("id", courseActive.id);
      },
      (err) => setGpsErreur("Activez la localisation : " + err.message),
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 10000 }
    );
    return () => { if (watchId.current !== null) { navigator.geolocation.clearWatch(watchId.current); watchId.current = null; } };
  }, [courseActive]);

  // BRIQUE 1 : quand le chauffeur est EN LIGNE et PAS en course,
  // il envoie sa position GPS en continu pour être trouvable par les commandes.
  const watchDispo = useRef(null);
  useEffect(() => {
    // On nettoie toute surveillance précédente
    if (watchDispo.current !== null) {
      navigator.geolocation.clearWatch(watchDispo.current);
      watchDispo.current = null;
    }
    // Actif seulement si en ligne, approuvé, et pas déjà en course
    if (!session || !profilComplet(profil) || !estApprouve(profil) || compteBloque(profil) || courseActive || !enLigne) {
      // Marque le chauffeur hors ligne s'il se déconnecte de la dispo
      if (profil && session && !enLigne) {
        supabase.from("chauffeurs").update({ en_ligne: false }).eq("user_id", session.user.id);
      }
      return;
    }
    if (!navigator.geolocation) return;
    watchDispo.current = navigator.geolocation.watchPosition(
      async (pos) => {
        const lat = pos.coords.latitude, lng = pos.coords.longitude;
        setMaPositionLive([lat, lng]);
        await supabase.from("chauffeurs").update({
          position_lat: lat, position_lng: lng,
          en_ligne: true, derniere_maj: new Date().toISOString(),
        }).eq("user_id", session.user.id);
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 12000 }
    );
    return () => {
      if (watchDispo.current !== null) {
        navigator.geolocation.clearWatch(watchDispo.current);
        watchDispo.current = null;
      }
    };
  }, [session, profil, courseActive, enLigne]);

  const depart = courseActive ? [courseActive.depart_lat, courseActive.depart_lng] : null;
  const dest = courseActive ? [courseActive.dest_lat, courseActive.dest_lng] : null;
  const lienNavigation = courseActive
    ? `https://www.google.com/maps/dir/?api=1&destination=${courseActive.depart_lat},${courseActive.depart_lng}&travelmode=driving`
    : "#";

  // Points du colis actif
  const colisRamassage = colisActif ? [colisActif.ramassage_lat, colisActif.ramassage_lng] : null;
  const colisLivraison = colisActif ? [colisActif.livraison_lat, colisActif.livraison_lng] : null;

  // GPS pendant la mission colis : envoyer la position au client
  const watchColis = useRef(null);
  useEffect(() => {
    if (!colisActif) {
      if (watchColis.current !== null) { navigator.geolocation.clearWatch(watchColis.current); watchColis.current = null; }
      return;
    }
    if (!navigator.geolocation) return;
    watchColis.current = navigator.geolocation.watchPosition(
      async (pos) => {
        const lat = pos.coords.latitude, lng = pos.coords.longitude;
        setColisPosition([lat, lng]);
        await supabase.from("colis").update({ chauffeur_lat: lat, chauffeur_lng: lng }).eq("id", colisActif.id);
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 10000 }
    );
    return () => { if (watchColis.current !== null) { navigator.geolocation.clearWatch(watchColis.current); watchColis.current = null; } };
  }, [colisActif]);

  // Trajet OSRM du colis selon la phase :
  // - ramassage : ma position -> point A (ramassage)
  // - livraison : point A -> point B (livraison)
  useEffect(() => {
    if (!colisActif) { setColisRoute(null); return; }
    const a = colisPhase === "ramassage" ? (colisPosition || colisRamassage) : colisRamassage;
    const b = colisPhase === "ramassage" ? colisRamassage : colisLivraison;
    if (!a || !b) { setColisRoute(null); return; }
    let annule = false;
    calculerRoute(a, b).then((pts) => { if (!annule) setColisRoute(pts); });
    return () => { annule = true; };
  }, [colisActif, colisPhase, colisPosition]);

  // Valider le colis livré avec le code du destinataire
  async function validerLivraisonColis() {
    setErreurCodeColis(null);
    if (codeColis.trim() !== colisActif.code_retrait) {
      setErreurCodeColis("Code incorrect. Demandez le bon code au destinataire.");
      return;
    }
    await supabase.from("colis").update({ statut: "livre", livre: true, recupere: true }).eq("id", colisActif.id);
    if (session) await supabase.from("chauffeurs").update({ en_course: false }).eq("user_id", session.user.id);
    setCodeColis("");
    setColisPhase("ramassage");
    setColisActif(null);
  }

  // Annuler la mission colis
  async function annulerColis() {
    if (!colisActif) return;
    const refuses = (colisActif.chauffeurs_refuses || "").split(",").filter(Boolean);
    if (session && !refuses.includes(session.user.id)) refuses.push(session.user.id);
    await supabase.from("colis").update({
      statut: "recherche", chauffeur_cible: null, cible_depuis: null,
      chauffeur_nom: null, chauffeur_tel: null, chauffeur_plaque: null,
      chauffeurs_refuses: refuses.join(","),
    }).eq("id", colisActif.id);
    if (session) await supabase.from("chauffeurs").update({ en_course: false }).eq("user_id", session.user.id);
    setColisPhase("ramassage");
    setColisActif(null);
  }


  // Trajet par les routes (OSRM) :
  // - course pas démarrée : ma position -> client (aller le chercher)
  // - course démarrée : départ client -> destination
  useEffect(() => {
    if (!courseActive) { setRouteTrace(null); return; }
    const demarree = courseActive.demarree;
    const a = demarree ? depart : maPosition;
    const b = demarree ? dest : depart;
    if (!a || !b) { setRouteTrace(null); return; }
    let annule = false;
    calculerRoute(a, b).then((pts) => { if (!annule) setRouteTrace(pts); });
    return () => { annule = true; };
  }, [courseActive, maPosition]);

  if (!authPrete) {
    return <div id="app" style={{ display: "flex", alignItems: "center", justifyContent: "center", background: "#002664" }}><div style={{ color: "#fff" }}>Chargement...</div></div>;
  }
  if (modeRecuperation) {
    return <div id="app"><NouveauMotDePasse onTermine={() => setModeRecuperation(false)} /></div>;
  }
  if (!session) {
    return <div id="app"><Accueil /></div>;
  }
  if (!profilCharge) {
    return <div id="app" style={{ display: "flex", alignItems: "center", justifyContent: "center", background: "#002664" }}><div style={{ color: "#fff" }}>Chargement du profil...</div></div>;
  }

  if (!profilComplet(profil) || editionProfil) {
    return (
      <div id="app">
        <div id="header">
          <div id="logo-badge"></div>
          <h1>Mira<span> Express</span><small>Mon profil</small></h1>
          <button onClick={deconnexion} style={{ ...btnDeco, marginLeft: "auto" }}>Déconnexion</button>
        </div>
        <div style={{ position: "absolute", top: 62, left: 0, right: 0, bottom: 0, overflowY: "auto", background: "#f3f4f6" }}>
          <MonProfil
            userId={session.user.id}
            profilExistant={profilComplet(profil) ? profil : (profil || null)}
            onEnregistre={async () => { await rechargerProfil(); setEditionProfil(false); }}
            onAnnuler={profilComplet(profil) ? () => setEditionProfil(false) : null}
          />
        </div>
      </div>
    );
  }

  if (!estApprouve(profil)) {
    return (
      <div id="app">
        <div id="header">
          <div id="logo-badge"></div>
          <h1>Mira<span> Express</span><small>Mode Chauffeur</small></h1>
          <button onClick={deconnexion} style={btnDeco}>Déconnexion</button>
        </div>
        <EcranStatut statut={profil.statut_verif} onDeconnexion={deconnexion} onRafraichir={rechargerProfil} />
      </div>
    );
  }

  if (compteBloque(profil)) {
    const suspendu = profil.statut_compte === "suspendu";
    return (
      <div id="app">
        <div id="header">
          <div id="logo-badge"></div>
          <h1>Mira<span> Express</span><small>Mode Chauffeur</small></h1>
          <button onClick={deconnexion} style={btnDeco}>Déconnexion</button>
        </div>
        <div style={{ position: "absolute", top: 62, left: 0, right: 0, bottom: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "#f3f4f6", padding: "24px" }}>
          <div style={{ background: "#fff", borderRadius: "18px", padding: "30px", maxWidth: "380px", width: "100%", textAlign: "center", boxShadow: "0 8px 30px rgba(0,0,0,.1)" }}>
            <div style={{ fontSize: "48px", marginBottom: "10px" }}>{suspendu ? "⏸" : "⛔"}</div>
            <h2 style={{ color: suspendu ? "#9a3412" : "#991b1b", marginBottom: "12px" }}>
              {suspendu ? "Compte suspendu" : "Compte bloqué"}
            </h2>
            <p style={{ color: "#6b7280", fontSize: "14px", marginBottom: "20px", lineHeight: 1.6 }}>
              {suspendu
                ? "Votre compte est temporairement suspendu. Vous ne pouvez pas recevoir de courses pour le moment. Contactez le support Mira Express pour régulariser votre situation."
                : "Votre compte a été bloqué et ne peut plus recevoir de courses. Pour toute question, contactez le support Mira Express."}
            </p>
            <button onClick={rechargerProfil}
              style={{ width: "100%", border: "none", borderRadius: "11px", background: "#002664", color: "#fff", fontWeight: 700, padding: "13px", cursor: "pointer", marginBottom: "8px" }}>
              Actualiser mon statut
            </button>
            <button onClick={deconnexion}
              style={{ width: "100%", border: "none", borderRadius: "11px", background: "#e5e7eb", color: "#6b7280", fontWeight: 700, padding: "13px", cursor: "pointer" }}>
              Déconnexion
            </button>
          </div>
        </div>
      </div>
    );
  }
  if (montrerFelicitations) {
    return (
      <div id="app">
        <div id="header">
          <div id="logo-badge"></div>
          <h1>Mira<span> Express</span><small>Mode Chauffeur</small></h1>
        </div>
        <EcranFelicitations nom={profil.nom} onContinuer={() => setMontrerFelicitations(false)} />
      </div>
    );
  }

  const maCat = NOM_CATEGORIE[profil.categorie] || profil.categorie;

  return (
    <div id="app">
      <div id="header" style={{ minHeight: "92px", display: "flex", alignItems: "center", position: "absolute", top: 0, left: 0, right: 0, zIndex: 1000, background: "#0d1117" }}>
        <div id="logo-badge"></div>
        <h1>Mira<span> Express</span><small>Mode Chauffeur</small></h1>
        <button onClick={() => setVoirHistorique(true)} style={{ ...btnDeco, marginLeft: "auto", marginRight: 6 }}>📋 Mes courses</button>
        <button onClick={() => setEditionProfil(true)} style={{ ...btnDeco, marginRight: 6 }}>Profil</button>
        <button onClick={deconnexion} style={btnDeco}>Déconnexion</button>
      </div>

      {voirHistorique ? (
        <div style={{ position: "absolute", top: "92px", left: 0, right: 0, bottom: 0, overflowY: "auto", background: "#f3f4f6" }}>
          <MesCourses profil={profil} onRetour={() => setVoirHistorique(false)} />
        </div>
      ) : colisActif ? (
        <div className="chauffeur-active-wrap" style={{ position: "absolute", top: "100px", left: 0, right: 0, bottom: 0, display: "flex", flexDirection: "column" }}>
          <div className="carte-chauffeur">
            <MapContainer center={colisPosition || colisRamassage || NDJAMENA} zoom={14} style={{ height: "100%", width: "100%" }} zoomControl={false}>
              <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="© OpenStreetMap" />
              {colisRamassage && <Marker position={colisRamassage} icon={icone("#002664")} />}
              {colisLivraison && <Marker position={colisLivraison} icon={icone("#C60C30")} />}
              {colisPosition && <Marker position={colisPosition} icon={iconeVoiture(couleurVers(profil?.couleur))} />}
              {colisRoute ? (
                <>
                  <Polyline positions={colisRoute} pathOptions={{ color: "#fff", weight: 9, opacity: 0.9 }} />
                  <Polyline positions={colisRoute} pathOptions={{ color: "#16a34a", weight: 5 }} />
                </>
              ) : null}
              <AjusterVue points={[colisPosition, colisRamassage, colisLivraison]} />
            </MapContainer>
          </div>
          <div className="course-active">
            <div className="course-active-titre" style={{ color: "#a16207" }}>
              📦 {colisPhase === "ramassage" ? "Aller chercher le colis" : "Livrer le colis"}
            </div>
            <div className="course-active-prix">{(colisActif.prix_fcfa || 0).toLocaleString("fr-FR")} FCFA</div>
            <div className="course-active-detail">
              Taille {colisActif.taille} · {colisActif.distance_km} km · {colisActif.mode_livraison === "porte" ? "Porte-à-porte" : "Agence"}
            </div>

            <div style={{ background: "#f3f4f6", borderRadius: "12px", padding: "12px", marginBottom: "10px", textAlign: "left", fontSize: "13px" }}>
              <div><b>Ramassage :</b> {colisActif.ramassage_nom || "Point A"}</div>
              <div><b>Livraison :</b> {colisActif.livraison_nom || "Point B"}</div>
              {colisActif.description ? <div><b>Contenu :</b> {colisActif.description}</div> : null}
              <div style={{ marginTop: "6px" }}><b>Destinataire :</b> {colisActif.destinataire_nom}</div>
              {colisActif.destinataire_tel ? <div><b>Tél :</b> {colisActif.destinataire_tel}</div> : null}
            </div>

            {colisActif.destinataire_tel && (
              <a href={"tel:" + colisActif.destinataire_tel}
                style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "100%", padding: "12px", marginBottom: "8px", borderRadius: "12px", textDecoration: "none", background: "#16a34a", color: "#fff", fontWeight: 700, fontSize: "15px" }}>
                📞 Appeler le destinataire
              </a>
            )}

            {colisPhase === "ramassage" ? (
              <button onClick={() => setColisPhase("livraison")}
                style={{ width: "100%", border: "none", borderRadius: "11px", background: "#002664", color: "#fff", fontWeight: 800, padding: "14px", cursor: "pointer", fontSize: "15px", marginBottom: "8px" }}>
                ✓ J'ai récupéré le colis
              </button>
            ) : (
              <div style={{ background: "#f3f4f6", borderRadius: "12px", padding: "14px", marginBottom: "8px" }}>
                <div style={{ fontSize: "13px", fontWeight: 700, color: "#0d1117", marginBottom: "8px", textAlign: "center" }}>
                  Saisissez le code du destinataire pour valider la remise
                </div>
                <input
                  type="tel" inputMode="numeric" maxLength={4}
                  value={codeColis}
                  onChange={(e) => setCodeColis(e.target.value.replace(/\D/g, ""))}
                  placeholder="• • • •"
                  style={{ width: "100%", textAlign: "center", fontSize: "28px", fontWeight: 800, letterSpacing: "10px", padding: "10px", borderRadius: "10px", border: "2px solid #d1d5db", outline: "none", marginBottom: "8px" }}
                />
                {erreurCodeColis && <div style={{ color: "#C60C30", fontSize: "12px", fontWeight: 600, textAlign: "center", marginBottom: "8px" }}>{erreurCodeColis}</div>}
                <button onClick={validerLivraisonColis}
                  style={{ width: "100%", border: "none", borderRadius: "11px", background: "#16a34a", color: "#fff", fontWeight: 800, padding: "13px", cursor: "pointer", fontSize: "15px" }}>
                  Valider la livraison
                </button>
              </div>
            )}

            <button onClick={annulerColis} className="btn-annuler-ch">Annuler la mission</button>
          </div>
        </div>
      ) : courseActive ? (
        <div className="chauffeur-active-wrap" style={{ position: "absolute", top: "100px", left: 0, right: 0, bottom: 0, display: "flex", flexDirection: "column" }}>
          <div className="carte-chauffeur">
            <MapContainer center={maPosition || depart || NDJAMENA} zoom={14} style={{ height: "100%", width: "100%" }} zoomControl={false}>
              <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="© OpenStreetMap" />
              {/* Protection : on ne rend les marqueurs que si les points existent.
                  Sans cette vérification, Leaflet reçoit position={null} au premier
                  rendu et plante (erreur removeChild, écran noir). */}
              {depart && <Marker position={depart} icon={icone("#002664")} />}
              {dest && <Marker position={dest} icon={icone("#C60C30")} />}
              {maPosition && <Marker position={maPosition} icon={iconeVoiture(couleurVers(profil?.couleur))} />}
              {routeTrace ? (
                <>
                  <Polyline positions={routeTrace} pathOptions={{ color: "#fff", weight: 9, opacity: 0.9 }} />
                  <Polyline positions={routeTrace} pathOptions={{ color: "#16a34a", weight: 5 }} />
                </>
              ) : (
                depart && dest && (
                  <Polyline positions={[depart, dest]} pathOptions={{ color: "#FECB00", weight: 4, dashArray: "2,8" }} />
                )
              )}
              <AjusterVue points={[maPosition, depart, dest]} />
            </MapContainer>
          </div>
          <div className="course-active">
            <div className="course-active-titre">🚗 Course en cours</div>
            <div className="course-active-prix">{courseActive.prix_fcfa.toLocaleString("fr-FR")} FCFA</div>
            <div className="course-active-detail">
              {NOM_CATEGORIE[courseActive.classe] || courseActive.classe} · {courseActive.distance_km} km · {PAY_NOMS[courseActive.mode_paiement]}
            </div>
            {gpsErreur
              ? <div className="gps-statut err">📍 {gpsErreur}</div>
              : maPosition
                ? <div className="gps-statut ok">📍 Position GPS envoyée en temps réel</div>
                : <div className="gps-statut">📍 Recherche du signal GPS...</div>}

            {!showMotifs ? (
              <>
                <a href={lienNavigation} target="_blank" rel="noopener noreferrer"
                  style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "100%", padding: "12px", marginTop: "8px", marginBottom: "8px", borderRadius: "12px", textDecoration: "none", background: "#16a34a", color: "#fff", fontWeight: 700, fontSize: "15px" }}>
                  🧭 Naviguer vers le client
                </a>
                <button onClick={() => setChatOuvert(true)}
                  style={{ width: "100%", padding: "12px", marginBottom: "8px", borderRadius: "12px", border: "none", cursor: "pointer", background: "#002664", color: "#fff", fontWeight: 700, fontSize: "15px" }}>
                  💬 Discussion
                </button>

                {!courseActive.demarree ? (
                  <div style={{ background: "#f3f4f6", borderRadius: "12px", padding: "14px", marginBottom: "8px" }}>
                    <div style={{ fontSize: "13px", fontWeight: 700, color: "#0d1117", marginBottom: "8px", textAlign: "center" }}>
                      Saisissez le code du client pour démarrer
                    </div>
                    <input
                      type="tel"
                      inputMode="numeric"
                      maxLength={4}
                      value={codeSaisi}
                      onChange={(e) => setCodeSaisi(e.target.value.replace(/\D/g, ""))}
                      placeholder="• • • •"
                      style={{ width: "100%", textAlign: "center", fontSize: "28px", fontWeight: 800, letterSpacing: "10px", padding: "10px", borderRadius: "10px", border: "2px solid #d1d5db", outline: "none", marginBottom: "8px" }}
                    />
                    {erreurCode && <div style={{ color: "#C60C30", fontSize: "12px", fontWeight: 600, textAlign: "center", marginBottom: "8px" }}>{erreurCode}</div>}
                    <button onClick={demarrerCourse}
                      style={{ width: "100%", border: "none", borderRadius: "11px", background: "#16a34a", color: "#fff", fontWeight: 800, padding: "13px", cursor: "pointer", fontSize: "15px" }}>
                      Démarrer la course
                    </button>
                  </div>
                ) : (
                  <button className="btn-terminer" onClick={terminer}>Terminer la course</button>
                )}

                <button className="btn-annuler-ch" onClick={() => setShowMotifs(true)}>Annuler la course</button>
              </>
            ) : (
              <div style={{ textAlign: "left", marginTop: "6px" }}>
                <div style={{ fontSize: "13px", fontWeight: 700, marginBottom: "8px", textAlign: "center" }}>Pourquoi annulez-vous ?</div>
                {MOTIFS_CHAUFFEUR.map((m) => (
                  <button key={m} className="motif-btn" onClick={() => annulerChauffeur(m)}>{m}</button>
                ))}
                <button className="motif-retour" onClick={() => setShowMotifs(false)}>Retour</button>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="chauffeur-body" style={{ position: "absolute", top: "100px", left: 0, right: 0, bottom: 0, background: "#f3f4f6", overflowY: "auto", padding: "16px" }}>
          <div style={{ background: "#fff", borderRadius: "14px", padding: "14px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px", boxShadow: "0 2px 8px rgba(0,0,0,.06)" }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: "15px", color: "#0d1117" }}>{profil.nom}</div>
              <div style={{ fontSize: "12px", color: "#6b7280", marginTop: "2px" }}>{profil.vehicule}{profil.couleur ? " · " + profil.couleur : ""} · {profil.plaque}</div>
            </div>
            <div
              onClick={() => setEnLigne(!enLigne)}
              style={{
                display: "flex", alignItems: "center", gap: "8px", cursor: "pointer",
                padding: "10px 16px", borderRadius: "30px", fontSize: "13px", fontWeight: 800,
                background: enLigne ? "#dcfce7" : "#fee2e2",
                color: enLigne ? "#16a34a" : "#C60C30",
                border: enLigne ? "2px solid #16a34a" : "2px solid #C60C30",
              }}>
              <div style={{
                width: "11px", height: "11px", borderRadius: "50%",
                background: enLigne ? "#16a34a" : "#C60C30",
                boxShadow: enLigne ? "0 0 0 3px rgba(22,163,74,.2)" : "0 0 0 3px rgba(198,12,48,.2)",
              }}></div>
              <span>{enLigne ? "En ligne" : "Hors ligne"}</span>
            </div>
          </div>

          <div style={{ textAlign: "center", fontSize: "12px", color: "#16a34a", margin: "0 0 8px", fontWeight: 700 }}>
            ✓ Compte vérifié · Catégorie : <b>{maCat}</b>
          </div>

          {profil.en_course && (
            <div style={{ background: "#fef9c3", border: "1.5px solid #eab308", borderRadius: "12px", padding: "12px", marginBottom: "12px", textAlign: "center" }}>
              <div style={{ fontSize: "13px", color: "#a16207", fontWeight: 600, marginBottom: "8px" }}>
                Vous êtes marqué « occupé » mais n'avez aucune mission en cours.
              </div>
              <button onClick={seLibererManuellement}
                style={{ width: "100%", border: "none", borderRadius: "10px", background: "#16a34a", color: "#fff", fontWeight: 700, padding: "11px", cursor: "pointer", fontSize: "14px" }}>
                Me remettre disponible
              </button>
            </div>
          )}

          {annuleParClient && (
            <div className="annul-client">
              <b>⚠️ Le client a annulé la course</b>
              <div style={{ fontSize: "12px", marginTop: "4px" }}>Motif : {annuleParClient}</div>
              <button className="annul-ok" onClick={() => setAnnuleParClient(null)}>Compris</button>
            </div>
          )}

          <div className="liste-titre">
            {enLigne ? `Demandes disponibles (${courses.length})` : "Vous êtes hors ligne"}
          </div>
          {!enLigne ? (
            <div className="aucune-course">Passez en ligne pour recevoir des courses.</div>
          ) : courses.length === 0 ? (
            <div className="aucune-course">En attente de courses {maCat}...</div>
          ) : (
            courses.map((c) => (
              <div key={c.id} className="course-card">
                <div className="course-card-haut">
                  <div className="course-card-prix">{c.prix_fcfa.toLocaleString("fr-FR")} FCFA</div>
                  <div className="course-card-classe">{NOM_CATEGORIE[c.classe] || c.classe}</div>
                </div>
                {typeof c._distChauffeur === "number" && (
                  <div style={{ display: "inline-block", background: "#dcfce7", color: "#16a34a", fontWeight: 800, fontSize: "12px", padding: "5px 12px", borderRadius: "20px", marginBottom: "8px" }}>
                    📍 Client à ~{c._distChauffeur < 1 ? Math.round(c._distChauffeur * 1000) + " m" : c._distChauffeur.toFixed(1) + " km"} de vous
                  </div>
                )}
                <div className="course-card-detail">
                  {c.distance_km} km · ~{c.duree_min} min · {PAY_NOMS[c.mode_paiement]}
                </div>
                <div className="course-card-coords">
                  Départ : {c.depart_lat.toFixed(4)}, {c.depart_lng.toFixed(4)}<br />
                  Arrivée : {c.dest_lat.toFixed(4)}, {c.dest_lng.toFixed(4)}
                </div>
                <div style={{ display: "flex", gap: "8px" }}>
                  <button className="btn-accepter" style={{ flex: 2 }} onClick={() => accepter(c)}>Accepter</button>
                  <button onClick={() => refuser(c)}
                    style={{ flex: 1, border: "1.5px solid #C60C30", borderRadius: "11px", background: "#fff", color: "#C60C30", fontWeight: 700, padding: "13px", cursor: "pointer", fontSize: "15px" }}>
                    Refuser
                  </button>
                </div>
              </div>
            ))
          )}

          {/* ÉTAPE B : demandes de COLIS à livrer */}
          {enLigne && colis.length > 0 && (
            <>
              <div className="liste-titre" style={{ marginTop: "20px" }}>
                📦 Colis à livrer ({colis.length})
              </div>
              {colis.map((c) => (
                <div key={c.id} className="course-card" style={{ borderLeftColor: "#FECB00" }}>
                  <div className="course-card-haut">
                    <div className="course-card-prix">{(c.prix_fcfa || 0).toLocaleString("fr-FR")} FCFA</div>
                    <div className="course-card-classe" style={{ background: "#FECB00", color: "#002664" }}>📦 Colis</div>
                  </div>
                  {typeof c._distChauffeur === "number" && (
                    <div style={{ display: "inline-block", background: "#fef9c3", color: "#a16207", fontWeight: 800, fontSize: "12px", padding: "5px 12px", borderRadius: "20px", marginBottom: "8px" }}>
                      📍 Ramassage à ~{c._distChauffeur < 1 ? Math.round(c._distChauffeur * 1000) + " m" : c._distChauffeur.toFixed(1) + " km"} de vous
                    </div>
                  )}
                  <div className="course-card-detail">
                    Taille : {c.taille} · {c.distance_km} km · {c.mode_livraison === "porte" ? "Porte-à-porte" : "Agence"} · {PAY_NOMS[c.mode_paiement]}
                  </div>
                  <div className="course-card-coords">
                    Ramassage : {c.ramassage_nom || `${c.ramassage_lat?.toFixed(4)}, ${c.ramassage_lng?.toFixed(4)}`}<br />
                    Livraison : {c.livraison_nom || `${c.livraison_lat?.toFixed(4)}, ${c.livraison_lng?.toFixed(4)}`}
                    {c.description ? <><br />Contenu : {c.description}</> : null}
                  </div>
                  <div style={{ display: "flex", gap: "8px" }}>
                    <button className="btn-accepter" style={{ flex: 2 }} onClick={() => accepterColis(c)}>Accepter le colis</button>
                    <button onClick={() => refuserColis(c)}
                      style={{ flex: 1, border: "1.5px solid #C60C30", borderRadius: "11px", background: "#fff", color: "#C60C30", fontWeight: 700, padding: "13px", cursor: "pointer", fontSize: "15px" }}>
                      Refuser
                    </button>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {chatOuvert && (
        <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: "#fff", display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "14px 16px", borderBottom: "1px solid #e5e7eb", background: "#002664", color: "#fff" }}>
            <button onClick={fermerChat} style={{ background: "none", border: "none", color: "#fff", fontSize: "22px", cursor: "pointer" }}>←</button>
            <div>
              <div style={{ fontWeight: 700 }}>Client</div>
              <div style={{ fontSize: "12px", opacity: 0.8 }}>
                {courseActive ? `${NOM_CATEGORIE[courseActive.classe] || courseActive.classe} · ${courseActive.prix_fcfa.toLocaleString("fr-FR")} FCFA` : ""}
              </div>
            </div>
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: "16px", background: "#f3f4f6" }}>
            {messages.length === 0 && (
              <div style={{ textAlign: "center", color: "#9ca3af", marginTop: "30px", fontSize: "14px" }}>
                Démarrez la conversation avec votre client
              </div>
            )}
            {messages.map((m) => (
              <div key={m.id} style={{ display: "flex", justifyContent: m.expediteur === "chauffeur" ? "flex-end" : "flex-start", marginBottom: "8px" }}>
                <div style={{
                  maxWidth: "75%", padding: "10px 14px", borderRadius: "16px", fontSize: "14px",
                  background: m.expediteur === "chauffeur" ? "#16a34a" : "#fff",
                  color: m.expediteur === "chauffeur" ? "#fff" : "#0d1117",
                  borderBottomRightRadius: m.expediteur === "chauffeur" ? "4px" : "16px",
                  borderBottomLeftRadius: m.expediteur === "chauffeur" ? "16px" : "4px",
                  boxShadow: "0 1px 2px rgba(0,0,0,.1)",
                }}>
                  {m.contenu}
                </div>
              </div>
            ))}
            <div ref={finChatRef} />
          </div>
          <div style={{ display: "flex", gap: "8px", padding: "12px", borderTop: "1px solid #e5e7eb", background: "#fff" }}>
            <input type="text" value={nouveauMsg}
              onChange={(e) => setNouveauMsg(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") envoyerMessage(); }}
              placeholder="Votre message..."
              style={{ flex: 1, padding: "12px 14px", borderRadius: "24px", border: "1px solid #d1d5db", fontSize: "14px", outline: "none" }} />
            <button onClick={envoyerMessage}
              style={{ padding: "0 18px", borderRadius: "24px", border: "none", background: "#16a34a", color: "#fff", fontWeight: 700, cursor: "pointer", fontSize: "15px" }}>
              Envoyer
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const btnDeco = {
  background: "rgba(255,255,255,.15)", border: "none", color: "#fff",
  padding: "7px 12px", borderRadius: "8px", cursor: "pointer", fontSize: "12px", fontWeight: 700,
};
