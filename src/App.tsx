import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Layout } from './components/Layout'
import { Dashboard } from './pages/Dashboard'
import { Tenants } from './pages/Tenants'
import { KillSwitch } from './pages/KillSwitch'
import { Plans } from './pages/Plans'
import { Configuration } from './pages/Configuration'
import { PosApkReleases } from './pages/PosApkReleases'
import SupportCommandCenter from './pages/SupportCommandCenter'

function App() {
    return (
        <HashRouter>
            <Routes>
                <Route path="/" element={<Layout />}>
                    <Route index element={<Dashboard />} />
                    <Route path="tenants" element={<Tenants />} />
                    <Route path="plans" element={<Plans />} />
                    <Route path="pos-apk" element={<PosApkReleases />} />
                    <Route path="support" element={<SupportCommandCenter />} />
                    <Route path="configuracion" element={<Configuration />} />
                    <Route path="kill-switch" element={<KillSwitch />} />
                </Route>
                <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
        </HashRouter>
    )
}

export default App
