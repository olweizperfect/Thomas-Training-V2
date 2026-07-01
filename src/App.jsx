import { useState, useEffect, useRef } from "react";

// ─── CONSTANTS ───────────────────────────────────────────────────────────────
const HOURS = Array.from({ length: 14 }, (_, i) => i + 6);
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MAX_GROUP_PER_WEEK = 3;
const MAX_1ON1_PER_WEEK = 5;
const MAX_GROUP_CAPACITY = 4;
const CANCEL_CUTOFF_HOURS = 24;
const GRACE_PERIOD_MS = 15 * 60 * 1000;
const INACTIVITY_LIMIT_MS = 60 * 60 * 1000;
const INACTIVITY_WARN_MS = 59 * 60 * 1000;
const ACCENT = "#c0392b";
const ACCENT2 = "#e8553e";

// ─── HELPERS ─────────────────────────────────────────────────────────────────
const fmtHour = h => h === 12 ? "12:00 PM" : h < 12 ? `${h}:00 AM` : `${h-12}:00 PM`;
const fmtDate = d => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
const addDays = (d, n) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };
const getMonday = d => { const r = new Date(d); const day = r.getDay(); r.setDate(r.getDate() - (day === 0 ? 6 : day - 1)); r.setHours(0,0,0,0); return r; };
const weekKey = d => d.toISOString().split("T")[0];
const slotDT = (monday, dayIdx, hour) => { const d = addDays(monday, dayIdx); d.setHours(hour,0,0,0); return d; };
const hoursUntil = dt => (dt.getTime() - Date.now()) / 3600000;
const getWeeks = () => { const m = getMonday(new Date()); return Array.from({length:4},(_,i)=>addDays(m,i*7)); };

// ─── SEED DATA ───────────────────────────────────────────────────────────────
const SEED_TRAINERS = [
  { email: "thomas@studio.com", name: "Thomas", color: ACCENT, bio: "Founder & lead trainer. Specializes in calisthenics progressions and mobility.", credentials: "NASM-CPT, 8 yrs coaching" },
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
  const wk = weekKey(monday);
  const mkBooking = email => ({ email, bookedAt: new Date().toISOString() });
  const mkSlot = (type, emails = []) => ({ type, blocked: false, bookings: emails.map(mkBooking) });
  return {
    [SEED_TRAINERS[0].email]: { [wk]: {
      0: { 7: mkSlot("group"), 17: mkSlot("group") },
      1: { 9: mkSlot("1on1"), 10: mkSlot("1on1"), 14: mkSlot("1on1",["maria@example.com"]) },
      2: { 7: mkSlot("group"), 17: mkSlot("group") },
      3: { 9: mkSlot("1on1"), 10: mkSlot("1on1"), 14: mkSlot("1on1") },
      4: { 7: mkSlot("group") },
      5: { 9: mkSlot("group", ["maria@example.com","pedro@example.com"]) },
    }},
    [SEED_TRAINERS[1].email]: { [wk]: {
      0: { 8: mkSlot("group", ["pedro@example.com"]) },
      2: { 8: mkSlot("group") },
      4: { 8: mkSlot("group") },
      1: { 11: mkSlot("1on1", ["carlo@example.com"]) },
      3: { 11: mkSlot("1on1") },
    }},
  };
}

// ─── STORAGE ─────────────────────────────────────────────────────────────────
async function load(key, fallback) {
  try { const r = await window.storage.get(key, true); return r ? JSON.parse(r.value) : fallback; }
  catch { return fallback; }
}
async function save(key, val) {
  try { await window.storage.set(key, JSON.stringify(val), true); } catch {}
}

// ─── SLOT HELPER ─────────────────────────────────────────────────────────────
const getSlot = (schedules, trainer, wk, dayIdx, hour) =>
  schedules[trainer]?.[wk]?.[dayIdx]?.[hour] || { type: null, blocked: false, bookings: [] };

const setSlot = (schedules, trainer, wk, dayIdx, hour, updater) => {
  const s = JSON.parse(JSON.stringify(schedules));
  if (!s[trainer]) s[trainer] = {};
  if (!s[trainer][wk]) s[trainer][wk] = {};
  if (!s[trainer][wk][dayIdx]) s[trainer][wk][dayIdx] = {};
  const cur = s[trainer][wk][dayIdx][hour] || { type: null, blocked: false, bookings: [] };
  s[trainer][wk][dayIdx][hour] = typeof updater === "function" ? updater(cur) : updater;
  return s;
};

// ─── ROOT APP ────────────────────────────────────────────────────────────────
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
      const [t, c, s] = await Promise.all([
        load("tt_trainers", SEED_TRAINERS),
        load("tt_clients", SEED_CLIENTS),
        load("tt_schedules", buildSeedSchedule()),
      ]);
      setTrainers(t); setClients(c); setSchedules(s);
      setLoading(false);
    })();
  }, []);

  // Inactivity
  useEffect(() => {
    if (!user) { setInactiveWarn(false); return; }
    const mark = () => { lastActivity.current = Date.now(); setInactiveWarn(false); };
    ["mousedown","keydown","scroll","touchstart"].forEach(e => window.addEventListener(e, mark));
    const id = setInterval(() => {
      const elapsed = Date.now() - lastActivity.current;
      if (elapsed >= INACTIVITY_LIMIT_MS) { logout(); showToast("Logged out due to inactivity.", "error"); }
      else if (elapsed >= INACTIVITY_WARN_MS) { setInactiveWarn(true); setCountdown(Math.ceil((INACTIVITY_LIMIT_MS - elapsed) / 1000)); }
    }, 1000);
    return () => { ["mousedown","keydown","scroll","touchstart"].forEach(e => window.removeEventListener(e, mark)); clearInterval(id); };
  }, [user]);

  const persist = { trainers: v => { setTrainers(v); save("tt_trainers", v); }, clients: v => { setClients(v); save("tt_clients", v); }, schedules: v => { setSchedules(v); save("tt_schedules", v); } };
  const showToast = (msg, type = "success") => { setToast({ msg, type }); setTimeout(() => setToast(null), 2800); };
  const logout = () => { setUser(null); setRole(null); setPage("home"); };

  if (loading) return <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:"100vh", background:"#0d0d0d", color:ACCENT2, fontFamily:"sans-serif" }}>Loading...</div>;

  return (
    <div style={{ minHeight:"100vh", background:"#0d0d0d", color:"#f0ede8", fontFamily:"'Segoe UI',system-ui,sans-serif" }}>
      <style>{`
        html { scrollbar-gutter: stable; }
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width:6px; height:6px; }
        ::-webkit-scrollbar-thumb { background:#3a3a3a; border-radius:3px; }
        @keyframes fadeIn { from{opacity:0;transform:translateX(-50%) translateY(-8px)}to{opacity:1;transform:translateX(-50%) translateY(0)} }
        @keyframes pulse { 0%,100%{transform:scale(1)}50%{transform:scale(1.06)} }
        button { font-family:inherit; cursor:pointer; }
      `}</style>

      {toast && (
        <div style={{ position:"fixed", top:16, left:"50%", transform:"translateX(-50%)", background:toast.type==="error"?"#7f1d1d":"#14532d", color:"#fff", padding:"10px 24px", borderRadius:8, zIndex:9999, fontSize:14, fontWeight:600, boxShadow:"0 4px 20px rgba(0,0,0,.5)", border:`1px solid ${toast.type==="error"?"#ef4444":"#22c55e"}`, animation:"fadeIn .2s ease" }}>
          {toast.msg}
        </div>
      )}

      {inactiveWarn && user && (
        <div style={{ position:"fixed", top:70, left:"50%", transform:"translateX(-50%)", zIndex:9998, background:"#2a1410", border:"1px solid #5a3a10", borderRadius:10, padding:"14px 22px", display:"flex", alignItems:"center", gap:14, boxShadow:"0 4px 20px rgba(0,0,0,.5)" }}>
          <span style={{ fontSize:13, color:"#e8a83a", fontWeight:600 }}>⏱ You'll be logged out in {countdown}s due to inactivity.</span>
          <button onClick={() => { lastActivity.current = Date.now(); setInactiveWarn(false); }} style={{ background:ACCENT, border:"none", color:"#fff", fontSize:12, fontWeight:700, padding:"6px 14px", borderRadius:6 }}>Stay Logged In</button>
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
      {page === "schedule" && user && role === "trainer" && (
        <TrainerSchedule user={user} trainers={trainers} clients={clients} weeks={weeks} schedules={schedules} persist={persist} showToast={showToast} />
      )}
      {page === "schedule" && user && role === "client" && (
        <ClientSchedule user={user} clients={clients} trainers={trainers} weeks={weeks} schedules={schedules} persist={persist} showToast={showToast} />
      )}

      <Footer />
    </div>
  );
}

// ─── NAV ─────────────────────────────────────────────────────────────────────
function Nav({ page, setPage, user, role, logout }) {
  const [mob, setMob] = useState(false);
  const links = [["home","Home"],["about","About"],["trainers","Trainers"],["pricing","Pricing"],["location","Location"],["contact","Contact"]];
  const cta = !user ? "Log In / Sign Up" : role === "trainer" ? "My Schedule" : "My Sessions";
  const ctaTarget = !user ? "login" : "schedule";
  return (
    <div style={{ background:"#141414", borderBottom:"1px solid #222", position:"sticky", top:0, zIndex:200 }}>
      <div style={{ maxWidth:1100, margin:"0 auto", padding:"0 16px", display:"flex", alignItems:"center", justifyContent:"space-between", height:56 }}>
        <div onClick={() => setPage("home")} style={{ cursor:"pointer", fontWeight:900, fontSize:18, letterSpacing:-0.5, color:ACCENT2 }}>
          THOMAS<span style={{ color:"#777", fontWeight:400 }}>TRAINING</span>
        </div>
        <div style={{ display:"flex", gap:4, alignItems:"center" }}>
          {links.map(([k,l]) => (
            <button key={k} onClick={() => setPage(k)} style={{ background:"none", border:"none", color:page===k?ACCENT2:"#aaa", fontSize:13, fontWeight:600, padding:"8px 10px", borderBottom:page===k?`2px solid ${ACCENT2}`:"2px solid transparent" }}>{l}</button>
          ))}
          <div style={{ width:1, height:20, background:"#333", margin:"0 6px" }} />
          <button onClick={() => setPage(ctaTarget)} style={{ background:ACCENT, border:"none", color:"#fff", fontSize:13, fontWeight:700, padding:"8px 16px", borderRadius:6 }}>{cta}</button>
          {user && <button onClick={logout} style={{ background:"none", border:"1px solid #333", color:"#999", fontSize:12, padding:"7px 12px", borderRadius:6 }}>Log Out</button>}
        </div>
      </div>
    </div>
  );
}

// ─── HOME ─────────────────────────────────────────────────────────────────────
function HomePage({ setPage, user, role }) {
  const cta = !user ? "Book a Session" : role === "trainer" ? "My Schedule" : "My Sessions";
  const ctaTarget = !user ? "login" : "schedule";
  return (
    <div>
      <div style={{ padding:"90px 20px 70px", textAlign:"center", background:"radial-gradient(circle at 50% 0%,#2a1410 0%,#0d0d0d 60%)", borderBottom:"1px solid #1a1a1a" }}>
        <div style={{ maxWidth:720, margin:"0 auto" }}>
          <h1 style={{ fontSize:"clamp(32px,6vw,52px)", fontWeight:900, lineHeight:1.1, marginBottom:18 }}>Train smarter.<br /><span style={{ color:ACCENT2 }}>Move better.</span></h1>
          <p style={{ fontSize:17, color:"#bbb", maxWidth:480, margin:"0 auto 32px", lineHeight:1.6 }}>Personalized calisthenics coaching and small-group classes with Thomas. Book your session in seconds.</p>
          <div style={{ display:"flex", gap:12, justifyContent:"center", flexWrap:"wrap" }}>
            <button onClick={() => setPage(ctaTarget)} style={{ background:ACCENT, border:"none", color:"#fff", fontSize:15, fontWeight:700, padding:"14px 28px", borderRadius:8 }}>{cta}</button>
            <button onClick={() => setPage("about")} style={{ background:"none", border:"1px solid #444", color:"#ddd", fontSize:15, fontWeight:600, padding:"14px 28px", borderRadius:8 }}>Learn More</button>
          </div>
        </div>
      </div>
      <div style={{ maxWidth:1000, margin:"0 auto", padding:"60px 20px", display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(240px,1fr))", gap:24 }}>
        {[["🤸","Calisthenics Focus","Bodyweight progressions built around mobility, strength, and control."],["👥","Group & 1-on-1","Mix small-group energy with personalized one-on-one coaching."],["📅","Easy Booking","See real-time availability and book your week in a few taps."]].map(([icon,t,d]) => (
          <div key={t} style={{ background:"#161616", border:"1px solid #222", borderRadius:12, padding:24, textAlign:"center" }}>
            <div style={{ fontSize:32, marginBottom:12 }}>{icon}</div>
            <h3 style={{ fontSize:16, fontWeight:700, marginBottom:8 }}>{t}</h3>
            <p style={{ fontSize:13, color:"#999", lineHeight:1.6 }}>{d}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── ABOUT ───────────────────────────────────────────────────────────────────
function AboutPage() {
  return (
    <div style={{ maxWidth:720, margin:"0 auto", padding:"60px 20px" }}>
      <h1 style={ptitle()}>About</h1>
      <p style={{ color:"#bbb", lineHeight:1.8, fontSize:15, marginBottom:16 }}>This studio is built around one idea: sustainable strength comes from movement quality, not just effort. Thomas works with clients of all levels using progressive programming tailored to where you are right now.</p>
      <p style={{ color:"#bbb", lineHeight:1.8, fontSize:15 }}>Sessions are kept small so coaching stays personal, whether you're in a group class or a 1-on-1.</p>
    </div>
  );
}

// ─── TRAINERS ────────────────────────────────────────────────────────────────
function TrainersPage({ trainers }) {
  return (
    <div style={{ maxWidth:900, margin:"0 auto", padding:"60px 20px" }}>
      <h1 style={ptitle()}>Meet the Trainers</h1>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(260px,1fr))", gap:20 }}>
        {trainers.map(t => (
          <div key={t.email} style={{ background:"#161616", border:"1px solid #222", borderRadius:12, padding:24 }}>
            <div style={{ width:56, height:56, borderRadius:"50%", background:t.color, display:"flex", alignItems:"center", justifyContent:"center", fontWeight:900, fontSize:22, color:"#fff", marginBottom:14 }}>{t.name[0]}</div>
            <h3 style={{ fontSize:17, fontWeight:700, marginBottom:4 }}>{t.name}</h3>
            <p style={{ fontSize:12, color:ACCENT2, fontWeight:600, marginBottom:10 }}>{t.credentials}</p>
            <p style={{ fontSize:13, color:"#aaa", lineHeight:1.6 }}>{t.bio}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── PRICING ─────────────────────────────────────────────────────────────────
function PricingPage({ setPage }) {
  return (
    <div style={{ maxWidth:640, margin:"0 auto", padding:"100px 20px", textAlign:"center" }}>
      <div style={{ fontSize:40, marginBottom:20 }}>🛠️</div>
      <h1 style={{ fontSize:26, fontWeight:800, marginBottom:14 }}>Pricing — Coming Soon</h1>
      <p style={{ color:"#999", fontSize:15, lineHeight:1.7, maxWidth:480, margin:"0 auto 28px" }}>We're finalizing membership plans as the studio transitions. In the meantime, reach out directly for current pricing and session credits.</p>
      <button onClick={() => setPage("contact")} style={{ background:ACCENT, border:"none", color:"#fff", fontSize:14, fontWeight:700, padding:"12px 24px", borderRadius:8 }}>Contact Us</button>
    </div>
  );
}

// ─── LOCATION ────────────────────────────────────────────────────────────────
function LocationPage() {
  return (
    <div style={{ maxWidth:720, margin:"0 auto", padding:"60px 20px" }}>
      <h1 style={ptitle()}>Location</h1>
      <div style={{ background:"#161616", border:"1px solid #222", borderRadius:12, padding:24, marginBottom:20 }}>
        <p style={{ fontSize:15, color:"#ddd", fontWeight:600, marginBottom:4 }}>1221 Pecos St, Unit 140</p>
        <p style={{ fontSize:15, color:"#ddd", fontWeight:600, marginBottom:8 }}>Denver, CO 80204</p>
        <p style={{ fontSize:13, color:"#999" }}>Street parking available nearby.</p>
        <p style={{ fontSize:11, color:"#777", marginTop:8, fontStyle:"italic" }}>This location may change as the studio transitions to its own space later this year.</p>
      </div>
      <div style={{ background:"#161616", border:"1px solid #222", borderRadius:12, padding:24 }}>
        <p style={{ fontSize:13, color:"#999", fontWeight:700, marginBottom:10 }}>Hours</p>
        {DAYS.map(d => (
          <div key={d} style={{ display:"flex", justifyContent:"space-between", fontSize:13, color:"#bbb", padding:"4px 0" }}>
            <span>{d}</span><span style={{ color:"#777" }}>6:00 AM – 7:00 PM</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── CONTACT ─────────────────────────────────────────────────────────────────
function ContactPage() {
  const [form, setForm] = useState({ name:"", email:"", message:"" });
  const [sent, setSent] = useState(false);
  return (
    <div style={{ maxWidth:560, margin:"0 auto", padding:"60px 20px" }}>
      <h1 style={ptitle()}>Contact</h1>
      {sent ? (
        <div style={{ background:"#14532d", border:"1px solid #22c55e", borderRadius:8, padding:20, color:"#bbf7d0", fontSize:14 }}>Thanks! Thomas will get back to you soon.</div>
      ) : (
        <>
          <input placeholder="Your name" value={form.name} onChange={e => setForm({...form,name:e.target.value})} style={field()} />
          <input placeholder="Your email" value={form.email} onChange={e => setForm({...form,email:e.target.value})} style={{...field(),marginTop:10}} />
          <textarea placeholder="Message" rows={5} value={form.message} onChange={e => setForm({...form,message:e.target.value})} style={{...field(),marginTop:10,resize:"vertical"}} />
          <button onClick={() => setSent(true)} style={{ marginTop:14, background:ACCENT, border:"none", color:"#fff", fontSize:14, fontWeight:700, padding:"12px 24px", borderRadius:8 }}>Send Message</button>
        </>
      )}
      <div style={{ marginTop:40, borderTop:"1px solid #222", paddingTop:24, fontSize:13, color:"#999", lineHeight:1.8 }}>
        <p>📧 thomas_wood_03@hotmail.com</p>
        <p>📞 (703) 232-7367</p>
        <p style={{ fontSize:11, color:"#666", marginTop:6 }}>A dedicated business email is coming soon — for the fastest response, call or text directly.</p>
      </div>
    </div>
  );
}

// ─── LOGIN ────────────────────────────────────────────────────────────────────
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
      <div style={{ width:"100%", maxWidth:380, background:"#161616", border:"1px solid #222", borderRadius:16, padding:32 }}>
        <div style={{ display:"flex", gap:8, marginBottom:24 }}>
          {["login","signup"].map(m => (
            <button key={m} onClick={() => { setMode(m); setErr(""); }} style={{ flex:1, padding:"9px", background:mode===m?ACCENT:"none", border:`1px solid ${mode===m?ACCENT:"#333"}`, color:mode===m?"#fff":"#999", borderRadius:6, fontSize:13, fontWeight:700 }}>{m === "login" ? "Log In" : "Sign Up"}</button>
          ))}
        </div>
        {mode === "signup" && <input placeholder="Full name" value={name} onChange={e => setName(e.target.value)} style={{...field(),marginBottom:10}} />}
        <input type="email" placeholder="your@email.com" value={email} onChange={e => setEmail(e.target.value)} onKeyDown={e => e.key==="Enter" && (mode==="login"?login():signup())} style={field()} />
        {err && <p style={{ color:"#ef4444", fontSize:12, marginTop:8 }}>{err}</p>}
        <button onClick={mode==="login"?login:signup} style={{ width:"100%", marginTop:14, padding:13, background:ACCENT, border:"none", borderRadius:8, color:"#fff", fontWeight:700, fontSize:14 }}>{mode === "login" ? "Log In" : "Create Account"}</button>
        {mode === "login" && (
          <div style={{ marginTop:20, padding:12, background:"#0f0f0f", border:"1px solid #222", borderRadius:8 }}>
            <p style={{ color:"#666", fontSize:11, marginBottom:6, fontWeight:700 }}>DEMO ACCOUNTS</p>
            {[["Trainer","thomas@studio.com"],["Trainer","arash@studio.com"],["Client","juan@example.com"],["Client","maria@example.com"],["Client","pedro@example.com"],["Client","ana@example.com"],["Client","carlo@example.com"]].map(([lbl,em]) => (
              <button key={em} onClick={() => setEmail(em)} style={{ display:"block", width:"100%", textAlign:"left", background:"none", border:"1px solid #2a2a2a", borderRadius:6, color:"#aaa", fontSize:11, padding:"6px 10px", marginTop:4 }}>
                <b style={{ color:ACCENT2 }}>{lbl}:</b> {em}
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
      <p style={{ color:"#999", fontSize:14 }}>Log in or create an account to view the schedule.</p>
      <button onClick={() => setPage("login")} style={{ background:ACCENT, border:"none", color:"#fff", fontSize:13, fontWeight:700, padding:"10px 20px", borderRadius:6 }}>Log In / Sign Up</button>
    </div>
  );
}

// ─── WEEK SELECTOR ───────────────────────────────────────────────────────────
function WeekSelector({ weeks, selected, setSelected }) {
  return (
    <div style={{ display:"flex", gap:8, overflowX:"auto", paddingBottom:4 }}>
      {weeks.map((monday, i) => {
        const k = weekKey(monday); const active = k === selected;
        return (
          <button key={k} onClick={() => setSelected(k)} style={{ flexShrink:0, padding:"8px 16px", borderRadius:8, background:active?ACCENT:"#161616", border:`1px solid ${active?ACCENT:"#2a2a2a"}`, color:active?"#fff":"#aaa", fontSize:12, fontWeight:600, display:"flex", flexDirection:"column", alignItems:"center", gap:2 }}>
            <span>Week {i+1}</span>
            <span style={{ fontSize:10, opacity:.7 }}>{fmtDate(monday)}–{fmtDate(addDays(monday,5))}</span>
          </button>
        );
      })}
    </div>
  );
}

// ─── TRAINER SCHEDULE ─────────────────────────────────────────────────────────
function TrainerSchedule({ user, trainers, clients, weeks, schedules, persist, showToast }) {
  const [selWeek, setSelWeek] = useState(weekKey(weeks[0]));
  const [viewTrainer, setViewTrainer] = useState(user.email);
  const [panel, setPanel] = useState(null);
  const [draft, setDraft] = useState(schedules);
  const [unsaved, setUnsaved] = useState(false);
  const [pulsing, setPulsing] = useState(false);
  const [detail, setDetail] = useState(null);
  // Add client form state
  const [newClientName, setNewClientName] = useState("");
  const [newClientEmail, setNewClientEmail] = useState("");
  // Add trainer form state
  const [newTrainerName, setNewTrainerName] = useState("");
  const [newTrainerEmail, setNewTrainerEmail] = useState("");
  // Quick setup
  const [qsDays, setQsDays] = useState([]);
  const [qsStart, setQsStart] = useState(7);
  const [qsEnd, setQsEnd] = useState(8);
  const [qsType, setQsType] = useState("group");
  const [qsScope, setQsScope] = useState("week");

  const monday = weeks.find(w => weekKey(w) === selWeek);
  const isOwn = viewTrainer === user.email;
  const display = isOwn ? draft : schedules;

  useEffect(() => { if (!unsaved) setDraft(schedules); }, [schedules, unsaved]);

  const updateDraft = (trainer, wk, dayIdx, hour, updater) => {
    const s = setSlot(draft, trainer, wk, dayIdx, hour, updater);
    setDraft(s); setUnsaved(true);
  };
  const updateLive = (trainer, wk, dayIdx, hour, updater) => {
    const s = setSlot(schedules, trainer, wk, dayIdx, hour, updater);
    persist.schedules(s); setDraft(s);
  };

  const cycleType = (dayIdx, hour) => {
    if (!isOwn) { showToast("You can only edit your own schedule.", "error"); return; }
    const slot = getSlot(draft, user.email, selWeek, dayIdx, hour);
    const order = [null, "group", "1on1"];
    const next = order[(order.indexOf(slot.type) + 1) % order.length];
    updateDraft(user.email, selWeek, dayIdx, hour, s => ({ ...s, type: next, blocked: false }));
  };

  const toggleBlock = (dayIdx, hour) => {
    if (!isOwn) { showToast("You can only edit your own schedule.", "error"); return; }
    const slot = getSlot(draft, user.email, selWeek, dayIdx, hour);
    if (slot.bookings.length > 0) showToast(`Heads up: ${slot.bookings.length} client(s) booked here. Reach out before cancelling.`, "error");
    updateDraft(user.email, selWeek, dayIdx, hour, s => ({ ...s, blocked: !s.blocked }));
  };

  const removeBooking = (dayIdx, hour, clientEmail) => {
    updateLive(viewTrainer, selWeek, dayIdx, hour, s => ({ ...s, bookings: s.bookings.filter(b => b.email !== clientEmail) }));
    showToast("Booking removed. Consider notifying the client.");
    setDetail(null);
  };

  const publish = () => { persist.schedules(draft); setUnsaved(false); setPulsing(false); showToast("Schedule published — clients can now see these changes."); };
  const discard = () => { setDraft(schedules); setUnsaved(false); showToast("Changes discarded."); };

  const applyQS = () => {
    if (!qsDays.length || qsEnd <= qsStart) return;
    const targets = qsScope === "month" ? weeks.map(w => weekKey(w)) : [selWeek];
    let s = JSON.parse(JSON.stringify(draft)); let count = 0;
    targets.forEach(wk => {
      qsDays.forEach(dayIdx => {
        for (let h = qsStart; h < qsEnd; h++) {
          if (!s[user.email]) s[user.email] = {};
          if (!s[user.email][wk]) s[user.email][wk] = {};
          if (!s[user.email][wk][dayIdx]) s[user.email][wk][dayIdx] = {};
          const ex = s[user.email][wk][dayIdx][h];
          if (!ex || (!ex.type && !ex.blocked)) { s[user.email][wk][dayIdx][h] = { type: qsType, blocked: false, bookings: [] }; count++; }
        }
      });
    });
    setDraft(s); setUnsaved(true); setPanel(null); setPulsing(true); setTimeout(() => setPulsing(false), 2400);
    showToast(`Filled ${count} empty slot${count===1?"":"s"} across ${targets.length} week${targets.length===1?"":"s"}. Review and Publish when ready.`);
  };

  const addClient = () => {
    const e = newClientEmail.trim().toLowerCase(), n = newClientName.trim();
    if (!e || !n) { showToast("Enter name and email.", "error"); return; }
    if (clients.find(c => c.email === e)) { showToast("Client already exists.", "error"); return; }
    persist.clients([...clients, { email: e, name: n, groupCredits: 0, oneOnOneCredits: 0 }]);
    setNewClientName(""); setNewClientEmail("");
    showToast(`${n} added!`);
  };

  const addTrainer = () => {
    const e = newTrainerEmail.trim().toLowerCase(), n = newTrainerName.trim();
    if (!e || !n) { showToast("Enter name and email.", "error"); return; }
    if (trainers.find(t => t.email === e)) { showToast("Trainer already exists.", "error"); return; }
    const colors = [ACCENT,"#2a9d8f","#e9c46a","#8338ec","#3a86ff","#f77f00"];
    persist.trainers([...trainers, { email: e, name: n, color: colors[trainers.length % colors.length], bio: "", credentials: "" }]);
    setNewTrainerName(""); setNewTrainerEmail("");
    showToast(`${n} added as trainer!`);
  };

  const updateCredits = (email, type, amount) => {
    const field = type === "group" ? "groupCredits" : "oneOnOneCredits";
    persist.clients(clients.map(c => c.email === email ? { ...c, [field]: (c[field]||0) + amount } : c));
    const cl = clients.find(c => c.email === email);
    showToast(`Added ${amount} ${type === "group" ? "group" : "1-on-1"} session${amount===1?"":"s"} for ${cl?.name}.`);
  };

  const clientName = email => clients.find(c => c.email === email)?.name || email;

  return (
    <div style={{ maxWidth:1000, margin:"0 auto", padding:"20px 16px 50px" }}>
      {/* Header */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:16, flexWrap:"wrap", gap:10 }}>
        <h1 style={{ fontSize:22, fontWeight:800 }}>Trainer Schedule</h1>
        <div style={{ display:"flex", gap:8 }}>
          {[["⚡ Quick Setup","qs"],["👥 Clients","clients"],["📊 Report","report"]].map(([lbl,k]) => (
            <button key={k} onClick={() => setPanel(panel===k?null:k)} style={{ background:panel===k?"#2a2a2a":"#161616", border:`1px solid ${panel===k?"#444":"#2a2a2a"}`, color:"#ccc", fontSize:12, padding:"7px 12px", borderRadius:6, fontWeight:600 }}>{lbl}</button>
          ))}
        </div>
      </div>

      {/* Unsaved banner */}
      {isOwn && unsaved && (
        <div style={{ background:"#1a1410", border:"1px solid #5a3a10", borderRadius:8, padding:"10px 16px", marginBottom:16, display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:10 }}>
          <span style={{ fontSize:13, color:"#d4a017", fontWeight:600 }}>⚠️ You have unsaved changes — clients can't see these yet.</span>
          <div style={{ display:"flex", gap:8 }}>
            <button onClick={discard} style={{ padding:"7px 14px", background:"none", border:"1px solid #444", color:"#ccc", borderRadius:6, fontSize:12, fontWeight:600 }}>Discard</button>
            <button onClick={publish} style={{ padding:"7px 16px", background:ACCENT, border:"none", color:"#fff", borderRadius:6, fontSize:12, fontWeight:700, animation:pulsing?"pulse 0.6s ease-in-out 3":"none" }}>Publish Changes</button>
          </div>
        </div>
      )}

      <div style={{ display:"flex", gap:0 }}>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ marginBottom:12 }}><WeekSelector weeks={weeks} selected={selWeek} setSelected={setSelWeek} /></div>

          {trainers.length > 1 && (
            <div style={{ marginBottom:14, display:"flex", gap:6, flexWrap:"wrap" }}>
              {trainers.map(t => (
                <button key={t.email} onClick={() => setViewTrainer(t.email)} style={{ padding:"6px 14px", borderRadius:8, fontSize:12, fontWeight:600, background:viewTrainer===t.email?t.color:"#161616", border:`1px solid ${viewTrainer===t.email?t.color:"#2a2a2a"}`, color:viewTrainer===t.email?"#fff":"#aaa" }}>
                  {t.name}{t.email===user.email?" (You)":""}
                </button>
              ))}
            </div>
          )}

          {!isOwn && <div style={{ background:"#1a1410", border:"1px solid #3a2a10", borderRadius:8, padding:"8px 14px", marginBottom:14, fontSize:12, color:"#d4a017" }}>👀 Viewing {trainers.find(t=>t.email===viewTrainer)?.name}'s schedule — read only</div>}

          {/* Trainer Grid */}
          <div style={{ overflowX:"auto" }}>
            <table style={{ borderCollapse:"collapse", width:720, tableLayout:"fixed" }}>
              <thead>
                <tr>
                  <th style={{ width:75, padding:"6px 4px", color:"#666", fontSize:11, textAlign:"left", borderBottom:"1px solid #222" }}>Time</th>
                  {DAYS.map((d,i) => (
                    <th key={d} style={{ padding:"6px 4px", color:"#aaa", fontSize:11, fontWeight:600, textAlign:"center", borderBottom:"1px solid #222" }}>
                      <div>{d.slice(0,3).toUpperCase()}</div>
                      <div style={{ fontSize:10, color:"#555" }}>{fmtDate(addDays(monday,i))}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {HOURS.map(hour => (
                  <tr key={hour}>
                    <td style={{ padding:"3px 4px", color:"#666", fontSize:10, fontWeight:600, whiteSpace:"nowrap" }}>{fmtHour(hour)}</td>
                    {DAYS.map((_,dayIdx) => {
                      const slot = getSlot(display, viewTrainer, selWeek, dayIdx, hour);
                      let bg="#161616", border="#222", label="—";
                      if (slot.blocked) { bg="#1a0808"; border="#3a1010"; label="Blocked"; }
                      else if (slot.type==="group") { bg="#0f2228"; border="#1d4a55"; label=`Group ${slot.bookings.length}/${MAX_GROUP_CAPACITY}`; }
                      else if (slot.type==="1on1") { bg="#241408"; border="#5a3a10"; label=slot.bookings.length?"1-on-1 ✓":"1-on-1 open"; }
                      return (
                        <td key={dayIdx} style={{ padding:2, textAlign:"center", verticalAlign:"top", width:`${(720-75)/6}px` }}>
                          <div onClick={() => { if (slot.bookings.length>0) setDetail({dayIdx,hour}); else if (isOwn) cycleType(dayIdx,hour); }}
                            style={{ background:bg, border:`1px solid ${border}`, borderRadius:6, padding:"5px 2px", height:54, boxSizing:"border-box", cursor:"pointer", display:"flex", flexDirection:"column", justifyContent:"center", alignItems:"center", gap:2, overflow:"hidden" }}>
                            <div style={{ fontSize:9, color:"#bbb", fontWeight:700 }}>{label}</div>
                            {isOwn && (
                              <button onClick={e => { e.stopPropagation(); toggleBlock(dayIdx,hour); }} style={{ fontSize:8, background:"none", border:"1px solid #333", color:"#888", borderRadius:3, padding:"1px 4px" }}>
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
            {[["#1d4a55","Group Class"],["#5a3a10","1-on-1"],["#3a1010","Blocked"],["#222","Unset"]].map(([c,l]) => (
              <div key={l} style={{ display:"flex", alignItems:"center", gap:6, fontSize:11, color:"#777" }}>
                <div style={{ width:12, height:12, borderRadius:2, background:c }} />{l}
              </div>
            ))}
          </div>
        </div>

        {/* Side Panels */}
        {panel && (
          <div style={{ width:270, flexShrink:0, borderLeft:"1px solid #222", padding:16, marginLeft:16, background:"#111", borderRadius:10, maxHeight:"calc(100vh - 100px)", overflowY:"auto" }}>

            {panel === "qs" && (
              <>
                <h3 style={{ fontSize:13, fontWeight:700, marginBottom:10 }}>Quick Setup</h3>
                <p style={{ fontSize:11, color:"#888", marginBottom:12, lineHeight:1.5 }}>Build your own pattern — only fills empty slots, never overwrites existing bookings.</p>
                <p style={{ fontSize:11, color:"#999", fontWeight:700, marginBottom:6 }}>DAYS</p>
                <div style={{ display:"flex", gap:4, marginBottom:12, flexWrap:"wrap" }}>
                  {["Mon","Tue","Wed","Thu","Fri","Sat"].map((d,i) => (
                    <button key={d} onClick={() => setQsDays(qsDays.includes(i)?qsDays.filter(x=>x!==i):[...qsDays,i].sort())} style={{ width:38, padding:"6px 0", borderRadius:6, fontSize:11, fontWeight:700, background:qsDays.includes(i)?ACCENT:"#0f0f0f", border:`1px solid ${qsDays.includes(i)?ACCENT:"#2a2a2a"}`, color:qsDays.includes(i)?"#fff":"#999" }}>{d}</button>
                  ))}
                </div>
                <p style={{ fontSize:11, color:"#999", fontWeight:700, marginBottom:6 }}>TIME RANGE</p>
                <div style={{ display:"flex", gap:8, alignItems:"center", marginBottom:12 }}>
                  <select value={qsStart} onChange={e=>setQsStart(+e.target.value)} style={{ flex:1, padding:"6px", background:"#0f0f0f", border:"1px solid #2a2a2a", borderRadius:6, color:"#eee", fontSize:11 }}>
                    {HOURS.map(h=><option key={h} value={h}>{fmtHour(h)}</option>)}
                  </select>
                  <span style={{ color:"#666", fontSize:12 }}>to</span>
                  <select value={qsEnd} onChange={e=>setQsEnd(+e.target.value)} style={{ flex:1, padding:"6px", background:"#0f0f0f", border:"1px solid #2a2a2a", borderRadius:6, color:"#eee", fontSize:11 }}>
                    {[...HOURS,20].map(h=><option key={h} value={h}>{fmtHour(h)}</option>)}
                  </select>
                </div>
                <p style={{ fontSize:11, color:"#999", fontWeight:700, marginBottom:6 }}>SESSION TYPE</p>
                <div style={{ display:"flex", gap:6, marginBottom:12 }}>
                  {[["group","Group"],["1on1","1-on-1"]].map(([v,l]) => (
                    <button key={v} onClick={()=>setQsType(v)} style={{ flex:1, padding:"8px", borderRadius:6, fontSize:12, fontWeight:700, background:qsType===v?(v==="group"?"#1d4a55":"#5a3a10"):"#0f0f0f", border:`1px solid ${qsType===v?(v==="group"?"#2a6f7f":"#7f4a2a"):"#2a2a2a"}`, color:qsType===v?(v==="group"?"#7dd3e0":"#e0a85a"):"#999" }}>{l}</button>
                  ))}
                </div>
                <p style={{ fontSize:11, color:"#999", fontWeight:700, marginBottom:6 }}>APPLY TO</p>
                <div style={{ display:"flex", gap:6, marginBottom:14 }}>
                  {[["week","This Week"],["month","All 4 Weeks"]].map(([v,l]) => (
                    <button key={v} onClick={()=>setQsScope(v)} style={{ flex:1, padding:"8px", borderRadius:6, fontSize:11, fontWeight:700, background:qsScope===v?"#222":"#0f0f0f", border:`1px solid ${qsScope===v?"#444":"#2a2a2a"}`, color:qsScope===v?"#fff":"#999" }}>{l}</button>
                  ))}
                </div>
                <button onClick={applyQS} disabled={!qsDays.length||qsEnd<=qsStart} style={{ width:"100%", padding:"10px", borderRadius:6, fontSize:13, fontWeight:700, background:qsDays.length&&qsEnd>qsStart?ACCENT:"#2a2a2a", border:"none", color:qsDays.length&&qsEnd>qsStart?"#fff":"#666" }}>Apply Rule</button>
              </>
            )}

            {panel === "clients" && (
              <>
                <h3 style={{ fontSize:13, fontWeight:700, marginBottom:12 }}>Manage Clients</h3>
                <input placeholder="Full name" value={newClientName} onChange={e=>setNewClientName(e.target.value)} style={fieldSm()} />
                <input placeholder="Email address" value={newClientEmail} onChange={e=>setNewClientEmail(e.target.value)} style={{...fieldSm(),marginTop:6}} />
                <button onClick={addClient} style={{ width:"100%", padding:"9px", background:ACCENT, border:"none", borderRadius:6, color:"#fff", fontWeight:700, fontSize:12, marginTop:8 }}>+ Add Client</button>
                <div style={{ marginTop:14, borderTop:"1px solid #222", paddingTop:10 }}>
                  <p style={{ color:"#666", fontSize:11, marginBottom:8 }}>{clients.length} clients</p>
                  {clients.map(c => <ClientRow key={c.email} client={c} onRemove={() => persist.clients(clients.filter(x=>x.email!==c.email))} onUpdateCredits={(type,n)=>updateCredits(c.email,type,n)} />)}
                </div>
              </>
            )}

            {panel === "report" && (
              <>
                <h3 style={{ fontSize:13, fontWeight:700, marginBottom:12 }}>Report (4-week)</h3>
                <p style={{ fontSize:11, color:"#888", fontWeight:700, marginBottom:6 }}>SESSIONS ATTENDED</p>
                {clients.map(c => {
                  let count = 0;
                  trainers.forEach(t => weeks.forEach(w => DAYS.forEach((_,di) => HOURS.forEach(h => {
                    const sl = getSlot(schedules,t.email,weekKey(w),di,h);
                    if (sl.bookings.some(b=>b.email===c.email&&b.status==="attended")) count++;
                  }))));
                  return <div key={c.email} style={{ display:"flex", justifyContent:"space-between", fontSize:12, padding:"4px 0", color:"#bbb" }}><span>{c.name}</span><span style={{ color:ACCENT2, fontWeight:700 }}>{count}</span></div>;
                })}
              </>
            )}
          </div>
        )}
      </div>

      {/* Detail Modal */}
      {detail && (() => {
        const slot = getSlot(display, viewTrainer, selWeek, detail.dayIdx, detail.hour);
        return (
          <div onClick={() => setDetail(null)} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.6)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:999, padding:20 }}>
            <div onClick={e=>e.stopPropagation()} style={{ background:"#181818", border:"1px solid #2a2a2a", borderRadius:12, padding:24, maxWidth:340, width:"100%" }}>
              <h3 style={{ fontSize:15, fontWeight:700, marginBottom:4 }}>{DAYS[detail.dayIdx]}, {fmtHour(detail.hour)}</h3>
              <p style={{ fontSize:12, color:"#888", marginBottom:14 }}>{slot.type==="group"?"Group Class":"1-on-1"} · {slot.bookings.length} booked</p>
              {slot.bookings.map(b => (
                <div key={b.email} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"8px 0", borderBottom:"1px solid #222" }}>
                  <div>
                    <div style={{ fontSize:13, color:"#ddd" }}>{clientName(b.email)}</div>
                    {b.status==="attended" && <div style={{ fontSize:10, color:"#4ade80" }}>✓ Attended</div>}
                  </div>
                  {isOwn && <button onClick={() => removeBooking(detail.dayIdx,detail.hour,b.email)} style={{ background:"none", border:"1px solid #3a1010", color:"#ef4444", fontSize:11, padding:"3px 8px", borderRadius:4 }}>Remove</button>}
                </div>
              ))}
              <button onClick={() => setDetail(null)} style={{ marginTop:16, width:"100%", padding:9, background:"#222", border:"none", borderRadius:6, color:"#ccc", fontSize:12 }}>Close</button>
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
    <div style={{ padding:"10px 0", borderBottom:"1px solid #1a1a1a" }}>
      <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
        <div>
          <div style={{ fontSize:12, fontWeight:600, color:"#ddd" }}>{client.name}</div>
          <div style={{ fontSize:10, color:"#666" }}>{client.email}</div>
        </div>
        <button onClick={onRemove} style={{ background:"none", border:"1px solid #3a1010", color:"#ef4444", borderRadius:4, fontSize:10, padding:"2px 6px" }}>✕</button>
      </div>
      <div style={{ fontSize:11, color:"#888", marginBottom:6 }}>
        Group: <b style={{ color:"#7dd3e0" }}>{client.groupCredits||0}</b> &nbsp; 1-on-1: <b style={{ color:"#e0a85a" }}>{client.oneOnOneCredits||0}</b>
      </div>
      <div style={{ display:"flex", gap:4 }}>
        <select value={type} onChange={e=>setType(e.target.value)} style={{ padding:"3px", background:"#0f0f0f", border:"1px solid #2a2a2a", borderRadius:4, color:"#eee", fontSize:10 }}>
          <option value="group">Group</option>
          <option value="1on1">1-on-1</option>
        </select>
        <input type="number" placeholder="#" value={amt} onChange={e=>setAmt(e.target.value)} style={{ width:46, padding:"3px 6px", background:"#0f0f0f", border:"1px solid #2a2a2a", borderRadius:4, color:"#eee", fontSize:11 }} />
        <button onClick={() => { const n=parseInt(amt,10); if(!isNaN(n)){onUpdateCredits(type,n);setAmt("");} }} style={{ background:"#1a3a1a", border:"1px solid #2a6f2a", color:"#86efac", borderRadius:4, fontSize:11, padding:"3px 8px", fontWeight:700 }}>+ Add</button>
      </div>
    </div>
  );
}

// ─── CLIENT SCHEDULE ──────────────────────────────────────────────────────────
function ClientSchedule({ user, clients, trainers, weeks, schedules, persist, showToast }) {
  const [selWeek, setSelWeek] = useState(weekKey(weeks[0]));
  const [viewTrainer, setViewTrainer] = useState(trainers[0]?.email);
  const [viewType, setViewType] = useState("group");
  const [pending, setPending] = useState(null);
  const [rescheduling, setRescheduling] = useState(null);

  const monday = weeks.find(w => weekKey(w) === selWeek);
  const liveUser = clients.find(c => c.email === user.email) || user;

  const weekCounts = (() => {
    let group = 0, oneOnOne = 0; const bookedDays = new Set();
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
      const wk = weekKey(w);
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

  const updateSlot = (trainer, wk, di, h, updater) => {
    persist.schedules(setSlot(schedules, trainer, wk, di, h, updater));
  };

  const book = (dayIdx, hour) => {
    const slot = getSlot(schedules, viewTrainer, selWeek, dayIdx, hour);
    const dt = slotDT(monday, dayIdx, hour);
    if (dt.getTime() < Date.now()) { showToast("This session time has already passed.", "error"); return; }
    if (slot.blocked || !slot.type) { showToast("Slot unavailable.", "error"); return; }
    if (slot.bookings.some(b=>b.email===user.email)) { showToast("Already booked here.", "error"); return; }
    const creditField = slot.type==="group"?"groupCredits":"oneOnOneCredits";
    if ((liveUser[creditField]||0) <= 0) { showToast(`No ${slot.type==="group"?"group":"1-on-1"} session credits remaining. Contact your trainer.`, "error"); return; }
    if (slot.type==="group" && weekCounts.group >= MAX_GROUP_PER_WEEK) { showToast(`Limit of ${MAX_GROUP_PER_WEEK} group sessions/week reached.`, "error"); return; }
    if (slot.type==="1on1" && weekCounts.oneOnOne >= MAX_1ON1_PER_WEEK) { showToast(`Limit of ${MAX_1ON1_PER_WEEK} 1-on-1s/week reached.`, "error"); return; }
    if (weekCounts.bookedDays.has(dayIdx)) { showToast("Only one session per day.", "error"); return; }
    if (slot.type==="group" && slot.bookings.length >= MAX_GROUP_CAPACITY) { showToast("Class is full.", "error"); return; }
    if (slot.type==="1on1" && slot.bookings.length >= 1) { showToast("Slot taken.", "error"); return; }
    setPending({ dayIdx, hour });
  };

  const confirmBook = () => {
    if (!pending) return;
    const { dayIdx, hour } = pending;
    const slot = getSlot(schedules, viewTrainer, selWeek, dayIdx, hour);
    const creditField = slot.type==="group"?"groupCredits":"oneOnOneCredits";
    updateSlot(viewTrainer, selWeek, dayIdx, hour, s => ({ ...s, bookings: [...s.bookings, { email: user.email, bookedAt: new Date().toISOString() }] }));
    persist.clients(clients.map(c => c.email===user.email ? { ...c, [creditField]: (c[creditField]||0)-1 } : c));
    showToast("Booked! 💪"); setPending(null);
  };

  const cancel = (dayIdx, hour) => {
    const slot = getSlot(schedules, viewTrainer, selWeek, dayIdx, hour);
    const myBooking = slot.bookings.find(b=>b.email===user.email);
    const withinGrace = myBooking && (Date.now()-new Date(myBooking.bookedAt).getTime()) < GRACE_PERIOD_MS;
    const dt = slotDT(monday, dayIdx, hour);
    if (hoursUntil(dt) < CANCEL_CUTOFF_HOURS && !withinGrace) { showToast(`Cancellations require ${CANCEL_CUTOFF_HOURS}h notice.`, "error"); return; }
    const creditField = slot.type==="group"?"groupCredits":"oneOnOneCredits";
    updateSlot(viewTrainer, selWeek, dayIdx, hour, s => ({ ...s, bookings: s.bookings.filter(b=>b.email!==user.email) }));
    persist.clients(clients.map(c => c.email===user.email ? { ...c, [creditField]: (c[creditField]||0)+1 } : c));
    showToast("Cancelled. Session credit refunded.");
  };

  const openReschedule = (dayIdx, hour) => {
    const slot = getSlot(schedules, viewTrainer, selWeek, dayIdx, hour);
    const myBooking = slot.bookings.find(b=>b.email===user.email);
    const withinGrace = myBooking && (Date.now()-new Date(myBooking.bookedAt).getTime()) < GRACE_PERIOD_MS;
    const dt = slotDT(monday, dayIdx, hour);
    if (hoursUntil(dt) < CANCEL_CUTOFF_HOURS && !withinGrace) { showToast("Rescheduling requires 24h notice.", "error"); return; }
    setRescheduling({ dayIdx, hour, type: slot.type });
  };

  const confirmReschedule = (newDayIdx, newHour) => {
    if (!rescheduling) return;
    const { dayIdx, hour } = rescheduling;
    let s = JSON.parse(JSON.stringify(schedules));
    s = setSlot(s, viewTrainer, selWeek, dayIdx, hour, sl => ({ ...sl, bookings: sl.bookings.filter(b=>b.email!==user.email) }));
    s = setSlot(s, viewTrainer, selWeek, newDayIdx, newHour, sl => ({ ...sl, bookings: [...sl.bookings, { email: user.email, bookedAt: new Date().toISOString() }] }));
    persist.schedules(s); showToast("Rescheduled! 🔄"); setRescheduling(null);
  };

  const attend = (dayIdx, hour) => {
    updateSlot(viewTrainer, selWeek, dayIdx, hour, s => ({ ...s, bookings: s.bookings.map(b=>b.email===user.email?{...b,status:"attended"}:b) }));
    showToast("Checked in! 💪");
  };

  return (
    <div style={{ maxWidth:900, margin:"0 auto", padding:"20px 16px 50px" }}>
      <h1 style={{ fontSize:22, fontWeight:800, marginBottom:16 }}>Book a Session</h1>

      {/* Credits card */}
      <div style={{ background:"#161616", border:"1px solid #222", borderRadius:10, padding:"14px 18px", marginBottom:14, display:"flex", gap:28, flexWrap:"wrap" }}>
        <div>
          <p style={{ fontSize:11, color:"#888", fontWeight:700, textTransform:"uppercase", letterSpacing:.5 }}>Group Sessions</p>
          <p style={{ fontSize:24, fontWeight:900, color:(liveUser.groupCredits||0)>0?ACCENT2:"#ef4444" }}>{liveUser.groupCredits||0}</p>
        </div>
        <div>
          <p style={{ fontSize:11, color:"#888", fontWeight:700, textTransform:"uppercase", letterSpacing:.5 }}>1-on-1 Sessions</p>
          <p style={{ fontSize:24, fontWeight:900, color:(liveUser.oneOnOneCredits||0)>0?ACCENT2:"#ef4444" }}>{liveUser.oneOnOneCredits||0}</p>
        </div>
      </div>

      {/* Attendance card */}
      <div style={{ background:"#0f2a14", border:"1px solid #22c55e", borderRadius:10, padding:"14px 18px", marginBottom:16, display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:8 }}>
        <div>
          <p style={{ fontSize:11, color:"#86efac", fontWeight:700, textTransform:"uppercase", letterSpacing:.5 }}>Your Attendance</p>
          <p style={{ fontSize:13, color:"#bbb" }}>Keep the streak going 💪</p>
        </div>
        <div style={{ display:"flex", gap:20 }}>
          {[["This Week",attendCounts.week],["This Month",attendCounts.month]].map(([l,v]) => (
            <div key={l} style={{ textAlign:"center" }}>
              <p style={{ fontSize:24, fontWeight:900, color:"#4ade80" }}>{v}</p>
              <p style={{ fontSize:10, color:"#888", fontWeight:700, textTransform:"uppercase" }}>{l}</p>
            </div>
          ))}
        </div>
      </div>

      <div style={{ marginBottom:12 }}><WeekSelector weeks={weeks} selected={selWeek} setSelected={setSelWeek} /></div>

      {trainers.length > 1 && (
        <div style={{ marginBottom:12, display:"flex", gap:6, flexWrap:"wrap" }}>
          {trainers.map(t => (
            <button key={t.email} onClick={() => setViewTrainer(t.email)} style={{ padding:"6px 14px", borderRadius:8, fontSize:12, fontWeight:600, background:viewTrainer===t.email?t.color:"#161616", border:`1px solid ${viewTrainer===t.email?t.color:"#2a2a2a"}`, color:viewTrainer===t.email?"#fff":"#aaa" }}>{t.name}</button>
          ))}
        </div>
      )}

      <div style={{ display:"flex", gap:6, marginBottom:16 }}>
        {[["group","Group Classes"],["1on1","1-on-1"]].map(([v,l]) => (
          <button key={v} onClick={()=>setViewType(v)} style={{ padding:"8px 18px", borderRadius:8, fontSize:13, fontWeight:700, background:viewType===v?ACCENT:"#161616", border:`1px solid ${viewType===v?ACCENT:"#2a2a2a"}`, color:viewType===v?"#fff":"#999" }}>{l}</button>
        ))}
      </div>

      {/* Client Grid */}
      <div style={{ overflowX:"auto" }}>
        <table style={{ borderCollapse:"collapse", width:720, tableLayout:"fixed" }}>
          <thead>
            <tr>
              <th style={{ width:75, padding:"6px 4px", color:"#666", fontSize:11, textAlign:"left", borderBottom:"1px solid #222" }}>Time</th>
              {DAYS.map((d,i) => (
                <th key={d} style={{ padding:"6px 4px", color:"#aaa", fontSize:11, fontWeight:600, textAlign:"center", borderBottom:"1px solid #222" }}>
                  <div>{d.slice(0,3).toUpperCase()}</div>
                  <div style={{ fontSize:10, color:"#555" }}>{fmtDate(addDays(monday,i))}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {HOURS.map(hour => (
              <tr key={hour}>
                <td style={{ padding:"3px 4px", color:"#666", fontSize:10, fontWeight:600, whiteSpace:"nowrap", width:75 }}>{fmtHour(hour)}</td>
                {DAYS.map((_,dayIdx) => {
                  const slot = getSlot(schedules, viewTrainer, selWeek, dayIdx, hour);
                  const matches = slot.type === viewType;
                  const myBooking = slot.bookings.find(b=>b.email===user.email);
                  const isBooked = !!myBooking;
                  const wasAttended = isBooked && myBooking.status==="attended";
                  const dt = slotDT(monday, dayIdx, hour);
                  const isPast = dt.getTime() < Date.now();
                  const isToday = dt.toDateString() === new Date().toDateString();
                  const withinGrace = myBooking && (Date.now()-new Date(myBooking.bookedAt).getTime()) < GRACE_PERIOD_MS;
                  const canModify = hoursUntil(dt) >= CANCEL_CUTOFF_HOURS || withinGrace;
                  const isFull = viewType==="group" ? slot.bookings.length>=MAX_GROUP_CAPACITY : slot.bookings.length>=1;

                  let bg="#111", border="#1e1e1e", label="";
                  if (wasAttended) { bg="#0f2a14"; border="#22c55e"; label="Attended ✓"; }
                  else if (isPast && isBooked) { bg="#0a0a0a"; border="#181818"; label="Completed"; }
                  else if (isPast) { bg="#0a0a0a"; border="#181818"; }
                  else if (!matches) { bg="#0d0d0d"; border="#161616"; }
                  else if (slot.blocked) { bg="#1a0808"; border="#3a1010"; label="Unavailable"; }
                  else if (isBooked) { bg="#0a1628"; border="#1d4ed8"; label="Scheduled"; }
                  else if (isFull) { bg="#0f1a0f"; border="#166534"; label="Full"; }
                  else { bg="#161616"; border="#2a2a2a"; label=viewType==="group"?`${slot.bookings.length}/${MAX_GROUP_CAPACITY}`:"Open"; }

                  let actions = null;
                  const showActions = matches && !slot.blocked && (!isPast || (isToday && isBooked && !wasAttended));
                  if (showActions) {
                    if (isBooked && !wasAttended) {
                      if (isToday) {
                        actions = <button onClick={()=>attend(dayIdx,hour)} style={{ background:"#7c2d12", color:"#fdba74", border:"none", borderRadius:4, fontSize:10, padding:"3px 8px", fontWeight:600 }}>Attend</button>;
                      } else if (withinGrace || !isPast) {
                        actions = (
                          <div style={{ display:"flex", gap:5, alignItems:"center", justifyContent:"center" }}>
                            <button onClick={()=>openReschedule(dayIdx,hour)} disabled={!canModify} style={{ background:"none", color:canModify?"#666":"#333", border:"none", fontSize:8, padding:0, textDecoration:"underline", opacity:canModify?1:.5 }}>reschedule</button>
                            <span style={{ color:"#333", fontSize:8 }}>·</span>
                            <button onClick={()=>cancel(dayIdx,hour)} disabled={!canModify} style={{ background:"none", color:canModify?"#666":"#333", border:"none", fontSize:8, padding:0, textDecoration:"underline", opacity:canModify?1:.5 }}>cancel</button>
                          </div>
                        );
                      }
                    } else if (!isBooked && !isFull && !isPast) {
                      actions = <button onClick={()=>book(dayIdx,hour)} style={{ background:"#14532d", color:"#86efac", border:"none", borderRadius:4, fontSize:10, padding:"3px 8px", fontWeight:600 }}>Book</button>;
                    }
                  }

                  return (
                    <td key={dayIdx} style={{ padding:2, textAlign:"center", verticalAlign:"top", width:`${(720-75)/6}px`, maxWidth:`${(720-75)/6}px`, overflow:"hidden" }}>
                      <div style={{ background:bg, border:`1px solid ${border}`, borderRadius:6, padding:"4px 2px", height:68, width:"100%", boxSizing:"border-box", boxShadow:wasAttended?"inset 0 0 0 1px #22c55e":"none", display:"flex", flexDirection:"column", justifyContent:"center", alignItems:"center", gap:3, overflow:"hidden" }}>
                        {matches && <div style={{ fontSize:wasAttended?13:label==="Scheduled"?13:9, color:wasAttended?"#4ade80":label==="Scheduled"?"#60a5fa":"#999", fontWeight:wasAttended||label==="Scheduled"?900:700, lineHeight:1 }}>{label}</div>}
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
        {[["#22c55e","Attended"],["#1d4ed8","Scheduled"],["#166534","Full"],["#3a1010","Unavailable"],["#2a2a2a","Open"]].map(([c,l]) => (
          <div key={l} style={{ display:"flex", alignItems:"center", gap:6, fontSize:11, color:"#777" }}>
            <div style={{ width:12, height:12, borderRadius:2, background:c }} />{l}
          </div>
        ))}
      </div>
      <p style={{ fontSize:11, color:"#777", marginTop:8 }}>Same-day bookings have a 15-minute grace period to reschedule or cancel right after booking.</p>

      {/* Booking confirm modal */}
      {pending && (() => {
        const slot = getSlot(schedules, viewTrainer, selWeek, pending.dayIdx, pending.hour);
        const dt = slotDT(monday, pending.dayIdx, pending.hour);
        const isToday = dt.toDateString() === new Date().toDateString();
        const trainerName = trainers.find(t=>t.email===viewTrainer)?.name;
        return (
          <div onClick={()=>setPending(null)} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.6)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:999, padding:20 }}>
            <div onClick={e=>e.stopPropagation()} style={{ background:"#181818", border:"1px solid #2a2a2a", borderRadius:12, padding:24, maxWidth:360, width:"100%" }}>
              <h3 style={{ fontSize:16, fontWeight:700, marginBottom:6 }}>Confirm Booking</h3>
              <p style={{ fontSize:13, color:"#bbb", marginBottom:4 }}>{slot.type==="group"?"Group Class":"1-on-1"} with {trainerName}</p>
              <p style={{ fontSize:14, color:"#eee", fontWeight:600, marginBottom:14 }}>{DAYS[pending.dayIdx]}, {fmtDate(addDays(monday,pending.dayIdx))} at {fmtHour(pending.hour)}</p>
              {isToday && <div style={{ background:"#2a1a08", border:"1px solid #5a3a10", borderRadius:6, padding:"8px 12px", marginBottom:14, fontSize:12, color:"#d4a017" }}>⚠️ This session is today. Same-day bookings cannot be cancelled after the 15-minute grace period.</div>}
              <div style={{ display:"flex", gap:8 }}>
                <button onClick={()=>setPending(null)} style={{ flex:1, padding:11, background:"#222", border:"none", borderRadius:6, color:"#ccc", fontSize:13, fontWeight:600 }}>Cancel</button>
                <button onClick={confirmBook} style={{ flex:1, padding:11, background:ACCENT, border:"none", borderRadius:6, color:"#fff", fontSize:13, fontWeight:700 }}>Confirm</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Reschedule modal */}
      {rescheduling && (() => {
        const options = [];
        DAYS.forEach((day,di) => HOURS.forEach(h => {
          if (di===rescheduling.dayIdx && h===rescheduling.hour) return;
          const dt = slotDT(monday,di,h);
          if (dt.getTime() < Date.now()) return;
          const sl = getSlot(schedules,viewTrainer,selWeek,di,h);
          if (sl.type!==rescheduling.type || sl.blocked) return;
          const full = rescheduling.type==="group"?sl.bookings.length>=MAX_GROUP_CAPACITY:sl.bookings.length>=1;
          if (full) return;
          options.push({ di, h, day, count: sl.bookings.length });
        }));
        return (
          <div onClick={()=>setRescheduling(null)} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.6)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:999, padding:20 }}>
            <div onClick={e=>e.stopPropagation()} style={{ background:"#181818", border:"1px solid #2a2a2a", borderRadius:12, padding:24, maxWidth:380, width:"100%", maxHeight:"80vh", overflowY:"auto" }}>
              <h3 style={{ fontSize:16, fontWeight:700, marginBottom:6 }}>Reschedule To...</h3>
              <p style={{ fontSize:12, color:"#888", marginBottom:16 }}>Moving from {DAYS[rescheduling.dayIdx]} {fmtHour(rescheduling.hour)}. Choose a new slot:</p>
              {options.length===0 && <p style={{ fontSize:13, color:"#999", textAlign:"center", padding:"20px 0" }}>No other open slots this week.</p>}
              {options.map(o => (
                <button key={`${o.di}-${o.h}`} onClick={()=>confirmReschedule(o.di,o.h)} style={{ display:"block", width:"100%", textAlign:"left", background:"#0f0f0f", border:"1px solid #2a2a2a", borderRadius:8, padding:"10px 14px", marginBottom:8, color:"#ddd", fontSize:13 }}>
                  <span style={{ fontWeight:700 }}>{o.day}</span>, {fmtDate(addDays(monday,o.di))} at {fmtHour(o.h)}
                  {rescheduling.type==="group" && <span style={{ color:"#888", marginLeft:8 }}>({o.count}/{MAX_GROUP_CAPACITY})</span>}
                </button>
              ))}
              <button onClick={()=>setRescheduling(null)} style={{ marginTop:10, width:"100%", padding:10, background:"#222", border:"none", borderRadius:6, color:"#ccc", fontSize:12 }}>Cancel</button>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// ─── FOOTER ──────────────────────────────────────────────────────────────────
function Footer() {
  return (
    <div style={{ borderTop:"1px solid #1a1a1a", padding:"28px 20px", textAlign:"center", color:"#555", fontSize:12 }}>
      <p>© 2026 Thomas Training · Denver, CO</p>
    </div>
  );
}

// ─── SHARED UTILS ────────────────────────────────────────────────────────────
const ptitle = () => ({ fontSize:30, fontWeight:900, marginBottom:24, letterSpacing:-0.5 });
const field = () => ({ width:"100%", padding:"11px 14px", background:"#161616", border:"1px solid #2a2a2a", borderRadius:8, color:"#eee", fontSize:14, outline:"none" });
const fieldSm = () => ({ width:"100%", padding:"8px 10px", background:"#0f0f0f", border:"1px solid #2a2a2a", borderRadius:6, color:"#eee", fontSize:12, outline:"none" });