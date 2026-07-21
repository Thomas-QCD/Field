import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Loader, Center } from '@mantine/core';
import { FieldAppShell } from './components/AppShell';
import { CurrentUserProvider, useCurrentUser } from './context/CurrentUserContext';
import { AddressesPage } from './pages/AddressesPage';
import { ContactsPage } from './pages/ContactsPage';
import { TasksPage } from './pages/TasksPage';

function HomeRedirect() {
	const { user, loading } = useCurrentUser();

	if (loading) {
		return (
			<Center py='xl'>
				<Loader size='sm' />
			</Center>
		);
	}

	if (user?.role === 'crew') {
		return <Navigate to='/my-tasks' replace />;
	}
	return <Navigate to='/tasks' replace />;
}

export default function App() {
	return (
		<BrowserRouter>
			<CurrentUserProvider>
				<Routes>
					<Route element={<FieldAppShell />}>
						<Route path='/' element={<HomeRedirect />} />
						<Route path='/tasks' element={<TasksPage mode='all' />} />
						<Route path='/my-tasks' element={<TasksPage mode='mine' />} />
						<Route path='/contacts' element={<ContactsPage />} />
						<Route path='/addresses' element={<AddressesPage />} />
						<Route path='*' element={<Navigate to='/' replace />} />
					</Route>
				</Routes>
			</CurrentUserProvider>
		</BrowserRouter>
	);
}
