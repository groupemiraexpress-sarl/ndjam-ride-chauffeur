import { useEffect, useRef, useState } from "react";
import { MapContainer, TileLayer, Marker, Polyline, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { supabase } from "./supabase";
import "./App.css";

const MON_PROFIL = {
  nom: "Mahamat Ali",
  plaque: "TD 4271",
  vehicule: "Toyota Corolla · Blanche",
  tel: "+235 66 12 34 56",
};
const PAY_NOMS = { airtel: "Airtel Money", moov: "Moov Money", cash: "Espèces" };
const NDJAMENA = [12.1348, 15.0557];
const MOTIFS_CHAUFFEUR = [
  "Client trop loin",
  "Problème de véhicule",
  "Trafic / route bloquée",
  "Client ne répond pas",
  "Autre",
];

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
    const valides = points.filter(Boolean);
    if (valides.length >= 2) map.fitBounds(valides, { padding: [50, 50] });
  }, [points, map]);
  return null;
}

export default function App() {
  const [courses, setCourses] = useState([]);
  const [enLigne, setEnLigne] = useState(true);
  const [courseActive, setCourseActive] = useState(null);
  const [maPosition, setMaPosition] = useState(null);
  const [gpsErreur, setGpsErreur] = useState(null);
  const [annuleParClient, setAnnuleParClient] = useState(null);
  const [showMotifs, setShowMotifs] = useState(false);
  // Chat
  const [chatOuvert, setChatOuvert] = useState(false);
  const [messages, setMessages] = useState([]);
  const [nouveauMsg, setNouveauMsg] = useState("");
  const finChatRef = useRef(null);
  const watchId = useRef(null);
  const courseActiveRef = useRef(null);
  useEffect(() => { courseActiveRef.current = courseActive; }, [courseActive]);

  useEffect(() => {
    chargerCourses();
    const canal = supabase
      .channel("courses-chauffeur")
      .on("postgres_changes", { event: "*", schema: "public", table: "courses" }, (payload) => {
        chargerCourses();
        // Détecter si le client a annulé MA course active
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
  }, []);

  async function chargerCourses() {
    const { data, error } = await supabase
      .from("courses").select("*").eq("statut", "recherche")
      .order("cree_le", { ascending: false });
    if (!error && data) setCourses(data);
  }

  async function accepter(course) {
    const { error } = await supabase
      .from("courses")
      .update({
        statut: "acceptee",
        chauffeur_nom: MON_PROFIL.nom,
        chauffeur_plaque: MON_PROFIL.plaque,
        chauffeur_vehicule: MON_PROFIL.vehicule,
        chauffeur_tel: MON_PROFIL.tel,
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

  // Le CHAUFFEUR annule
  async function annulerChauffeur(motif) {
    if (!courseActive) return;
    await supabase
      .from("courses")
      .update({ statut: "annulee", annule_par: "chauffeur", motif_annulation: motif })
      .eq("id", courseActive.id);
    setCourseActive(null);
    setShowMotifs(false);
    fermerChat();
    chargerCourses();
  }

  // CHAT : charger l'historique + écouter les nouveaux messages en temps réel
  useEffect(() => {
    if (!courseActive) { setMessages([]); return; }
    const id = courseActive.id;

    // 1. Charger l'historique
    (async () => {
      const { data } = await supabase
        .from("messages")
        .select("*")
        .eq("course_id", id)
        .order("created_at", { ascending: true });
      if (data) setMessages(data);
    })();

    // 2. Écouter les nouveaux messages
    const canalChat = supabase
      .channel("chat-ch-" + id)
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: "course_id=eq." + id },
        (payload) => {
          setMessages((prev) => [...prev, payload.new]);
        }
      ).subscribe();

    return () => supabase.removeChannel(canalChat);
  }, [courseActive]);

  // Défilement auto du chat
  useEffect(() => {
    if (chatOuvert && finChatRef.current) {
      finChatRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, chatOuvert]);

  async function envoyerMessage() {
    const texte = nouveauMsg.trim();
    if (!texte || !courseActive) return;
    setNouveauMsg("");
    await supabase.from("messages").insert({
      course_id: courseActive.id,
      expediteur: "chauffeur",
      contenu: texte,
    });
  }

  function fermerChat() {
    setChatOuvert(false);
    setNouveauMsg("");
  }

  // Suivi GPS
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

  return (
    <div id="app">
      <div id="header">
        <div id="logo-badge"></div>
        <h1>NDjam<span> Ride</span><small>Mode Chauffeur</small></h1>
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
              Trajet {courseActive.classe} · {courseActive.distance_km} km · {PAY_NOMS[courseActive.mode_paiement]}
            </div>
            {gpsErreur
              ? <div className="gps-statut err">📍 {gpsErreur}</div>
              : maPosition
                ? <div className="gps-statut ok">📍 Position GPS envoyée en temps réel</div>
                : <div className="gps-statut">📍 Recherche du signal GPS...</div>}

            {!showMotifs ? (
              <>
                <button
                  onClick={() => setChatOuvert(true)}
                  style={{
                    width: "100%", padding: "12px", marginTop: "8px", marginBottom: "8px",
                    borderRadius: "12px", border: "none", cursor: "pointer",
                    background: "#002664", color: "#fff", fontWeight: 700, fontSize: "15px",
                  }}
                >
                  💬 Discussion
                </button>
                <button className="btn-terminer" onClick={terminer}>Terminer la course</button>
                <button className="btn-annuler-ch" onClick={() => setShowMotifs(true)}>Annuler la course</button>
              </>
            ) : (
              <div style={{ textAlign: "left", marginTop: "6px" }}>
                <div style={{ fontSize: "13px", fontWeight: 700, marginBottom: "8px", textAlign: "center" }}>
                  Pourquoi annulez-vous ?
                </div>
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
              <div className="statut-nom">{MON_PROFIL.nom}</div>
              <div className="statut-vehicule">{MON_PROFIL.vehicule} · {MON_PROFIL.plaque}</div>
            </div>
            <div className={"statut-toggle" + (enLigne ? " on" : "")} onClick={() => setEnLigne(!enLigne)}>
              <div className="toggle-dot"></div>
              <span>{enLigne ? "En ligne" : "Hors ligne"}</span>
            </div>
          </div>

          {/* Notification annulation client */}
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
            <div className="aucune-course">En attente de nouvelles demandes...</div>
          ) : (
            courses.map((c) => (
              <div key={c.id} className="course-card">
                <div className="course-card-haut">
                  <div className="course-card-prix">{c.prix_fcfa.toLocaleString("fr-FR")} FCFA</div>
                  <div className="course-card-classe">{c.classe}</div>
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

      {/* FENÊTRE DE CHAT */}
      {chatOuvert && (
        <div
          style={{
            position: "fixed", inset: 0, zIndex: 1000,
            background: "#fff", display: "flex", flexDirection: "column",
          }}
        >
          {/* En-tête du chat */}
          <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "14px 16px", borderBottom: "1px solid #e5e7eb", background: "#002664", color: "#fff" }}>
            <button
              onClick={fermerChat}
              style={{ background: "none", border: "none", color: "#fff", fontSize: "22px", cursor: "pointer" }}
            >
              ←
            </button>
            <div>
              <div style={{ fontWeight: 700 }}>Client</div>
              <div style={{ fontSize: "12px", opacity: 0.8 }}>
                {courseActive ? `Trajet ${courseActive.classe} · ${courseActive.prix_fcfa.toLocaleString("fr-FR")} FCFA` : ""}
              </div>
            </div>
          </div>

          {/* Liste des messages */}
          <div style={{ flex: 1, overflowY: "auto", padding: "16px", background: "#f3f4f6" }}>
            {messages.length === 0 && (
              <div style={{ textAlign: "center", color: "#9ca3af", marginTop: "30px", fontSize: "14px" }}>
                Démarrez la conversation avec votre client
              </div>
            )}
            {messages.map((m) => (
              <div
                key={m.id}
                style={{
                  display: "flex",
                  justifyContent: m.expediteur === "chauffeur" ? "flex-end" : "flex-start",
                  marginBottom: "8px",
                }}
              >
                <div
                  style={{
                    maxWidth: "75%",
                    padding: "10px 14px",
                    borderRadius: "16px",
                    fontSize: "14px",
                    background: m.expediteur === "chauffeur" ? "#16a34a" : "#fff",
                    color: m.expediteur === "chauffeur" ? "#fff" : "#0d1117",
                    borderBottomRightRadius: m.expediteur === "chauffeur" ? "4px" : "16px",
                    borderBottomLeftRadius: m.expediteur === "chauffeur" ? "16px" : "4px",
                    boxShadow: "0 1px 2px rgba(0,0,0,.1)",
                  }}
                >
                  {m.contenu}
                </div>
              </div>
            ))}
            <div ref={finChatRef} />
          </div>

          {/* Saisie */}
          <div style={{ display: "flex", gap: "8px", padding: "12px", borderTop: "1px solid #e5e7eb", background: "#fff" }}>
            <input
              type="text"
              value={nouveauMsg}
              onChange={(e) => setNouveauMsg(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") envoyerMessage(); }}
              placeholder="Votre message..."
              style={{
                flex: 1, padding: "12px 14px", borderRadius: "24px",
                border: "1px solid #d1d5db", fontSize: "14px", outline: "none",
              }}
            />
            <button
              onClick={envoyerMessage}
              style={{
                padding: "0 18px", borderRadius: "24px", border: "none",
                background: "#16a34a", color: "#fff", fontWeight: 700, cursor: "pointer", fontSize: "15px",
              }}
            >
              Envoyer
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
