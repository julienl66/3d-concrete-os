-- Sépare explicitement le vivier de prospects des opportunités commerciales.
-- Les contacts restent dans crm_contacts ; seuls ceux marqués is_opportunity=true
-- sont affichés dans le pipeline et dans Chaud/Tiède/Froid.

alter table public.crm_contacts
  add column if not exists is_opportunity boolean not null default false;

-- Préserve les opportunités déjà réellement qualifiées.
update public.crm_contacts c
set is_opportunity = true
where c.project_id is not null
   or coalesce(c.probability_percent, 0) > 5
   or exists (
     select 1
     from public.crm_interactions i
     where i.contact_id = c.id
       and (
         lower(coalesce(i.interaction_type, '')) in ('appel','email','rdv','devis','relance')
         or lower(coalesce(i.subject, '')) like '%opportunité créée%'
         or lower(coalesce(i.subject, '')) like '%prospect ciblé%'
         or lower(coalesce(i.subject, '')) like '%ajouté manuellement depuis le vivier%'
       )
   );

-- Tous les autres contacts restent dans le vivier, même s'ils avaient hérité
-- historiquement de l'étape par défaut « Suspect ciblé » et de 5 %.
update public.crm_contacts
set status = 'contact_only',
    stage_id = null
where is_opportunity = false
  and project_id is null;

create index if not exists crm_contacts_is_opportunity_idx
  on public.crm_contacts (is_opportunity);
