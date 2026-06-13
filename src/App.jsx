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
function iconeVoiture() {
  return L.divIcon({
    className: "",
    html: `<div style="background:#16a34a;width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.4);font-size:16px;">🚗</div>`,
    iconSize: [30, 30], iconAnchor: [15, 15],
  });
}
function AjusterVue({ points }) {
  const map = useMap();
  useEffect(() => {
    // Force Leaflet à recalculer sa taille (corrige l'écran noir sur mobile)
    const t1 = setTimeout(() => map.invalidateSize(), 100);
    const t2 = setTimeout(() => map.invalidateSize(), 400);
    const valides = points.filter(Boolean);
    if (valides.length >= 2) map.fitBounds(valides, { padding: [50, 50] });
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [points, map]);
  return null;
}

/* ===================== ÉCRAN D'ACCUEIL / AUTH ===================== */
function Accueil() {
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

  return (
    <div className="accueil">
      <div className="accueil-logo">
        <div id="logo-badge" style={{ width: 60, height: 60, borderRadius: 16 }}></div>
        <h1>NDjam<span>Ride</span></h1>
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
    if (!nom.trim() || !telephone.trim() || !plaque.trim() || !vehicule.trim()) {
      setErreur("Tous les champs sont obligatoires."); return;
    }
    if (!pieceChemin) { setErreur("Veuillez téléverser votre pièce d'identité."); return; }
    if (!selfieChemin) { setErreur("Veuillez prendre votre photo (selfie)."); return; }
    setChargement(true);
    const { error } = await supabase.from("chauffeurs").upsert({
      user_id: userId, nom: nom.trim(), telephone: telephone.trim(),
      plaque: plaque.trim(), vehicule: vehicule.trim(), categorie,
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
      <label className="profil-label">Véhicule</label>
      <input className="accueil-input" value={vehicule} onChange={(e) => setVehicule(e.target.value)} placeholder="Ex : Toyota Corolla · Blanche" />

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
            ? "Merci pour votre inscription chez NDjam Ride ! Nos équipes examinent actuellement vos documents afin de garantir la sécurité de tous les utilisateurs. Cette vérification prend généralement moins de 24 heures. Dès que votre compte sera validé, vous pourrez commencer à recevoir des courses. Vous pouvez actualiser votre statut à tout moment."
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
          Votre compte chauffeur a été vérifié et approuvé avec succès. Vous faites désormais partie de NDjam Ride et pouvez commencer à recevoir des courses dès maintenant. Bonne route !
        </p>
        <button onClick={onContinuer}
          style={{ width: "100%", border: "none", borderRadius: "11px", background: "#16a34a", color: "#fff", fontWeight: 800, padding: "14px", cursor: "pointer", fontSize: "15px" }}>
          Commencer à recevoir des courses
        </button>
      </div>
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

  const [courses, setCourses] = useState([]);
  const [enLigne, setEnLigne] = useState(true);
  const [courseActive, setCourseActive] = useState(null);
  const [maPosition, setMaPosition] = useState(null);
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
  useEffect(() => { courseActiveRef.current = courseActive; }, [courseActive]);
  useEffect(() => { profilRef.current = profil; }, [profil]);

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

  async function rechargerProfil() {
    if (!session) return;
    const ancienStatut = profilRef.current ? profilRef.current.statut_verif : null;
    const { data } = await supabase.from("chauffeurs").select("*").eq("user_id", session.user.id).maybeSingle();
    if (data && data.statut_verif === "approuve" && ancienStatut && ancienStatut !== "approuve") {
      setMontrerFelicitations(true);
    }
    setProfil(data || null);
    setProfilCharge(true);
  }

  useEffect(() => {
    if (!session) return;
    rechargerProfil();
  }, [session]);

  async function deconnexion() {
    await supabase.auth.signOut();
    setCourseActive(null);
    setCourses([]);
    setMontrerFelicitations(false);
  }

  function profilComplet(p) {
    return p && p.nom && p.telephone && p.plaque && p.vehicule && p.categorie && p.piece_identite_url && p.selfie_url;
  }
  function estApprouve(p) {
    return p && p.statut_verif === "approuve";
  }

  useEffect(() => {
    if (!session || !profilComplet(profil) || !estApprouve(profil)) return;
    chargerCourses();
    const canal = supabase
      .channel("courses-chauffeur")
      .on("postgres_changes", { event: "*", schema: "public", table: "courses" }, (payload) => {
        chargerCourses();
        const active = courseActiveRef.current;
        if (active && payload.new && payload.new.id === active.id) {
          if (payload.new.statut === "annulee" && payload.new.annule_par === "client") {
            setAnnuleParClient(payload.new.motif_annulation || "Annulée par le client");
            setCourseActive(null);
          }
        }
      })
      .subscribe();
    return () => supabase.removeChannel(canal);
  }, [session, profil]);

  async function chargerCourses() {
    const p = profilRef.current;
    if (!p || !p.categorie) return;
    const { data, error } = await supabase
      .from("courses").select("*")
      .eq("statut", "recherche")
      .eq("classe", p.categorie)
      .order("cree_le", { ascending: false });
    if (!error && data) setCourses(data);
  }

  async function accepter(course) {
    const { error } = await supabase
      .from("courses")
      .update({
        statut: "acceptee",
        chauffeur_nom: profil.nom,
        chauffeur_plaque: profil.plaque,
        chauffeur_vehicule: profil.vehicule,
        chauffeur_tel: profil.telephone,
      })
      .eq("id", course.id);
    if (!error) { setCourseActive(course); setAnnuleParClient(null); chargerCourses(); }
  }

  async function terminer() {
    if (courseActive) {
      await supabase.from("courses").update({ statut: "terminee" }).eq("id", courseActive.id);
    }
    setCourseActive(null);
    fermerChat();
    chargerCourses();
  }

  async function annulerChauffeur(motif) {
    if (!courseActive) return;
    await supabase.from("courses")
      .update({ statut: "annulee", annule_par: "chauffeur", motif_annulation: motif })
      .eq("id", courseActive.id);
    setCourseActive(null);
    setShowMotifs(false);
    fermerChat();
    chargerCourses();
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

  const depart = courseActive ? [courseActive.depart_lat, courseActive.depart_lng] : null;
  const dest = courseActive ? [courseActive.dest_lat, courseActive.dest_lng] : null;
  const lienNavigation = courseActive
    ? `https://www.google.com/maps/dir/?api=1&destination=${courseActive.depart_lat},${courseActive.depart_lng}&travelmode=driving`
    : "#";

  if (!authPrete) {
    return <div id="app" style={{ display: "flex", alignItems: "center", justifyContent: "center", background: "#002664" }}><div style={{ color: "#fff" }}>Chargement...</div></div>;
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
          <h1>NDjam<span> Ride</span><small>Mon profil</small></h1>
          <button onClick={deconnexion} style={btnDeco}>Déconnexion</button>
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
          <h1>NDjam<span> Ride</span><small>Mode Chauffeur</small></h1>
          <button onClick={deconnexion} style={btnDeco}>Déconnexion</button>
        </div>
        <EcranStatut statut={profil.statut_verif} onDeconnexion={deconnexion} onRafraichir={rechargerProfil} />
      </div>
    );
  }

  if (montrerFelicitations) {
    return (
      <div id="app">
        <div id="header">
          <div id="logo-badge"></div>
          <h1>NDjam<span> Ride</span><small>Mode Chauffeur</small></h1>
        </div>
        <EcranFelicitations nom={profil.nom} onContinuer={() => setMontrerFelicitations(false)} />
      </div>
    );
  }

  const maCat = NOM_CATEGORIE[profil.categorie] || profil.categorie;

  return (
    <div id="app">
      <div id="header">
        <div id="logo-badge"></div>
        <h1>NDjam<span> Ride</span><small>Mode Chauffeur</small></h1>
        <button onClick={() => setEditionProfil(true)} style={{ ...btnDeco, marginLeft: "auto", marginRight: 6 }}>Profil</button>
        <button onClick={deconnexion} style={btnDeco}>Déconnexion</button>
      </div>

      {courseActive ? (
        <div className="chauffeur-active-wrap">
          <div className="carte-chauffeur">
            <MapContainer center={maPosition || depart || NDJAMENA} zoom={14} style={{ height: "100%", width: "100%" }} zoomControl={false}>
              <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="© OpenStreetMap" />
              <Marker position={depart} icon={icone("#002664")} />
              <Marker position={dest} icon={icone("#C60C30")} />
              {maPosition && <Marker position={maPosition} icon={iconeVoiture()} />}
              <Polyline positions={[depart, dest]} pathOptions={{ color: "#FECB00", weight: 4, dashArray: "2,8" }} />
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
                <button className="btn-terminer" onClick={terminer}>Terminer la course</button>
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
        <div className="chauffeur-body">
          <div className="statut-bar">
            <div className="statut-info">
              <div className="statut-nom">{profil.nom}</div>
              <div className="statut-vehicule">{profil.vehicule} · {profil.plaque}</div>
            </div>
            <div className={"statut-toggle" + (enLigne ? " on" : "")} onClick={() => setEnLigne(!enLigne)}>
              <div className="toggle-dot"></div>
              <span>{enLigne ? "En ligne" : "Hors ligne"}</span>
            </div>
          </div>

          <div style={{ textAlign: "center", fontSize: "12px", color: "#16a34a", margin: "0 0 8px", fontWeight: 700 }}>
            ✓ Compte vérifié · Catégorie : <b>{maCat}</b>
          </div>

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
                <div className="course-card-detail">
                  {c.distance_km} km · ~{c.duree_min} min · {PAY_NOMS[c.mode_paiement]}
                </div>
                <div className="course-card-coords">
                  Départ : {c.depart_lat.toFixed(4)}, {c.depart_lng.toFixed(4)}<br />
                  Arrivée : {c.dest_lat.toFixed(4)}, {c.dest_lng.toFixed(4)}
                </div>
                <button className="btn-accepter" onClick={() => accepter(c)}>Accepter la course</button>
              </div>
            ))
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
