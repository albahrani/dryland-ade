// PROTOTYPE (throwaway): "Remaining screens" round. Loaded BEFORE the main inline script; uses its globals lazily.
// Adds: Settings, New Map, New Ticket, Open/Switch Project, Merge/PR flow. In-memory state only.
const S={tab:"general",form:{},pr:{},sim:{conflict:false,dirty:false,unresolved:false},
 prefs:{autoSubmit:false,defaultAgent:"GitHub Copilot",confirmWrites:{"ticket status":true,"ticket create":true,"map index":true,"worktree cleanup":true},channel:"latest",hooks:{"GitHub Copilot":false,"Claude Code":true},trust:{"GitHub Copilot":false},skillState:"default"},
 projects:[{name:"mattpocock-ide",path:"<repo>",tracker:"local-markdown",live:3,next:"Remaining screens",skills:"default"},
  {name:"acme-billing",path:"C:\\work\\acme-billing",tracker:"github",live:1,next:"Invoice export spec",skills:"default"},
  {name:"course-site",path:"C:\\work\\course-site",tracker:"gitlab",live:0,next:"none: no open work",skills:"modified"}],cur:0,stash:{}};
const bx=(s)=>s.replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const fv=(k,d="")=>S.form[k]===undefined?d:S.form[k];
const inp=(k,ph,d="")=>`<input data-f="${k}" value="${bx(fv(k,d))}" placeholder="${bx(ph||"")}" style="width:100%;background:#3c3c3c;color:#ddd;border:1px solid #555;border-radius:3px;padding:4px;font:inherit;user-select:text">`;
const area=(k,ph,rows=3)=>`<textarea data-f="${k}" rows="${rows}" placeholder="${bx(ph||"")}" style="width:100%;resize:vertical">${bx(fv(k))}</textarea>`;
const sel=(k,opts,d)=>`<select data-f="${k}" data-r="1" style="width:100%">${opts.map(o=>`<option ${fv(k,d)===o?"selected":""}>${bx(o)}</option>`).join("")}</select>`;
const fld=(l,h,hint)=>`<div style="margin:8px 0"><div class="dim" style="margin-bottom:2px">${l}</div>${h}${hint?`<div class="dim" style="font-size:11px;margin-top:2px">${hint}</div>`:""}</div>`;
const chk=(on,act,l,hint)=>`<div style="margin:6px 0;cursor:pointer" data-act="${act}"><span style="display:inline-block;width:14px">${on?"&#9745;":"&#9744;"}</span> ${l}${hint?`<div class="dim" style="font-size:11px;margin-left:18px">${hint}</div>`:""}</div>`;
const wrap=(title,body,foot,wide)=>`<h3 style="margin:0 0 6px">${title}</h3>${body}<div style="margin-top:14px;display:flex;gap:8px;justify-content:flex-end;align-items:center">${foot}</div>`;
const cancel=`<button data-closemodal="1">Cancel</button>`;
const curProj=()=>S.projects[S.cur];
const slug=s=>s.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,30)||"untitled";

// ---------- Settings ----------
const STABS=[["general","General"],["agents","Agent CLIs"],["tracker","Tracker"],["skills","Skills"],["writes","Write confirmations"],["updates","Updates"]];
function settingsBody(){const p=S.prefs;let b="";
 if(S.tab==="general")b=`${fld("Default agent CLI",sel("p:defaultAgent",AGENTS,p.defaultAgent))}
  ${chk(p.autoSubmit,"p:autoSubmit","Auto-submit the pre-typed command","Off by default: the command is typed, you press Enter. Per-launch override in the terminal start box.")}
  ${fld("Worktree location",`<code>&lt;repo&gt;\\..\\.ade-worktrees\\&lt;effort&gt;\\&lt;NN&gt;-&lt;slug&gt;</code>`,"Branch is always <code>&lt;effort&gt;/&lt;NN&gt;-&lt;slug&gt;</code>. Read-only in v1.")}`;
 if(S.tab==="agents")b=`<div class="dim" style="margin-bottom:6px">Detected on PATH. Hooks give live status; without them the session shows only idle/ended from the PTY.</div>`+AGENTS.map(a=>{
   const det=a==="GitHub Copilot"||a==="Claude Code",first=a==="GitHub Copilot"||a==="Claude Code",h=p.hooks[a];
   return `<div class="card" style="margin:4px 0"><div style="display:flex;gap:6px;align-items:center"><span class="ic ag">${aSvg(a)}</span><b>${a}</b>${first?'<span class="pill">first-class</span>':'<span class="pill">best-effort</span>'}<span style="margin-left:auto" class="${det?"ok":"no"}">${det?"&#10004; found":"not found"}</span></div>
   ${det?`<div style="margin-top:4px">Status hooks: <span class="${h?"ok":"warn"}">${h?"installed (ADE-owned, env-gated)":"not installed"}</span> <button data-act="p:hook:${a}" style="margin-left:6px">${h?"Remove":"Install"}</button></div>
   ${a==="GitHub Copilot"?`<div style="margin-top:3px">Trusted folders: <span class="${p.trust[a]?"ok":"warn"}">${p.trust[a]?"ADE worktrees trusted":"worktrees not trusted: first launch will prompt"}</span> <button data-act="p:trust:${a}" style="margin-left:6px">${p.trust[a]?"Remove":"Add"}</button></div>`:""}
   <div class="dim" style="font-size:11px;margin-top:3px">${a==="Claude Code"?"Per-launch <code>--settings</code> injection: nothing written to ~/.claude.":"Writes only <code>~/.copilot/hooks/ade.json</code>; unrelated keys never touched."}</div>`:""}</div>`}).join("");
 if(S.tab==="tracker")b=`${fld("Tracker for this project",sel("p:tracker",["local-markdown","github","gitlab"],curProj().tracker),"Read from <code>docs/agents/issue-tracker.md</code>. The ADE never edits that file; to change it run <code>/setup-matt-pocock-skills</code>.")}
  <div class="card" style="margin:4px 0">CLI check: <span class="ok">&#10004; ade</span> &nbsp; <span class="${curProj().tracker==="github"?"ok":"no"}">${curProj().tracker==="github"?"&#10004;":"&middot;"} gh</span> &nbsp; <span class="${curProj().tracker==="gitlab"?"ok":"no"}">${curProj().tracker==="gitlab"?"&#10004;":"&middot;"} glab</span><div class="dim" style="font-size:11px">No tokens stored: auth is whatever <code>gh</code>/<code>glab</code> already has.</div></div>`;
 if(S.tab==="skills")b=`<div class="card" style="margin:4px 0">Fingerprint: <b class="${p.skillState==="default"?"ok":"warn"}">${p.skillState==="default"?"matches upstream default setup":"modified setup detected"}</b><div class="dim" style="font-size:11px">Checked on every startup. Features degrade, never refuse.</div></div>
  ${p.skillState!=="default"?`<div class="why"><b>Compatibility</b><div>Agent-written verdict (last run): <span class="warn">partial</span>. Next-step routing for <code>implement</code> is off; <code>wayfinder</code> and <code>triage</code> on.</div></div>
  <button data-act="p:compat">Run compatibility check (agent)</button> <button data-act="p:skillState:default">Accept as default</button>`:`<div class="dim">Nothing to do.</div>`}
  <div style="margin-top:8px" class="dim">Updating skills from upstream is out of scope: the ADE only reports differences.</div><button style="margin-top:6px" data-act="p:skillState:modified">Prototype: pretend setup is modified</button>`;
 if(S.tab==="writes")b=`<div class="dim" style="margin-bottom:6px">Mechanical metadata writes via <code>ade</code>. Git log is the audit trail. Ticket-started actions never ask.</div>`+Object.keys(p.confirmWrites).map(k=>chk(p.confirmWrites[k],"p:cw:"+k,"Ask before: "+k)).join("");
 if(S.tab==="updates")b=`${fld("Channel",sel("p:channel",["latest","beta"],p.channel),"Unsigned builds from GitHub Releases. macOS: notify only, no auto-install.")}<div class="card" style="margin:4px 0">Current: 0.1.0-prototype &middot; <span class="ok">up to date</span> <button data-act="toast:Check for updates">Check now</button></div>`;
 return `<div style="display:flex;gap:14px;min-height:300px"><div style="width:150px;flex:none">${STABS.map(([k,l])=>`<div class="row ${S.tab===k?"sel":""}" data-act="stab:${k}" style="padding:5px 8px">${l}</div>`).join("")}<hr style="border:0;border-top:1px solid #444"><div class="row" data-act="toast:ade doctor" style="padding:5px 8px"${""}>Run <code>ade doctor</code></div></div><div style="flex:1;min-width:0">${b}</div></div>`}

// ---------- New Map ----------
function newMapBody(){const a=fv("nm:agent",S.prefs.defaultAgent);
 return `<div class="dim">Maps are charted by the <code>/wayfinder</code> skill inside the agent CLI: describe your idea and name the effort there. The only choice here is which agent CLI to use.</div>
 ${fld("Agent CLI",sel("nm:agent",AGENTS,a))}
 <div class="mono" style="background:#101010;padding:6px 8px;border-radius:3px">&#10095; /wayfinder <span class="dim">&lt;you type the idea here&gt;</span></div>
 <div class="dim" style="font-size:11px;margin-top:4px">Opens a temporary worktree and a terminal with <code>/wayfinder</code> pre-typed (not submitted).</div>`}
// ---------- New Ticket ----------
function newTicketBody(){const maps=MAPS.map(m=>m.title),mt=fv("nt:map",maps[0]),m=MAPS.find(x=>x.title===mt)||MAPS[0],type=fv("nt:type","grilling");
 const cands=allT().filter(t=>t.map===m.id).slice(-6);
 return `<div class="dim">Mechanical creation through <code>ade ticket create</code>: writes the file/issue, nothing else. Tickets from to-tickets/wayfinder are better made by the skills; use this for quick one-offs.</div>
 ${fld("Map / effort",sel("nt:map",maps,maps[0]))}
 ${fld("Title",inp("nt:title","short decision or task"))}
 ${fld("Type",sel("nt:type",["grilling","research","prototype","task"],"grilling"),type==="research"?"AFK: agent can run it alone.":"HITL: needs you in the loop.")}
 ${fld("Question",area("nt:q","what must be decided?"))}
 <div class="dim" style="margin-top:8px">Blocked by</div>${cands.map(t=>chk(!!S.form["nt:b:"+t.id],"nt:b:"+t.id,bx(t.title))).join("")}
 <div class="mono" style="background:#101010;padding:6px 8px;border-radius:3px;margin-top:6px;white-space:pre-wrap">ade ticket create --map ${bx(m.title)} --type ${type}${Object.keys(S.form).filter(k=>k.startsWith("nt:b:")&&S.form[k]).length?" --blocked-by "+Object.keys(S.form).filter(k=>k.startsWith("nt:b:")&&S.form[k]).map(k=>k.slice(5)).join(","):""} --title "${bx(fv("nt:title","..."))}"</div>`}
// ---------- Projects ----------
function projectBody(){return `<div class="dim" style="margin-bottom:6px">Single user, local only. Each project keeps its own tabs, sessions and tracker; switching closes nothing, live agents keep running.</div>`+
 S.projects.map((p,i)=>`<div class="card" style="margin:4px 0;cursor:pointer;${i===S.cur?"border-color:#4b6a8a":""}" data-act="projsw:${i}"><div style="display:flex;gap:8px;align-items:center"><span class="av" style="display:inline-flex;width:22px;height:22px;border-radius:6px;background:linear-gradient(135deg,#21d789,#087cfa);align-items:center;justify-content:center;font-size:10px;font-weight:800;color:#fff">${p.name.slice(0,2).toUpperCase()}</span><b>${p.name}</b>${i===S.cur?'<span class="pill">current</span>':""}<span style="margin-left:auto" class="dim">${p.tracker}</span></div>
 <div class="dim" style="font-size:11px">${bx(p.path)}</div><div style="margin-top:3px">${p.live?`<span class="warn">&#9654; ${p.live} live session(s)</span>`:'<span class="dim">no live sessions</span>'} &middot; <span class="star">&#9733;</span> ${bx(p.next)}${p.skills==="modified"?' &middot; <span class="warn">modified skills</span>':""}</div></div>`).join("")+
 `<div style="margin-top:8px"><button data-act="toast:Native folder picker">Browse for repository...</button> <button data-act="toast:git clone via gh/glab">Clone from tracker...</button></div>
 <div class="dim" style="font-size:11px;margin-top:6px">A folder with no <code>docs/agents/issue-tracker.md</code> opens with a banner: run <code>/setup-matt-pocock-skills</code> (pre-typed).</div>`}
// ---------- Merge / PR ----------
function prSection(c){const k=wtKey(c),w=WT[k];if(!w||!w.newWt)return `<div class="grp2"><span>Merge / PR</span></div><div class="dim" style="padding:2px 10px">Main checkout: nothing to merge.</div>`;
 const st=S.pr[k]||"none",gh=curProjTracker()!=="local-markdown",ahead=w.commits.length,dirty=w.files.filter(f=>f[1]).length,t=c&&c.t;
 const noun=curProjTracker()==="gitlab"?"Merge Request":"Pull Request";
 let b="";
 if(st==="merged")b=`<div class="ok">&#10004; Merged into main. Worktree and branch cleaned up.</div>`;
 else if(st==="pr")b=`<div class="ok">&#10004; ${noun} opened</div><div class="dim">${curProjTracker()==="gitlab"?"!":"#"}42 &middot; waiting for review/CI</div><button data-act="toast:Would open the ${noun} in the browser" style="margin-top:4px">Open in browser</button> <button data-act="mergeopen">Merge...</button>`;
 else b=`<div>${ahead} commit(s) ahead of main${dirty?`, <span class="warn">${dirty} uncommitted</span>`:""}</div>
  ${t&&t.status!=="resolved"?`<div class="warn" style="font-size:11px">Ticket not resolved yet: no Answer recorded.</div>`:""}
  <div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap">${gh?`<button class="pri" data-act="mergeopen:pr">Create ${noun}...</button>`:""}<button ${gh?"":'class="pri"'} data-act="mergeopen">Merge into main...</button></div>`;
 return `<div class="grp2"><span>Merge / PR</span><span class="dim">${gh?curProjTracker():"local"}</span></div><div style="padding:6px 10px">${b}</div>`}
const curProjTracker=()=>tracker;
function mergeBody(pr){const c=ctx(),k=wtKey(c),w=WT[k],t=c&&c.t,dirty=w.files.filter(f=>f[1]).length,noun=tracker==="gitlab"?"Merge Request":"Pull Request";
 const checks=[[!dirty&&!S.sim.dirty,"Working tree clean"+(dirty?` (${dirty} uncommitted)`:""),"Commit or stash first; the ADE never commits code for you."],[!S.sim.unresolved&&(!t||t.status==="resolved"||true),t?`Ticket <i>${bx(t.title)}</i> has an Answer`:"No linked ticket (unlinked branch)","Hint only: not blocking."],[!S.sim.conflict,S.sim.conflict?"Conflicts with main in 2 files":"No conflicts with main (dry run)","Dry run: <code>git merge-tree</code>"]];
 const blocked=!checks[0][0]||S.sim.conflict;
 let b=`<div class="dim">Branch <code>${bx(w.branch)}</code> &rarr; <code>main</code></div><div style="margin:8px 0">${checks.map(([ok,l,h])=>`<div class="${ok?"ok":"bad"}">${ok?"&#10004;":"&#10008;"} ${l}</div>`).join("")}</div>`;
 if(pr)b+=`${fld(noun+" title",inp("pr:title",w.branch,t?t.title:w.branch))}${fld("Body",area("pr:body","(empty: let the agent write it)",3),`<button data-act="prskill">Let agent write it with /pr (pre-typed)</button>`)}${chk(true,"noop","Push branch with <code>"+(tracker==="gitlab"?"glab":"gh")+"</code>")}`;
 else b+=`${fld("Strategy",sel("mg:strat",["merge commit (--no-ff)","squash","rebase + fast-forward"],"merge commit (--no-ff)"))}${chk(fv("mg:clean","1")==="1","mg:clean","Remove worktree and branch after merge",S.prefs.confirmWrites["worktree cleanup"]?"Asks once more because the worktree may hold a live agent.":"")}
  ${tracker!=="local-markdown"?chk(false,"noop","Also push main"):""}`;
 if(S.sim.conflict)b+=`<div class="why" style="border-color:#f48771;background:#2b1f1f"><b>Conflicts</b><div class="mono">.scratch/.../map.md<br>issues/11-views-and-ux.md</div><div class="dim">The ADE does not resolve conflicts.</div><button data-act="conflictask">Ask agent to resolve (pre-typed)</button></div>`;
 b+=`<div style="margin-top:8px"><span class="dim" style="font-size:11px">Prototype:</span> <button data-act="sim:conflict">${S.sim.conflict?"clear":"simulate"} conflict</button> <button data-act="sim:dirty">${S.sim.dirty?"clear":"simulate"} dirty tree</button></div>`;
 return [b,`${cancel}<button class="pri" ${blocked?"disabled":""} data-act="${pr?"prgo":"mergego"}">${pr?"Push &amp; create "+noun:"Merge"}</button>`]}

// ---------- hooks into the main script ----------
function modalHtml(){let t,b,f="";
 if(modal==="about")return `<div class="m2"><h3 style='margin:0 0 6px'>ADE (working name)</h3><div class='dim'>Agent development environment for Matt Pocock skills.<br>Prototype build &mdash; throwaway.</div><div style="margin-top:12px;text-align:right"><button data-closemodal="1">Close</button></div></div>`;
 const cfg={settings:["Settings",settingsBody,`<button class="pri" data-closemodal="1">Done</button>`,640],newmap:["New map",newMapBody,`${cancel}<button class="pri" data-act="nmgo">&#9654; Open agent</button>`,460],
  newticket:["New ticket",newTicketBody,`${cancel}<button class="pri" data-act="ntgo" ${fv("nt:title")?"":"disabled"}>Create ticket</button>`,480],project:["Projects",projectBody,`<button data-closemodal="1">Close</button>`,480]}[modal];
 if(modal==="merge"||modal==="pr"){const [bb,ff]=mergeBody(modal==="pr");return `<div class="m2" style="width:480px">${wrap(modal==="pr"?"Create "+(tracker==="gitlab"?"Merge Request":"Pull Request"):"Merge into main",bb,ff)}</div>`}
 if(modal==="confirm")return `<div class="m2" style="width:420px">${wrap("Confirm write",`<div>${S.confirm.text}</div><div class="mono dim" style="margin-top:6px">${S.confirm.cmd}</div>${chk(false,"dontask","Don't ask again for "+S.confirm.kind)}`,`${cancel}<button class="pri" data-act="confirmgo">Confirm</button>`)}</div>`;
 if(!cfg)return "";return `<div class="m2" style="width:${cfg[3]}px;max-width:92vw">${wrap(cfg[0],cfg[1](),cfg[2])}</div>`}
function askConfirm(kind,text,cmd,then){if(S.prefs.confirmWrites[kind]===false){then();return}S.confirm={kind,text,cmd,then};modal="confirm"}
function screenAction(a){const p=S.prefs;
 const map={"toast:New map":()=>modal="newmap","toast:New ticket":()=>modal="newticket","toast:Open repo":()=>modal="project","toast:Recent":()=>modal="project","toast:Switch project (stub)":()=>modal="project",
  "toast:Push":()=>{const c=ctx();if(c&&WT[wtKey(c)].newWt)modal="pr";else msg="Main checkout: push not offered here"},"settings":()=>{modal="settings"}};
 if(map[a]){map[a]();return true}
 if(a.startsWith("stab:")){S.tab=a.slice(5);return true}
 if(a==="p:autoSubmit"){p.autoSubmit=!p.autoSubmit;return true}
 if(a.startsWith("p:hook:")){const k=a.slice(7);p.hooks[k]=!p.hooks[k];msg=(p.hooks[k]?"Installed":"Removed")+" hooks for "+k;return true}
 if(a.startsWith("p:trust:")){const k=a.slice(8);p.trust[k]=!p.trust[k];return true}
 if(a.startsWith("p:cw:")){const k=a.slice(5);p.confirmWrites[k]=!p.confirmWrites[k];return true}
 if(a.startsWith("p:skillState:")){p.skillState=a.slice(13);return true}
 if(a==="p:compat"){msg="Compat check: pre-typed in a new agent session";modal=null;return true}
 if(a==="nmgo"){agentSel=fv("nm:agent",agentSel);modal=null;
  const id="n"+(SESS.length+1),now=new Date().toTimeString().slice(0,8),br="new-map-"+id;
  SESS.push({id,name:"New map ("+agentSel+")",agent:agentSel,model:"",ticket:null,map:null,state:"idle",started:now,last:now,events:1,log:[["t","worktree created: "+br]],typed:"/wayfinder ",ev:[[now,"session.start",agentSel+" in new worktree"]]});
  WT[id]={branch:br,files:REAL.files.map(f=>[f[0],"",0]),commits:[REAL.commits[0]],newWt:true};openTab("session",id);S.form={};msg="Agent opened, /wayfinder pre-typed";return true}
 if(a.startsWith("nt:b:")){S.form[a]=!S.form[a];return true}
 if(a==="ntgo"){const f=S.form,m=MAPS.find(x=>x.title===(f["nt:map"]||MAPS[0].title));
  askConfirm("ticket create","Create ticket <b>"+bx(f["nt:title"])+"</b> in "+bx(m.title)+"?","ade ticket create ...",()=>{const id="u"+(allT().length+1);T.push({id,map:m.id,title:f["nt:title"],type:f["nt:type"]||"grilling",status:"open",blocked:Object.keys(f).filter(k=>k.startsWith("nt:b:")&&f[k]).map(k=>k.slice(5)),gist:f["nt:q"]||"",sim:false});openTab("ticket",id);msg="Ticket created";S.form={}});
  if(modal!=="confirm"){modal=null}return true}
 if(a==="confirmgo"){if(S.confirm.dontask)S.prefs.confirmWrites[S.confirm.kind]=false;const th=S.confirm.then;modal=null;th();return true}
 if(a==="dontask"){S.confirm.dontask=!S.confirm.dontask;return true}
 if(a.startsWith("projsw:")){const i=+a.slice(7);if(i!==S.cur){S.stash[S.cur]={tabs,act};const ns=S.stash[i];tabs=ns?ns.tabs:[];act=ns?ns.act:0;S.cur=i;REPO=S.projects[i].name;tracker=S.projects[i].tracker;S.prefs.skillState=S.projects[i].skills;msg="Switched to "+REPO+" ("+S.projects[i].live+" live sessions kept running)"}modal=null;return true}
 if(a==="mergeopen"||a==="mergeopen:pr"){modal=a==="mergeopen"?"merge":"pr";return true}
 if(a==="sim:conflict"){S.sim.conflict=!S.sim.conflict;return true}
 if(a==="sim:dirty"){S.sim.dirty=!S.sim.dirty;return true}
 if(a==="mg:clean"){S.form["mg:clean"]=fv("mg:clean","1")==="1"?"0":"1";return true}
 if(a==="noop")return true;
 if(a==="prskill"||a==="conflictask"){const c=ctx(),s=c&&c.s;if(s){s.typed=a==="prskill"?"/pr":"Resolve the merge conflicts with main, then stop.";msg="Command pre-typed in the session terminal"}modal=null;return true}
 if(a==="prgo"){const k=wtKey(ctx());askConfirm("ticket status","Push <b>"+bx(WT[k].branch)+"</b> and open a "+(tracker==="gitlab"?"merge request":"pull request")+"?",(tracker==="gitlab"?"glab mr create":"gh pr create")+" --title ...",()=>{S.pr[k]="pr";msg="PR opened"});if(modal!=="confirm"){modal=null}return true}
 if(a==="mergego"){const k=wtKey(ctx()),clean=fv("mg:clean","1")==="1";askConfirm("worktree cleanup","Merge <b>"+bx(WT[k].branch)+"</b> into main"+(clean?" and remove its worktree":"")+"?","git merge --no-ff "+WT[k].branch,()=>{S.pr[k]="merged";msg="Merged into main"});if(modal!=="confirm"){modal=null}return true}
 return false}
document.addEventListener("input",e=>{const k=e.target.dataset&&e.target.dataset.f;if(k)S.form[k]=e.target.value});
document.addEventListener("change",e=>{const k=e.target.dataset&&e.target.dataset.f;if(!k)return;S.form[k]=e.target.value;
 if(k.startsWith("p:")){const n=k.slice(2);if(n==="defaultAgent")S.prefs.defaultAgent=agentSel=e.target.value;else if(n==="channel")S.prefs.channel=e.target.value;else if(n==="tracker"){tracker=e.target.value;curProj().tracker=tracker}}
 if(e.target.dataset.r)render()});

