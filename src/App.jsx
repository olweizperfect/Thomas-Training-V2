import { useState, useEffect, useRef } from "react";

const HOURS = Array.from({ length: 14 }, (_, i) => i + 6);
const DAYS = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const MAX_GROUP_PER_WEEK = 3;
const MAX_1ON1_PER_WEEK = 5;
const MAX_GROUP_CAPACITY = 6;
const CANCEL_CUTOFF_HOURS = 24;
const GRACE_MS = 15 * 60 * 1000;
const INACTIVE_LIMIT = 60 * 60 * 1000;
const INACTIVE_WARN  = 59 * 60 * 1000;

const RED    = "#c0392b";
const BG     = "#f7f5f3";
const CARD   = "#ffffff";
const BORDER = "#e2ddd8";
const TEXT   = "#1a1a1a";
const TEXT2  = "#4a4a4a";
const TEXT3  = "#6b6b6b";

const fmtH   = h => h===12?"12:00 PM":h<12?`${h}:00 AM`:`${h-12}:00 PM`;
const fmtD   = d => d.toLocaleDateString("en-US",{month:"short",day:"numeric"});
const addD   = (d,n) => { const r=new Date(d); r.setDate(r.getDate()+n); return r; };
const monOf  = d => { const r=new Date(d); const day=r.getDay(); r.setDate(r.getDate()-(day===0?6:day-1)); r.setHours(0,0,0,0); return r; };
const wk     = d => d.toISOString().split("T")[0];
const sDT    = (mon,di,h) => { const d=addD(mon,di); d.setHours(h,0,0,0); return d; };
const hUntil = dt => (dt.getTime()-Date.now())/3600000;
const weeks  = () => { const m=monOf(new Date()); return Array.from({length:4},(_,i)=>addD(m,i*7)); };

const TRAINERS = [
  {email:"thomas@studio.com",name:"Thomas",color:RED,bio:"Founder & lead trainer. Specializes in calisthenics progressions and mobility.",creds:"NASM-CPT, 8 yrs coaching"},
  {email:"arash@studio.com", name:"Arash", color:"#2a6f7f",bio:"Coach focused on strength fundamentals and group class programming.",creds:"CSCS, 5 yrs coaching"},
];
const CLIENTS = [
  {email:"juan@example.com",  name:"Juan dela Cruz", gc:1, oc:0},
  {email:"maria@example.com", name:"Maria Santos",   gc:8, oc:2},
  {email:"pedro@example.com", name:"Pedro Reyes",    gc:0, oc:6},
  {email:"ana@example.com",   name:"Ana Cruz",       gc:0, oc:7},
  {email:"carlo@example.com", name:"Carlo Reyes",    gc:5, oc:0},
];

function seedSchedule() {
  const mon = monOf(new Date()); const w = wk(mon);
  const b = email => ({email,bookedAt:new Date().toISOString()});
  const s = (type,emails=[]) => ({type,blocked:false,bookings:emails.map(b)});
  return {
    [TRAINERS[0].email]:{[w]:{
      0:{7:s("group"),17:s("group")},
      1:{9:s("1on1"),10:s("1on1"),14:s("1on1",["maria@example.com"])},
      2:{7:s("group"),17:s("group")},
      3:{9:s("1on1"),10:s("1on1"),14:s("1on1")},
      4:{7:s("group")},
      5:{9:s("group",["maria@example.com","pedro@example.com"])},
    }},
    [TRAINERS[1].email]:{[w]:{
      0:{8:s("group",["pedro@example.com"])},
      2:{8:s("group")},4:{8:s("group")},
      1:{11:s("1on1",["carlo@example.com"])},3:{11:s("1on1")},
    }},
  };
}

async function load(key,fb){try{const r=await window.storage?.get(key,true);return r?JSON.parse(r.value):fb;}catch{return fb;}}
async function save(key,v){try{await window.storage?.set(key,JSON.stringify(v),true);}catch{}}

const gSlot=(sc,tr,w,di,h)=>sc[tr]?.[w]?.[di]?.[h]||{type:null,blocked:false,bookings:[]};
const sSlot=(sc,tr,w,di,h,upd)=>{
  const s=JSON.parse(JSON.stringify(sc));
  if(!s[tr])s[tr]={};if(!s[tr][w])s[tr][w]={};if(!s[tr][w][di])s[tr][w][di]={};
  const cur=s[tr][w][di][h]||{type:null,blocked:false,bookings:[]};
  s[tr][w][di][h]=typeof upd==="function"?upd(cur):upd;
  return s;
};

const btn  = extra=>({border:"none",cursor:"pointer",fontFamily:"inherit",...extra});
const inp  = ()=>({width:"100%",padding:"11px 14px",background:CARD,border:`1px solid ${BORDER}`,borderRadius:8,color:TEXT,fontSize:14,outline:"none",fontFamily:"inherit"});
const inpS = ()=>({width:"100%",padding:"8px 10px",background:BG,border:`1px solid ${BORDER}`,borderRadius:6,color:TEXT,fontSize:12,outline:"none",fontFamily:"inherit"});
const card = ()=>({background:CARD,border:`1px solid ${BORDER}`,borderRadius:12,padding:24,boxShadow:"0 1px 4px rgba(0,0,0,.06)"});
const lbl  = ()=>({fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:.5,color:TEXT3});

export default function App(){
  const [page,setPage]=useState("home");
  const [user,setUser]=useState(null);
  const [role,setRole]=useState(null);
  const [trainers,setTrainers]=useState(TRAINERS);
  const [clients,setClients]=useState(CLIENTS);
  const [scheds,setScheds]=useState({});
  const [loading,setLoading]=useState(true);
  const [toast,setToast]=useState(null);
  const [warn,setWarn]=useState(false);
  const [cd,setCd]=useState(60);
  const lastAct=useRef(Date.now());
  const WKS=weeks();

  useEffect(()=>{
    (async()=>{
      const [t,c,s]=await Promise.all([load("tt_t",TRAINERS),load("tt_c",CLIENTS),load("tt_s",seedSchedule())]);
      setTrainers(t);setClients(c);setScheds(s);setLoading(false);
    })();
  },[]);

  useEffect(()=>{
    if(!user){setWarn(false);return;}
    const mark=()=>{lastAct.current=Date.now();setWarn(false);};
    const evts=["mousedown","keydown","scroll","touchstart"];
    evts.forEach(e=>window.addEventListener(e,mark));
    const id=setInterval(()=>{
      const el=Date.now()-lastAct.current;
      if(el>=INACTIVE_LIMIT){logout();showToast("Logged out due to inactivity.","error");}
      else if(el>=INACTIVE_WARN){setWarn(true);setCd(Math.ceil((INACTIVE_LIMIT-el)/1000));}
    },1000);
    return()=>{evts.forEach(e=>window.removeEventListener(e,mark));clearInterval(id);};
  },[user]);

  const ps={
    trainers:v=>{setTrainers(v);save("tt_t",v);},
    clients:v=>{setClients(v);save("tt_c",v);},
    scheds:v=>{setScheds(v);save("tt_s",v);},
  };
  const showToast=(msg,type="success")=>{setToast({msg,type});setTimeout(()=>setToast(null),2800);};
  const logout=()=>{setUser(null);setRole(null);setPage("home");};

  if(loading)return<div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",background:BG,color:RED,fontFamily:"sans-serif"}}>Loading...</div>;

  return(
    <div style={{minHeight:"100vh",background:BG,color:TEXT,fontFamily:"'Segoe UI',system-ui,sans-serif"}}>
      <style>{`html{scrollbar-gutter:stable}*{box-sizing:border-box}::-webkit-scrollbar{width:6px;height:6px}::-webkit-scrollbar-thumb{background:#ccc;border-radius:3px}@keyframes fi{from{opacity:0;transform:translateX(-50%) translateY(-8px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}@keyframes pu{0%,100%{transform:scale(1)}50%{transform:scale(1.06)}}button,input,select,textarea{font-family:inherit}`}</style>

      {toast&&<div style={{position:"fixed",top:16,left:"50%",transform:"translateX(-50%)",background:toast.type==="error"?"#fee2e2":"#dcfce7",color:toast.type==="error"?"#991b1b":"#166534",padding:"10px 24px",borderRadius:8,zIndex:9999,fontSize:14,fontWeight:600,boxShadow:"0 4px 20px rgba(0,0,0,.12)",border:`1px solid ${toast.type==="error"?"#fca5a5":"#86efac"}`,animation:"fi .2s ease"}}>{toast.msg}</div>}

      {warn&&user&&<div style={{position:"fixed",top:70,left:"50%",transform:"translateX(-50%)",zIndex:9998,background:"#fffbeb",border:"1px solid #f59e0b",borderRadius:10,padding:"14px 22px",display:"flex",alignItems:"center",gap:14,boxShadow:"0 4px 20px rgba(0,0,0,.1)"}}>
        <span style={{fontSize:13,color:"#92400e",fontWeight:600}}>⏱ Logging out in {cd}s due to inactivity.</span>
        <button onClick={()=>{lastAct.current=Date.now();setWarn(false);}} style={btn({background:RED,color:"#fff",fontWeight:700,fontSize:12,padding:"6px 14px",borderRadius:6})}>Stay Logged In</button>
      </div>}

      <Nav page={page} setPage={setPage} user={user} role={role} logout={logout}/>

      {page==="home"     &&<Home     setPage={setPage} user={user} role={role}/>}
      {page==="about"    &&<About/>}
      {page==="trainers" &&<Trainers trainers={trainers}/>}
      {page==="pricing"  &&<Pricing  setPage={setPage}/>}
      {page==="location" &&<Location/>}
      {page==="contact"  &&<Contact/>}
      {page==="login"    &&<Login    trainers={trainers} clients={clients} ps={ps} setUser={setUser} setRole={setRole} setPage={setPage} showToast={showToast}/>}
      {page==="schedule"&&!user&&<LoginPrompt setPage={setPage}/>}
      {page==="schedule"&&user&&role==="trainer"&&<TrainerSchedule user={user} trainers={trainers} clients={clients} WKS={WKS} scheds={scheds} ps={ps} showToast={showToast}/>}
      {page==="schedule"&&user&&role==="client" &&<ClientSchedule  user={user} clients={clients} trainers={trainers} WKS={WKS} scheds={scheds} ps={ps} showToast={showToast}/>}
      <Footer/>
    </div>
  );
}

function Nav({page,setPage,user,role,logout}){
  const links=[["home","Home"],["about","About"],["trainers","Trainers"],["pricing","Pricing"],["location","Location"],["contact","Contact"]];
  const cta=!user?"Log In / Sign Up":role==="trainer"?"My Schedule":"My Sessions";
  const target=!user?"login":"schedule";
  return(
    <div style={{background:CARD,borderBottom:`1px solid ${BORDER}`,position:"sticky",top:0,zIndex:200,boxShadow:"0 1px 3px rgba(0,0,0,.06)"}}>
      <div style={{maxWidth:1100,margin:"0 auto",padding:"0 16px",display:"flex",alignItems:"center",justifyContent:"space-between",height:56}}>
        <div onClick={()=>setPage("home")} style={{cursor:"pointer",fontWeight:900,fontSize:18,letterSpacing:-0.5,color:RED}}>THOMAS<span style={{color:TEXT3,fontWeight:400}}>TRAINING</span></div>
        <div style={{display:"flex",gap:4,alignItems:"center"}}>
          {links.map(([k,l])=><button key={k} onClick={()=>setPage(k)} style={btn({background:"none",color:page===k?RED:TEXT2,fontSize:13,fontWeight:600,padding:"8px 10px",borderBottom:page===k?`2px solid ${RED}`:"2px solid transparent"})}>{l}</button>)}
          <div style={{width:1,height:20,background:BORDER,margin:"0 6px"}}/>
          <button onClick={()=>setPage(target)} style={btn({background:RED,color:"#fff",fontWeight:700,fontSize:13,padding:"8px 16px",borderRadius:6})}>{cta}</button>
          {user&&<button onClick={logout} style={btn({background:"none",border:`1px solid ${BORDER}`,color:TEXT2,fontSize:12,padding:"7px 12px",borderRadius:6})}>Log Out</button>}
        </div>
      </div>
    </div>
  );
}

function Home({setPage,user,role}){
  const cta=!user?"Book a Session":role==="trainer"?"My Schedule":"My Sessions";
  const target=!user?"login":"schedule";
  return(
    <div>
      <div style={{padding:"90px 20px 70px",textAlign:"center",background:`linear-gradient(160deg,#fff5f4 0%,${BG} 60%)`,borderBottom:`1px solid ${BORDER}`}}>
        <div style={{maxWidth:720,margin:"0 auto"}}>
          <h1 style={{fontSize:"clamp(32px,6vw,52px)",fontWeight:900,lineHeight:1.1,marginBottom:18,color:TEXT}}>Train smarter.<br/><span style={{color:RED}}>Move better.</span></h1>
          <p style={{fontSize:17,color:TEXT2,maxWidth:480,margin:"0 auto 32px",lineHeight:1.6}}>Personalized calisthenics coaching and small-group classes with Thomas. Book your session in seconds.</p>
          <div style={{display:"flex",gap:12,justifyContent:"center",flexWrap:"wrap"}}>
            <button onClick={()=>setPage(target)} style={btn({background:RED,color:"#fff",fontWeight:700,fontSize:15,padding:"14px 28px",borderRadius:8})}>{cta}</button>
            <button onClick={()=>setPage("about")} style={btn({background:CARD,border:`1px solid ${BORDER}`,color:TEXT,fontWeight:600,fontSize:15,padding:"14px 28px",borderRadius:8})}>Learn More</button>
          </div>
        </div>
      </div>
      <div style={{maxWidth:1000,margin:"0 auto",padding:"60px 20px",display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(240px,1fr))",gap:24}}>
        {[["🤸","Calisthenics Focus","Bodyweight progressions built around mobility, strength, and control."],["👥","Group & 1-on-1","Mix small-group energy with personalized one-on-one coaching."],["📅","Easy Booking","See real-time availability and book your week in a few taps."]].map(([icon,t,d])=>(
          <div key={t} style={card()}><div style={{fontSize:32,marginBottom:12}}>{icon}</div><h3 style={{fontSize:16,fontWeight:700,marginBottom:8,color:TEXT}}>{t}</h3><p style={{fontSize:13,color:TEXT2,lineHeight:1.6}}>{d}</p></div>
        ))}
      </div>
    </div>
  );
}

function About(){return<div style={{maxWidth:720,margin:"0 auto",padding:"60px 20px"}}><h1 style={{fontSize:30,fontWeight:900,marginBottom:24,color:TEXT}}>About</h1><p style={{color:TEXT2,lineHeight:1.8,fontSize:15,marginBottom:16}}>This studio is built around one idea: sustainable strength comes from movement quality, not just effort. Thomas works with clients of all levels using progressive programming tailored to where you are right now.</p><p style={{color:TEXT2,lineHeight:1.8,fontSize:15}}>Sessions are kept small so coaching stays personal, whether you're in a group class or a 1-on-1.</p></div>;}

function Trainers({trainers}){
  return(
    <div style={{maxWidth:900,margin:"0 auto",padding:"60px 20px"}}>
      <h1 style={{fontSize:30,fontWeight:900,marginBottom:24,color:TEXT}}>Meet the Trainers</h1>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(260px,1fr))",gap:20}}>
        {trainers.map(t=>(
          <div key={t.email} style={card()}>
            <div style={{width:56,height:56,borderRadius:"50%",background:t.color,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:900,fontSize:22,color:"#fff",marginBottom:14}}>{t.name[0]}</div>
            <h3 style={{fontSize:17,fontWeight:700,marginBottom:4,color:TEXT}}>{t.name}</h3>
            <p style={{fontSize:12,color:RED,fontWeight:600,marginBottom:10}}>{t.creds}</p>
            <p style={{fontSize:13,color:TEXT2,lineHeight:1.6}}>{t.bio}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function Pricing({setPage}){return<div style={{maxWidth:640,margin:"0 auto",padding:"100px 20px",textAlign:"center"}}><div style={{fontSize:40,marginBottom:20}}>🛠️</div><h1 style={{fontSize:26,fontWeight:800,marginBottom:14,color:TEXT}}>Pricing — Coming Soon</h1><p style={{color:TEXT2,fontSize:15,lineHeight:1.7,maxWidth:480,margin:"0 auto 28px"}}>We're finalizing membership plans as the studio transitions. Reach out directly for current pricing and session credits.</p><button onClick={()=>setPage("contact")} style={btn({background:RED,color:"#fff",fontWeight:700,fontSize:14,padding:"12px 24px",borderRadius:8})}>Contact Us</button></div>;}

function Location(){
  return(
    <div style={{maxWidth:720,margin:"0 auto",padding:"60px 20px"}}>
      <h1 style={{fontSize:30,fontWeight:900,marginBottom:24,color:TEXT}}>Location</h1>
      <div style={{...card(),marginBottom:16}}>
        <p style={{fontSize:15,color:TEXT,fontWeight:600,marginBottom:4}}>1221 Pecos St, Unit 140</p>
        <p style={{fontSize:15,color:TEXT,fontWeight:600,marginBottom:8}}>Denver, CO 80204</p>
        <p style={{fontSize:13,color:TEXT2}}>Street parking available nearby.</p>
        <p style={{fontSize:11,color:TEXT3,marginTop:8,fontStyle:"italic"}}>This location may change as the studio transitions to its own space later this year.</p>
      </div>
      <div style={card()}>
        <p style={{fontSize:13,color:TEXT3,fontWeight:700,marginBottom:10}}>Hours</p>
        {DAYS.map(d=><div key={d} style={{display:"flex",justifyContent:"space-between",fontSize:13,padding:"5px 0",borderBottom:`1px solid ${BG}`,color:TEXT2}}><span>{d}</span><span style={{color:TEXT3}}>6:00 AM – 7:00 PM</span></div>)}
      </div>
    </div>
  );
}

function Contact(){
  const [form,setForm]=useState({name:"",email:"",msg:""});
  const [sent,setSent]=useState(false);
  return(
    <div style={{maxWidth:560,margin:"0 auto",padding:"60px 20px"}}>
      <h1 style={{fontSize:30,fontWeight:900,marginBottom:24,color:TEXT}}>Contact</h1>
      {sent?<div style={{background:"#dcfce7",border:"1px solid #86efac",borderRadius:8,padding:20,color:"#166534",fontSize:14}}>Thanks! Thomas will get back to you soon.</div>:<>
        <input placeholder="Your name" value={form.name} onChange={e=>setForm({...form,name:e.target.value})} style={inp()}/>
        <input placeholder="Your email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})} style={{...inp(),marginTop:10}}/>
        <textarea placeholder="Message" rows={5} value={form.msg} onChange={e=>setForm({...form,msg:e.target.value})} style={{...inp(),marginTop:10,resize:"vertical"}}/>
        <button onClick={()=>setSent(true)} style={btn({background:RED,color:"#fff",fontWeight:700,fontSize:14,padding:"12px 24px",borderRadius:8,marginTop:14})}>Send Message</button>
      </>}
      <div style={{marginTop:40,borderTop:`1px solid ${BORDER}`,paddingTop:24,fontSize:13,color:TEXT2,lineHeight:1.8}}>
        <p>📧 thomas_wood_03@hotmail.com</p><p>📞 (703) 232-7367</p>
        <p style={{fontSize:11,color:TEXT3,marginTop:6}}>A dedicated business email is coming soon — for the fastest response, call or text directly.</p>
      </div>
    </div>
  );
}

function Login({trainers,clients,ps,setUser,setRole,setPage,showToast}){
  const [mode,setMode]=useState("login");
  const [email,setEmail]=useState("");
  const [name,setName]=useState("");
  const [err,setErr]=useState("");

  const login=()=>{
    const e=email.trim().toLowerCase();
    const t=trainers.find(x=>x.email.toLowerCase()===e);
    if(t){setUser(t);setRole("trainer");setPage("home");showToast(`Welcome back, ${t.name}!`);return;}
    const c=clients.find(x=>x.email.toLowerCase()===e);
    if(c){setUser(c);setRole("client");setPage("home");showToast(`Welcome back, ${c.name}!`);return;}
    setErr("No account found with that email.");setMode("signup");
  };
  const signup=()=>{
    const e=email.trim().toLowerCase(),n=name.trim();
    if(!e||!n){setErr("Enter your name and email.");return;}
    if(clients.find(c=>c.email===e)||trainers.find(t=>t.email===e)){setErr("Account already exists. Try logging in.");return;}
    const nc={email:e,name:n,gc:0,oc:0};
    ps.clients([...clients,nc]);setUser(nc);setRole("client");setPage("home");showToast(`Welcome, ${n}!`);
  };

  return(
    <div style={{minHeight:"60vh",display:"flex",alignItems:"center",justifyContent:"center",padding:24}}>
      <div style={{width:"100%",maxWidth:380,...card(),padding:32}}>
        <div style={{display:"flex",gap:8,marginBottom:24}}>
          {["login","signup"].map(m=><button key={m} onClick={()=>{setMode(m);setErr("");}} style={btn({flex:1,padding:"9px",background:mode===m?RED:"none",border:`1px solid ${mode===m?RED:BORDER}`,color:mode===m?"#fff":TEXT2,borderRadius:6,fontSize:13,fontWeight:700})}>{m==="login"?"Log In":"Sign Up"}</button>)}
        </div>
        {mode==="signup"&&<input placeholder="Full name" value={name} onChange={e=>setName(e.target.value)} style={{...inp(),marginBottom:10}}/>}
        <input type="email" placeholder="your@email.com" value={email} onChange={e=>setEmail(e.target.value)} onKeyDown={e=>e.key==="Enter"&&(mode==="login"?login():signup())} style={inp()}/>
        {err&&<p style={{color:RED,fontSize:12,marginTop:8}}>{err}</p>}
        <button onClick={mode==="login"?login:signup} style={btn({background:RED,color:"#fff",fontWeight:700,fontSize:14,width:"100%",marginTop:14,padding:13,borderRadius:8})}>{mode==="login"?"Log In":"Create Account"}</button>
        {mode==="login"&&(
          <div style={{marginTop:20,padding:12,background:BG,border:`1px solid ${BORDER}`,borderRadius:8}}>
            <p style={{...lbl(),marginBottom:6}}>Demo Accounts</p>
            {[["Trainer","thomas@studio.com"],["Trainer","arash@studio.com"],["Client","juan@example.com"],["Client","maria@example.com"],["Client","pedro@example.com"],["Client","ana@example.com"],["Client","carlo@example.com"]].map(([l,e])=>(
              <button key={e} onClick={()=>setEmail(e)} style={btn({display:"block",width:"100%",textAlign:"left",background:CARD,border:`1px solid ${BORDER}`,borderRadius:6,color:TEXT2,fontSize:11,padding:"6px 10px",marginTop:4})}><b style={{color:RED}}>{l}:</b> {e}</button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function LoginPrompt({setPage}){return<div style={{minHeight:"40vh",display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:14,padding:24}}><p style={{color:TEXT2,fontSize:14}}>Log in or create an account to view the schedule.</p><button onClick={()=>setPage("login")} style={btn({background:RED,color:"#fff",fontWeight:700,fontSize:13,padding:"10px 20px",borderRadius:6})}>Log In / Sign Up</button></div>;}

function WeekSel({WKS,sel,setSel}){
  return(
    <div style={{display:"flex",gap:8,overflowX:"auto",paddingBottom:4}}>
      {WKS.map((mon,i)=>{const k=wk(mon);const a=k===sel;return(
        <button key={k} onClick={()=>setSel(k)} style={btn({flexShrink:0,padding:"8px 16px",borderRadius:8,background:a?RED:CARD,border:`1px solid ${a?RED:BORDER}`,color:a?"#fff":TEXT2,fontSize:12,fontWeight:600,display:"flex",flexDirection:"column",alignItems:"center",gap:2})}>
          <span>Week {i+1}</span><span style={{fontSize:10,opacity:.8}}>{fmtD(mon)}–{fmtD(addD(mon,5))}</span>
        </button>
      );})}
    </div>
  );
}

// ─── TRAINER SCHEDULE ────────────────────────────────────────────────────────
function TrainerSchedule({user,trainers,clients,WKS,scheds,ps,showToast}){
  const [selWk,setSelWk]=useState(wk(WKS[0]));
  const [selTr,setSelTr]=useState(user.email);
  const [panel,setPanel]=useState(null);
  const [draft,setDraft]=useState(scheds);
  const [dirty,setDirty]=useState(false);
  const [pulsing,setPulsing]=useState(false);
  const [roster,setRoster]=useState(null); // {di, h}
  const [newCN,setNewCN]=useState("");
  const [newCE,setNewCE]=useState("");
  const [qDays,setQDays]=useState([]);
  const [qStart,setQStart]=useState(7);
  const [qEnd,setQEnd]=useState(8);
  const [qType,setQType]=useState("group");
  const [qScope,setQScope]=useState("week");

  const mon=WKS.find(w=>wk(w)===selWk);
  const ownSched=selTr===user.email;
  const display=ownSched?draft:scheds;

  useEffect(()=>{if(!dirty)setDraft(scheds);},[scheds,dirty]);

  const uDraft=(tr,w,di,h,upd)=>{setDraft(sSlot(draft,tr,w,di,h,upd));setDirty(true);};
  const uLive =(tr,w,di,h,upd)=>{const s=sSlot(scheds,tr,w,di,h,upd);ps.scheds(s);setDraft(s);};

  const cycleType=(di,h)=>{
    const slot=gSlot(draft,user.email,selWk,di,h);
    const order=[null,"group","1on1"];
    uDraft(user.email,selWk,di,h,s=>({...s,type:order[(order.indexOf(slot.type)+1)%order.length],blocked:false}));
  };
  const toggleBlock=(di,h)=>{
    const slot=gSlot(draft,user.email,selWk,di,h);
    if(slot.bookings.length>0)showToast(`Heads up: ${slot.bookings.length} client(s) booked here.`,"error");
    uDraft(user.email,selWk,di,h,s=>({...s,blocked:!s.blocked}));
  };
  const removeFromRoster=(di,h,email)=>{
    uLive(selTr,selWk,di,h,s=>({...s,bookings:s.bookings.filter(b=>b.email!==email)}));
    showToast("Booking removed.");
    // refresh roster state
    setRoster(null); setTimeout(()=>setRoster({di,h}),50);
  };
  const addToRoster=(di,h,clientEmail,override)=>{
    const slot=gSlot(scheds,selTr,selWk,di,h);
    if(!override){
      if(slot.type==="group"&&slot.bookings.length>=MAX_GROUP_CAPACITY){showToast("Class is full. Use override to add anyway.","error");return;}
      if(slot.type==="1on1"&&slot.bookings.length>=1){showToast("Slot taken. Use override to add anyway.","error");return;}
    }
    uLive(selTr,selWk,di,h,s=>({...s,bookings:[...s.bookings,{email:clientEmail,bookedAt:new Date().toISOString(),addedByTrainer:true}]}));
    const cl=clients.find(c=>c.email===clientEmail);
    showToast(`${cl?.name} added!`);
    setRoster(null); setTimeout(()=>setRoster({di,h}),50);
  };

  const publish=()=>{ps.scheds(draft);setDirty(false);setPulsing(false);showToast("Schedule published!");};
  const discard=()=>{setDraft(scheds);setDirty(false);showToast("Changes discarded.");};

  const applyQS=()=>{
    if(!qDays.length||qEnd<=qStart)return;
    const targets=qScope==="month"?WKS.map(w=>wk(w)):[selWk];
    let s=JSON.parse(JSON.stringify(draft));let count=0;
    targets.forEach(w=>qDays.forEach(di=>{
      for(let h=qStart;h<qEnd;h++){
        if(!s[user.email])s[user.email]={};
        if(!s[user.email][w])s[user.email][w]={};
        if(!s[user.email][w][di])s[user.email][w][di]={};
        const ex=s[user.email][w][di][h];
        if(!ex||(!ex.type&&!ex.blocked)){s[user.email][w][di][h]={type:qType,blocked:false,bookings:[]};count++;}
      }
    }));
    setDraft(s);setDirty(true);setPanel(null);setPulsing(true);setTimeout(()=>setPulsing(false),2400);
    showToast(`Filled ${count} slot${count===1?"":"s"}. Review and Publish when ready.`);
  };

  const addClient=()=>{
    const e=newCE.trim().toLowerCase(),n=newCN.trim();
    if(!e||!n){showToast("Enter name and email.","error");return;}
    if(clients.find(c=>c.email===e)){showToast("Already exists.","error");return;}
    ps.clients([...clients,{email:e,name:n,gc:0,oc:0}]);
    setNewCN("");setNewCE("");showToast(`${n} added!`);
  };
  const addCredits=(email,type,amount)=>{
    const field=type==="group"?"gc":"oc";
    ps.clients(clients.map(c=>c.email===email?{...c,[field]:(c[field]||0)+amount}:c));
    const cl=clients.find(c=>c.email===email);
    showToast(`Added ${amount} ${type==="group"?"group":"1-on-1"} credit${amount===1?"":"s"} for ${cl?.name}.`);
  };

  const cName=email=>clients.find(c=>c.email===email)?.name||email;

  // Roster modal data
  const rSlot=roster?gSlot(display,selTr,selWk,roster.di,roster.h):null;
  const rBooked=rSlot?rSlot.bookings.map(b=>b.email):[];
  const rAvail=clients.filter(c=>!rBooked.includes(c.email));

  return(
    <div style={{maxWidth:1000,margin:"0 auto",padding:"20px 16px 50px"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16,flexWrap:"wrap",gap:10}}>
        <h1 style={{fontSize:22,fontWeight:800,color:TEXT}}>Trainer Schedule</h1>
        <div style={{display:"flex",gap:8}}>
          {[["⚡ Quick Setup","qs"],["👥 Clients","clients"],["📊 Report","report"]].map(([l,k])=>(
            <button key={k} onClick={()=>setPanel(panel===k?null:k)} style={btn({background:panel===k?BG:CARD,border:`1px solid ${BORDER}`,color:TEXT2,fontSize:12,padding:"7px 12px",borderRadius:6,fontWeight:600})}>{l}</button>
          ))}
        </div>
      </div>

      {ownSched&&dirty&&(
        <div style={{background:"#fffbeb",border:"1px solid #f59e0b",borderRadius:8,padding:"10px 16px",marginBottom:16,display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:10}}>
          <span style={{fontSize:13,color:"#92400e",fontWeight:600}}>⚠️ Unsaved changes — clients can't see these yet.</span>
          <div style={{display:"flex",gap:8}}>
            <button onClick={discard} style={btn({background:"none",border:`1px solid ${BORDER}`,color:TEXT2,fontSize:12,padding:"7px 14px",borderRadius:6,fontWeight:600})}>Discard</button>
            <button onClick={publish} style={btn({background:RED,color:"#fff",fontSize:12,padding:"7px 16px",borderRadius:6,fontWeight:700,animation:pulsing?"pu 0.6s ease 3":"none"})}>Publish Changes</button>
          </div>
        </div>
      )}

      <div style={{display:"flex",gap:0}}>
        <div style={{flex:1,minWidth:0}}>
          <div style={{marginBottom:12}}><WeekSel WKS={WKS} sel={selWk} setSel={setSelWk}/></div>

          {trainers.length>1&&(
            <div style={{marginBottom:14,display:"flex",gap:6,flexWrap:"wrap"}}>
              {trainers.map(t=>(
                <button key={t.email} onClick={()=>setSelTr(t.email)} style={btn({padding:"6px 14px",borderRadius:8,fontSize:12,fontWeight:600,background:selTr===t.email?t.color:CARD,border:`1px solid ${selTr===t.email?t.color:BORDER}`,color:selTr===t.email?"#fff":TEXT2})}>
                  {t.name}{t.email===user.email?" (You)":""}
                </button>
              ))}
            </div>
          )}

          {!ownSched&&<div style={{background:"#fffbeb",border:"1px solid #f59e0b",borderRadius:8,padding:"8px 14px",marginBottom:14,fontSize:12,color:"#92400e"}}>👀 Viewing {trainers.find(t=>t.email===selTr)?.name}'s schedule — read only</div>}
          <p style={{fontSize:12,color:TEXT3,marginBottom:10}}>{ownSched?"Click a cell to cycle types. Use 'Roster' button to manage bookings.":"Read-only view."}</p>

          <div style={{overflowX:"auto"}}>
            <table style={{borderCollapse:"collapse",width:720,tableLayout:"fixed"}}>
              <thead>
                <tr style={{background:BG}}>
                  <th style={{width:75,padding:"8px 6px",color:TEXT3,fontSize:11,textAlign:"left",borderBottom:`2px solid ${BORDER}`}}>Time</th>
                  {DAYS.map((d,i)=>(
                    <th key={d} style={{padding:"8px 4px",color:TEXT2,fontSize:11,fontWeight:700,textAlign:"center",borderBottom:`2px solid ${BORDER}`}}>
                      <div>{d.slice(0,3).toUpperCase()}</div>
                      <div style={{fontSize:10,color:TEXT3,fontWeight:400}}>{fmtD(addD(mon,i))}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {HOURS.map(h=>(
                  <tr key={h} style={{borderBottom:`1px solid ${BG}`}}>
                    <td style={{padding:"3px 6px",color:TEXT3,fontSize:10,fontWeight:600,whiteSpace:"nowrap"}}>{fmtH(h)}</td>
                    {DAYS.map((_,di)=>{
                      const slot=gSlot(display,selTr,selWk,di,h);
                      let bg=CARD,border=BORDER,lc=TEXT3,label="—";
                      if(slot.blocked){bg="#fee2e2";border="#fca5a5";label="Blocked";lc="#991b1b";}
                      else if(slot.type==="group"){bg="#eff6ff";border="#93c5fd";label=`Group ${slot.bookings.length}/${MAX_GROUP_CAPACITY}`;lc="#1e40af";}
                      else if(slot.type==="1on1"){bg="#fefce8";border="#fde047";label=slot.bookings.length?"1-on-1 ✓":"1-on-1";lc="#854d0e";}
                      return(
                        <td key={di} style={{padding:2,textAlign:"center",verticalAlign:"top",width:`${(720-75)/6}px`}}>
                          <div onClick={()=>{if(ownSched)cycleType(di,h);}} style={{background:bg,border:`1px solid ${border}`,borderRadius:6,padding:"4px 2px",height:54,boxSizing:"border-box",cursor:ownSched?"pointer":"default",display:"flex",flexDirection:"column",justifyContent:"center",alignItems:"center",gap:2,overflow:"hidden"}}>
                            <div style={{fontSize:9,color:lc,fontWeight:700}}>{label}</div>
                            <div style={{display:"flex",gap:2}}>
                              {ownSched&&<button onClick={e=>{e.stopPropagation();toggleBlock(di,h);}} style={btn({fontSize:7,background:CARD,border:`1px solid ${BORDER}`,color:TEXT3,borderRadius:3,padding:"1px 3px"})}>{slot.blocked?"Unblock":"Block"}</button>}
                              {slot.type&&<button onClick={e=>{e.stopPropagation();setRoster({di,h});}} style={btn({fontSize:7,background:"#eff6ff",border:"1px solid #93c5fd",color:"#1e40af",borderRadius:3,padding:"1px 3px"})}>Roster</button>}
                            </div>
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{marginTop:14,display:"flex",gap:16,flexWrap:"wrap"}}>
            {[["#93c5fd","Group"],["#fde047","1-on-1"],["#fca5a5","Blocked"],[BORDER,"Unset"]].map(([c,l])=>(
              <div key={l} style={{display:"flex",alignItems:"center",gap:6,fontSize:11,color:TEXT2}}>
                <div style={{width:12,height:12,borderRadius:2,background:c,border:`1px solid ${BORDER}`}}/>{l}
              </div>
            ))}
          </div>
        </div>

        {panel&&(
          <div style={{width:270,flexShrink:0,borderLeft:`1px solid ${BORDER}`,padding:16,marginLeft:16,background:CARD,borderRadius:10,maxHeight:"calc(100vh - 100px)",overflowY:"auto"}}>
            {panel==="qs"&&(
              <>
                <h3 style={{fontSize:13,fontWeight:700,marginBottom:10,color:TEXT}}>Quick Setup</h3>
                <p style={{fontSize:11,color:TEXT3,marginBottom:12,lineHeight:1.5}}>Build your own pattern. Only fills empty slots.</p>
                <p style={{...lbl(),marginBottom:6}}>Days</p>
                <div style={{display:"flex",gap:4,marginBottom:12,flexWrap:"wrap"}}>
                  {["Mon","Tue","Wed","Thu","Fri","Sat"].map((d,i)=>(
                    <button key={d} onClick={()=>setQDays(qDays.includes(i)?qDays.filter(x=>x!==i):[...qDays,i].sort())} style={btn({width:38,padding:"6px 0",borderRadius:6,fontSize:11,fontWeight:700,background:qDays.includes(i)?RED:CARD,border:`1px solid ${qDays.includes(i)?RED:BORDER}`,color:qDays.includes(i)?"#fff":TEXT2})}>{d}</button>
                  ))}
                </div>
                <p style={{...lbl(),marginBottom:6}}>Time Range</p>
                <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:12}}>
                  <select value={qStart} onChange={e=>setQStart(+e.target.value)} style={{flex:1,padding:"6px",background:CARD,border:`1px solid ${BORDER}`,borderRadius:6,color:TEXT,fontSize:11}}>{HOURS.map(h=><option key={h} value={h}>{fmtH(h)}</option>)}</select>
                  <span style={{color:TEXT3,fontSize:12}}>to</span>
                  <select value={qEnd} onChange={e=>setQEnd(+e.target.value)} style={{flex:1,padding:"6px",background:CARD,border:`1px solid ${BORDER}`,borderRadius:6,color:TEXT,fontSize:11}}>{[...HOURS,20].map(h=><option key={h} value={h}>{fmtH(h)}</option>)}</select>
                </div>
                <p style={{...lbl(),marginBottom:6}}>Session Type</p>
                <div style={{display:"flex",gap:6,marginBottom:12}}>
                  {[["group","Group"],["1on1","1-on-1"]].map(([v,l])=>(
                    <button key={v} onClick={()=>setQType(v)} style={btn({flex:1,padding:"8px",borderRadius:6,fontSize:12,fontWeight:700,background:qType===v?(v==="group"?"#eff6ff":"#fefce8"):CARD,border:`1px solid ${qType===v?(v==="group"?"#93c5fd":"#fde047"):BORDER}`,color:qType===v?(v==="group"?"#1e40af":"#854d0e"):TEXT2})}>{l}</button>
                  ))}
                </div>
                <p style={{...lbl(),marginBottom:6}}>Apply To</p>
                <div style={{display:"flex",gap:6,marginBottom:14}}>
                  {[["week","This Week"],["month","All 4 Weeks"]].map(([v,l])=>(
                    <button key={v} onClick={()=>setQScope(v)} style={btn({flex:1,padding:"8px",borderRadius:6,fontSize:11,fontWeight:700,background:qScope===v?BG:CARD,border:`1px solid ${BORDER}`,color:qScope===v?TEXT:TEXT2})}>{l}</button>
                  ))}
                </div>
                <button onClick={applyQS} disabled={!qDays.length||qEnd<=qStart} style={btn({width:"100%",padding:"10px",borderRadius:6,fontSize:13,fontWeight:700,background:qDays.length&&qEnd>qStart?RED:"#e5e5e5",color:qDays.length&&qEnd>qStart?"#fff":TEXT3})}> Apply Rule</button>
              </>
            )}
            {panel==="clients"&&(
              <>
                <h3 style={{fontSize:13,fontWeight:700,marginBottom:12,color:TEXT}}>Manage Clients</h3>
                <input placeholder="Full name" value={newCN} onChange={e=>setNewCN(e.target.value)} style={inpS()}/>
                <input placeholder="Email" value={newCE} onChange={e=>setNewCE(e.target.value)} style={{...inpS(),marginTop:6}}/>
                <button onClick={addClient} style={btn({background:RED,color:"#fff",fontWeight:700,fontSize:12,width:"100%",padding:"9px",borderRadius:6,marginTop:8})}>+ Add Client</button>
                <div style={{marginTop:14,borderTop:`1px solid ${BORDER}`,paddingTop:10}}>
                  {clients.map(c=><CreditRow key={c.email} client={c} onRemove={()=>ps.clients(clients.filter(x=>x.email!==c.email))} onAdd={(type,n)=>addCredits(c.email,type,n)}/>)}
                </div>
              </>
            )}
            {panel==="report"&&(
              <>
                <h3 style={{fontSize:13,fontWeight:700,marginBottom:12,color:TEXT}}>Report (4-week)</h3>
                <p style={{...lbl(),marginBottom:6}}>Sessions Attended</p>
                {clients.map(c=>{
                  let count=0;
                  trainers.forEach(t=>WKS.forEach(w=>DAYS.forEach((_,di)=>HOURS.forEach(h=>{
                    const sl=gSlot(scheds,t.email,wk(w),di,h);
                    if(sl.bookings.some(b=>b.email===c.email&&b.status==="attended"))count++;
                  }))));
                  return<div key={c.email} style={{display:"flex",justifyContent:"space-between",fontSize:12,padding:"5px 0",borderBottom:`1px solid ${BG}`,color:TEXT2}}><span>{c.name}</span><span style={{color:RED,fontWeight:700}}>{count}</span></div>;
                })}
              </>
            )}
          </div>
        )}
      </div>

      {/* ROSTER MODAL */}
      {roster&&rSlot&&(
        <RosterModal
          slot={rSlot}
          di={roster.di}
          h={roster.h}
          mon={mon}
          canEdit={ownSched}
          available={rAvail}
          cName={cName}
          onClose={()=>setRoster(null)}
          onRemove={(email)=>removeFromRoster(roster.di,roster.h,email)}
          onAdd={(email,override)=>addToRoster(roster.di,roster.h,email,override)}
        />
      )}
    </div>
  );
}

function RosterModal({slot,di,h,mon,canEdit,available,cName,onClose,onRemove,onAdd}){
  const [selClient,setSelClient]=useState("");
  const [override,setOverride]=useState(false);
  const isFull=slot.type==="group"?slot.bookings.length>=MAX_GROUP_CAPACITY:slot.bookings.length>=1;

  return(
    <div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(0,0,0,.3)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:999,padding:20}}>
      <div onClick={e=>e.stopPropagation()} style={{...card(),maxWidth:400,width:"100%",padding:24,maxHeight:"80vh",overflowY:"auto"}}>
        <h3 style={{fontSize:15,fontWeight:700,marginBottom:4,color:TEXT}}>{DAYS[di]}, {fmtH(h)}</h3>
        <p style={{fontSize:12,color:TEXT3,marginBottom:14}}>{slot.type==="group"?"Group Class":"1-on-1"} · {slot.bookings.length} booked{slot.type==="group"?` / ${MAX_GROUP_CAPACITY} max`:""}</p>

        {/* Roster */}
        {slot.bookings.length===0&&<p style={{fontSize:12,color:TEXT3,marginBottom:12,fontStyle:"italic"}}>No clients booked yet.</p>}
        {slot.bookings.map(b=>(
          <div key={b.email} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:`1px solid ${BG}`}}>
            <div>
              <div style={{fontSize:13,color:TEXT,fontWeight:500}}>{cName(b.email)}</div>
              {b.addedByTrainer&&<div style={{fontSize:10,color:TEXT3}}>Added by trainer</div>}
              {b.status==="attended"&&<div style={{fontSize:10,color:"#16a34a"}}>✓ Attended</div>}
            </div>
            {canEdit&&<button onClick={()=>onRemove(b.email)} style={btn({background:"none",border:"1px solid #fca5a5",color:"#991b1b",fontSize:11,padding:"3px 8px",borderRadius:4})}>Remove</button>}
          </div>
        ))}

        {/* Add client */}
        {canEdit&&(
          <div style={{marginTop:16,paddingTop:16,borderTop:`1px solid ${BORDER}`}}>
            <p style={{...lbl(),marginBottom:8}}>Add Client to This Session</p>
            {available.length===0
              ? <p style={{fontSize:11,color:TEXT3,fontStyle:"italic"}}>All clients are already in this slot.</p>
              : <>
                  <div style={{display:"flex",gap:6,marginBottom:8}}>
                    <select value={selClient} onChange={e=>setSelClient(e.target.value)} style={{flex:1,padding:"8px",background:BG,border:`1px solid ${BORDER}`,borderRadius:6,color:selClient?TEXT:TEXT3,fontSize:12}}>
                      <option value="">Select a client...</option>
                      {available.map(c=><option key={c.email} value={c.email}>{c.name}</option>)}
                    </select>
                    <button onClick={()=>{if(selClient){onAdd(selClient,override);setSelClient("");setOverride(false);}}} disabled={!selClient} style={btn({padding:"8px 16px",background:selClient?RED:"#e5e5e5",color:selClient?"#fff":TEXT3,fontWeight:700,fontSize:12,borderRadius:6})}>Add</button>
                  </div>
                  {isFull&&(
                    <label style={{display:"flex",alignItems:"center",gap:8,fontSize:11,color:"#92400e",cursor:"pointer"}}>
                      <input type="checkbox" checked={override} onChange={e=>setOverride(e.target.checked)}/>
                      Override capacity limit — class is full, add anyway
                    </label>
                  )}
                </>
            }
          </div>
        )}

        <button onClick={onClose} style={btn({background:"none",border:`1px solid ${BORDER}`,color:TEXT2,marginTop:16,width:"100%",padding:9,fontSize:12,borderRadius:6})}>Close</button>
      </div>
    </div>
  );
}

function CreditRow({client,onRemove,onAdd}){
  const [amt,setAmt]=useState("");
  const [type,setType]=useState("group");
  return(
    <div style={{padding:"10px 0",borderBottom:`1px solid ${BG}`}}>
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
        <div><div style={{fontSize:12,fontWeight:600,color:TEXT}}>{client.name}</div><div style={{fontSize:10,color:TEXT3}}>{client.email}</div></div>
        <button onClick={onRemove} style={btn({background:"none",border:"1px solid #fca5a5",color:"#991b1b",borderRadius:4,fontSize:10,padding:"2px 6px"})}>✕</button>
      </div>
      <div style={{fontSize:11,color:TEXT2,marginBottom:6}}>Group: <b style={{color:"#1e40af"}}>{client.gc||0}</b> &nbsp; 1-on-1: <b style={{color:"#854d0e"}}>{client.oc||0}</b></div>
      <div style={{display:"flex",gap:4}}>
        <select value={type} onChange={e=>setType(e.target.value)} style={{padding:"3px 4px",background:CARD,border:`1px solid ${BORDER}`,borderRadius:4,color:TEXT,fontSize:10}}>
          <option value="group">Group</option><option value="1on1">1-on-1</option>
        </select>
        <input type="number" placeholder="#" value={amt} onChange={e=>setAmt(e.target.value)} style={{width:46,padding:"3px 6px",background:CARD,border:`1px solid ${BORDER}`,borderRadius:4,color:TEXT,fontSize:11}}/>
        <button onClick={()=>{const n=parseInt(amt,10);if(!isNaN(n)){onAdd(type,n);setAmt("");}}} style={btn({background:"#dcfce7",border:"1px solid #86efac",color:"#166534",borderRadius:4,fontSize:11,padding:"3px 8px",fontWeight:700})}>+ Add</button>
      </div>
    </div>
  );
}

// ─── CLIENT SCHEDULE ─────────────────────────────────────────────────────────
function ClientSchedule({user,clients,trainers,WKS,scheds,ps,showToast}){
  const [selWk,setSelWk]=useState(wk(WKS[0]));
  const [selTr,setSelTr]=useState(trainers[0]?.email);
  const [vType,setVType]=useState("group");
  const [pending,setPending]=useState(null);
  const [resched,setResched]=useState(null);

  const mon=WKS.find(w=>wk(w)===selWk);
  const me=clients.find(c=>c.email===user.email)||user;

  const wkCounts=(()=>{
    let g=0,o=0;const bd=new Set();
    trainers.forEach(t=>DAYS.forEach((_,di)=>HOURS.forEach(h=>{
      const sl=gSlot(scheds,t.email,selWk,di,h);
      if(sl.bookings.some(b=>b.email===user.email)){
        if(sl.type==="group")g++;else if(sl.type==="1on1")o++;bd.add(di);
      }
    })));
    return{g,o,bd};
  })();

  const attCounts=(()=>{
    let wkC=0,moC=0;const now=new Date();
    trainers.forEach(t=>WKS.forEach(w=>{
      const k=wk(w);
      DAYS.forEach((_,di)=>HOURS.forEach(h=>{
        const sl=gSlot(scheds,t.email,k,di,h);
        const mine=sl.bookings.find(b=>b.email===user.email&&b.status==="attended");
        if(!mine)return;
        const dt=sDT(w,di,h);
        if(dt.getMonth()===now.getMonth()&&dt.getFullYear()===now.getFullYear())moC++;
        if(k===selWk)wkC++;
      }));
    }));
    return{wk:wkC,mo:moC};
  })();

  const uSlot=(tr,k,di,h,upd)=>ps.scheds(sSlot(scheds,tr,k,di,h,upd));

  const book=(di,h)=>{
    const slot=gSlot(scheds,selTr,selWk,di,h);
    const dt=sDT(mon,di,h);
    if(dt.getTime()<Date.now()){showToast("This session time has already passed.","error");return;}
    if(slot.blocked||!slot.type){showToast("Slot unavailable.","error");return;}
    if(slot.bookings.some(b=>b.email===user.email)){showToast("Already booked here.","error");return;}
    const cf=slot.type==="group"?"gc":"oc";
    if((me[cf]||0)<=0){showToast(`No ${slot.type==="group"?"group":"1-on-1"} credits remaining. Contact your trainer.`,"error");return;}
    if(slot.type==="group"&&wkCounts.g>=MAX_GROUP_PER_WEEK){showToast(`Limit of ${MAX_GROUP_PER_WEEK} group sessions/week reached.`,"error");return;}
    if(slot.type==="1on1"&&wkCounts.o>=MAX_1ON1_PER_WEEK){showToast(`Limit of ${MAX_1ON1_PER_WEEK} 1-on-1s/week reached.`,"error");return;}
    if(wkCounts.bd.has(di)){showToast("Only one session per day.","error");return;}
    if(slot.type==="group"&&slot.bookings.length>=MAX_GROUP_CAPACITY){showToast("Class is full.","error");return;}
    if(slot.type==="1on1"&&slot.bookings.length>=1){showToast("Slot taken.","error");return;}
    setPending({di,h});
  };

  const confirmBook=()=>{
    if(!pending)return;
    const {di,h}=pending;
    const slot=gSlot(scheds,selTr,selWk,di,h);
    const cf=slot.type==="group"?"gc":"oc";
    uSlot(selTr,selWk,di,h,s=>({...s,bookings:[...s.bookings,{email:user.email,bookedAt:new Date().toISOString()}]}));
    ps.clients(clients.map(c=>c.email===user.email?{...c,[cf]:(c[cf]||0)-1}:c));
    showToast("Booked! 💪");setPending(null);
  };

  const cancel=(di,h)=>{
    const slot=gSlot(scheds,selTr,selWk,di,h);
    const myB=slot.bookings.find(b=>b.email===user.email);
    const inGrace=myB&&(Date.now()-new Date(myB.bookedAt).getTime())<GRACE_MS;
    const dt=sDT(mon,di,h);
    if(hUntil(dt)<CANCEL_CUTOFF_HOURS&&!inGrace){showToast(`Cancellations require ${CANCEL_CUTOFF_HOURS}h notice.`,"error");return;}
    const cf=slot.type==="group"?"gc":"oc";
    uSlot(selTr,selWk,di,h,s=>({...s,bookings:s.bookings.filter(b=>b.email!==user.email)}));
    ps.clients(clients.map(c=>c.email===user.email?{...c,[cf]:(c[cf]||0)+1}:c));
    showToast("Cancelled. Credit refunded.");
  };

  const openResched=(di,h)=>{
    const slot=gSlot(scheds,selTr,selWk,di,h);
    const myB=slot.bookings.find(b=>b.email===user.email);
    const inGrace=myB&&(Date.now()-new Date(myB.bookedAt).getTime())<GRACE_MS;
    const dt=sDT(mon,di,h);
    if(hUntil(dt)<CANCEL_CUTOFF_HOURS&&!inGrace){showToast("Rescheduling requires 24h notice.","error");return;}
    setResched({di,h,type:slot.type});
  };

  const confirmResched=(ndi,nh)=>{
    if(!resched)return;
    let s=JSON.parse(JSON.stringify(scheds));
    s=sSlot(s,selTr,selWk,resched.di,resched.h,sl=>({...sl,bookings:sl.bookings.filter(b=>b.email!==user.email)}));
    s=sSlot(s,selTr,selWk,ndi,nh,sl=>({...sl,bookings:[...sl.bookings,{email:user.email,bookedAt:new Date().toISOString()}]}));
    ps.scheds(s);showToast("Rescheduled! 🔄");setResched(null);
  };

  const attend=(di,h)=>{
    uSlot(selTr,selWk,di,h,s=>({...s,bookings:s.bookings.map(b=>b.email===user.email?{...b,status:"attended"}:b)}));
    showToast("Checked in! 💪");
  };

  return(
    <div style={{maxWidth:900,margin:"0 auto",padding:"20px 16px 50px"}}>
      <h1 style={{fontSize:22,fontWeight:800,marginBottom:16,color:TEXT}}>Book a Session</h1>

      {/* Credits */}
      <div style={{...card(),marginBottom:14,display:"flex",gap:32,flexWrap:"wrap"}}>
        <div><p style={{...lbl(),marginBottom:4}}>Group Sessions Available</p><p style={{fontSize:28,fontWeight:900,color:(me.gc||0)>0?RED:"#dc2626"}}>{me.gc||0}</p></div>
        <div><p style={{...lbl(),marginBottom:4}}>1-on-1 Sessions Available</p><p style={{fontSize:28,fontWeight:900,color:(me.oc||0)>0?RED:"#dc2626"}}>{me.oc||0}</p></div>
      </div>

      {/* Attendance */}
      <div style={{background:"#f0fdf4",border:"1px solid #86efac",borderRadius:10,padding:"14px 18px",marginBottom:16,display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8}}>
        <div><p style={{fontSize:11,color:"#166534",fontWeight:700,textTransform:"uppercase",letterSpacing:.5}}>Your Attendance</p><p style={{fontSize:13,color:"#15803d"}}>Keep the streak going 💪</p></div>
        <div style={{display:"flex",gap:24}}>
          {[["This Week",attCounts.wk],["This Month",attCounts.mo]].map(([l,v])=>(
            <div key={l} style={{textAlign:"center"}}><p style={{fontSize:26,fontWeight:900,color:"#16a34a",lineHeight:1}}>{v}</p><p style={{fontSize:10,color:"#166534",fontWeight:700,textTransform:"uppercase",marginTop:2}}>{l}</p></div>
          ))}
        </div>
      </div>

      <div style={{marginBottom:12}}><WeekSel WKS={WKS} sel={selWk} setSel={setSelWk}/></div>

      {trainers.length>1&&(
        <div style={{marginBottom:12,display:"flex",gap:6,flexWrap:"wrap"}}>
          {trainers.map(t=>(
            <button key={t.email} onClick={()=>setSelTr(t.email)} style={btn({padding:"6px 14px",borderRadius:8,fontSize:12,fontWeight:600,background:selTr===t.email?t.color:CARD,border:`1px solid ${selTr===t.email?t.color:BORDER}`,color:selTr===t.email?"#fff":TEXT2})}>{t.name}</button>
          ))}
        </div>
      )}

      <div style={{display:"flex",gap:6,marginBottom:16}}>
        {[["group","Group Classes"],["1on1","1-on-1"]].map(([v,l])=>(
          <button key={v} onClick={()=>setVType(v)} style={btn({padding:"8px 18px",borderRadius:8,fontSize:13,fontWeight:700,background:vType===v?RED:CARD,border:`1px solid ${vType===v?RED:BORDER}`,color:vType===v?"#fff":TEXT2})}>{l}</button>
        ))}
      </div>

      <div style={{overflowX:"auto"}}>
        <table style={{borderCollapse:"collapse",width:720,tableLayout:"fixed"}}>
          <thead>
            <tr style={{background:BG}}>
              <th style={{width:75,padding:"8px 6px",color:TEXT3,fontSize:11,textAlign:"left",borderBottom:`2px solid ${BORDER}`}}>Time</th>
              {DAYS.map((d,i)=>(
                <th key={d} style={{padding:"8px 4px",color:TEXT2,fontSize:11,fontWeight:700,textAlign:"center",borderBottom:`2px solid ${BORDER}`}}>
                  <div>{d.slice(0,3).toUpperCase()}</div>
                  <div style={{fontSize:10,color:TEXT3,fontWeight:400}}>{fmtD(addD(mon,i))}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {HOURS.map(h=>(
              <tr key={h} style={{borderBottom:`1px solid ${BG}`}}>
                <td style={{padding:"3px 6px",color:TEXT3,fontSize:10,fontWeight:600,whiteSpace:"nowrap",width:75}}>{fmtH(h)}</td>
                {DAYS.map((_,di)=>{
                  const slot=gSlot(scheds,selTr,selWk,di,h);
                  const matches=slot.type===vType;
                  const myB=slot.bookings.find(b=>b.email===user.email);
                  const isBooked=!!myB;
                  const attended=isBooked&&myB.status==="attended";
                  const dt=sDT(mon,di,h);
                  const isPast=dt.getTime()<Date.now();
                  const isToday=dt.toDateString()===new Date().toDateString();
                  const inGrace=myB&&(Date.now()-new Date(myB.bookedAt).getTime())<GRACE_MS;
                  const canMod=hUntil(dt)>=CANCEL_CUTOFF_HOURS||inGrace;
                  const isFull=vType==="group"?slot.bookings.length>=MAX_GROUP_CAPACITY:slot.bookings.length>=1;

                  let bg=CARD,border=BORDER,label="",lc=TEXT3;
                  if(attended){bg="#f0fdf4";border="#86efac";label="Attended ✓";lc="#16a34a";}
                  else if(isPast&&isBooked){bg="#f9f9f9";border="#e0e0e0";label="Completed";lc=TEXT3;}
                  else if(isPast){bg="#f9f9f9";border="#e5e5e5";}
                  else if(!matches){bg=BG;border=BORDER;}
                  else if(slot.blocked){bg="#fee2e2";border="#fca5a5";label="Unavailable";lc="#991b1b";}
                  else if(isBooked){bg="#eff6ff";border="#93c5fd";label="Scheduled";lc="#1e40af";}
                  else if(isFull){bg="#fafaf9";border="#d4d4d4";label="Full";lc=TEXT3;}
                  else{bg=CARD;border=BORDER;label=vType==="group"?`${slot.bookings.length}/${MAX_GROUP_CAPACITY} spots`:"Open";lc=TEXT3;}

                  let actions=null;
                  const showActs=matches&&!slot.blocked&&(!isPast||(isToday&&isBooked&&!attended));
                  if(showActs){
                    if(isBooked&&!attended){
                      if(isToday){
                        actions=<button onClick={()=>attend(di,h)} style={btn({background:RED,color:"#fff",borderRadius:4,fontSize:10,padding:"3px 8px",fontWeight:700})}>Attend</button>;
                      } else if(inGrace||!isPast){
                        actions=(
                          <div style={{display:"flex",gap:5,alignItems:"center",justifyContent:"center"}}>
                            <button onClick={()=>openResched(di,h)} disabled={!canMod} style={btn({background:"none",color:canMod?TEXT2:TEXT3,fontSize:8,padding:0,textDecoration:"underline",opacity:canMod?1:.5})}>reschedule</button>
                            <span style={{color:TEXT3,fontSize:8}}>·</span>
                            <button onClick={()=>cancel(di,h)} disabled={!canMod} style={btn({background:"none",color:canMod?TEXT2:TEXT3,fontSize:8,padding:0,textDecoration:"underline",opacity:canMod?1:.5})}>cancel</button>
                          </div>
                        );
                      }
                    } else if(!isBooked&&!isFull&&!isPast){
                      actions=<button onClick={()=>book(di,h)} style={btn({background:"#dcfce7",color:"#166534",border:"1px solid #86efac",borderRadius:4,fontSize:10,padding:"3px 8px",fontWeight:600})}>Book</button>;
                    }
                  }

                  return(
                    <td key={di} style={{padding:2,textAlign:"center",verticalAlign:"top",width:`${(720-75)/6}px`,maxWidth:`${(720-75)/6}px`,overflow:"hidden"}}>
                      <div style={{background:bg,border:`1px solid ${border}`,borderRadius:6,padding:"4px 2px",height:68,width:"100%",boxSizing:"border-box",boxShadow:attended?"inset 0 0 0 1px #86efac":"none",display:"flex",flexDirection:"column",justifyContent:"center",alignItems:"center",gap:3,overflow:"hidden"}}>
                        {matches&&label&&<div style={{fontSize:label==="Scheduled"||attended?11:9,color:lc,fontWeight:label==="Scheduled"||attended?800:600,lineHeight:1}}>{label}</div>}
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

      <div style={{marginTop:12,display:"flex",gap:16,flexWrap:"wrap"}}>
        {[["#86efac","Attended"],["#93c5fd","Scheduled"],["#e5e5e5","Full"],["#fca5a5","Unavailable"],[BORDER,"Open"]].map(([c,l])=>(
          <div key={l} style={{display:"flex",alignItems:"center",gap:6,fontSize:11,color:TEXT2}}><div style={{width:12,height:12,borderRadius:2,background:c,border:`1px solid ${BORDER}`}}/>{l}</div>
        ))}
      </div>
      <p style={{fontSize:11,color:TEXT2,marginTop:8}}>Same-day bookings have a 15-minute grace period to reschedule or cancel.</p>

      {/* Booking confirm */}
      {pending&&(()=>{
        const slot=gSlot(scheds,selTr,selWk,pending.di,pending.h);
        const dt=sDT(mon,pending.di,pending.h);
        const isToday=dt.toDateString()===new Date().toDateString();
        const trName=trainers.find(t=>t.email===selTr)?.name;
        return(
          <div onClick={()=>setPending(null)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,.25)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:999,padding:20}}>
            <div onClick={e=>e.stopPropagation()} style={{...card(),maxWidth:360,width:"100%",padding:24}}>
              <h3 style={{fontSize:16,fontWeight:700,marginBottom:6,color:TEXT}}>Confirm Booking</h3>
              <p style={{fontSize:13,color:TEXT2,marginBottom:4}}>{slot.type==="group"?"Group Class":"1-on-1"} with {trName}</p>
              <p style={{fontSize:14,color:TEXT,fontWeight:600,marginBottom:14}}>{DAYS[pending.di]}, {fmtD(addD(mon,pending.di))} at {fmtH(pending.h)}</p>
              {isToday&&<div style={{background:"#fffbeb",border:"1px solid #f59e0b",borderRadius:6,padding:"8px 12px",marginBottom:14,fontSize:12,color:"#92400e"}}>⚠️ Same-day bookings can only be cancelled within 15 minutes.</div>}
              <div style={{display:"flex",gap:8}}>
                <button onClick={()=>setPending(null)} style={btn({flex:1,padding:11,background:"none",border:`1px solid ${BORDER}`,color:TEXT2,fontSize:13,fontWeight:600,borderRadius:6})}>Cancel</button>
                <button onClick={confirmBook} style={btn({flex:1,padding:11,background:RED,color:"#fff",fontSize:13,fontWeight:700,borderRadius:6})}>Confirm</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Reschedule modal */}
      {resched&&(()=>{
        const opts=[];
        DAYS.forEach((day,di)=>HOURS.forEach(h=>{
          if(di===resched.di&&h===resched.h)return;
          const dt=sDT(mon,di,h);if(dt.getTime()<Date.now())return;
          const sl=gSlot(scheds,selTr,selWk,di,h);
          if(sl.type!==resched.type||sl.blocked)return;
          const full=resched.type==="group"?sl.bookings.length>=MAX_GROUP_CAPACITY:sl.bookings.length>=1;
          if(full)return;
          opts.push({di,h,day,count:sl.bookings.length});
        }));
        return(
          <div onClick={()=>setResched(null)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,.25)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:999,padding:20}}>
            <div onClick={e=>e.stopPropagation()} style={{...card(),maxWidth:380,width:"100%",maxHeight:"80vh",overflowY:"auto",padding:24}}>
              <h3 style={{fontSize:16,fontWeight:700,marginBottom:6,color:TEXT}}>Reschedule To...</h3>
              <p style={{fontSize:12,color:TEXT3,marginBottom:16}}>Moving from {DAYS[resched.di]} {fmtH(resched.h)}.</p>
              {opts.length===0&&<p style={{fontSize:13,color:TEXT2,textAlign:"center",padding:"20px 0"}}>No other open slots this week.</p>}
              {opts.map(o=>(
                <button key={`${o.di}-${o.h}`} onClick={()=>confirmResched(o.di,o.h)} style={btn({display:"block",width:"100%",textAlign:"left",background:BG,border:`1px solid ${BORDER}`,borderRadius:8,padding:"10px 14px",marginBottom:8,color:TEXT,fontSize:13})}>
                  <span style={{fontWeight:700}}>{o.day}</span>, {fmtD(addD(mon,o.di))} at {fmtH(o.h)}
                  {resched.type==="group"&&<span style={{color:TEXT3,marginLeft:8}}>({o.count}/{MAX_GROUP_CAPACITY})</span>}
                </button>
              ))}
              <button onClick={()=>setResched(null)} style={btn({background:"none",border:`1px solid ${BORDER}`,color:TEXT2,marginTop:10,width:"100%",padding:10,fontSize:12,borderRadius:6})}>Cancel</button>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

function Footer(){return<div style={{borderTop:`1px solid ${BORDER}`,padding:"28px 20px",textAlign:"center",color:TEXT3,fontSize:12,background:CARD}}><p>© 2026 Thomas Training · Denver, CO</p></div>;}