import { Button, Center, Stack, Text, Title } from '@mantine/core';
import { useMsal } from '@azure/msal-react';
import { InteractionStatus } from '@azure/msal-browser';
import { loginRequest } from './msalConfig';

export function LoginPage() {
	const { instance, inProgress } = useMsal();
	const busy = inProgress !== InteractionStatus.None;

	const onSignIn = () => {
		void instance.loginRedirect(loginRequest);
	};

	return (
		<Center
			mih='100dvh'
			px='md'
			style={{
				background:
					'radial-gradient(ellipse at 20% 0%, var(--color-accent-subtle) 0%, transparent 55%), linear-gradient(165deg, #f0f0f0 0%, #e4e4e4 45%, #ececec 100%)',
			}}
		>
			<Stack gap='lg' maw={400} w='100%' align='stretch'>
				<Stack gap={6}>
					<Title
						order={1}
						fz='2.75rem'
						fw={700}
						style={{
							fontFamily: 'var(--font-display)',
							letterSpacing: '-0.03em',
							color: 'var(--color-text)',
						}}
					>
						Field
					</Title>
					<Text c='dimmed' size='sm'>
						Sign in with your organization account to manage tasks.
					</Text>
				</Stack>
				<Button
					size='md'
					color='brand'
					onClick={onSignIn}
					loading={busy}
					disabled={busy}
				>
					Sign in with Microsoft
				</Button>
			</Stack>
		</Center>
	);
}
