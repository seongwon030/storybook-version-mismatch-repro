import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button } from './Button';

const meta = { component: Button } satisfies Meta<typeof Button>;
export default meta;

export const Primary: StoryObj<typeof meta> = { args: { label: 'Button' } };
