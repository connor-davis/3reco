import { Route, Routes } from '@solidjs/router';

import AuthGuard from './guards/authGuard';
import Authentication from './pages/authentication/authentication';
import Dashboard from './pages/dashboard/dashboard';
import Materials from './pages/materials/materials';
import Root from './pages/root/root';
import Stock from './pages/stock/stock';

function App() {
  return (
    <div class="w-screen h-screen bg-gray-100 dark:bg-gray-900 select-none">
      <div className="flex flex-col w-full h-full">
        <AuthGuard>
          <Routes>
            <Route path="/auth" component={Authentication} />
            <Route path="/" component={Root}>
              <Route path="/" element={Dashboard} />
              <Route path="/stock" element={Stock} />
              <Route path="/materials" element={Materials} />
            </Route>
          </Routes>
        </AuthGuard>
      </div>
    </div>
  );
}

export default App;
