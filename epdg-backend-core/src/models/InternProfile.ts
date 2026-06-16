export interface InternProfile {
  id: number;
  user_id: number;
  school_id: number | null;
  course: string | null;
  year_of_study: number | null;
  cv_url: string | null;
  contact_phone: string | null;
  skills: any;
  bio: string | null;
  availability_start: Date | null;
  availability_end: Date | null;
  nda_signed: boolean;
  disclaimer_accepted: boolean;
  onboarding_complete: boolean;
  created_at: Date;
}
