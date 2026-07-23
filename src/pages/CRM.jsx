import { useEffect, useMemo, useState } from "react";
import { supabase } from "../services/supabase.js";
import { canAccess } from "../services/permissions.js";
import { emitEvent } from "../services/events.js";

const PIPELINE = [
  ["Suspect ciblé", "#64748b", 5, "🎯"],
  ["Prospect contacté — sans réponse", "#0ea5e9", 10, "📞"],
  ["Prospect contacté — réponse reçue", "#0284c7", 20, "✅"],
  ["À recontacter", "#f59e0b", 25, "🔄"],
  ["RDV 1 planifié", "#eab308", 35, "📅"],
  ["RDV 1 réalisé", "#d97706", 45, "🤝"],
  ["RDV 2 planifié", "#f97316", 55, "📅"],
  ["RDV 2 réalisé", "#ea580c", 65, "🤝"],
  ["Devis à préparer", "#8b5cf6", 70, "📝"],
  ["Devis envoyé", "#7c3aed", 75, "📄"],
  ["Devis en discussion", "#db2777", 85, "💬"],
  ["Devis validé", "#16a34a", 100, "✅"],
].map(([name, color, probability, icon]) => ({ name, color, probability, icon }));

const emptyContact = {
  company_name: "", contact_name: "", email: "", phone: "", city: "",
  contact_type: "prospect", assigned_to: "", sector: "", lead_source: "", notes: "",
};

const emptyOpportunity = {
  contact_id: "", title: "", stage_id: "", assigned_to: "", estimated_amount: "",
  margin_percent: "", probability_percent: "", expected_signature_month: "",
  product_family: "", sector: "", lead_source: "", competitor: "", priority: "normal", notes: "",
};

export default function CRM({ user, permissions }) {
  const [contacts, setContacts] = useState([]);
  const [opportunities, setOpportunities] = useState([]);
  const [stages, setStages] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [projects, setProjects] = useState([]);
  const [interactions, setInteractions] = useState([]);
  const [view, setView] = useState("temperature");
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const [contactForm, setContactForm] = useState(emptyContact);
  const [oppForm, setOppForm] = useState(emptyOpportunity);
  const [showOppForm, setShowOppForm] = useState(false);
  const [selectedOpportunity, setSelectedOpportunity] = useState(null);
  const [draggedId, setDraggedId] = useState(null);

  useEffect(() => { loadData(); }, []);

  function can(action) { return canAccess(user, permissions, "crm", action); }
  function money(value) { return `${Number(value || 0).toLocaleString("fr-FR", { maximumFractionDigits: 0 })} €`; }
  function today() { return new Date().toISOString().slice(0, 10); }
  function employeeName(id) { return employees.find((e) => e.id === id)?.name || "-"; }
  function stageName(id) { return stages.find((s) => s.id === id)?.name || "Sans étape"; }
  function contactFor(opp) { return contacts.find((c) => c.id === opp.contact_id) || {}; }
  function projectFor(opp) { return projects.find((p) => p.id === opp.project_id || p.crm_opportunity_id === opp.id) || null; }
  function oppInteractions(id) { return interactions.filter((i) => i.opportunity_id === id); }

  async function loadData() {
    const [c, o, s, e, p, i] = await Promise.all([
      supabase.from("crm_contacts").select("*").order("company_name"),
      supabase.from("crm_opportunities").select("*").order("created_at", { ascending: false }),
      supabase.from("crm_pipeline_stages").select("*").eq("active", true).order("stage_order"),
      supabase.from("employees").select("*").eq("active", true).order("name"),
      supabase.from("projects").select("*").eq("active", true).order("created_at", { ascending: false }),
      supabase.from("crm_interactions").select("*").order("created_at", { ascending: false }),
    ]);
    const error = c.error || o.error || s.error || e.error || p.error || i.error;
    if (error) { setMessage(`Base CRM : ${error.message}. Exécute la migration 20260723_create_crm_opportunities.sql si nécessaire.`); return; }
    setContacts(c.data || []); setOpportunities(o.data || []); setStages(s.data || []);
    setEmployees(e.data || []); setProjects(p.data || []); setInteractions(i.data || []);
  }

  const firstStage = useMemo(() => [...stages].filter((s) => !String(s.name).toLowerCase().includes("perdu")).sort((a,b) => Number(a.stage_order)-Number(b.stage_order))[0], [stages]);

  function lifecycle(opp) {
    const p = projectFor(opp);
    if (p?.status === "ready") return "completed";
    if (p?.status === "in_production") return "production";
    if (p && ["validated", "planned"].includes(p.status)) return "validated";
    if (opp.status === "lost") return "lost";
    if (opp.status === "won") return "validated";
    return "open";
  }

  function score(opp) {
    let value = Number(opp.probability_percent || 0);
    if (Number(opp.estimated_amount || 0) >= 50000) value += 8;
    if (Number(opp.estimated_amount || 0) >= 100000) value += 5;
    if (oppInteractions(opp.id).some((x) => x.interaction_type === "rdv")) value += 8;
    if (oppInteractions(opp.id).some((x) => x.interaction_type === "devis")) value += 10;
    return Math.max(0, Math.min(100, Math.round(value)));
  }
  function temperature(opp) { const s = score(opp); return s >= 70 ? "hot" : s >= 40 ? "warm" : "cold"; }
  function tempLabel(t) { return t === "hot" ? "🔥 Chaud" : t === "warm" ? "🟠 Tiède" : "🔵 Froid"; }

  const visibleOpps = useMemo(() => {
    const q = search.trim().toLowerCase();
    return opportunities.filter((opp) => {
      const c = contactFor(opp);
      return !q || [opp.title, c.company_name, c.contact_name, c.city, opp.product_family, opp.dossier_code]
        .filter(Boolean).some((v) => String(v).toLowerCase().includes(q));
    });
  }, [opportunities, contacts, search]);

  const pool = useMemo(() => {
    const q = search.trim().toLowerCase();
    return contacts.filter((c) => !q || [c.company_name, c.contact_name, c.city, c.email, c.phone]
      .filter(Boolean).some((v) => String(v).toLowerCase().includes(q)));
  }, [contacts, search]);

  async function createContact(e) {
    e.preventDefault();
    if (!can("can_create") || !contactForm.company_name.trim()) return;
    const { error } = await supabase.from("crm_contacts").insert({
      ...contactForm,
      company_name: contactForm.company_name.trim(),
      assigned_to: contactForm.assigned_to || null,
      status: "contact_only",
      stage_id: null,
      probability_percent: null,
      estimated_amount: 0,
    });
    if (error) return setMessage(error.message);
    setContactForm(emptyContact); setMessage("Prospect ajouté au vivier."); await loadData();
  }

  function openCreateOpportunity(contact = null, defaults = {}) {
    setOppForm({
      ...emptyOpportunity,
      contact_id: contact?.id || "",
      assigned_to: contact?.assigned_to || "",
      sector: contact?.sector || "",
      lead_source: contact?.lead_source || "",
      stage_id: defaults.stage_id || firstStage?.id || "",
      probability_percent: defaults.probability_percent ?? firstStage?.default_probability_percent ?? 5,
      title: defaults.title || "",
    });
    setShowOppForm(true);
  }

  async function createOpportunity(e) {
    e.preventDefault();
    if (!can("can_create") || !oppForm.contact_id || !oppForm.title.trim()) return setMessage("Choisis un prospect et donne un nom au projet potentiel.");
    const { data, error } = await supabase.from("crm_opportunities").insert({
      ...oppForm,
      title: oppForm.title.trim(), stage_id: oppForm.stage_id || firstStage?.id || null,
      assigned_to: oppForm.assigned_to || null,
      estimated_amount: Number(oppForm.estimated_amount || 0),
      margin_percent: oppForm.margin_percent ? Number(oppForm.margin_percent) : null,
      probability_percent: oppForm.probability_percent === "" ? Number(firstStage?.default_probability_percent || 5) : Number(oppForm.probability_percent),
      expected_signature_month: oppForm.expected_signature_month || null,
      created_by: user?.id || null,
    }).select().single();
    if (error) return setMessage(error.message);
    await supabase.from("crm_interactions").insert({
      contact_id: oppForm.contact_id, opportunity_id: data.id, interaction_type: "note",
      subject: "Opportunité créée", notes: `Projet potentiel : ${data.title}`, created_by: user?.id || null,
    });
    setShowOppForm(false); setOppForm(emptyOpportunity); setMessage("Opportunité créée dans le pipeline."); await loadData();
  }

  async function moveOpportunity(id, stageId) {
    if (!can("can_edit")) return;
    const stage = stages.find((s) => s.id === stageId);
    const def = PIPELINE.find((x) => x.name === stage?.name);
    const patch = { stage_id: stageId, probability_percent: Number(def?.probability ?? stage?.default_probability_percent ?? 0), updated_at: new Date().toISOString() };
    const { error } = await supabase.from("crm_opportunities").update(patch).eq("id", id);
    if (error) return setMessage(error.message);
    await loadData();
  }

  async function markLost(opp) {
    const reason = window.prompt("Motif de perte (facultatif) ?", opp.lost_reason || "");
    if (reason === null) return;
    const { error } = await supabase.from("crm_opportunities").update({ status: "lost", lost_reason: reason || null, lost_at: new Date().toISOString(), probability_percent: 0 }).eq("id", opp.id);
    if (error) return setMessage(error.message);
    setMessage("Opportunité classée perdue. Le prospect reste dans le vivier."); await loadData();
  }

  async function removeOpportunity(opp) {
    if (!window.confirm(`Supprimer uniquement l'opportunité « ${opp.title} » ? Le prospect sera conservé.`)) return;
    const { error } = await supabase.from("crm_opportunities").delete().eq("id", opp.id);
    if (error) return setMessage(error.message);
    setMessage("Opportunité supprimée. Le prospect est conservé."); await loadData();
  }

  function projectCode(opp) {
    const c = contactFor(opp); const base = String(c.city || c.company_name || "PROJ").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]/g, "").slice(0,4).toUpperCase();
    return `${base || "PROJ"}-${new Date().getFullYear()}-${String(Date.now()).slice(-4)}`;
  }

  async function validateOpportunity(opp) {
    if (projectFor(opp)) return setMessage("Cette opportunité possède déjà un projet.");
    const c = contactFor(opp);
    const signedDate = window.prompt("Date de signature (AAAA-MM-JJ) ?", today());
    if (signedDate === null) return;
    const { data: project, error } = await supabase.from("projects").insert({
      project_code: projectCode(opp), dossier_code: opp.dossier_code || `DOS-${new Date().getFullYear()}-${String(Date.now()).slice(-5)}`,
      name: opp.title, client_name: c.company_name || "Client", crm_contact_id: c.id,
      crm_opportunity_id: opp.id, description: opp.notes || null, active: true, status: "validated",
      signed_date: signedDate || null, estimated_hours: 0, progress_percent: 0,
      project_color: "#2563eb", sale_amount: Number(opp.estimated_amount || 0),
      expected_signature_month: opp.expected_signature_month || null,
    }).select().single();
    if (error) return setMessage(error.message);
    await supabase.from("crm_opportunities").update({ status: "won", project_id: project.id, probability_percent: 100, won_at: new Date().toISOString() }).eq("id", opp.id);
    await emitEvent({ event_type: "PROJECT_CREATED_FROM_CRM", entity_type: "project", entity_id: project.id, title: `Projet créé depuis opportunité : ${project.name}`, payload: { crm_contact_id: c.id, crm_opportunity_id: opp.id }, user });
    setMessage("Opportunité validée et transformée en projet."); await loadData();
  }

  async function changeProduction(opp, status) {
    const p = projectFor(opp); if (!p) return;
    const patch = { status };
    if (status === "in_production") patch.production_start_date = today();
    if (status === "ready") patch.production_end_date = today();
    const { error } = await supabase.from("projects").update(patch).eq("id", p.id);
    if (error) return setMessage(error.message);
    await loadData();
  }

  async function addInteraction(e) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const opp = selectedOpportunity; if (!opp) return;
    const { error } = await supabase.from("crm_interactions").insert({
      contact_id: opp.contact_id, opportunity_id: opp.id,
      interaction_type: form.get("type") || "note", subject: form.get("subject") || null,
      notes: form.get("notes") || null, next_action: form.get("next_action") || null,
      next_action_date: form.get("next_action_date") || null, created_by: user?.id || null,
    });
    if (error) return setMessage(error.message);
    e.currentTarget.reset(); await loadData();
  }

  function opportunityCard(opp) {
    const c = contactFor(opp); const t = temperature(opp); const p = projectFor(opp);
    return <article key={opp.id} className="crm-opportunity-card" draggable onDragStart={() => setDraggedId(opp.id)} onClick={() => setSelectedOpportunity(opp)}>
      <div className="crm-opportunity-card-head"><strong>{opp.title}</strong><span className={`crm-temperature-badge ${t}`}>{tempLabel(t)}</span></div>
      <small>{c.company_name || "Prospect inconnu"}{c.city ? ` · ${c.city}` : ""}</small>
      <div className="crm-opportunity-money"><strong>{money(opp.estimated_amount)}</strong><span>{Number(opp.probability_percent || 0)} %</span></div>
      <small>{employeeName(opp.assigned_to)} · {stageName(opp.stage_id)}</small>
      {p ? <small>Projet : {p.project_code || p.name}</small> : null}
      <div className="crm-card-actions">
        {lifecycle(opp) === "open" ? <button className="btn small primary" onClick={(e) => {e.stopPropagation(); validateOpportunity(opp);}}>Valider</button> : null}
        {lifecycle(opp) === "validated" ? <button className="btn small primary" onClick={(e) => {e.stopPropagation(); changeProduction(opp,"in_production");}}>Production</button> : null}
        {lifecycle(opp) === "production" ? <button className="btn small primary" onClick={(e) => {e.stopPropagation(); changeProduction(opp,"ready");}}>Clôturer</button> : null}
        {lifecycle(opp) === "open" ? <button className="btn small" onClick={(e) => {e.stopPropagation(); markLost(opp);}}>Perdu</button> : null}
        <button className="btn small danger-soft" onClick={(e) => {e.stopPropagation(); removeOpportunity(opp);}}>Supprimer</button>
      </div>
    </article>;
  }

  const openOpps = visibleOpps.filter((o) => lifecycle(o) === "open");
  const groups = {
    hot: openOpps.filter((o) => temperature(o) === "hot"), warm: openOpps.filter((o) => temperature(o) === "warm"), cold: openOpps.filter((o) => temperature(o) === "cold"),
    validated: visibleOpps.filter((o) => lifecycle(o) === "validated"), production: visibleOpps.filter((o) => lifecycle(o) === "production"), completed: visibleOpps.filter((o) => lifecycle(o) === "completed"), lost: visibleOpps.filter((o) => lifecycle(o) === "lost"),
  };

  return <section className="page crm-page">
    <div className="page-header"><div><h2>CRM — Prospects & opportunités</h2><p>Un prospect peut désormais porter plusieurs projets potentiels indépendants.</p></div></div>
    {message ? <div className="message">{message}</div> : null}

    <div className="crm-toolbar">
      <button className={`btn ${view === "temperature" ? "primary" : ""}`} onClick={() => setView("temperature")}>Chaud / Tiède / Froid</button>
      <button className={`btn ${view === "pipeline" ? "primary" : ""}`} onClick={() => setView("pipeline")}>Pipeline</button>
      <button className={`btn ${view === "pool" ? "primary" : ""}`} onClick={() => setView("pool")}>Vivier ({contacts.length})</button>
      <button className={`btn ${view === "lifecycle" ? "primary" : ""}`} onClick={() => setView("lifecycle")}>Projets & production</button>
      <input placeholder="Rechercher prospect ou opportunité..." value={search} onChange={(e) => setSearch(e.target.value)} />
      <button className="btn primary" onClick={() => openCreateOpportunity()}>+ Nouvelle opportunité</button>
    </div>

    {view === "pool" ? <>
      <div className="card"><h3>Ajouter un prospect au vivier</h3><form className="crm-form-grid" onSubmit={createContact}>
        <input required placeholder="Entreprise / collectivité" value={contactForm.company_name} onChange={(e)=>setContactForm({...contactForm,company_name:e.target.value})}/>
        <input placeholder="Contact" value={contactForm.contact_name} onChange={(e)=>setContactForm({...contactForm,contact_name:e.target.value})}/>
        <input placeholder="Ville" value={contactForm.city} onChange={(e)=>setContactForm({...contactForm,city:e.target.value})}/>
        <input placeholder="Email" value={contactForm.email} onChange={(e)=>setContactForm({...contactForm,email:e.target.value})}/>
        <input placeholder="Téléphone" value={contactForm.phone} onChange={(e)=>setContactForm({...contactForm,phone:e.target.value})}/>
        <button className="btn primary">Ajouter au vivier</button>
      </form></div>
      <div className="crm-pool-grid">{pool.map((c) => <article className="crm-pool-card" key={c.id}><div><strong>{c.company_name}</strong><small>{c.contact_name || "-"}{c.city ? ` · ${c.city}` : ""}</small></div><div><span>{opportunities.filter((o)=>o.contact_id===c.id).length} opportunité(s)</span><button className="btn small primary" onClick={()=>openCreateOpportunity(c)}>+ Opportunité</button></div></article>)}</div>
    </> : null}

    {view === "temperature" ? <div className="crm-temperature-board">{[
      ["hot","Opportunités chaudes"],["warm","Opportunités tièdes"],["cold","Opportunités froides"]
    ].map(([key,label]) => <section className={`crm-temperature-column ${key}`} key={key}><header><h3>{label}</h3><strong>{groups[key].length}</strong><span>{money(groups[key].reduce((s,o)=>s+Number(o.estimated_amount||0),0))}</span></header><button className="btn small crm-add-existing-project" onClick={()=>openCreateOpportunity(null,{probability_percent:key==="hot"?85:key==="warm"?55:20})}>+ Ajouter depuis le vivier</button>{groups[key].map(opportunityCard)}</section>)}</div> : null}

    {view === "pipeline" ? <div className="crm-pipeline-board">{stages.filter((s)=>!String(s.name).toLowerCase().includes("perdu")).map((stage)=><section className="crm-stage-column" key={stage.id} onDragOver={(e)=>e.preventDefault()} onDrop={()=>draggedId&&moveOpportunity(draggedId,stage.id)} style={{borderTopColor:stage.color}}><header><h3>{stage.name}</h3><strong>{openOpps.filter((o)=>o.stage_id===stage.id).length}</strong></header><button className="btn small crm-add-existing-project" onClick={()=>openCreateOpportunity(null,{stage_id:stage.id,probability_percent:stage.default_probability_percent})}>+ Ajouter depuis le vivier</button>{openOpps.filter((o)=>o.stage_id===stage.id).map(opportunityCard)}</section>)}</div> : null}

    {view === "lifecycle" ? <div className="crm-temperature-board">{[
      ["validated","Validés"],["production","En production"],["completed","Production terminée"],["lost","Perdus"]
    ].map(([key,label])=><section className="crm-temperature-column" key={key}><header><h3>{label}</h3><strong>{groups[key].length}</strong></header>{groups[key].map(opportunityCard)}</section>)}</div> : null}

    {showOppForm ? <div className="modal-backdrop"><div className="modal card"><h3>Créer une opportunité</h3><p>Une opportunité représente un projet potentiel, distinct de la fiche prospect.</p><form className="crm-form-grid" onSubmit={createOpportunity}>
      <select required value={oppForm.contact_id} onChange={(e)=>setOppForm({...oppForm,contact_id:e.target.value})}><option value="">Prospect du vivier</option>{contacts.map((c)=><option key={c.id} value={c.id}>{c.company_name}{c.city?` — ${c.city}`:""}</option>)}</select>
      <input required placeholder="Nom du projet potentiel" value={oppForm.title} onChange={(e)=>setOppForm({...oppForm,title:e.target.value})}/>
      <select value={oppForm.stage_id} onChange={(e)=>setOppForm({...oppForm,stage_id:e.target.value})}>{stages.filter((s)=>!String(s.name).toLowerCase().includes("perdu")).map((s)=><option key={s.id} value={s.id}>{s.name}</option>)}</select>
      <select value={oppForm.assigned_to} onChange={(e)=>setOppForm({...oppForm,assigned_to:e.target.value})}><option value="">Commercial</option>{employees.map((e)=><option key={e.id} value={e.id}>{e.name}</option>)}</select>
      <input type="number" placeholder="Montant HT" value={oppForm.estimated_amount} onChange={(e)=>setOppForm({...oppForm,estimated_amount:e.target.value})}/>
      <input type="number" min="0" max="100" placeholder="Probabilité %" value={oppForm.probability_percent} onChange={(e)=>setOppForm({...oppForm,probability_percent:e.target.value})}/>
      <input type="month" value={oppForm.expected_signature_month} onChange={(e)=>setOppForm({...oppForm,expected_signature_month:e.target.value})}/>
      <input placeholder="Famille produit" value={oppForm.product_family} onChange={(e)=>setOppForm({...oppForm,product_family:e.target.value})}/>
      <textarea placeholder="Notes" value={oppForm.notes} onChange={(e)=>setOppForm({...oppForm,notes:e.target.value})}/>
      <div><button className="btn primary">Créer l'opportunité</button><button type="button" className="btn" onClick={()=>setShowOppForm(false)}>Annuler</button></div>
    </form></div></div> : null}

    {selectedOpportunity ? <div className="crm-drawer-overlay" onClick={()=>setSelectedOpportunity(null)}><aside className="crm-drawer" onClick={(e)=>e.stopPropagation()}><button className="crm-drawer-close" onClick={()=>setSelectedOpportunity(null)}>×</button><h3>{selectedOpportunity.title}</h3><p><strong>Prospect :</strong> {contactFor(selectedOpportunity).company_name}</p><p><strong>Étape :</strong> {stageName(selectedOpportunity.stage_id)}</p><p><strong>Montant :</strong> {money(selectedOpportunity.estimated_amount)}</p><p><strong>Probabilité :</strong> {selectedOpportunity.probability_percent || 0}%</p><h4>Ajouter une activité à cette opportunité</h4><form className="crm-interaction-form" onSubmit={addInteraction}><select name="type"><option value="note">note</option><option value="appel">appel</option><option value="email">email</option><option value="rdv">rdv</option><option value="devis">devis</option><option value="relance">relance</option></select><input name="subject" placeholder="Sujet"/><input name="next_action" placeholder="Action suivante"/><input name="next_action_date" type="date"/><textarea name="notes" placeholder="Notes"/><button className="btn primary">Ajouter</button></form><h4>Historique de l'opportunité</h4><div className="crm-timeline">{oppInteractions(selectedOpportunity.id).map((i)=><div className="crm-timeline-item" key={i.id}><span>{i.interaction_type}</span><strong>{i.subject || "Activité"}</strong><small>{i.next_action_date || ""}</small>{i.notes?<p>{i.notes}</p>:null}</div>)}</div></aside></div> : null}
  </section>;
}
