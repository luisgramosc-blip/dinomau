import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { SITE_URL } from './env';

export interface AuthUser {
  id: string;
  email: string | null;
  /** Código de referido guardado en los metadatos al registrarse (si lo hubo). */
  referralCode: string | null;
}

export type AuthResult = { ok: true; needsConfirmation?: boolean } | { ok: false; error: AuthErrorCode };
export type AuthErrorCode =
  | 'INVALID_CREDENTIALS' | 'EMAIL_NOT_CONFIRMED' | 'EMAIL_IN_USE' | 'WEAK_PASSWORD'
  | 'INVALID_EMAIL' | 'RATE_LIMIT' | 'NETWORK' | 'UNKNOWN';

/**
 * Cuentas: email + contraseña (con verificación por correo) y Google.
 * Sin sesión el jugador es "invitado": puede jugar, pero no guarda monedas,
 * no compra dinos y no aparece en el ranking.
 */
export class AuthService {
  private current: AuthUser | null = null;
  private readonly listeners = new Set<(user: AuthUser | null) => void>();

  constructor(private readonly sb: SupabaseClient) {
    sb.auth.onAuthStateChange((_event, session) => this.setSession(session));
  }

  /** Recupera la sesión guardada (o la que llega en la URL tras confirmar el correo / Google). */
  async init(): Promise<AuthUser | null> {
    const { data } = await this.sb.auth.getSession();
    this.setSession(data.session);
    return this.current;
  }

  get user(): AuthUser | null {
    return this.current;
  }

  onChange(listener: (user: AuthUser | null) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private setSession(session: Session | null): void {
    const meta = session?.user.user_metadata as { referral_code?: unknown } | undefined;
    const next = session
      ? {
          id: session.user.id,
          email: session.user.email ?? null,
          referralCode: typeof meta?.referral_code === 'string' ? meta.referral_code : null,
        }
      : null;
    if (next?.id === this.current?.id) return;
    this.current = next;
    this.listeners.forEach((l) => l(next));
  }

  async signUp(email: string, password: string, referralCode?: string): Promise<AuthResult> {
    const { data, error } = await this.sb.auth.signUp({
      email,
      password,
      // El código de referido se guarda en los metadatos; se canjea en la Fase 6 (servidor)
      options: { emailRedirectTo: SITE_URL, data: referralCode ? { referral_code: referralCode } : undefined },
    });
    if (error) return { ok: false, error: mapError(error) };
    return { ok: true, needsConfirmation: !data.session };
  }

  async signIn(email: string, password: string): Promise<AuthResult> {
    const { error } = await this.sb.auth.signInWithPassword({ email, password });
    return error ? { ok: false, error: mapError(error) } : { ok: true };
  }

  /** Redirige a Google; al volver, `init()` recoge la sesión. */
  async signInWithGoogle(): Promise<AuthResult> {
    const { error } = await this.sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: SITE_URL } });
    return error ? { ok: false, error: mapError(error) } : { ok: true };
  }

  async resetPassword(email: string): Promise<AuthResult> {
    const { error } = await this.sb.auth.resetPasswordForEmail(email, { redirectTo: SITE_URL });
    return error ? { ok: false, error: mapError(error) } : { ok: true };
  }

  async signOut(): Promise<void> {
    await this.sb.auth.signOut();
  }
}

export function mapError(error: { message?: string; code?: string; status?: number }): AuthErrorCode {
  const msg = `${error.code ?? ''} ${error.message ?? ''}`.toLowerCase();
  if (msg.includes('invalid login') || msg.includes('invalid_credentials')) return 'INVALID_CREDENTIALS';
  if (msg.includes('not confirmed') || msg.includes('email_not_confirmed')) return 'EMAIL_NOT_CONFIRMED';
  if (msg.includes('already registered') || msg.includes('user_already_exists') || msg.includes('email_exists')) return 'EMAIL_IN_USE';
  if (msg.includes('password') && (msg.includes('weak') || msg.includes('at least') || msg.includes('short'))) return 'WEAK_PASSWORD';
  if (msg.includes('email') && (msg.includes('invalid') || msg.includes('validate'))) return 'INVALID_EMAIL';
  if (error.status === 429 || msg.includes('rate limit')) return 'RATE_LIMIT';
  if (msg.includes('fetch') || msg.includes('network')) return 'NETWORK';
  return 'UNKNOWN';
}
