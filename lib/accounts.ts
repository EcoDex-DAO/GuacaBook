export type AccountType = {
  id: string;
  label: string;
  can_review_data: boolean;
  can_manage_accounts: boolean;
  builtin: boolean;
};
export type AccountProfile = {
  user_id: string;
  type_id: string;
  label: string;
  active: boolean;
  protected: boolean;
  can_manage_accounts: boolean;
  can_review_data: boolean;
  has_password: boolean;
};
export type ManagedAccount = {
  account_id: string;
  email: string;
  type_id: string;
  active: boolean;
  protected: boolean;
  created_at: string;
  email_confirmed_at: string | null;
  has_password: boolean;
};
