'use client';

import { SessionProvider } from 'next-auth/react';
import { FeedbackProvider } from '@/components/ui';

export default function Providers({ children }) {
    return <SessionProvider><FeedbackProvider>{children}</FeedbackProvider></SessionProvider>;
}
