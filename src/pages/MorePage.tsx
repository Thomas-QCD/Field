import { Navigate } from 'react-router-dom';
import { Box, Text, Title } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { UserSelect } from '../components/UserSelect';

/** Mobile-only settings/account surface (user select, etc.). */
export function MorePage() {
	const isDesktop = useMediaQuery('(min-width: 48em)');

	if (isDesktop) {
		return <Navigate to='/' replace />;
	}

	return (
		<Box className='field-more-page'>
			<Title order={2} mb='lg' style={{ fontFamily: 'var(--font-display)' }}>
				More
			</Title>
			<Text
				fz={11}
				tt='uppercase'
				fw={600}
				c='dimmed'
				mb={6}
				style={{ letterSpacing: '0.04em' }}
			>
				Signed in as
			</Text>
			<UserSelect variant='light' />
		</Box>
	);
}
