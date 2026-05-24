import { useEffect, useState, type FormEvent } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Layout } from './components/Layout'
import { Dashboard } from './pages/Dashboard'
import { Tenants } from './pages/Tenants'
import { KillSwitch } from './pages/KillSwitch'
import { Plans } from './pages/Plans'
import { Configuration } from './pages/Configuration'
import { PosApkReleases } from './pages/PosApkReleases'
import SupportCommandCenter from './pages/SupportCommandCenter'
import { CustomerImprovements } from './pages/CustomerImprovements'
import { AccessManagement } from './pages/AccessManagement'
import { supabase, supabaseAdmin } from './lib/supabase'
import type { CloudAdminProfile, CloudAdminUser } from './types'

type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

interface CloudAdminSession {
    authUser: User;
    adminUser: CloudAdminUser;
    profile: CloudAdminProfile | null;
}

function clearSupabaseAuthStorage() {
    if (typeof window === 'undefined') return;
    const clearMatchingKeys = (storage: Storage) => {
        Object.keys(storage)
            .filter((key) => key.startsWith('sb-') && key.includes('auth-token'))
            .forEach((key) => storage.removeItem(key));
    };

    clearMatchingKeys(window.localStorage);
    clearMatchingKeys(window.sessionStorage);
}

async function resolveCloudAdminSession(session: Session | null): Promise<CloudAdminSession | null> {
    const authUser = session?.user;
    if (!authUser?.id) return null;

    const { data: adminUser, error: adminError } = await supabaseAdmin
        .from('cloud_admin_users')
        .select('*')
        .eq('auth_user_id', authUser.id)
        .maybeSingle();

    if (adminError) throw adminError;
    if (!adminUser || (adminUser as CloudAdminUser).status === 'suspended') return null;

    let profile: CloudAdminProfile | null = null;
    const profileId = (adminUser as CloudAdminUser).profile_id;
    if (profileId) {
        const { data: profileData, error: profileError } = await supabaseAdmin
            .from('cloud_admin_profiles')
            .select('*')
            .eq('id', profileId)
            .maybeSingle();
        if (profileError) throw profileError;
        profile = profileData as CloudAdminProfile | null;
    }

    return { authUser, adminUser: adminUser as CloudAdminUser, profile };
}

function App() {
    const [authStatus, setAuthStatus] = useState<AuthStatus>('loading');
    const [cloudAdminSession, setCloudAdminSession] = useState<CloudAdminSession | null>(null);
    const [authError, setAuthError] = useState<string | null>(null);
    const [signingOut, setSigningOut] = useState(false);

    useEffect(() => {
        let mounted = true;

        const loadSession = async () => {
            try {
                const { data, error } = await supabase.auth.getSession();
                if (error) throw error;
                const resolved = await resolveCloudAdminSession(data.session);
                if (!mounted) return;
                setCloudAdminSession(resolved);
                setAuthStatus(resolved ? 'authenticated' : 'unauthenticated');
                if (data.session && !resolved) {
                    setAuthError('Tu usuario no tiene acceso activo a Cloud-Admin.');
                    await supabase.auth.signOut();
                    clearSupabaseAuthStorage();
                }
            } catch (error) {
                console.error('Cloud-Admin auth bootstrap failed', error);
                if (!mounted) return;
                setCloudAdminSession(null);
                setAuthStatus('unauthenticated');
                setAuthError(getAuthErrorMessage(error));
                clearSupabaseAuthStorage();
            }
        };

        void loadSession();

        const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
            if (event === 'SIGNED_OUT') {
                setCloudAdminSession(null);
                setAuthStatus('unauthenticated');
                return;
            }

            if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION') {
                void resolveCloudAdminSession(session)
                    .then((resolved) => {
                        if (!mounted) return;
                        setCloudAdminSession(resolved);
                        setAuthStatus(resolved ? 'authenticated' : 'unauthenticated');
                    })
                    .catch((error) => {
                        console.error('Cloud-Admin auth state failed', error);
                        if (!mounted) return;
                        setCloudAdminSession(null);
                        setAuthStatus('unauthenticated');
                        setAuthError(getAuthErrorMessage(error));
                    });
            }
        });

        return () => {
            mounted = false;
            listener.subscription.unsubscribe();
        };
    }, []);

    const handleLogin = async (email: string, password: string) => {
        setAuthError(null);
        const { data, error } = await supabase.auth.signInWithPassword({
            email: email.trim().toLowerCase(),
            password,
        });

        if (error) throw error;

        const resolved = await resolveCloudAdminSession(data.session);
        if (!resolved) {
            await supabase.auth.signOut();
            clearSupabaseAuthStorage();
            throw new Error('Tu usuario no tiene acceso activo a Cloud-Admin.');
        }

        setCloudAdminSession(resolved);
        setAuthStatus('authenticated');
    };

    const handleSignOut = async () => {
        setSigningOut(true);
        setAuthError(null);
        try {
            await supabase.auth.signOut();
        } catch (error) {
            console.warn('Supabase sign out returned an error; clearing local session anyway.', error);
        } finally {
            clearSupabaseAuthStorage();
            setCloudAdminSession(null);
            setAuthStatus('unauthenticated');
            setSigningOut(false);
        }
    };

    if (authStatus === 'loading') {
        return <AuthLoadingScreen />;
    }

    if (!cloudAdminSession) {
        return <LoginScreen error={authError} onLogin={handleLogin} />;
    }

    return (
        <HashRouter>
            <Routes>
                <Route
                    path="/"
                    element={(
                        <Layout
                            adminName={cloudAdminSession.adminUser.full_name}
                            adminEmail={cloudAdminSession.adminUser.email || cloudAdminSession.authUser.email}
                            adminRole={cloudAdminSession.profile?.name || 'Cloud Admin'}
                            signingOut={signingOut}
                            onSignOut={() => void handleSignOut()}
                        />
                    )}
                >
                    <Route index element={<Dashboard />} />
                    <Route path="tenants" element={<Tenants />} />
                    <Route path="plans" element={<Plans />} />
                    <Route path="pos-apk" element={<PosApkReleases />} />
                    <Route path="support" element={<SupportCommandCenter />} />
                    <Route path="mejoras" element={<CustomerImprovements />} />
                    <Route path="configuracion" element={<Configuration />} />
                    <Route path="accesos" element={<AccessManagement />} />
                    <Route path="kill-switch" element={<KillSwitch />} />
                </Route>
                <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
        </HashRouter>
    )
}

function AuthLoadingScreen() {
    return (
        <div className="flex min-h-screen items-center justify-center bg-slate-950 text-white">
            <div className="rounded-lg border border-white/10 bg-white/5 px-6 py-5 shadow-2xl">
                <p className="text-sm font-bold uppercase tracking-[0.24em] text-indigo-300">CLIC-CLOUD</p>
                <p className="mt-2 text-lg font-black">Validando sesión...</p>
            </div>
        </div>
    );
}

function LoginScreen({ error, onLogin }: { error: string | null; onLogin: (email: string, password: string) => Promise<void> }) {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [localError, setLocalError] = useState<string | null>(null);

    const submit = async (event: FormEvent) => {
        event.preventDefault();
        setLoading(true);
        setLocalError(null);
        try {
            await onLogin(email, password);
        } catch (loginError) {
            console.error('Cloud-Admin login failed', loginError);
            setLocalError(getAuthErrorMessage(loginError));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4 text-slate-900">
            <form onSubmit={submit} className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-7 shadow-2xl">
                <div>
                    <p className="text-xs font-black uppercase tracking-[0.28em] text-indigo-600">CLIC-CLOUD</p>
                    <h1 className="mt-3 text-2xl font-black text-slate-950">Acceso Cloud-Admin</h1>
                    <p className="mt-1 text-sm text-slate-500">Inicia sesión con tu usuario autorizado.</p>
                </div>

                {error || localError ? (
                    <div className="mt-5 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
                        {localError || error}
                    </div>
                ) : null}

                <div className="mt-6 space-y-4">
                    <label className="block">
                        <span className="text-xs font-black uppercase tracking-wide text-slate-500">Email</span>
                        <input
                            required
                            type="email"
                            value={email}
                            onChange={(event) => setEmail(event.target.value)}
                            className="mt-2 w-full rounded-lg border border-slate-200 px-4 py-3 text-sm font-semibold outline-none transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
                            placeholder="usuario@empresa.com"
                        />
                    </label>
                    <label className="block">
                        <span className="text-xs font-black uppercase tracking-wide text-slate-500">Clave</span>
                        <input
                            required
                            type="password"
                            value={password}
                            onChange={(event) => setPassword(event.target.value)}
                            className="mt-2 w-full rounded-lg border border-slate-200 px-4 py-3 text-sm font-semibold outline-none transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
                            placeholder="Clave de acceso"
                        />
                    </label>
                </div>

                <button
                    type="submit"
                    disabled={loading}
                    className="mt-6 w-full rounded-lg bg-indigo-600 px-4 py-3 text-sm font-black text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-70"
                >
                    {loading ? 'Validando...' : 'Entrar'}
                </button>
            </form>
        </div>
    );
}

function getAuthErrorMessage(error: unknown) {
    const message = error instanceof Error ? error.message : String(error || '');
    if (/invalid login credentials/i.test(message)) return 'Email o clave incorrectos.';
    if (/email not confirmed/i.test(message)) return 'Este email no ha sido confirmado.';
    if (/access activo|cloud-admin/i.test(message)) return message;
    return message || 'No se pudo completar la autenticación.';
}

export default App
