import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { FieldAppShell } from './components/AppShell';
import { CurrentUserProvider } from './context/CurrentUserContext';
import { AddressesPage } from './pages/AddressesPage';
import { ContactsPage } from './pages/ContactsPage';
import { TasksPage } from './pages/TasksPage';

export default function App() {
  return (
    <BrowserRouter>
      <CurrentUserProvider>
        <Routes>
          <Route element={<FieldAppShell />}>
            <Route path="/" element={<TasksPage />} />
            <Route path="/contacts" element={<ContactsPage />} />
            <Route path="/addresses" element={<AddressesPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </CurrentUserProvider>
    </BrowserRouter>
  );
}
