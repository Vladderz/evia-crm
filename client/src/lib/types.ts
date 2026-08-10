export interface Client {
  id: number
  company_name: string
  contact_name: string | null
  email: string | null
  phone: string | null
  website: string | null
  sector: string | null
  region: string | null
  status: 'active_client' | 'seeking_tender' | 'prospect'
  notes: string | null
  account_manager: 'vlad' | 'tristan' | 'both'
  created_by_name: string | null
  created_at: string
  updated_at: string
  latest_note_text?: string | null
  latest_note_date?: string | null
  latest_note_type?: string | null
}

export interface ProspectedContract {
  id: number
  title: string
  url: string
  submission_deadline: string
  source: 'fts' | 'manual'
  ocds_id: string | null
  added_by: number
  added_by_name: string
  created_at: string
}

export interface PipelineProspect {
  id: number;
  company_name: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  sector: string | null;
  region: string | null;
  tender_title: string | null;
  tender_url: string | null;
  tender_reference: string | null;
  tender_value: number | null;
  submission_deadline: string | null;
  award_date: string | null;
  buyer: string | null;
  status: string;
  last_contact_date: string | null;
  next_followup_date: string | null;
  assigned_to: string | null;
  created_by: number;
  created_by_name: string;
  prospected_contract_id: number | null;
  created_at: string;
  updated_at: string;
  latest_note_text?: string | null;
  latest_note_date?: string | null;
  latest_note_type?: string | null;
  /** Drop / No Man's Land state - same semantics as Tender. */
  dropped_at?: string | null;
  drop_reason?: DropReason | null;
  drop_note?: string | null;
}

/**
 * Unified row shape returned by GET /api/no-mans-land. Each row is
 * either a dropped tender or a dropped prospect (sales_pipeline row),
 * discriminated by `source`. The id is stable per source - frontend
 * keys must combine them (`${source}-${id}`) to be unique across the
 * union.
 */
export interface NoMansLandRow {
  source: 'tender' | 'prospect';
  id: number;
  company: string | null;
  contact: string | null;
  tender_title: string | null;
  /** The status the row had at the moment it was dropped. */
  stage_when_dropped: string;
  drop_reason: DropReason | null;
  drop_note: string | null;
  dropped_at: string;
  last_contact: string | null;
}

export interface Note {
  id: number
  note: string
  note_type: 'manual' | 'system'
  created_by: number
  created_by_name: string
  created_at: string
}

export interface PipelineNote {
  id: number;
  pipeline_id: number;
  note: string;
  note_type: 'manual' | 'system';
  created_by: number;
  created_by_name: string;
  created_at: string;
}

/**
 * Canonical tender workflow stages. Labels for these values live in
 * client/src/lib/format.ts (TENDER_STATUS_LABELS / _LONG).
 */
export type TenderStatus =
  | 'questionnaire_sent'
  | 'writing'
  | 'submitted'
  | 'won'
  | 'lost'
  | 'archived'

/**
 * Canonical sales-pipeline stages. Labels for these values live in
 * client/src/lib/format.ts (PROSPECT_STATUS_LABELS).
 */
export type ProspectStatus = 'contacted' | 'call_booked' | 'waiting_room'

/**
 * Reasons a tender or prospect can be dropped (paused into No Man's
 * Land). Backed by check constraints on tenders and sales_pipeline.
 */
export type DropReason =
  | 'not_interested'
  | 'went_with_other'
  | 'price_concern'
  | 'ghosted'
  | 'timing'
  | 'other'

export interface Tender {
  id: number
  client_id: number | null
  client_name: string | null
  client_website: string | null
  title: string
  buyer: string | null
  estimated_value: number | null
  evia_fee: number | null
  submission_deadline: string | null
  award_date: string | null
  portal: string | null
  reference_number: string | null
  sector: string | null
  tender_url: string | null
  status: 'questionnaire_sent' | 'writing' | 'submitted' | 'won' | 'lost' | 'archived'
  assigned_to: string | null
  notes: string | null
  /**
   * "Awaiting client input" flag - only meaningful when status is
   * 'writing'. Surfaces as a second amber badge on the row and a
   * toggle in the Add/Edit drawer.
   */
  awaiting_info?: boolean | null
  awaiting_info_note?: string | null
  /**
   * Drop / No Man's Land state. dropped_at is the discriminator; if
   * set, the row is in No Man's Land regardless of `status`. The row's
   * `status` is preserved as the "stage when dropped".
   */
  dropped_at?: string | null
  drop_reason?: DropReason | null
  drop_note?: string | null
  /** Optional free-text reason captured when Mark Lost is used. */
  loss_note?: string | null
  created_by: number | null
  created_by_name: string | null
  created_at: string
  updated_at: string
  latest_note_text?: string | null
  latest_note_date?: string | null
  latest_note_type?: string | null
}
