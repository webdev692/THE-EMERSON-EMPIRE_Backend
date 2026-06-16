export interface School {
  id: number;
  user_id: number;
  school_name: string;
  email: string | null;
  school_type: 'university' | 'college' | 'polytechnic' | 'tvet';
  county: string | null;
  address: string | null;
  website: string | null;
  logo_url: string | null;
  contact_person: string;
  contact_phone: string | null;
  courses_offered: any;
  is_verified: boolean;
  is_approved: boolean;
  approved_at: Date | null;
  approved_by: number | null;
  created_at: Date;
  deleted_at: Date | null;
}
