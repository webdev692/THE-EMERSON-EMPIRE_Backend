export interface Company {
  id: number;
  user_id: number;
  company_name: string;
  email: string | null;
  country: string | null;
  county: string | null;
  industry: string | null;
  number_of_employees: number | null;
  registration_number: string | null;
  website: string | null;
  logo_url: string | null;
  description: string | null;
  contact_person: string;
  contact_phone: string | null;
  is_verified: boolean;
  is_approved: boolean;
  approved_at: Date | null;
  approved_by: number | null;
  created_at: Date;
  deleted_at: Date | null;
}
