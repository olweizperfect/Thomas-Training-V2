import { useState, useEffect, useRef } from "react";

const HOURS = Array.from({ length: 14 }, (_, i) => i + 6);
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MAX_GROUP_PER_WEEK = 3;
const MAX_1ON1_PER_WEEK = 5;
const MAX_GROUP_CAPACITY = 4;
const CANCEL_CUTOFF_HOURS = 24;
const GRACE_PERIOD_MS = 15 * 60 * 1000;
const INACTIVITY_LIMIT_MS = 60 * 60 * 1000;
const INACTIVITY_WARN_MS = 59 * 60 * 1000;

// Light theme colors
const RED = "#c0392b";
const RED2 = "#e8553e";
const BG = "#f7f5f3";
const CARD = "#ffffff";
const BORDER = "#e2ddd8";
const TEXT = "#1a1a1a";
const TEXT2 = "#4a4a4a";
const TEXT3 = "#6b6b6b";

const fmtHour = h => h === 12 ? "12:00 PM" : h < 12 ? `${h}:00 AM` : `${h-12}:00 PM`;
const fmtDate = d => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
const addDays = (d, n) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };
const getMonday = d => { const r = new Date(d); const day = r.getDay(); r.setDate(r.getDate() - (day === 0 ? 6 : day - 1)); r.setHours(0,0,0,0); return r; };
const wKey = d => d.toISOString().split("T")[0];
const slotDT = (monday, dayIdx, hour) => { const d = addDays(monday, dayIdx); d.setHours(hour,0,0,0); return d; };
const hoursUntil = dt => (dt.getTime() - Date.now()) / 3600000;
const getWeeks = () => { const m = getMonday(new Date()); return Array.from({length:4},(_,i)=>addDays(m,i*7)); };

const SEED_TRAINERS = [
  { email: "thomas@studio.com", name: "Thomas", color: RED, bio: "Founder & lead trainer. Specializes in calisthenics progressions and mobility.", credentials: "NASM-CPT, 8 yrs coaching" },
  { email: "arash@studio.com", name: "Arash", color: "#2a6f7f", bio: "Coach focused on strength fundamentals and group class programming.", credentials: "CSCS, 5 yrs coaching" },
];
const SEED_CLIENTS = [
  { email: "juan@example.com",  name: "Juan dela Cruz", groupCredits: 1, oneOnOneCredits: 0 },
  { email: "maria@example.com", name: "Maria Santos",   groupCredits: 8, oneOnOneCredits: 2 },
  { email: "pedro@example.com", name: "Pedro Reyes",    groupCredits: 0, oneOnOneCredits: 6 },
  { email: "ana@example.com",   name: "Ana Cruz",       groupCredits: 0, oneOnOneCredits: 7 },
  { email: "carlo@example.com", name: "Carlo Reyes",    groupCredits: 5, oneOnOneCredits: 0 },
];

function buildSeedSchedule() {
  const monday = getMonday(new Date());
  const wk = wKey(monday);
  const mkB = email => ({ email, bookedAt: new Date().toISOString() });
  const mkS = (type, emails = []) => ({ type, blocked: false, bookings: emails.map(mkB) });
  return {
    [SEED_TRAINERS[0].email]: { [wk]: {
      0: { 7: mkS("group"), 17: mkS("group") },
      1: { 9: mkS("1on1"), 10: mkS("1on1"), 14: mkS("1on1",["maria@example.com"]) },
      2: { 7: mkS("group"), 17: mkS("group") },
      3: { 9: mkS("1on1"), 10: mkS("1on1"), 14: mkS("1on1") },
      4: { 7: mkS("group") },
      5: { 9: mkS("group", ["maria@example.com","pedro@example.com"]) },
    }},
    [SEED_TRAINERS[1].email]: { [wk]: {
      0: { 8: mkS("group", ["pedro@example.com"]) },
      2: { 8: mkS("group") },
      4: { 8: mkS("group") },
      1: { 11: mkS("1on1", ["carlo@example.com"]) },
      3: { 11: mkS("1on1") },
    }},
  };
}

async function load(key, fallback) {
  try { const r = await window.storage.get(key, true); return r ? JSON.parse(r.value) : fallback; }
  catch { return fallback; }
}
async function save(key, val) { try { await window.storage.set(key, JSON.stringify(val), true); } catch {} }

const getSlot = (sc, tr, wk, di, h) => sc[tr]?.[wk]?.[di]?.[h] || { type: null, blocked: false, bookings: [] };
const setSlot = (sc, tr, wk, di, h, upd) => {
  const s = JSON.parse(JSON.stringify(sc));
  if (!s[tr]) s[tr] = {};
  if (!s[tr][wk]) s[tr][wk] = {};
  if (!s[tr][wk][di]) s[tr][wk][di] = {};
  const cur = s[tr][wk][di][h] || { type: null, blocked: false, bookings: [] };
  s[tr][wk][di][h] = typeof upd === "function" ? upd(cur) : upd;
  return s;
};

// Shared styles
const S = {
  card: { background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 24, boxShadow: "0 1px 4px rgba(0,0,0,.06)" },
  input: { width: "100%", padding: "11px 14px", background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8, color: TEXT, fontSize: 14, outline: "none", fontFamily: "inherit" },
  inputSm: { width: "100%", padding: "8px 10px", background: BG, border: `1px solid ${BORDER}`, borderRadius: 6, color: TEXT, fontSize: 12, outline: "none", fontFamily: "inherit" },
  btnPrimary: { background: RED, border: "none", color: "#fff", fontWeight: 700, borderRadius: 8, cursor: "pointer", fontFamily: "inherit" },
  btnGhost: { background: "none", border: `1px solid ${BORDER}`, color: TEXT2, borderRadius: 8, cursor: "pointer", fontFamily: "inherit" },
  label: { fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, color: TEXT3 },
};

export default function App() {
  const [page, setPage] = useState("home");
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);
  const [trainers, setTrainers] = useState(SEED_TRAINERS);
  const [clients, setClients] = useState(SEED_CLIENTS);
  const [schedules, setSchedules] = useState({});
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const [inactiveWarn, setInactiveWarn] = useState(false);
  const [countdown, setCountdown] = useState(60);
  const lastActivity = useRef(Date.now());
  const weeks = getWeeks();

  useEffect(() => {
    (async () => {
      const [t, c, s] = await Promise.all([load("tt_trainers", SEED_TRAINERS), load("tt_clients", SEED_CLIENTS), load("tt_schedules", buildSeedSchedule())]);
      setTrainers(t); setClients(c); setSchedules(s); setLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (!user) { setInactiveWarn(false); return; }
    const mark = () => { lastActivity.current = Date.now(); setInactiveWarn(false); };
    const evts = ["mousedown","keydown","scroll","touchstart"];
    evts.forEach(e => window.addEventListener(e, mark));
    const id = setInterval(() => {
      const el = Date.now() - lastActivity.current;
      if (el >= INACTIVITY_LIMIT_MS) { logout(); showToast("Logged out due to inactivity.", "error"); }
      else if (el >= INACTIVITY_WARN_MS) { setInactiveWarn(true); setCountdown(Math.ceil((INACTIVITY_LIMIT_MS - el) / 1000)); }
    }, 1000);
    return () => { evts.forEach(e => window.removeEventListener(e, mark)); clearInterval(id); };
  }, [user]);

  const persist = {
    trainers: v => { setTrainers(v); save("tt_trainers", v); },
    clients: v => { setClients(v); save("tt_clients", v); },
    schedules: v => { setSchedules(v); save("tt_schedules", v); },
  };
  const showToast = (msg, type = "success") => { setToast({ msg, type }); setTimeout(() => setToast(null), 2800); };
  const logout = () => { setUser(null); setRole(null); setPage("home"); };

  if (loading) return <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:"100vh", background: BG, color: RED, fontFamily:"sans-serif", fontSize:16 }}>Loading...</div>;

  return (
    <div style={{ minHeight:"100vh", background: BG, color: TEXT, fontFamily:"'Segoe UI',system-ui,sans-serif" }}>
      <style>{`
        html { scrollbar-gutter: stable; }
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width:6px; height:6px; }
        ::-webkit-scrollbar-thumb { background:#ccc; border-radius:3px; }
        @keyframes fadeIn { from{opacity:0;transform:translateX(-50%) translateY(-8px)}to{opacity:1;transform:translateX(-50%) translateY(0)} }
        @keyframes pulse { 0%,100%{transform:scale(1)}50%{transform:scale(1.06)} }
        button { font-family:inherit; cursor:pointer; }
        input, select, textarea { font-family:inherit; }
      `}</style>

      {toast && (
        <div style={{ position:"fixed", top:16, left:"50%", transform:"translateX(-50%)", background: toast.type==="error" ? "#fee2e2" : "#dcfce7", color: toast.type==="error" ? "#991b1b" : "#166534", padding:"10px 24px", borderRadius:8, zIndex:9999, fontSize:14, fontWeight:600, boxShadow:"0 4px 20px rgba(0,0,0,.12)", border:`1px solid ${toast.type==="error" ? "#fca5a5" : "#86efac"}`, animation:"fadeIn .2s ease" }}>
          {toast.msg}
        </div>
      )}

      {inactiveWarn && user && (
        <div style={{ position:"fixed", top:70, left:"50%", transform:"translateX(-50%)", zIndex:9998, background:"#fffbeb", border:"1px solid #f59e0b", borderRadius:10, padding:"14px 22px", display:"flex", alignItems:"center", gap:14, boxShadow:"0 4px 20px rgba(0,0,0,.1)" }}>
          <span style={{ fontSize:13, color:"#92400e", fontWeight:600 }}>⏱ You'll be logged out in {countdown}s due to inactivity.</span>
          <button onClick={() => { lastActivity.current = Date.now(); setInactiveWarn(false); }} style={{ ...S.btnPrimary, fontSize:12, padding:"6px 14px" }}>Stay Logged In</button>
        </div>
      )}

      <Nav page={page} setPage={setPage} user={user} role={role} logout={logout} />

      {page === "home"     && <HomePage setPage={setPage} user={user} role={role} />}
      {page === "about"    && <AboutPage />}
      {page === "trainers" && <TrainersPage trainers={trainers} />}
      {page === "pricing"  && <PricingPage setPage={setPage} />}
      {page === "location" && <LocationPage />}
      {page === "contact"  && <ContactPage />}
      {page === "login"    && <LoginPage trainers={trainers} clients={clients} persist={persist} setUser={setUser} setRole={setRole} setPage={setPage} showToast={showToast} />}
      {page === "schedule" && !user && <LoginPrompt setPage={setPage} />}
      {page === "schedule" && user && role === "trainer" && <TrainerSchedule user={user} trainers={trainers} clients={clients} weeks={weeks} schedules={schedules} persist={persist} showToast={showToast} />}
      {page === "schedule" && user && role === "client"  && <ClientSchedule  user={user} clients={clients} trainers={trainers} weeks={weeks} schedules={schedules} persist={persist} showToast={showToast} />}

      <Footer />
    </div>
  );
}

function Nav({ page, setPage, user, role, logout }) {
  const links = [["home","Home"],["about","About"],["trainers","Trainers"],["pricing","Pricing"],["location","Location"],["contact","Contact"]];
  const cta = !user ? "Log In / Sign Up" : role === "trainer" ? "My Schedule" : "My Sessions";
  const ctaTarget = !user ? "login" : "schedule";
  return (
    <div style={{ background: CARD, borderBottom:`1px solid ${BORDER}`, position:"sticky", top:0, zIndex:200, boxShadow:"0 1px 3px rgba(0,0,0,.06)" }}>
      <div style={{ maxWidth:1100, margin:"0 auto", padding:"0 16px", display:"flex", alignItems:"center", justifyContent:"space-between", height:56 }}>
        <div onClick={() => setPage("home")} style={{ cursor:"pointer", fontWeight:900, fontSize:18, letterSpacing:-0.5, color: RED }}>
          THOMAS<span style={{ color: TEXT3, fontWeight:400 }}>TRAINING</span>
        </div>
        <div style={{ display:"flex", gap:4, alignItems:"center" }}>
          {links.map(([k,l]) => (
            <button key={k} onClick={() => setPage(k)} style={{ background:"none", border:"none", color: page===k ? RED : TEXT2, fontSize:13, fontWeight:600, padding:"8px 10px", borderBottom: page===k ? `2px solid ${RED}` : "2px solid transparent" }}>{l}</button>
          ))}
          <div style={{ width:1, height:20, background: BORDER, margin:"0 6px" }} />
          <button onClick={() => setPage(ctaTarget)} style={{ ...S.btnPrimary, fontSize:13, padding:"8px 16px" }}>{cta}</button>
          {user && <button onClick={logout} style={{ ...S.btnGhost, fontSize:12, padding:"7px 12px" }}>Log Out</button>}
        </div>
      </div>
    </div>
  );
}

function HomePage({ setPage, user, role }) {
  const cta = !user ? "Book a Session" : role === "trainer" ? "My Schedule" : "My Sessions";
  const ctaTarget = !user ? "login" : "schedule";
  return (
    <div>
      <div style={{ padding:"90px 20px 70px", textAlign:"center", background:`linear-gradient(160deg, #fff5f4 0%, ${BG} 60%)`, borderBottom:`1px solid ${BORDER}` }}>
        <div style={{ maxWidth:720, margin:"0 auto" }}>
          <h1 style={{ fontSize:"clamp(32px,6vw,52px)", fontWeight:900, lineHeight:1.1, marginBottom:18, color: TEXT }}>Train smarter.<br /><span style={{ color: RED }}>Move better.</span></h1>
          <p style={{ fontSize:17, color: TEXT2, maxWidth:480, margin:"0 auto 32px", lineHeight:1.6 }}>Personalized calisthenics coaching and small-group classes with Thomas. Book your session in seconds.</p>
          <div style={{ display:"flex", gap:12, justifyContent:"center", flexWrap:"wrap" }}>
            <button onClick={() => setPage(ctaTarget)} style={{ ...S.btnPrimary, fontSize:15, padding:"14px 28px" }}>{cta}</button>
            <button onClick={() => setPage("about")} style={{ background: CARD, border:`1px solid ${BORDER}`, color: TEXT, fontSize:15, fontWeight:600, padding:"14px 28px", borderRadius:8, cursor:"pointer" }}>Learn More</button>
          </div>
        </div>
      </div>
      <div style={{ maxWidth:1000, margin:"0 auto", padding:"60px 20px", display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(240px,1fr))", gap:24 }}>
        {[["🤸","Calisthenics Focus","Bodyweight progressions built around mobility, strength, and control."],["👥","Group & 1-on-1","Mix small-group energy with personalized one-on-one coaching."],["📅","Easy Booking","See real-time availability and book your week in a few taps."]].map(([icon,t,d]) => (
          <div key={t} style={{ ...S.card }}>
            <div style={{ fontSize:32, marginBottom:12 }}>{icon}</div>
            <h3 style={{ fontSize:16, fontWeight:700, marginBottom:8, color: TEXT }}>{t}</h3>
            <p style={{ fontSize:13, color: TEXT2, lineHeight:1.6 }}>{d}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function AboutPage() {
  return (
    <div style={{ maxWidth:720, margin:"0 auto", padding:"60px 20px" }}>
      <h1 style={{ fontSize:30, fontWeight:900, marginBottom:24, color: TEXT }}>About</h1>
      <p style={{ color: TEXT2, lineHeight:1.8, fontSize:15, marginBottom:16 }}>This studio is built around one idea: sustainable strength comes from movement quality, not just effort. Thomas works with clients of all levels using progressive programming tailored to where you are right now.</p>
      <p style={{ color: TEXT2, lineHeight:1.8, fontSize:15 }}>Sessions are kept small so coaching stays personal, whether you're in a group class or a 1-on-1.</p>
    </div>
  );
}

function TrainersPage({ trainers }) {
  return (
    <div style={{ maxWidth:900, margin:"0 auto", padding:"60px 20px" }}>
      <h1 style={{ fontSize:30, fontWeight:900, marginBottom:24, color: TEXT }}>Meet the Trainers</h1>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(260px,1fr))", gap:20 }}>
        {trainers.map(t => (
          <div key={t.email} style={{ ...S.card }}>
            <div style={{ width:56, height:56, borderRadius:"50%", background:t.color, display:"flex", alignItems:"center", justifyContent:"center", fontWeight:900, fontSize:22, color:"#fff", marginBottom:14 }}>{t.name[0]}</div>
            <h3 style={{ fontSize:17, fontWeight:700, marginBottom:4, color: TEXT }}>{t.name}</h3>
            <p style={{ fontSize:12, color: RED, fontWeight:600, marginBottom:10 }}>{t.credentials}</p>
            <p style={{ fontSize:13, color: TEXT2, lineHeight:1.6 }}>{t.bio}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function PricingPage({ setPage }) {
  return (
    <div style={{ maxWidth:640, margin:"0 auto", padding:"100px 20px", textAlign:"center" }}>
      <div style={{ fontSize:40, marginBottom:20 }}>🛠️</div>
      <h1 style={{ fontSize:26, fontWeight:800, marginBottom:14, color: TEXT }}>Pricing — Coming Soon</h1>
      <p style={{ color: TEXT2, fontSize:15, lineHeight:1.7, maxWidth:480, margin:"0 auto 28px" }}>We're finalizing membership plans as the studio transitions. In the meantime, reach out directly for current pricing and session credits.</p>
      <button onClick={() => setPage("contact")} style={{ ...S.btnPrimary, fontSize:14, padding:"12px 24px" }}>Contact Us</button>
    </div>
  );
}

function LocationPage() {
  return (
    <div style={{ maxWidth:720, margin:"0 auto", padding:"60px 20px" }}>
      <h1 style={{ fontSize:30, fontWeight:900, marginBottom:24, color: TEXT }}>Location</h1>
      <div style={{ ...S.card, marginBottom:16 }}>
        <p style={{ fontSize:15, color: TEXT, fontWeight:600, marginBottom:4 }}>1221 Pecos St, Unit 140</p>
        <p style={{ fontSize:15, color: TEXT, fontWeight:600, marginBottom:8 }}>Denver, CO 80204</p>
        <p style={{ fontSize:13, color: TEXT2 }}>Street parking available nearby.</p>
        <p style={{ fontSize:11, color: TEXT3, marginTop:8, fontStyle:"italic" }}>This location may change as the studio transitions to its own space later this year.</p>
      </div>
      <div style={{ ...S.card }}>
        <p style={{ fontSize:13, color: TEXT3, fontWeight:700, marginBottom:10 }}>Hours</p>
        {DAYS.map(d => (
          <div key={d} style={{ display:"flex", justifyContent:"space-between", fontSize:13, padding:"5px 0", borderBottom:`1px solid ${BG}`, color: TEXT2 }}>
            <span>{d}</span><span style={{ color: TEXT3 }}>6:00 AM – 7:00 PM</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ContactPage() {
  const [form, setForm] = useState({ name:"", email:"", message:"" });
  const [sent, setSent] = useState(false);
  return (
    <div style={{ maxWidth:560, margin:"0 auto", padding:"60px 20px" }}>
      <h1 style={{ fontSize:30, fontWeight:900, marginBottom:24, color: TEXT }}>Contact</h1>
      {sent ? (
        <div style={{ background:"#dcfce7", border:"1px solid #86efac", borderRadius:8, padding:20, color:"#166534", fontSize:14 }}>Thanks! Thomas will get back to you soon.</div>
      ) : (
        <>
          <input placeholder="Your name" value={form.name} onChange={e => setForm({...form,name:e.target.value})} style={S.input} />
          <input placeholder="Your email" value={form.email} onChange={e => setForm({...form,email:e.target.value})} style={{...S.input,marginTop:10}} />
          <textarea placeholder="Message" rows={5} value={form.message} onChange={e => setForm({...form,message:e.target.value})} style={{...S.input,marginTop:10,resize:"vertical"}} />
          <button onClick={() => setSent(true)} style={{ ...S.btnPrimary, fontSize:14, padding:"12px 24px", marginTop:14 }}>Send Message</button>
        </>
      )}
      <div style={{ marginTop:40, borderTop:`1px solid ${BORDER}`, paddingTop:24, fontSize:13, color: TEXT2, lineHeight:1.8 }}>
        <p>📧 thomas_wood_03@hotmail.com</p>
        <p>📞 (703) 232-7367</p>
        <p style={{ fontSize:11, color: TEXT3, marginTop:6 }}>A dedicated business email is coming soon — for the fastest response, call or text directly.</p>
      </div>
    </div>
  );
}

function LoginPage({ trainers, clients, persist, setUser, setRole, setPage, showToast }) {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [err, setErr] = useState("");

  const login = () => {
    const e = email.trim().toLowerCase();
    const t = trainers.find(x => x.email.toLowerCase() === e);
    if (t) { setUser(t); setRole("trainer"); setPage("home"); showToast(`Welcome back, ${t.name}!`); return; }
    const c = clients.find(x => x.email.toLowerCase() === e);
    if (c) { setUser(c); setRole("client"); setPage("home"); showToast(`Welcome back, ${c.name}!`); return; }
    setErr("No account found with that email."); setMode("signup");
  };

  const signup = () => {
    const e = email.trim().toLowerCase(), n = name.trim();
    if (!e || !n) { setErr("Enter your name and email."); return; }
    if (clients.find(c => c.email === e) || trainers.find(t => t.email === e)) { setErr("Account already exists. Try logging in."); return; }
    const nc = { email:e, name:n, groupCredits:0, oneOnOneCredits:0 };
    persist.clients([...clients, nc]);
    setUser(nc); setRole("client"); setPage("home"); showToast(`Welcome, ${n}!`);
  };

  return (
    <div style={{ minHeight:"60vh", display:"flex", alignItems:"center", justifyContent:"center", padding:24 }}>
      <div style={{ width:"100%", maxWidth:380, ...S.card, padding:32 }}>
        <div style={{ display:"flex", gap:8, marginBottom:24 }}>
          {["login","signup"].map(m => (
            <button key={m} onClick={() => { setMode(m); setErr(""); }} style={{ flex:1, padding:"9px", background: mode===m ? RED : "none", border:`1px solid ${mode===m ? RED : BORDER}`, color: mode===m ? "#fff" : TEXT2, borderRadius:6, fontSize:13, fontWeight:700 }}>
              {m === "login" ? "Log In" : "Sign Up"}
            </button>
          ))}
        </div>
        {mode === "signup" && <input placeholder="Full name" value={name} onChange={e => setName(e.target.value)} style={{...S.input,marginBottom:10}} />}
        <input type="email" placeholder="your@email.com" value={email} onChange={e => setEmail(e.target.value)} onKeyDown={e => e.key==="Enter" && (mode==="login"?login():signup())} style={S.input} />
        {err && <p style={{ color: RED, fontSize:12, marginTop:8 }}>{err}</p>}
        <button onClick={mode==="login"?login:signup} style={{ ...S.btnPrimary, width:"100%", marginTop:14, padding:13, fontSize:14 }}>
          {mode === "login" ? "Log In" : "Create Account"}
        </button>
        {mode === "login" && (
          <div style={{ marginTop:20, padding:12, background: BG, border:`1px solid ${BORDER}`, borderRadius:8 }}>
            <p style={{ color: TEXT3, fontSize:11, marginBottom:6, fontWeight:700 }}>DEMO ACCOUNTS</p>
            {[["Trainer","thomas@studio.com"],["Trainer","arash@studio.com"],["Client","juan@example.com"],["Client","maria@example.com"],["Client","pedro@example.com"],["Client","ana@example.com"],["Client","carlo@example.com"]].map(([lbl,em]) => (
              <button key={em} onClick={() => setEmail(em)} style={{ display:"block", width:"100%", textAlign:"left", background: CARD, border:`1px solid ${BORDER}`, borderRadius:6, color: TEXT2, fontSize:11, padding:"6px 10px", marginTop:4 }}>
                <b style={{ color: RED }}>{lbl}:</b> {em}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function LoginPrompt({ setPage }) {
  return (
    <div style={{ minHeight:"40vh", display:"flex", alignItems:"center", justifyContent:"center", flexDirection:"column", gap:14, padding:24 }}>
      <p style={{ color: TEXT2, fontSize:14 }}>Log in or create an account to view the schedule.</p>
      <button onClick={() => setPage("login")} style={{ ...S.btnPrimary, fontSize:13, padding:"10px 20px" }}>Log In / Sign Up</button>
    </div>
  );
}

function WeekSelector({ weeks, selected, setSelected }) {
  return (
    <div style={{ display:"flex", gap:8, overflowX:"auto", paddingBottom:4 }}>
      {weeks.map((monday, i) => {
        const k = wKey(monday); const active = k === selected;
        return (
          <button key={k} onClick={() => setSelected(k)} style={{ flexShrink:0, padding:"8px 16px", borderRadius:8, background: active ? RED : CARD, border:`1px solid ${active ? RED : BORDER}`, color: active ? "#fff" : TEXT2, fontSize:12, fontWeight:600, display:"flex", flexDirection:"column", alignItems:"center", gap:2 }}>
            <span>Week {i+1}</span>
            <span style={{ fontSize:10, opacity:.8 }}>{fmtDate(monday)}–{fmtDate(addDays(monday,5))}</span>
          </button>
        );
      })}
    </div>
  );
}

function TrainerSchedule({ user, trainers, clients, weeks, schedules, persist, showToast }) {
  const [selWeek, setSelWeek] = useState(wKey(weeks[0]));
  const [viewTrainer, setViewTrainer] = useState(user.email);
  const [panel, setPanel] = useState(null);
  const [draft, setDraft] = useState(schedules);
  const [unsaved, setUnsaved] = useState(false);
  const [pulsing, setPulsing] = useState(false);
  const [detail, setDetail] = useState(null);
  const [newClientName, setNewClientName] = useState("");
  const [newClientEmail, setNewClientEmail] = useState("");
  const [qsDays, setQsDays] = useState([]);
  const [qsStart, setQsStart] = useState(7);
  const [qsEnd, setQsEnd] = useState(8);
  const [qsType, setQsType] = useState("group");
  const [qsScope, setQsScope] = useState("week");

  const monday = weeks.find(w => wKey(w) === selWeek);
  const isOwn = viewTrainer === user.email;
  const display = isOwn ? draft : schedules;

  useEffect(() => { if (!unsaved) setDraft(schedules); }, [schedules, unsaved]);

  const updateDraft = (tr, wk, di, h, upd) => { const s = setSlot(draft,tr,wk,di,h,upd); setDraft(s); setUnsaved(true); };
  const updateLive  = (tr, wk, di, h, upd) => { const s = setSlot(schedules,tr,wk,di,h,upd); persist.schedules(s); setDraft(s); };

  const cycleType = (di, h) => {
    if (!isOwn) { showToast("You can only edit your own schedule.", "error"); return; }
    const slot = getSlot(draft, user.email, selWeek, di, h);
    const order = [null, "group", "1on1"];
    updateDraft(user.email, selWeek, di, h, s => ({ ...s, type: order[(order.indexOf(slot.type)+1)%order.length], blocked: false }));
  };

  const toggleBlock = (di, h) => {
    if (!isOwn) { showToast("You can only edit your own schedule.", "error"); return; }
    const slot = getSlot(draft, user.email, selWeek, di, h);
    if (slot.bookings.length > 0) showToast(`Heads up: ${slot.bookings.length} client(s) booked here.`, "error");
    updateDraft(user.email, selWeek, di, h, s => ({ ...s, blocked: !s.blocked }));
  };

  const removeBooking = (di, h, email) => {
    updateLive(viewTrainer, selWeek, di, h, s => ({ ...s, bookings: s.bookings.filter(b => b.email !== email) }));
    showToast("Booking removed."); setDetail(null);
  };

  const publish = () => { persist.schedules(draft); setUnsaved(false); setPulsing(false); showToast("Schedule published!"); };
  const discard  = () => { setDraft(schedules); setUnsaved(false); showToast("Changes discarded."); };

  const applyQS = () => {
    if (!qsDays.length || qsEnd <= qsStart) return;
    const targets = qsScope === "month" ? weeks.map(w => wKey(w)) : [selWeek];
    let s = JSON.parse(JSON.stringify(draft)); let count = 0;
    targets.forEach(wk => qsDays.forEach(di => {
      for (let h = qsStart; h < qsEnd; h++) {
        if (!s[user.email]) s[user.email] = {};
        if (!s[user.email][wk]) s[user.email][wk] = {};
        if (!s[user.email][wk][di]) s[user.email][wk][di] = {};
        const ex = s[user.email][wk][di][h];
        if (!ex || (!ex.type && !ex.blocked)) { s[user.email][wk][di][h] = { type: qsType, blocked: false, bookings: [] }; count++; }
      }
    }));
    setDraft(s); setUnsaved(true); setPanel(null); setPulsing(true); setTimeout(()=>setPulsing(false),2400);
    showToast(`Filled ${count} slot${count===1?"":"s"}. Review and Publish when ready.`);
  };

  const addClient = () => {
    const e = newClientEmail.trim().toLowerCase(), n = newClientName.trim();
    if (!e || !n) { showToast("Enter name and email.", "error"); return; }
    if (clients.find(c => c.email === e)) { showToast("Already exists.", "error"); return; }
    persist.clients([...clients, { email:e, name:n, groupCredits:0, oneOnOneCredits:0 }]);
    setNewClientName(""); setNewClientEmail(""); showToast(`${n} added!`);
  };

  const updateCredits = (email, type, amount) => {
    const field = type === "group" ? "groupCredits" : "oneOnOneCredits";
    persist.clients(clients.map(c => c.email===email ? {...c,[field]:(c[field]||0)+amount} : c));
    const cl = clients.find(c=>c.email===email);
    showToast(`Added ${amount} ${type==="group"?"group":"1-on-1"} session${amount===1?"":"s"} for ${cl?.name}.`);
  };

  const clientName = email => clients.find(c=>c.email===email)?.name || email;

  return (
    <div style={{ maxWidth:1000, margin:"0 auto", padding:"20px 16px 50px" }}>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:16, flexWrap:"wrap", gap:10 }}>
        <h1 style={{ fontSize:22, fontWeight:800, color: TEXT }}>Trainer Schedule</h1>
        <div style={{ display:"flex", gap:8 }}>
          {[["⚡ Quick Setup","qs"],["👥 Clients","clients"],["📊 Report","report"]].map(([lbl,k]) => (
            <button key={k} onClick={()=>setPanel(panel===k?null:k)} style={{ background: panel===k ? BG : CARD, border:`1px solid ${BORDER}`, color: TEXT2, fontSize:12, padding:"7px 12px", borderRadius:6, fontWeight:600 }}>{lbl}</button>
          ))}
        </div>
      </div>

      {isOwn && unsaved && (
        <div style={{ background:"#fffbeb", border:"1px solid #f59e0b", borderRadius:8, padding:"10px 16px", marginBottom:16, display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:10 }}>
          <span style={{ fontSize:13, color:"#92400e", fontWeight:600 }}>⚠️ Unsaved changes — clients can't see these yet.</span>
          <div style={{ display:"flex", gap:8 }}>
            <button onClick={discard} style={{ ...S.btnGhost, fontSize:12, padding:"7px 14px" }}>Discard</button>
            <button onClick={publish} style={{ ...S.btnPrimary, fontSize:12, padding:"7px 16px", animation: pulsing?"pulse 0.6s ease 3":"none" }}>Publish Changes</button>
          </div>
        </div>
      )}

      <div style={{ display:"flex", gap:0 }}>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ marginBottom:12 }}><WeekSelector weeks={weeks} selected={selWeek} setSelected={setSelWeek} /></div>

          {trainers.length > 1 && (
            <div style={{ marginBottom:14, display:"flex", gap:6, flexWrap:"wrap" }}>
              {trainers.map(t => (
                <button key={t.email} onClick={()=>setViewTrainer(t.email)} style={{ padding:"6px 14px", borderRadius:8, fontSize:12, fontWeight:600, background: viewTrainer===t.email ? t.color : CARD, border:`1px solid ${viewTrainer===t.email ? t.color : BORDER}`, color: viewTrainer===t.email ? "#fff" : TEXT2 }}>
                  {t.name}{t.email===user.email?" (You)":""}
                </button>
              ))}
            </div>
          )}

          {!isOwn && <div style={{ background:"#fffbeb", border:"1px solid #f59e0b", borderRadius:8, padding:"8px 14px", marginBottom:14, fontSize:12, color:"#92400e" }}>👀 Viewing {trainers.find(t=>t.email===viewTrainer)?.name}'s schedule — read only</div>}

          <p style={{ fontSize:12, color: TEXT3, marginBottom:10 }}>{isOwn ? "Click a cell to cycle: Unset → Group → 1-on-1." : "Read-only view."}</p>

          <div style={{ overflowX:"auto" }}>
            <table style={{ borderCollapse:"collapse", width:720, tableLayout:"fixed" }}>
              <thead>
                <tr style={{ background: BG }}>
                  <th style={{ width:75, padding:"8px 6px", color: TEXT3, fontSize:11, textAlign:"left", borderBottom:`2px solid ${BORDER}` }}>Time</th>
                  {DAYS.map((d,i) => (
                    <th key={d} style={{ padding:"8px 4px", color: TEXT2, fontSize:11, fontWeight:700, textAlign:"center", borderBottom:`2px solid ${BORDER}` }}>
                      <div>{d.slice(0,3).toUpperCase()}</div>
                      <div style={{ fontSize:10, color: TEXT3, fontWeight:400 }}>{fmtDate(addDays(monday,i))}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {HOURS.map(hour => (
                  <tr key={hour} style={{ borderBottom:`1px solid ${BG}` }}>
                    <td style={{ padding:"3px 6px", color: TEXT3, fontSize:10, fontWeight:600, whiteSpace:"nowrap" }}>{fmtHour(hour)}</td>
                    {DAYS.map((_,di) => {
                      const slot = getSlot(display, viewTrainer, selWeek, di, hour);
                      let bg=CARD, border=BORDER, labelColor=TEXT3, label="—";
                      if (slot.blocked) { bg="#fee2e2"; border="#fca5a5"; label="Blocked"; labelColor="#991b1b"; }
                      else if (slot.type==="group") { bg="#eff6ff"; border="#93c5fd"; label=`Group ${slot.bookings.length}/${MAX_GROUP_CAPACITY}`; labelColor="#1e40af"; }
                      else if (slot.type==="1on1") { bg="#fefce8"; border="#fde047"; label=slot.bookings.length?"1-on-1 ✓":"1-on-1"; labelColor="#854d0e"; }
                      return (
                        <td key={di} style={{ padding:2, textAlign:"center", verticalAlign:"top", width:`${(720-75)/6}px` }}>
                          <div onClick={()=>{ if(slot.bookings.length>0) setDetail({di,hour}); else if(isOwn) cycleType(di,hour); }}
                            style={{ background:bg, border:`1px solid ${border}`, borderRadius:6, padding:"5px 2px", height:54, boxSizing:"border-box", cursor:"pointer", display:"flex", flexDirection:"column", justifyContent:"center", alignItems:"center", gap:2, overflow:"hidden" }}>
                            <div style={{ fontSize:9, color: labelColor, fontWeight:700 }}>{label}</div>
                            {isOwn && (
                              <button onClick={e=>{e.stopPropagation();toggleBlock(di,hour);}} style={{ fontSize:8, background: CARD, border:`1px solid ${BORDER}`, color: TEXT3, borderRadius:3, padding:"1px 4px" }}>
                                {slot.blocked?"Unblock":"Block"}
                              </button>
                            )}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ marginTop:14, display:"flex", gap:16, flexWrap:"wrap" }}>
            {[["#93c5fd","Group"],["#fde047","1-on-1"],["#fca5a5","Blocked"],[BORDER,"Unset"]].map(([c,l]) => (
              <div key={l} style={{ display:"flex", alignItems:"center", gap:6, fontSize:11, color: TEXT2 }}>
                <div style={{ width:12, height:12, borderRadius:2, background:c, border:`1px solid ${BORDER}` }} />{l}
              </div>
            ))}
          </div>
        </div>

        {panel && (
          <div style={{ width:270, flexShrink:0, borderLeft:`1px solid ${BORDER}`, padding:16, marginLeft:16, background: CARD, borderRadius:10, maxHeight:"calc(100vh - 100px)", overflowY:"auto" }}>

            {panel === "qs" && (
              <>
                <h3 style={{ fontSize:13, fontWeight:700, marginBottom:10, color: TEXT }}>Quick Setup</h3>
                <p style={{ fontSize:11, color: TEXT3, marginBottom:12, lineHeight:1.5 }}>Build your own schedule pattern. Only fills empty slots.</p>
                <p style={{ ...S.label, marginBottom:6 }}>Days</p>
                <div style={{ display:"flex", gap:4, marginBottom:12, flexWrap:"wrap" }}>
                  {["Mon","Tue","Wed","Thu","Fri","Sat"].map((d,i) => (
                    <button key={d} onClick={()=>setQsDays(qsDays.includes(i)?qsDays.filter(x=>x!==i):[...qsDays,i].sort())}
                      style={{ width:38, padding:"6px 0", borderRadius:6, fontSize:11, fontWeight:700, background: qsDays.includes(i) ? RED : CARD, border:`1px solid ${qsDays.includes(i) ? RED : BORDER}`, color: qsDays.includes(i) ? "#fff" : TEXT2 }}>{d}</button>
                  ))}
                </div>
                <p style={{ ...S.label, marginBottom:6 }}>Time Range</p>
                <div style={{ display:"flex", gap:8, alignItems:"center", marginBottom:12 }}>
                  <select value={qsStart} onChange={e=>setQsStart(+e.target.value)} style={{ flex:1, padding:"6px", background: CARD, border:`1px solid ${BORDER}`, borderRadius:6, color: TEXT, fontSize:11 }}>
                    {HOURS.map(h=><option key={h} value={h}>{fmtHour(h)}</option>)}
                  </select>
                  <span style={{ color: TEXT3, fontSize:12 }}>to</span>
                  <select value={qsEnd} onChange={e=>setQsEnd(+e.target.value)} style={{ flex:1, padding:"6px", background: CARD, border:`1px solid ${BORDER}`, borderRadius:6, color: TEXT, fontSize:11 }}>
                    {[...HOURS,20].map(h=><option key={h} value={h}>{fmtHour(h)}</option>)}
                  </select>
                </div>
                <p style={{ ...S.label, marginBottom:6 }}>Session Type</p>
                <div style={{ display:"flex", gap:6, marginBottom:12 }}>
                  {[["group","Group"],["1on1","1-on-1"]].map(([v,l]) => (
                    <button key={v} onClick={()=>setQsType(v)} style={{ flex:1, padding:"8px", borderRadius:6, fontSize:12, fontWeight:700, background: qsType===v ? (v==="group"?"#eff6ff":"#fefce8") : CARD, border:`1px solid ${qsType===v ? (v==="group"?"#93c5fd":"#fde047") : BORDER}`, color: qsType===v ? (v==="group"?"#1e40af":"#854d0e") : TEXT2 }}>{l}</button>
                  ))}
                </div>
                <p style={{ ...S.label, marginBottom:6 }}>Apply To</p>
                <div style={{ display:"flex", gap:6, marginBottom:14 }}>
                  {[["week","This Week"],["month","All 4 Weeks"]].map(([v,l]) => (
                    <button key={v} onClick={()=>setQsScope(v)} style={{ flex:1, padding:"8px", borderRadius:6, fontSize:11, fontWeight:700, background: qsScope===v ? BG : CARD, border:`1px solid ${qsScope===v ? BORDER : BORDER}`, color: qsScope===v ? TEXT : TEXT2 }}>{l}</button>
                  ))}
                </div>
                <button onClick={applyQS} disabled={!qsDays.length||qsEnd<=qsStart} style={{ width:"100%", padding:"10px", borderRadius:6, fontSize:13, fontWeight:700, background: qsDays.length&&qsEnd>qsStart ? RED : "#e5e5e5", border:"none", color: qsDays.length&&qsEnd>qsStart ? "#fff" : TEXT3 }}>Apply Rule</button>
              </>
            )}

            {panel === "clients" && (
              <>
                <h3 style={{ fontSize:13, fontWeight:700, marginBottom:12, color: TEXT }}>Manage Clients</h3>
                <input placeholder="Full name" value={newClientName} onChange={e=>setNewClientName(e.target.value)} style={S.inputSm} />
                <input placeholder="Email" value={newClientEmail} onChange={e=>setNewClientEmail(e.target.value)} style={{...S.inputSm,marginTop:6}} />
                <button onClick={addClient} style={{ ...S.btnPrimary, width:"100%", padding:"9px", fontSize:12, marginTop:8, borderRadius:6 }}>+ Add Client</button>
                <div style={{ marginTop:14, borderTop:`1px solid ${BORDER}`, paddingTop:10 }}>
                  {clients.map(c => <ClientRow key={c.email} client={c} onRemove={()=>persist.clients(clients.filter(x=>x.email!==c.email))} onUpdateCredits={(type,n)=>updateCredits(c.email,type,n)} />)}
                </div>
              </>
            )}

            {panel === "report" && (
              <>
                <h3 style={{ fontSize:13, fontWeight:700, marginBottom:12, color: TEXT }}>Report (4-week)</h3>
                <p style={{ ...S.label, marginBottom:6 }}>Sessions Attended</p>
                {clients.map(c => {
                  let count = 0;
                  trainers.forEach(t => weeks.forEach(w => DAYS.forEach((_,di) => HOURS.forEach(h => {
                    const sl = getSlot(schedules,t.email,wKey(w),di,h);
                    if (sl.bookings.some(b=>b.email===c.email&&b.status==="attended")) count++;
                  }))));
                  return <div key={c.email} style={{ display:"flex", justifyContent:"space-between", fontSize:12, padding:"5px 0", borderBottom:`1px solid ${BG}`, color: TEXT2 }}><span>{c.name}</span><span style={{ color: RED, fontWeight:700 }}>{count}</span></div>;
                })}
              </>
            )}
          </div>
        )}
      </div>

      {detail && (() => {
        const slot = getSlot(display, viewTrainer, selWeek, detail.di, detail.hour);
        return (
          <div onClick={()=>setDetail(null)} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.3)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:999, padding:20 }}>
            <div onClick={e=>e.stopPropagation()} style={{ ...S.card, maxWidth:340, width:"100%" }}>
              <h3 style={{ fontSize:15, fontWeight:700, marginBottom:4, color: TEXT }}>{DAYS[detail.di]}, {fmtHour(detail.hour)}</h3>
              <p style={{ fontSize:12, color: TEXT3, marginBottom:14 }}>{slot.type==="group"?"Group Class":"1-on-1"} · {slot.bookings.length} booked</p>
              {slot.bookings.map(b => (
                <div key={b.email} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"8px 0", borderBottom:`1px solid ${BG}` }}>
                  <div>
                    <div style={{ fontSize:13, color: TEXT, fontWeight:500 }}>{clientName(b.email)}</div>
                    {b.status==="attended" && <div style={{ fontSize:10, color:"#16a34a" }}>✓ Attended</div>}
                  </div>
                  {isOwn && <button onClick={()=>removeBooking(detail.di,detail.hour,b.email)} style={{ background:"none", border:`1px solid #fca5a5`, color:"#991b1b", fontSize:11, padding:"3px 8px", borderRadius:4 }}>Remove</button>}
                </div>
              ))}
              <button onClick={()=>setDetail(null)} style={{ ...S.btnGhost, marginTop:16, width:"100%", padding:9, fontSize:12 }}>Close</button>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

function ClientRow({ client, onRemove, onUpdateCredits }) {
  const [amt, setAmt] = useState("");
  const [type, setType] = useState("group");
  return (
    <div style={{ padding:"10px 0", borderBottom:`1px solid ${BG}` }}>
      <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
        <div>
          <div style={{ fontSize:12, fontWeight:600, color: TEXT }}>{client.name}</div>
          <div style={{ fontSize:10, color: TEXT3 }}>{client.email}</div>
        </div>
        <button onClick={onRemove} style={{ background:"none", border:`1px solid #fca5a5`, color:"#991b1b", borderRadius:4, fontSize:10, padding:"2px 6px" }}>✕</button>
      </div>
      <div style={{ fontSize:11, color: TEXT2, marginBottom:6 }}>
        Group: <b style={{ color:"#1e40af" }}>{client.groupCredits||0}</b> &nbsp; 1-on-1: <b style={{ color:"#854d0e" }}>{client.oneOnOneCredits||0}</b>
      </div>
      <div style={{ display:"flex", gap:4 }}>
        <select value={type} onChange={e=>setType(e.target.value)} style={{ padding:"3px 4px", background: CARD, border:`1px solid ${BORDER}`, borderRadius:4, color: TEXT, fontSize:10 }}>
          <option value="group">Group</option>
          <option value="1on1">1-on-1</option>
        </select>
        <input type="number" placeholder="#" value={amt} onChange={e=>setAmt(e.target.value)} style={{ width:46, padding:"3px 6px", background: CARD, border:`1px solid ${BORDER}`, borderRadius:4, color: TEXT, fontSize:11 }} />
        <button onClick={()=>{const n=parseInt(amt,10);if(!isNaN(n)){onUpdateCredits(type,n);setAmt("");}}} style={{ background:"#dcfce7", border:"1px solid #86efac", color:"#166534", borderRadius:4, fontSize:11, padding:"3px 8px", fontWeight:700 }}>+ Add</button>
      </div>
    </div>
  );
}

function ClientSchedule({ user, clients, trainers, weeks, schedules, persist, showToast }) {
  const [selWeek, setSelWeek] = useState(wKey(weeks[0]));
  const [viewTrainer, setViewTrainer] = useState(trainers[0]?.email);
  const [viewType, setViewType] = useState("group");
  const [pending, setPending] = useState(null);
  const [rescheduling, setRescheduling] = useState(null);

  const monday = weeks.find(w => wKey(w) === selWeek);
  const liveUser = clients.find(c => c.email === user.email) || user;

  const weekCounts = (() => {
    let group=0, oneOnOne=0; const bookedDays = new Set();
    trainers.forEach(t => DAYS.forEach((_,di) => HOURS.forEach(h => {
      const sl = getSlot(schedules, t.email, selWeek, di, h);
      if (sl.bookings.some(b=>b.email===user.email)) {
        if (sl.type==="group") group++; else if (sl.type==="1on1") oneOnOne++;
        bookedDays.add(di);
      }
    })));
    return { group, oneOnOne, bookedDays };
  })();

  const attendCounts = (() => {
    let week=0, month=0; const now = new Date();
    trainers.forEach(t => weeks.forEach(w => {
      const wk = wKey(w);
      DAYS.forEach((_,di) => HOURS.forEach(h => {
        const sl = getSlot(schedules,t.email,wk,di,h);
        const mine = sl.bookings.find(b=>b.email===user.email&&b.status==="attended");
        if (!mine) return;
        const dt = slotDT(w,di,h);
        if (dt.getMonth()===now.getMonth()&&dt.getFullYear()===now.getFullYear()) month++;
        if (wk===selWeek) week++;
      }));
    }));
    return { week, month };
  })();

  const updateSlot = (tr,wk,di,h,upd) => persist.schedules(setSlot(schedules,tr,wk,di,h,upd));

  const book = (di, h) => {
    const slot = getSlot(schedules, viewTrainer, selWeek, di, h);
    const dt = slotDT(monday, di, h);
    if (dt.getTime() < Date.now()) { showToast("This session time has already passed.", "error"); return; }
    if (slot.blocked || !slot.type) { showToast("Slot unavailable.", "error"); return; }
    if (slot.bookings.some(b=>b.email===user.email)) { showToast("Already booked here.", "error"); return; }
    const cf = slot.type==="group"?"groupCredits":"oneOnOneCredits";
    if ((liveUser[cf]||0) <= 0) { showToast(`No ${slot.type==="group"?"group":"1-on-1"} credits remaining. Contact your trainer.`, "error"); return; }
    if (slot.type==="group" && weekCounts.group >= MAX_GROUP_PER_WEEK) { showToast(`Limit of ${MAX_GROUP_PER_WEEK} group sessions/week reached.`, "error"); return; }
    if (slot.type==="1on1" && weekCounts.oneOnOne >= MAX_1ON1_PER_WEEK) { showToast(`Limit of ${MAX_1ON1_PER_WEEK} 1-on-1s/week reached.`, "error"); return; }
    if (weekCounts.bookedDays.has(di)) { showToast("Only one session per day.", "error"); return; }
    if (slot.type==="group" && slot.bookings.length >= MAX_GROUP_CAPACITY) { showToast("Class is full.", "error"); return; }
    if (slot.type==="1on1" && slot.bookings.length >= 1) { showToast("Slot taken.", "error"); return; }
    setPending({ di, h });
  };

  const confirmBook = () => {
    if (!pending) return;
    const { di, h } = pending;
    const slot = getSlot(schedules, viewTrainer, selWeek, di, h);
    const cf = slot.type==="group"?"groupCredits":"oneOnOneCredits";
    updateSlot(viewTrainer, selWeek, di, h, s => ({ ...s, bookings: [...s.bookings, { email: user.email, bookedAt: new Date().toISOString() }] }));
    persist.clients(clients.map(c => c.email===user.email ? {...c,[cf]:(c[cf]||0)-1} : c));
    showToast("Booked! 💪"); setPending(null);
  };

  const cancel = (di, h) => {
    const slot = getSlot(schedules, viewTrainer, selWeek, di, h);
    const myB = slot.bookings.find(b=>b.email===user.email);
    const inGrace = myB && (Date.now()-new Date(myB.bookedAt).getTime()) < GRACE_PERIOD_MS;
    const dt = slotDT(monday, di, h);
    if (hoursUntil(dt) < CANCEL_CUTOFF_HOURS && !inGrace) { showToast(`Cancellations require ${CANCEL_CUTOFF_HOURS}h notice.`, "error"); return; }
    const cf = slot.type==="group"?"groupCredits":"oneOnOneCredits";
    updateSlot(viewTrainer, selWeek, di, h, s => ({ ...s, bookings: s.bookings.filter(b=>b.email!==user.email) }));
    persist.clients(clients.map(c => c.email===user.email ? {...c,[cf]:(c[cf]||0)+1} : c));
    showToast("Cancelled. Credit refunded.");
  };

  const openReschedule = (di, h) => {
    const slot = getSlot(schedules, viewTrainer, selWeek, di, h);
    const myB = slot.bookings.find(b=>b.email===user.email);
    const inGrace = myB && (Date.now()-new Date(myB.bookedAt).getTime()) < GRACE_PERIOD_MS;
    const dt = slotDT(monday, di, h);
    if (hoursUntil(dt) < CANCEL_CUTOFF_HOURS && !inGrace) { showToast("Rescheduling requires 24h notice.", "error"); return; }
    setRescheduling({ di, h, type: slot.type });
  };

  const confirmReschedule = (ndi, nh) => {
    if (!rescheduling) return;
    let s = JSON.parse(JSON.stringify(schedules));
    s = setSlot(s, viewTrainer, selWeek, rescheduling.di, rescheduling.h, sl => ({ ...sl, bookings: sl.bookings.filter(b=>b.email!==user.email) }));
    s = setSlot(s, viewTrainer, selWeek, ndi, nh, sl => ({ ...sl, bookings: [...sl.bookings, { email: user.email, bookedAt: new Date().toISOString() }] }));
    persist.schedules(s); showToast("Rescheduled! 🔄"); setRescheduling(null);
  };

  const attend = (di, h) => {
    updateSlot(viewTrainer, selWeek, di, h, s => ({ ...s, bookings: s.bookings.map(b=>b.email===user.email?{...b,status:"attended"}:b) }));
    showToast("Checked in! 💪");
  };

  return (
    <div style={{ maxWidth:900, margin:"0 auto", padding:"20px 16px 50px" }}>
      <h1 style={{ fontSize:22, fontWeight:800, marginBottom:16, color: TEXT }}>Book a Session</h1>

      {/* Credits */}
      <div style={{ ...S.card, marginBottom:14, display:"flex", gap:32, flexWrap:"wrap" }}>
        <div>
          <p style={{ ...S.label, marginBottom:4 }}>Group Sessions Available</p>
          <p style={{ fontSize:28, fontWeight:900, color:(liveUser.groupCredits||0)>0 ? RED : "#dc2626" }}>{liveUser.groupCredits||0}</p>
        </div>
        <div>
          <p style={{ ...S.label, marginBottom:4 }}>1-on-1 Sessions Available</p>
          <p style={{ fontSize:28, fontWeight:900, color:(liveUser.oneOnOneCredits||0)>0 ? RED : "#dc2626" }}>{liveUser.oneOnOneCredits||0}</p>
        </div>
      </div>

      {/* Attendance */}
      <div style={{ background:"#f0fdf4", border:"1px solid #86efac", borderRadius:10, padding:"14px 18px", marginBottom:16, display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:8 }}>
        <div>
          <p style={{ fontSize:11, color:"#166534", fontWeight:700, textTransform:"uppercase", letterSpacing:.5 }}>Your Attendance</p>
          <p style={{ fontSize:13, color:"#15803d" }}>Keep the streak going 💪</p>
        </div>
        <div style={{ display:"flex", gap:24 }}>
          {[["This Week",attendCounts.week],["This Month",attendCounts.month]].map(([l,v]) => (
            <div key={l} style={{ textAlign:"center" }}>
              <p style={{ fontSize:26, fontWeight:900, color:"#16a34a", lineHeight:1 }}>{v}</p>
              <p style={{ fontSize:10, color:"#166534", fontWeight:700, textTransform:"uppercase", marginTop:2 }}>{l}</p>
            </div>
          ))}
        </div>
      </div>

      <div style={{ marginBottom:12 }}><WeekSelector weeks={weeks} selected={selWeek} setSelected={setSelWeek} /></div>

      {trainers.length > 1 && (
        <div style={{ marginBottom:12, display:"flex", gap:6, flexWrap:"wrap" }}>
          {trainers.map(t => (
            <button key={t.email} onClick={()=>setViewTrainer(t.email)} style={{ padding:"6px 14px", borderRadius:8, fontSize:12, fontWeight:600, background: viewTrainer===t.email ? t.color : CARD, border:`1px solid ${viewTrainer===t.email ? t.color : BORDER}`, color: viewTrainer===t.email ? "#fff" : TEXT2 }}>{t.name}</button>
          ))}
        </div>
      )}

      <div style={{ display:"flex", gap:6, marginBottom:16 }}>
        {[["group","Group Classes"],["1on1","1-on-1"]].map(([v,l]) => (
          <button key={v} onClick={()=>setViewType(v)} style={{ padding:"8px 18px", borderRadius:8, fontSize:13, fontWeight:700, background: viewType===v ? RED : CARD, border:`1px solid ${viewType===v ? RED : BORDER}`, color: viewType===v ? "#fff" : TEXT2 }}>{l}</button>
        ))}
      </div>

      {/* Client Grid */}
      <div style={{ overflowX:"auto" }}>
        <table style={{ borderCollapse:"collapse", width:720, tableLayout:"fixed" }}>
          <thead>
            <tr style={{ background: BG }}>
              <th style={{ width:75, padding:"8px 6px", color: TEXT3, fontSize:11, textAlign:"left", borderBottom:`2px solid ${BORDER}` }}>Time</th>
              {DAYS.map((d,i) => (
                <th key={d} style={{ padding:"8px 4px", color: TEXT2, fontSize:11, fontWeight:700, textAlign:"center", borderBottom:`2px solid ${BORDER}` }}>
                  <div>{d.slice(0,3).toUpperCase()}</div>
                  <div style={{ fontSize:10, color: TEXT3, fontWeight:400 }}>{fmtDate(addDays(monday,i))}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {HOURS.map(hour => (
              <tr key={hour} style={{ borderBottom:`1px solid ${BG}` }}>
                <td style={{ padding:"3px 6px", color: TEXT3, fontSize:10, fontWeight:600, whiteSpace:"nowrap", width:75 }}>{fmtHour(hour)}</td>
                {DAYS.map((_,di) => {
                  const slot = getSlot(schedules, viewTrainer, selWeek, di, hour);
                  const matches = slot.type === viewType;
                  const myB = slot.bookings.find(b=>b.email===user.email);
                  const isBooked = !!myB;
                  const wasAttended = isBooked && myB.status==="attended";
                  const dt = slotDT(monday, di, hour);
                  const isPast = dt.getTime() < Date.now();
                  const isToday = dt.toDateString() === new Date().toDateString();
                  const inGrace = myB && (Date.now()-new Date(myB.bookedAt).getTime()) < GRACE_PERIOD_MS;
                  const canModify = hoursUntil(dt) >= CANCEL_CUTOFF_HOURS || inGrace;
                  const isFull = viewType==="group" ? slot.bookings.length>=MAX_GROUP_CAPACITY : slot.bookings.length>=1;

                  let bg=CARD, border=BORDER, label="", labelColor=TEXT3;
                  if (wasAttended) { bg="#f0fdf4"; border="#86efac"; label="Attended ✓"; labelColor="#16a34a"; }
                  else if (isPast && isBooked) { bg="#f9f9f9"; border="#e0e0e0"; label="Completed"; labelColor=TEXT3; }
                  else if (isPast) { bg="#f9f9f9"; border="#e5e5e5"; }
                  else if (!matches) { bg: BG; border=BG; }
                  else if (slot.blocked) { bg="#fee2e2"; border="#fca5a5"; label="Unavailable"; labelColor="#991b1b"; }
                  else if (isBooked) { bg:"#eff6ff"; border="#93c5fd"; label="Scheduled"; labelColor="#1e40af"; }
                  else if (isFull) { bg="#fafaf9"; border="#d4d4d4"; label="Full"; labelColor=TEXT3; }
                  else { bg=CARD; border=BORDER; label=viewType==="group"?`${slot.bookings.length}/${MAX_GROUP_CAPACITY}`:"Open"; labelColor=TEXT3; }

                  let actions = null;
                  const showActs = matches && !slot.blocked && (!isPast || (isToday && isBooked && !wasAttended));
                  if (showActs) {
                    if (isBooked && !wasAttended) {
                      if (isToday) {
                        actions = <button onClick={()=>attend(di,hour)} style={{ background: RED, color:"#fff", border:"none", borderRadius:4, fontSize:10, padding:"3px 8px", fontWeight:700 }}>Attend</button>;
                      } else if (inGrace || !isPast) {
                        actions = (
                          <div style={{ display:"flex", gap:5, alignItems:"center", justifyContent:"center" }}>
                            <button onClick={()=>openReschedule(di,hour)} disabled={!canModify} style={{ background:"none", color: canModify ? TEXT2 : TEXT3, border:"none", fontSize:8, padding:0, textDecoration:"underline", opacity: canModify?1:.5 }}>reschedule</button>
                            <span style={{ color: TEXT3, fontSize:8 }}>·</span>
                            <button onClick={()=>cancel(di,hour)} disabled={!canModify} style={{ background:"none", color: canModify ? TEXT2 : TEXT3, border:"none", fontSize:8, padding:0, textDecoration:"underline", opacity: canModify?1:.5 }}>cancel</button>
                          </div>
                        );
                      }
                    } else if (!isBooked && !isFull && !isPast) {
                      actions = <button onClick={()=>book(di,hour)} style={{ background:"#dcfce7", color:"#166534", border:"1px solid #86efac", borderRadius:4, fontSize:10, padding:"3px 8px", fontWeight:600 }}>Book</button>;
                    }
                  }

                  return (
                    <td key={di} style={{ padding:2, textAlign:"center", verticalAlign:"top", width:`${(720-75)/6}px`, maxWidth:`${(720-75)/6}px`, overflow:"hidden" }}>
                      <div style={{ background:bg, border:`1px solid ${border}`, borderRadius:6, padding:"4px 2px", height:68, width:"100%", boxSizing:"border-box", boxShadow: wasAttended ? "inset 0 0 0 1px #86efac" : "none", display:"flex", flexDirection:"column", justifyContent:"center", alignItems:"center", gap:3, overflow:"hidden" }}>
                        {matches && label && <div style={{ fontSize: label==="Scheduled"||wasAttended ? 11 : 9, color: labelColor, fontWeight: label==="Scheduled"||wasAttended ? 800 : 600, lineHeight:1 }}>{label}</div>}
                        {actions}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop:12, display:"flex", gap:16, flexWrap:"wrap" }}>
        {[["#86efac","Attended"],["#93c5fd","Scheduled"],["#e5e5e5","Full"],["#fca5a5","Unavailable"],[BORDER,"Open"]].map(([c,l]) => (
          <div key={l} style={{ display:"flex", alignItems:"center", gap:6, fontSize:11, color: TEXT2 }}>
            <div style={{ width:12, height:12, borderRadius:2, background:c, border:`1px solid ${BORDER}` }} />{l}
          </div>
        ))}
      </div>
      <p style={{ fontSize:11, color: TEXT2, marginTop:8 }}>Same-day bookings have a 15-minute grace period to reschedule or cancel right after booking.</p>

      {/* Booking confirm */}
      {pending && (() => {
        const slot = getSlot(schedules, viewTrainer, selWeek, pending.di, pending.h);
        const dt = slotDT(monday, pending.di, pending.h);
        const isToday = dt.toDateString() === new Date().toDateString();
        const trainerName = trainers.find(t=>t.email===viewTrainer)?.name;
        return (
          <div onClick={()=>setPending(null)} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.25)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:999, padding:20 }}>
            <div onClick={e=>e.stopPropagation()} style={{ ...S.card, maxWidth:360, width:"100%", padding:24 }}>
              <h3 style={{ fontSize:16, fontWeight:700, marginBottom:6, color: TEXT }}>Confirm Booking</h3>
              <p style={{ fontSize:13, color: TEXT2, marginBottom:4 }}>{slot.type==="group"?"Group Class":"1-on-1"} with {trainerName}</p>
              <p style={{ fontSize:14, color: TEXT, fontWeight:600, marginBottom:14 }}>{DAYS[pending.di]}, {fmtDate(addDays(monday,pending.di))} at {fmtHour(pending.h)}</p>
              {isToday && <div style={{ background:"#fffbeb", border:"1px solid #f59e0b", borderRadius:6, padding:"8px 12px", marginBottom:14, fontSize:12, color:"#92400e" }}>⚠️ This session is today. Same-day bookings can only be cancelled within 15 minutes of booking.</div>}
              <div style={{ display:"flex", gap:8 }}>
                <button onClick={()=>setPending(null)} style={{ ...S.btnGhost, flex:1, padding:11, fontSize:13, fontWeight:600 }}>Cancel</button>
                <button onClick={confirmBook} style={{ ...S.btnPrimary, flex:1, padding:11, fontSize:13 }}>Confirm</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Reschedule modal */}
      {rescheduling && (() => {
        const options = [];
        DAYS.forEach((day,di) => HOURS.forEach(h => {
          if (di===rescheduling.di && h===rescheduling.h) return;
          const dt = slotDT(monday,di,h);
          if (dt.getTime() < Date.now()) return;
          const sl = getSlot(schedules,viewTrainer,selWeek,di,h);
          if (sl.type!==rescheduling.type || sl.blocked) return;
          const full = rescheduling.type==="group"?sl.bookings.length>=MAX_GROUP_CAPACITY:sl.bookings.length>=1;
          if (full) return;
          options.push({ di, h, day, count: sl.bookings.length });
        }));
        return (
          <div onClick={()=>setRescheduling(null)} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.25)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:999, padding:20 }}>
            <div onClick={e=>e.stopPropagation()} style={{ ...S.card, maxWidth:380, width:"100%", maxHeight:"80vh", overflowY:"auto", padding:24 }}>
              <h3 style={{ fontSize:16, fontWeight:700, marginBottom:6, color: TEXT }}>Reschedule To...</h3>
              <p style={{ fontSize:12, color: TEXT3, marginBottom:16 }}>Moving from {DAYS[rescheduling.di]} {fmtHour(rescheduling.h)}.</p>
              {options.length===0 && <p style={{ fontSize:13, color: TEXT2, textAlign:"center", padding:"20px 0" }}>No other open slots this week.</p>}
              {options.map(o => (
                <button key={`${o.di}-${o.h}`} onClick={()=>confirmReschedule(o.di,o.h)} style={{ display:"block", width:"100%", textAlign:"left", background: BG, border:`1px solid ${BORDER}`, borderRadius:8, padding:"10px 14px", marginBottom:8, color: TEXT, fontSize:13 }}>
                  <span style={{ fontWeight:700 }}>{o.day}</span>, {fmtDate(addDays(monday,o.di))} at {fmtHour(o.h)}
                  {rescheduling.type==="group" && <span style={{ color: TEXT3, marginLeft:8 }}>({o.count}/{MAX_GROUP_CAPACITY})</span>}
                </button>
              ))}
              <button onClick={()=>setRescheduling(null)} style={{ ...S.btnGhost, marginTop:10, width:"100%", padding:10, fontSize:12 }}>Cancel</button>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

function Footer() {
  return (
    <div style={{ borderTop:`1px solid ${BORDER}`, padding:"28px 20px", textAlign:"center", color: TEXT3, fontSize:12, background: CARD }}>
      <p>© 2026 Thomas Training · Denver, CO</p>
    </div>
  );
}