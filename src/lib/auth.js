import CredentialsProvider from 'next-auth/providers/credentials';
import GoogleProvider from 'next-auth/providers/google';
import bcrypt from 'bcryptjs';
import prisma from './db';

export const authOptions = {
    providers: [
        ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET ? [GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        })] : []),
        CredentialsProvider({
            name: 'credentials',
            credentials: {
                email: { label: 'Email', type: 'email' },
                password: { label: 'Contraseña', type: 'password' }
            },
            async authorize(credentials) {
                if (!credentials?.email || !credentials?.password) {
                    throw new Error('Credenciales incorrectas');
                }

                const user = await prisma.user.findUnique({
                    where: { email: credentials.email.toLowerCase().trim() }
                });

                if (!user) {
                    throw new Error('Credenciales incorrectas');
                }

                // Check if this is a Google-only user (no password)
                if (!user.password_hash) {
                    throw new Error('Credenciales incorrectas');
                }

                const isValid = await bcrypt.compare(credentials.password, user.password_hash);

                if (!isValid) {
                    throw new Error('Credenciales incorrectas');
                }

                // Update last login
                await prisma.user.update({
                    where: { id: user.id },
                    data: { last_login_at: new Date() }
                });

                return {
                    id: user.id.toString(),
                    email: user.email,
                    name: user.name || user.email.split('@')[0], // Fallback to email prefix
                    onboardingStep: user.onboarding_step,
                    accountMode: user.account_mode,
                };
            }
        })
    ],
    session: {
        strategy: 'jwt',
    },
    callbacks: {
        async signIn({ user, account, profile }) {
            // Handle Google OAuth - find or create user
            if (account?.provider === 'google') {
                try {
                    if (!user.email || profile?.email_verified !== true) return false;
                    const email = user.email.toLowerCase().trim();
                    let dbUser = await prisma.user.findUnique({ where: { google_sub: account.providerAccountId } });
                    if (dbUser && dbUser.email !== email) return false;
                    if (!dbUser) dbUser = await prisma.user.findUnique({ where: { email } });
                    if (dbUser?.google_sub && dbUser.google_sub !== account.providerAccountId) return false;

                    if (!dbUser) {
                        // Create new user for Google OAuth
                        // Generate name from profile or email
                        const userName = profile?.name
                            || profile?.given_name
                            || user.name
                            || user.email.split('@')[0];

                        dbUser = await prisma.user.create({
                            data: {
                                email,
                                name: userName,
                                google_sub: account.providerAccountId,
                                password_hash: null, // OAuth users don't have password
                                onboarding_step: 0,
                                account_mode: 'UNSET',
                                created_at: new Date(),
                                last_login_at: new Date(),
                            }
                        });
                    } else {
                        // User exists - update google_sub if not set, update last_login
                        // Only update name if it's currently null/empty
                        const updates = {
                            last_login_at: new Date(),
                        };

                        // Link Google account if not already linked
                        if (!dbUser.google_sub) {
                            updates.google_sub = account.providerAccountId;
                        }

                        // Fill in name if missing
                        if (!dbUser.name) {
                            updates.name = profile?.name
                                || profile?.given_name
                                || user.name
                                || user.email.split('@')[0];
                        }

                        await prisma.user.update({
                            where: { id: dbUser.id },
                            data: updates
                        });
                    }

                    // Store the DB user id for the jwt callback
                    user.id = dbUser.id.toString();
                    user.name = dbUser.name || user.name;
                    user.onboardingStep = dbUser.onboarding_step;
                    user.accountMode = dbUser.account_mode;

                } catch (error) {
                    console.error('Error in Google signIn callback:', error);
                    // Return false to deny access with a clear error
                    return false;
                }
            }
            return true;
        },
        async jwt({ token, user, trigger, session }) {
            if (user) {
                token.id = user.id;
                token.name = user.name;
                token.onboardingStep = user.onboardingStep;
                token.accountMode = user.accountMode;
            }

            // Handle session update (e.g., after profile edit)
            if (trigger === 'update' && session && token.id) {
                const dbUser = await prisma.user.findUnique({ where: { id: Number(token.id) }, select: { name: true, onboarding_step: true, account_mode: true } });
                if (dbUser) {
                    token.name = dbUser.name;
                    token.onboardingStep = dbUser.onboarding_step;
                    token.accountMode = dbUser.account_mode;
                }
            }

            return token;
        },
        async session({ session, token }) {
            if (session.user) {
                session.user.id = token.id;
                session.user.name = token.name;
                session.user.onboardingStep = token.onboardingStep;
                session.user.accountMode = token.accountMode;
            }
            return session;
        }
    },
    pages: {
        signIn: '/login',
        error: '/login', // Redirect errors to login page
    },
    debug: process.env.NODE_ENV === 'development',
};
