import React, { useEffect, useMemo, useState } from 'react';
import { Check, Copy, Loader2, Save, ShieldCheck, Trash2, UserCog, Users } from 'lucide-react';
import type { CloudAdminPermissions, CloudAdminProfile, CloudAdminUser, CloudAdminUserStatus } from '../types';
import { accessService, emptyPermissions, permissionCatalog } from '../lib/accessService';

const defaultProfileForm = {
    code: '',
    name: '',
    description: '',
    level: 50,
    permissions: { ...emptyPermissions } as CloudAdminPermissions,
    is_active: true,
};

const defaultUserForm = {
    email: '',
    fullName: '',
    phone: '',
    profileId: '',
    status: 'active' as CloudAdminUserStatus,
};

const statusStyles: Record<CloudAdminUserStatus, string> = {
    active: 'bg-emerald-100 text-emerald-700',
    invited: 'bg-blue-100 text-blue-700',
    suspended: 'bg-rose-100 text-rose-700',
};

export const AccessManagement: React.FC = () => {
    const [profiles, setProfiles] = useState<CloudAdminProfile[]>([]);
    const [users, setUsers] = useState<CloudAdminUser[]>([]);
    const [activeTab, setActiveTab] = useState<'users' | 'profiles'>('users');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [editingProfile, setEditingProfile] = useState<CloudAdminProfile | null>(null);
    const [editingUser, setEditingUser] = useState<CloudAdminUser | null>(null);
    const [profileForm, setProfileForm] = useState(defaultProfileForm);
    const [userForm, setUserForm] = useState(defaultUserForm);
    const [userNotice, setUserNotice] = useState<{ title: string; message: string; tempPassword?: string | null } | null>(null);

    const activeProfiles = useMemo(() => profiles.filter((profile) => profile.is_active), [profiles]);
    const stats = useMemo(() => ({
        users: users.length,
        activeUsers: users.filter((user) => user.status === 'active').length,
        profiles: profiles.length,
        highAccess: profiles.filter((profile) => profile.level >= 80).length,
    }), [profiles, users]);

    useEffect(() => {
        void loadAccess();
    }, []);

    const loadAccess = async () => {
        setLoading(true);
        try {
            const data = await accessService.getAccessOverview();
            setProfiles(data.profiles);
            setUsers(data.users);
            setUserForm((current) => ({
                ...current,
                profileId: current.profileId || data.profiles.find((profile) => profile.code === 'support')?.id || data.profiles[0]?.id || '',
            }));
        } catch (error) {
            console.error('Error loading access management', error);
            alert(getErrorMessage(error));
        } finally {
            setLoading(false);
        }
    };

    const resetProfileForm = () => {
        setEditingProfile(null);
        setProfileForm(defaultProfileForm);
    };

    const resetUserForm = () => {
        setEditingUser(null);
        setUserForm({
            ...defaultUserForm,
            profileId: activeProfiles.find((profile) => profile.code === 'support')?.id || activeProfiles[0]?.id || '',
        });
    };

    const handleEditProfile = (profile: CloudAdminProfile) => {
        setEditingProfile(profile);
        setProfileForm({
            code: profile.code,
            name: profile.name,
            description: profile.description || '',
            level: profile.level,
            permissions: { ...emptyPermissions, ...(profile.permissions || {}) },
            is_active: profile.is_active,
        });
        setActiveTab('profiles');
    };

    const handleEditUser = (user: CloudAdminUser) => {
        setEditingUser(user);
        setUserForm({
            email: user.email,
            fullName: user.full_name,
            phone: user.phone || '',
            profileId: user.profile_id || activeProfiles[0]?.id || '',
            status: user.status,
        });
        setActiveTab('users');
    };

    const saveProfile = async (event: React.FormEvent) => {
        event.preventDefault();
        setSaving(true);
        try {
            if (editingProfile) {
                await accessService.updateProfile(editingProfile.id, profileForm);
            } else {
                await accessService.createProfile(profileForm);
            }
            resetProfileForm();
            await loadAccess();
        } catch (error) {
            console.error('Error saving profile', error);
            alert(getErrorMessage(error));
        } finally {
            setSaving(false);
        }
    };

    const saveUser = async (event: React.FormEvent) => {
        event.preventDefault();
        setSaving(true);
        setUserNotice(null);
        try {
            if (editingUser) {
                await accessService.updateCloudAdminUser(editingUser.id, userForm);
            } else {
                const result = await accessService.createCloudAdminUser(userForm);
                if (result.authLinkType === 'linked_existing') {
                    setUserNotice({
                        title: 'Usuario vinculado',
                        message: 'El email ya existía en Auth; se vinculó al perfil Cloud-Admin sin cambiar su clave actual.',
                    });
                } else {
                    setUserNotice({
                        title: 'Usuario creado',
                        message: 'Comparte esta clave temporal para el primer acceso.',
                        tempPassword: result.tempPassword,
                    });
                }
            }
            resetUserForm();
            await loadAccess();
        } catch (error) {
            console.error('Error saving cloud admin user', error);
            alert(getErrorMessage(error));
        } finally {
            setSaving(false);
        }
    };

    const deleteProfile = async (profile: CloudAdminProfile) => {
        if (profile.is_system) {
            alert('Los perfiles del sistema no se eliminan; puedes desactivarlos si no deben usarse.');
            return;
        }
        if (!confirm(`Eliminar el perfil ${profile.name}?`)) return;
        setSaving(true);
        try {
            await accessService.deleteProfile(profile.id);
            await loadAccess();
        } catch (error) {
            console.error('Error deleting profile', error);
            alert(getErrorMessage(error));
        } finally {
            setSaving(false);
        }
    };

    const deleteUser = async (user: CloudAdminUser) => {
        if (!confirm(`Eliminar el acceso Cloud-Admin de ${user.email}? Si el usuario fue creado desde este módulo también se eliminará su Auth; si ya existía en ERP solo se desvincula de Cloud-Admin.`)) return;
        setSaving(true);
        try {
            await accessService.deleteCloudAdminUser(user);
            await loadAccess();
        } catch (error) {
            console.error('Error deleting cloud admin user', error);
            alert(getErrorMessage(error));
        } finally {
            setSaving(false);
        }
    };

    const togglePermission = (key: keyof CloudAdminPermissions) => {
        setProfileForm((current) => ({
            ...current,
            permissions: {
                ...current.permissions,
                [key]: !current.permissions[key],
            },
        }));
    };

    const copyPassword = async () => {
        if (!userNotice?.tempPassword) return;
        await navigator.clipboard.writeText(userNotice.tempPassword);
    };

    return (
        <div className="min-h-full bg-slate-50">
            <div className="border-b border-slate-200 bg-white px-8 py-6">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                        <p className="text-xs font-bold uppercase tracking-[0.24em] text-indigo-600">Seguridad</p>
                        <h2 className="mt-2 text-2xl font-black text-slate-900">Usuarios y perfiles Cloud-Admin</h2>
                        <p className="mt-1 text-sm text-slate-500">Gestiona accesos internos, roles operativos y permisos por módulo.</p>
                    </div>
                    <button
                        type="button"
                        onClick={() => void loadAccess()}
                        className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
                    >
                        {loading ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
                        Actualizar
                    </button>
                </div>
            </div>

            <div className="space-y-6 p-8">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                    <Metric label="Usuarios" value={stats.users} tone="slate" />
                    <Metric label="Activos" value={stats.activeUsers} tone="emerald" />
                    <Metric label="Perfiles" value={stats.profiles} tone="indigo" />
                    <Metric label="Alto acceso" value={stats.highAccess} tone="amber" />
                </div>

                {userNotice ? (
                    <div className="flex flex-col gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 md:flex-row md:items-center md:justify-between">
                        <div>
                            <p className="text-sm font-black text-emerald-800">{userNotice.title}</p>
                            <p className="text-xs text-emerald-700">
                                {userNotice.message}
                                {userNotice.tempPassword ? <> Clave temporal: <span className="font-mono font-bold">{userNotice.tempPassword}</span></> : null}
                            </p>
                        </div>
                        {userNotice.tempPassword ? (
                            <button
                                type="button"
                                onClick={() => void copyPassword()}
                                className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-700"
                            >
                                <Copy size={14} />
                                Copiar clave
                            </button>
                        ) : null}
                    </div>
                ) : null}

                <div className="flex w-full overflow-hidden rounded-lg border border-slate-200 bg-slate-100 p-1 md:w-max">
                    <button
                        type="button"
                        onClick={() => setActiveTab('users')}
                        className={`inline-flex flex-1 items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-bold md:flex-none ${activeTab === 'users' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                    >
                        <Users size={16} />
                        Usuarios
                    </button>
                    <button
                        type="button"
                        onClick={() => setActiveTab('profiles')}
                        className={`inline-flex flex-1 items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-bold md:flex-none ${activeTab === 'profiles' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                    >
                        <UserCog size={16} />
                        Perfiles
                    </button>
                </div>

                {activeTab === 'users' ? (
                    <section className="grid grid-cols-1 gap-6 xl:grid-cols-[420px_1fr]">
                        <form onSubmit={saveUser} className="space-y-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                            <div>
                                <p className="text-sm font-black text-slate-900">{editingUser ? 'Editar usuario' : 'Nuevo usuario'}</p>
                                <p className="mt-1 text-xs text-slate-500">Vincula usuarios Auth con un perfil de Cloud-Admin.</p>
                            </div>
                            <Field label="Nombre">
                                <input required value={userForm.fullName} onChange={(event) => setUserForm({ ...userForm, fullName: event.target.value })} className="input" placeholder="Nombre del usuario" />
                            </Field>
                            <Field label="Email">
                                <input required type="email" disabled={Boolean(editingUser)} value={userForm.email} onChange={(event) => setUserForm({ ...userForm, email: event.target.value })} className="input disabled:bg-slate-100" placeholder="usuario@empresa.com" />
                            </Field>
                            <Field label="Teléfono">
                                <input value={userForm.phone} onChange={(event) => setUserForm({ ...userForm, phone: event.target.value })} className="input" placeholder="Opcional" />
                            </Field>
                            <Field label="Perfil">
                                <select required value={userForm.profileId} onChange={(event) => setUserForm({ ...userForm, profileId: event.target.value })} className="input">
                                    <option value="">Selecciona perfil</option>
                                    {activeProfiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name} · Nivel {profile.level}</option>)}
                                </select>
                            </Field>
                            <Field label="Estado">
                                <select value={userForm.status} onChange={(event) => setUserForm({ ...userForm, status: event.target.value as CloudAdminUserStatus })} className="input">
                                    <option value="active">Activo</option>
                                    <option value="invited">Invitado</option>
                                    <option value="suspended">Suspendido</option>
                                </select>
                            </Field>
                            <div className="flex gap-3 border-t border-slate-100 pt-4">
                                {editingUser ? <button type="button" onClick={resetUserForm} className="btn-secondary">Cancelar</button> : null}
                                <button disabled={saving} type="submit" className="btn-primary">
                                    {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                                    {editingUser ? 'Guardar' : 'Crear'}
                                </button>
                            </div>
                        </form>

                        <AccessTable loading={loading} users={users} onEdit={handleEditUser} onDelete={deleteUser} />
                    </section>
                ) : (
                    <section className="grid grid-cols-1 gap-6 xl:grid-cols-[460px_1fr]">
                        <form onSubmit={saveProfile} className="space-y-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                            <div>
                                <p className="text-sm font-black text-slate-900">{editingProfile ? 'Editar perfil' : 'Nuevo perfil'}</p>
                                <p className="mt-1 text-xs text-slate-500">Define el nivel de acceso y módulos disponibles.</p>
                            </div>
                            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                                <Field label="Código">
                                    <input required disabled={Boolean(editingProfile)} value={profileForm.code} onChange={(event) => setProfileForm({ ...profileForm, code: event.target.value })} className="input disabled:bg-slate-100" placeholder="soporte_n2" />
                                </Field>
                                <Field label="Nivel">
                                    <input required type="number" min={0} max={100} value={profileForm.level} onChange={(event) => setProfileForm({ ...profileForm, level: Number(event.target.value) })} className="input" />
                                </Field>
                            </div>
                            <Field label="Nombre">
                                <input required value={profileForm.name} onChange={(event) => setProfileForm({ ...profileForm, name: event.target.value })} className="input" placeholder="Soporte Nivel 2" />
                            </Field>
                            <Field label="Descripción">
                                <textarea value={profileForm.description} onChange={(event) => setProfileForm({ ...profileForm, description: event.target.value })} className="input min-h-[84px] resize-y" placeholder="Responsabilidad del perfil" />
                            </Field>
                            <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-bold text-slate-700">
                                <input type="checkbox" checked={profileForm.is_active} onChange={(event) => setProfileForm({ ...profileForm, is_active: event.target.checked })} className="h-4 w-4 rounded border-slate-300 text-indigo-600" />
                                Perfil activo
                            </label>
                            <div>
                                <p className="mb-2 text-xs font-black uppercase tracking-wider text-slate-500">Permisos</p>
                                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                    {permissionCatalog.map((permission) => (
                                        <button
                                            key={permission.key}
                                            type="button"
                                            onClick={() => togglePermission(permission.key)}
                                            className={`flex min-h-[68px] items-start gap-3 rounded-lg border px-3 py-2 text-left transition-colors ${profileForm.permissions[permission.key] ? 'border-indigo-200 bg-indigo-50 text-indigo-800' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
                                        >
                                            <span className={`mt-0.5 flex h-5 w-5 items-center justify-center rounded ${profileForm.permissions[permission.key] ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-transparent'}`}>
                                                <Check size={14} />
                                            </span>
                                            <span>
                                                <span className="block text-xs font-black">{permission.label}</span>
                                                <span className="mt-0.5 block text-[11px] leading-snug opacity-80">{permission.description}</span>
                                            </span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div className="flex gap-3 border-t border-slate-100 pt-4">
                                {editingProfile ? <button type="button" onClick={resetProfileForm} className="btn-secondary">Cancelar</button> : null}
                                <button disabled={saving} type="submit" className="btn-primary">
                                    {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                                    {editingProfile ? 'Guardar' : 'Crear'}
                                </button>
                            </div>
                        </form>

                        <ProfileList profiles={profiles} onEdit={handleEditProfile} onDelete={deleteProfile} />
                    </section>
                )}
            </div>
        </div>
    );
};

function Metric({ label, value, tone }: { label: string; value: number; tone: 'slate' | 'emerald' | 'indigo' | 'amber' }) {
    const toneClasses = {
        slate: 'border-slate-200 bg-white text-slate-800',
        emerald: 'border-emerald-200 bg-emerald-50 text-emerald-700',
        indigo: 'border-indigo-200 bg-indigo-50 text-indigo-700',
        amber: 'border-amber-200 bg-amber-50 text-amber-700',
    };
    return (
        <div className={`rounded-lg border px-5 py-4 ${toneClasses[tone]}`}>
            <p className="text-xs font-black uppercase tracking-wider opacity-70">{label}</p>
            <p className="mt-2 text-3xl font-black">{value}</p>
        </div>
    );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <label className="block">
            <span className="mb-1 block text-xs font-black uppercase tracking-wider text-slate-500">{label}</span>
            {children}
        </label>
    );
}

function AccessTable({ loading, users, onEdit, onDelete }: {
    loading: boolean;
    users: CloudAdminUser[];
    onEdit: (user: CloudAdminUser) => void;
    onDelete: (user: CloudAdminUser) => void;
}) {
    if (loading) return <LoadingPanel label="Cargando usuarios..." />;
    return (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
            <table className="min-w-full divide-y divide-slate-100 text-sm">
                <thead className="bg-slate-50 text-xs font-black uppercase tracking-wider text-slate-500">
                    <tr>
                        <th className="px-4 py-3 text-left">Usuario</th>
                        <th className="px-4 py-3 text-left">Perfil</th>
                        <th className="px-4 py-3 text-left">Estado</th>
                        <th className="px-4 py-3 text-right">Acciones</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                    {users.length === 0 ? (
                        <tr><td colSpan={4} className="px-4 py-10 text-center text-slate-500">No hay usuarios registrados.</td></tr>
                    ) : users.map((user) => (
                        <tr key={user.id} className="hover:bg-slate-50">
                            <td className="px-4 py-3">
                                <p className="font-black text-slate-800">{user.full_name}</p>
                                <p className="text-xs text-slate-500">{user.email}</p>
                            </td>
                            <td className="px-4 py-3">
                                <p className="font-bold text-slate-700">{user.profile?.name || 'Sin perfil'}</p>
                                <p className="text-xs text-slate-400">Nivel {user.profile?.level ?? 'N/D'}</p>
                            </td>
                            <td className="px-4 py-3">
                                <span className={`rounded-full px-3 py-1 text-xs font-black uppercase ${statusStyles[user.status]}`}>{user.status}</span>
                            </td>
                            <td className="px-4 py-3">
                                <div className="flex justify-end gap-2">
                                    <button type="button" onClick={() => onEdit(user)} className="icon-btn" title="Editar usuario"><UserCog size={16} /></button>
                                    <button type="button" onClick={() => void onDelete(user)} className="icon-btn text-rose-600" title="Eliminar usuario"><Trash2 size={16} /></button>
                                </div>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function ProfileList({ profiles, onEdit, onDelete }: {
    profiles: CloudAdminProfile[];
    onEdit: (profile: CloudAdminProfile) => void;
    onDelete: (profile: CloudAdminProfile) => void;
}) {
    return (
        <div className="grid grid-cols-1 gap-4 2xl:grid-cols-2">
            {profiles.map((profile) => {
                const enabled = permissionCatalog.filter((permission) => profile.permissions?.[permission.key]);
                return (
                    <article key={profile.id} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <div className="flex flex-wrap items-center gap-2">
                                    <h3 className="font-black text-slate-900">{profile.name}</h3>
                                    {profile.is_system ? <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-black uppercase text-slate-500">Sistema</span> : null}
                                    {!profile.is_active ? <span className="rounded-full bg-rose-100 px-2 py-1 text-[10px] font-black uppercase text-rose-600">Inactivo</span> : null}
                                </div>
                                <p className="mt-1 text-xs font-mono text-slate-400">{profile.code}</p>
                            </div>
                            <span className="rounded-lg bg-indigo-50 px-3 py-2 text-sm font-black text-indigo-700">Nivel {profile.level}</span>
                        </div>
                        <p className="mt-3 min-h-[40px] text-sm text-slate-600">{profile.description || 'Sin descripción.'}</p>
                        <div className="mt-4 flex flex-wrap gap-2">
                            {enabled.length === 0 ? <span className="text-xs text-slate-400">Sin permisos activos</span> : enabled.map((permission) => (
                                <span key={permission.key} className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-600">{permission.label}</span>
                            ))}
                        </div>
                        <div className="mt-5 flex justify-end gap-2 border-t border-slate-100 pt-4">
                            <button type="button" onClick={() => onEdit(profile)} className="btn-secondary"><UserCog size={16} />Editar</button>
                            <button type="button" onClick={() => void onDelete(profile)} className="btn-danger" disabled={profile.is_system}><Trash2 size={16} />Eliminar</button>
                        </div>
                    </article>
                );
            })}
        </div>
    );
}

function LoadingPanel({ label }: { label: string }) {
    return (
        <div className="flex min-h-[240px] items-center justify-center gap-3 rounded-lg border border-slate-200 bg-white text-sm font-bold text-slate-500">
            <Loader2 size={18} className="animate-spin text-indigo-500" />
            {label}
        </div>
    );
}

function getErrorMessage(error: unknown) {
    if (error instanceof Error) return error.message;
    if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') return error.message;
    return 'Error inesperado gestionando accesos.';
}
