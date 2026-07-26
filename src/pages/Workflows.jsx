import { useEffect, useMemo, useState } from "react";
import { supabase } from "../services/supabase.js";

const CLOSURE_NAME = "Clôture du projet";

function isClosureStep(step) {
  const label = String(step?.name || step?.title || "").trim().toLowerCase();
  return step?.is_closure === true || ["clôture du projet", "cloture du projet", "clôture projet", "cloture projet"].includes(label);
}

export default function Workflows({ user, permissions }) {
  const [templates, setTemplates] = useState([]);
  const [steps, setSteps] = useState([]);
  const [projectTypes, setProjectTypes] = useState([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [templateName, setTemplateName] = useState("");
  const [stepName, setStepName] = useState("");
  const [message, setMessage] = useState("");

  function canEdit() {
    return user?.role === "admin" || !!permissions?.workflows?.can_edit || !!permissions?.projets?.can_edit;
  }

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (!selectedTemplateId && templates.length > 0) {
      setSelectedTemplateId(templates[0].id);
    }
  }, [templates, selectedTemplateId]);

  async function loadData() {
    setMessage("");
    const [templatesResult, stepsResult, typesResult, typeWorkflowResult] = await Promise.all([
      supabase.from("project_workflow_templates").select("*").eq("active", true).order("name"),
      supabase.from("project_workflow_steps").select("*").eq("active", true).order("step_order"),
      supabase.from("project_types").select("*").eq("active", true).order("name"),
      supabase.from("project_type_workflow_assignments").select("project_type_id, workflow_template_id"),
    ]);

    const error = templatesResult.error || stepsResult.error || typesResult.error || typeWorkflowResult.error;
    if (error) {
      setMessage(error.message);
      return;
    }

    setTemplates(templatesResult.data || []);
    setSteps(stepsResult.data || []);
    const workflowByType = new Map((typeWorkflowResult.data || []).map((row) => [row.project_type_id, row.workflow_template_id]));
    setProjectTypes((typesResult.data || []).map((type) => ({
      ...type,
      default_workflow_template_id: workflowByType.get(type.id) || null,
    })));
  }

  const selectedTemplate = templates.find((template) => template.id === selectedTemplateId) || null;
  const selectedSteps = useMemo(
    () => steps
      .filter((step) => step.template_id === selectedTemplateId)
      .sort((a, b) => Number(a.step_order || 0) - Number(b.step_order || 0)),
    [steps, selectedTemplateId]
  );

  async function ensureClosureStep(templateId) {
    const templateSteps = steps.filter((step) => step.template_id === templateId && step.active !== false);
    const closure = templateSteps.find((step) => isClosureStep(step));
    const maxRegularOrder = templateSteps
      .filter((step) => !isClosureStep(step))
      .reduce((max, step) => Math.max(max, Number(step.step_order || 0)), 0);

    if (closure) {
      await supabase
        .from("project_workflow_steps")
        .update({ name: CLOSURE_NAME, step_order: maxRegularOrder + 1, active: true,  })
        .eq("id", closure.id);
      return;
    }

    await supabase.from("project_workflow_steps").insert({
      template_id: templateId,
      name: CLOSURE_NAME,
      step_order: maxRegularOrder + 1,
      default_duration_days: 0,
      active: true,
    });
  }

  async function createTemplate(e) {
    e.preventDefault();
    if (!canEdit()) return setMessage("Action non autorisée.");
    if (!templateName.trim()) return setMessage("Nom du workflow obligatoire.");

    const { data, error } = await supabase
      .from("project_workflow_templates")
      .insert({ name: templateName.trim(), active: true })
      .select()
      .single();

    if (error) return setMessage(error.message);

    const { error: closureError } = await supabase.from("project_workflow_steps").insert({
      template_id: data.id,
      name: CLOSURE_NAME,
      step_order: 1,
      default_duration_days: 0,
      active: true,
    });

    if (closureError) return setMessage(closureError.message);

    setTemplateName("");
    setSelectedTemplateId(data.id);
    setMessage("Workflow créé. L'étape de clôture a été ajoutée automatiquement.");
    await loadData();
  }

  async function renameTemplate(template) {
    if (!canEdit()) return setMessage("Action non autorisée.");
    const name = window.prompt("Nouveau nom du workflow ?", template.name);
    if (name === null || !name.trim()) return;
    const { error } = await supabase.from("project_workflow_templates").update({ name: name.trim() }).eq("id", template.id);
    if (error) return setMessage(error.message);
    setMessage("Workflow renommé.");
    await loadData();
  }

  async function archiveTemplate(template) {
    if (!canEdit()) return setMessage("Action non autorisée.");
    const usedByType = projectTypes.some((type) => type.default_workflow_template_id === template.id);
    if (usedByType) {
      return setMessage("Ce workflow est encore associé à une catégorie de projet. Change d'abord cette association.");
    }
    if (!window.confirm(`Archiver le workflow « ${template.name} » ?`)) return;
    const { error } = await supabase.from("project_workflow_templates").update({ active: false }).eq("id", template.id);
    if (error) return setMessage(error.message);
    if (selectedTemplateId === template.id) setSelectedTemplateId("");
    setMessage("Workflow archivé.");
    await loadData();
  }

  async function addStep(e) {
    e.preventDefault();
    if (!canEdit()) return setMessage("Action non autorisée.");
    if (!selectedTemplateId) return setMessage("Sélectionne un workflow.");
    if (!stepName.trim()) return setMessage("Nom de l'étape obligatoire.");

    const regularSteps = selectedSteps.filter((step) => !isClosureStep(step));
    const nextOrder = regularSteps.reduce((max, step) => Math.max(max, Number(step.step_order || 0)), 0) + 1;

    const { error } = await supabase.from("project_workflow_steps").insert({
      template_id: selectedTemplateId,
      name: stepName.trim(),
      step_order: nextOrder,
      default_duration_days: 1,
      active: true,
    });
    if (error) return setMessage(error.message);

    setStepName("");
    await loadData();
    // loadData refreshes local steps; normalize closure in a second pass from DB.
    const { data: refreshed } = await supabase.from("project_workflow_steps").select("*").eq("template_id", selectedTemplateId).eq("active", true);
    const closure = (refreshed || []).find((step) => isClosureStep(step));
    const maxOrder = (refreshed || []).filter((step) => !isClosureStep(step)).reduce((max, step) => Math.max(max, Number(step.step_order || 0)), 0);
    if (closure) await supabase.from("project_workflow_steps").update({ step_order: maxOrder + 1, name: CLOSURE_NAME }).eq("id", closure.id);
    setMessage("Étape ajoutée avant la clôture.");
    await loadData();
  }

  async function editStep(step) {
    if (!canEdit()) return setMessage("Action non autorisée.");
    if (isClosureStep(step)) return setMessage("La clôture est une étape système : elle doit toujours rester en dernière position.");

    const name = window.prompt("Nom de l'étape ?", step.name);
    if (name === null || !name.trim()) return;
    const orderInput = window.prompt("Ordre de l'étape ?", String(step.step_order || 1));
    if (orderInput === null) return;
    const durationInput = window.prompt("Durée indicative en jours ?", String(step.default_duration_days || 1));
    if (durationInput === null) return;

    const order = Math.max(1, Number(orderInput || 1));
    const duration = Math.max(0, Number(durationInput || 0));
    const { error } = await supabase
      .from("project_workflow_steps")
      .update({ name: name.trim(), step_order: order, default_duration_days: duration })
      .eq("id", step.id);
    if (error) return setMessage(error.message);

    await loadData();
    await ensureClosureStep(selectedTemplateId);
    setMessage("Étape modifiée.");
    await loadData();
  }

  async function deleteStep(step) {
    if (!canEdit()) return setMessage("Action non autorisée.");
    if (isClosureStep(step)) return setMessage("Impossible de supprimer l'étape « Clôture du projet ».");
    if (!window.confirm(`Supprimer l'étape « ${step.name} » ?`)) return;
    const { error } = await supabase.from("project_workflow_steps").update({ active: false }).eq("id", step.id);
    if (error) return setMessage(error.message);
    setMessage("Étape supprimée.");
    await loadData();
    await ensureClosureStep(selectedTemplateId);
    await loadData();
  }

  async function setCategoryWorkflow(type, templateId) {
    if (!canEdit()) return setMessage("Action non autorisée.");

    let error = null;
    if (templateId) {
      const result = await supabase
        .from("project_type_workflow_assignments")
        .upsert(
          { project_type_id: type.id, workflow_template_id: templateId },
          { onConflict: "project_type_id" }
        );
      error = result.error;
    } else {
      const result = await supabase
        .from("project_type_workflow_assignments")
        .delete()
        .eq("project_type_id", type.id);
      error = result.error;
    }

    if (error) return setMessage(error.message);
    setMessage(`Workflow de la catégorie « ${type.name} » mis à jour.`);
    await loadData();
  }

  return (
    <section className="page">
      <div className="page-head">
        <div>
          <p className="eyebrow">Projets</p>
          <h1>Workflows projet</h1>
          <p>Crée les parcours de réalisation et associe un workflow par défaut à chaque catégorie de projet.</p>
        </div>
      </div>

      {message && <div className="message">{message}</div>}

      <div className="card workflow-admin-card">
        <div className="page-head">
          <div>
            <h3>Catégories → workflows</h3>
            <p>Lorsqu'une catégorie est choisie sur un projet, son workflow par défaut peut être appliqué automatiquement.</p>
          </div>
        </div>

        {projectTypes.length === 0 ? (
          <p>Aucune catégorie de projet disponible.</p>
        ) : (
          <div className="admin-list">
            {projectTypes.map((type) => (
              <div className="admin-row" key={type.id}>
                <strong>{type.name}</strong>
                <select
                  value={type.default_workflow_template_id || ""}
                  onChange={(e) => setCategoryWorkflow(type, e.target.value)}
                  disabled={!canEdit()}
                >
                  <option value="">Aucun workflow par défaut</option>
                  {templates.map((template) => (
                    <option key={template.id} value={template.id}>{template.name}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card workflow-admin-card">
        <div className="page-head">
          <div>
            <h3>Bibliothèque de workflows</h3>
            <p>La dernière étape est toujours « {CLOSURE_NAME} » et ne peut ni être supprimée ni déplacée.</p>
          </div>
        </div>

        <form onSubmit={createTemplate} className="admin-inline-form workflow-template-form">
          <input value={templateName} onChange={(e) => setTemplateName(e.target.value)} placeholder="Ex : Mobilier urbain" />
          <button className="btn primary" disabled={!canEdit()}>Créer un workflow</button>
        </form>

        {templates.length === 0 ? (
          <p>Aucun workflow.</p>
        ) : (
          <>
            <div className="workflow-template-tabs">
              {templates.map((template) => (
                <button
                  key={template.id}
                  type="button"
                  className={selectedTemplateId === template.id ? "active" : ""}
                  onClick={() => setSelectedTemplateId(template.id)}
                >
                  {template.name}
                </button>
              ))}
            </div>

            {selectedTemplate && (
              <div className="workflow-template-head">
                <div>
                  <strong>{selectedTemplate.name}</strong>
                  <small>{selectedSteps.length} étape(s)</small>
                </div>
                <div className="inline-actions">
                  <button className="btn small" onClick={() => renameTemplate(selectedTemplate)}>Renommer</button>
                  <button className="btn small danger-soft" onClick={() => archiveTemplate(selectedTemplate)}>Archiver</button>
                </div>
              </div>
            )}

            <form onSubmit={addStep} className="admin-inline-form">
              <input value={stepName} onChange={(e) => setStepName(e.target.value)} placeholder="Nouvelle étape avant clôture" />
              <button className="btn primary" disabled={!canEdit()}>Ajouter l'étape</button>
            </form>

            <div className="workflow-step-list">
              {selectedSteps.map((step, index) => (
                <div className={`workflow-step-row ${isClosureStep(step) ? "workflow-closure-step" : ""}`} key={step.id}>
                  <div className="workflow-step-order">{index + 1}</div>
                  <div>
                    <strong>{isClosureStep(step) ? `🔒 ${CLOSURE_NAME}` : step.name}</strong>
                    <small>{isClosureStep(step) ? "Étape système · archive le projet et termine la production dans le CRM" : `${Number(step.default_duration_days || 0)} jour(s)`}</small>
                  </div>
                  {!isClosureStep(step) && (
                    <div className="inline-actions">
                      <button className="btn small" onClick={() => editStep(step)}>Modifier</button>
                      <button className="btn small danger-soft" onClick={() => deleteStep(step)}>Supprimer</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
