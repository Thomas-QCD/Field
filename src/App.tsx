import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Loader, Center } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { AuthRoot } from './auth/AuthRoot';
import { MobileAuthGate } from './auth/MobileAuthGate';
import { FieldAppShell } from './components/AppShell';
import { CurrentUserProvider, useCurrentUser } from './context/CurrentUserContext';
import { AG_GRID_MOBILE_MQ } from './agGridDefaults';
import { DocumentTitle } from './documentTitle';
import { useDeliveryMode } from './deliveryMode';
import { NotificationTapListener } from './notifications/NotificationTapListener';
import { AddressesPage } from './pages/AddressesPage';
import { ContactsPage } from './pages/ContactsPage';
import { CrewMapPage } from './pages/CrewMapPage';
import { MorePage } from './pages/MorePage';
import { NotificationsPage } from './pages/NotificationsPage';
import { DeliveryPage } from './pages/DeliveryPage';
import { TasksPage } from './pages/TasksPage';
import { CompleteTaskPage } from './pages/CompleteTaskPage';
import { DeliverTaskPage } from './pages/DeliverTaskPage';
import { TaskViewPage } from './pages/TaskViewPage';
import { UsersPage } from './pages/UsersPage';

function HomeRedirect() {
	const { user, loading } = useCurrentUser();
	const [deliveryMode] = useDeliveryMode();

	if (loading) {
		return (
			<Center py='xl'>
				<Loader size='sm' />
			</Center>
		);
	}

	if (deliveryMode) {
		return <Navigate to='/delivery' replace />;
	}
	if (user?.role === 'crew') {
		return <Navigate to='/my-tasks' replace />;
	}
	return <Navigate to='/tasks' replace />;
}

/** Desktop keeps the AG Grid delivery list; mobile uses the crew card UI. */
function DeliveryRoute() {
	const isMobile = useMediaQuery(AG_GRID_MOBILE_MQ);
	if (isMobile) return <DeliveryPage />;
	return <TasksPage mode='delivery' />;
}

export default function App() {
	return (
		<BrowserRouter>
			<DocumentTitle />
			<NotificationTapListener />
			<AuthRoot>
				<CurrentUserProvider>
					<MobileAuthGate>
						<Routes>
							<Route element={<FieldAppShell />}>
								<Route path='/' element={<HomeRedirect />} />
								<Route path='/tasks' element={<TasksPage mode='all' />} />
								<Route path='/my-tasks' element={<TasksPage mode='mine' />} />
								<Route path='/delivery' element={<DeliveryRoute />} />
								<Route
									path='/task/:taskId/complete'
									element={<CompleteTaskPage />}
								/>
								<Route
									path='/task/:taskId/deliver'
									element={<DeliverTaskPage />}
								/>
								<Route path='/task/:taskId' element={<TaskViewPage />} />
								<Route path='/contacts' element={<ContactsPage />} />
								<Route path='/addresses' element={<AddressesPage />} />
								<Route path='/users' element={<UsersPage />} />
								<Route path='/crew-map' element={<CrewMapPage />} />
								<Route path='/more' element={<MorePage />} />
								<Route
									path='/notifications'
									element={<NotificationsPage />}
								/>
								<Route path='*' element={<Navigate to='/' replace />} />
							</Route>
						</Routes>
					</MobileAuthGate>
				</CurrentUserProvider>
			</AuthRoot>
		</BrowserRouter>
	);
}
