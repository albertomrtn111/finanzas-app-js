import CredentialsProvider from 'next-auth/providers/credentials';
import GoogleProvider from 'next-auth/providers/google';
import bcrypt from 'bcryptjs';
import prisma from './db';

export const authOptions = {
    providers: [
        GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID ?? '',
            clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
        }),
        CredentialsProvider({
            name: 'credentials',
            credentials: {
                email: { label: 'Email', type: 'email' },
                password: { label: 'Contraseña', type: 'password' }
            },
            async authorize(credentials) {
                if (!credentials?.email || !credentials?.password) {
                    throw new Error('Email y contraseña son obligatorios');
                }

                const user = await prisma.user.findUnique({
                    where: { email: credentials.email.toLowerCase().trim() }
                });

                if (!user) {
                    throw new Error('No existe una cuenta con este email');
                }

                // Check if this is a Google-only user (no password)
                if (!user.password_hash) {
                    throw new Error('Esta cuenta usa inicio de sesión con Google');
                }

                const isValid = await bcrypt.compare(credentials.password, user.password_hash);

                if (!isValid) {
                    throw new Error('Contraseña incorrecta');
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
                    let dbUser = await prisma.user.findUnique({
                        where: { email: user.email }
                    });

                    if (!dbUser) {
                        // Create new user for Google OAuth
                        // Generate name from profile or email
                        const userName = profile?.name
                            || profile?.given_name
                            || user.name
                            || user.email.split('@')[0];

                        dbUser = await prisma.user.create({
                            data: {
                                email: user.email,
                                name: userName,
                                google_sub: account.providerAccountId,
                                password_hash: null, // OAuth users don't have password
                                onboarding_step: 0,
                                created_at: new Date(),
                                last_login_at: new Date(),
                            }
                        });
                        console.log('Created new Google user:', dbUser.id);
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
            }

            // Handle session update (e.g., after profile edit)
            if (trigger === 'update' && session) {
                if (session.name) token.name = session.name;
            }

            return token;
        },
        async session({ session, token }) {
            if (session.user) {
                session.user.id = token.id;
                session.user.name = token.name;
                session.user.onboardingStep = token.onboardingStep;
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
