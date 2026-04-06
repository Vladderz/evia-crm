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

export interface Tender {
  id: number
  client_id: number | null
  client_name: string | null
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
  created_by: number | null
  created_by_name: string | null
  created_at: string
  updated_at: string
}
