import rawUsers from '../data/users.json';

export interface UserRecord {
  id: string;
  email: string;
  password: string;
  gstin: string;
  name: string;
  role: string;
  companyName?: string;
  phone?: string;
}

export interface AuthResult {
  success: boolean;
  user?: UserRecord;
  error?: string;
  field?: 'email' | 'password' | 'gstin';
}

const AUTH_STORAGE_KEY = 'auth_user';

export const authService = {
  /**
   * Returns all registered users from users.json (without exposed passwords)
   */
  getRegisteredUsers(): Omit<UserRecord, 'password'>[] {
    return (rawUsers as UserRecord[]).map(({ password: _, ...rest }) => rest);
  },

  /**
   * Validates user credentials against users.json
   * @param email User email address
   * @param password User password
   * @param gstin User GSTIN (optional or required depending on tenant)
   */
  async validateUser(email: string, password: string, gstin?: string): Promise<AuthResult> {
    // Artificial small delay for UX realism
    await new Promise((resolve) => setTimeout(resolve, 350));

    const cleanEmail = (email || '').trim().toLowerCase();
    const cleanPass = (password || '').trim();
    const cleanGst = (gstin || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');

    const users = rawUsers as UserRecord[];

    const foundUser = users.find((u) => u.email.trim().toLowerCase() === cleanEmail);

    if (!foundUser) {
      return {
        success: false,
        error: `No registered account found for ${cleanEmail}. Please check your email.`,
        field: 'email',
      };
    }

    if (foundUser.password !== cleanPass) {
      return {
        success: false,
        error: 'Incorrect password. Please verify and try again.',
        field: 'password',
      };
    }

    if (cleanGst) {
      const userGst = (foundUser.gstin || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (userGst !== cleanGst) {
        return {
          success: false,
          error: `GSTIN mismatch! The entered GSTIN does not match the GSTIN registered for ${cleanEmail}.`,
          field: 'gstin',
        };
      }
    }

    // Persist session
    const { password: _, ...safeUser } = foundUser;
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(safeUser));

    return {
      success: true,
      user: foundUser,
    };
  },

  /**
   * Gets currently authenticated user from localStorage
   */
  getCurrentUser(): Omit<UserRecord, 'password'> | null {
    try {
      const stored = localStorage.getItem(AUTH_STORAGE_KEY);
      if (!stored) return null;
      return JSON.parse(stored);
    } catch {
      return null;
    }
  },

  /**
   * Clears session
   */
  logout(): void {
    localStorage.removeItem(AUTH_STORAGE_KEY);
  },

  /**
   * Checks if user is currently authenticated
   */
  isAuthenticated(): boolean {
    return Boolean(this.getCurrentUser());
  },
};

export default authService;

