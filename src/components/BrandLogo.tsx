type BrandLogoProps = {
	/** Pixel height of the mark; width matches (square). */
	size?: number;
	className?: string;
};

/** Field brand mark used across shell, login, and favicon. */
export function BrandLogo({ size = 32, className }: BrandLogoProps) {
	return (
		<img
			src='/logo.svg'
			alt='Field'
			width={size}
			height={size}
			className={className}
			draggable={false}
			style={{ display: 'block', objectFit: 'contain' }}
		/>
	);
}
