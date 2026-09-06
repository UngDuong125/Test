export type UserRole = 'admin' | 'teacher' | 'student';
export type UserStatus = 'invited' | 'active' | 'locked' | 'disabled';

export interface PublicUser {
  id: string;
  email: string;
  username: string;
  displayName: string | null;
  role: UserRole;
  status: UserStatus;
  mustChangePassword: boolean;
}

export type TagKey = 'math' | 'lang' | 'flang' | 'sci' | 'hist_geo' | 'civic';
