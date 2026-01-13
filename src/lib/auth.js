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

                if (!user || !user.password_hash) {
                    throw new Error('Credenciales inválidas');
                }

                const isValid = await bcrypt.compare(credentials.password, user.password_hash);

                if (!isValid) {
                    throw new Error('Credenciales inválidas');
                }

                // Actualizar último login
                await prisma.user.update({
                    where: { id: user.id },
                    data: { last_login_at: new Date() }
                });

                return {
                    id: user.id.toString(),
                    email: user.email,
                    name: user.name,
                };
            }
        })
    ],
    session: {
        strategy: 'jwt',
    },
    callbacks: {
        async signIn({ user, account }) {
            // Handle Google OAuth - find or create user
            if (account?.provider === 'google') {
                try {
                    let dbUser = await prisma.user.findUnique({
                        where: { email: user.email }
                    });

                    if (!dbUser) {
                        // Create new user for Google OAuth
                        dbUser = await prisma.user.create({
                            data: {
                                email: user.email,
                                name: user.name,
                                google_sub: account.providerAccountId,
                                created_at: new Date(),
                                last_login_at: new Date(),
                            }
                        });
                    } else {
                        // Update google_sub if not set, and update last_login
                        await prisma.user.update({
                            where: { id: dbUser.id },
                            data: {
                                name: dbUser.name ? undefined : user.name, // Save name if missing
                                google_sub: dbUser.google_sub || account.providerAccountId,
                                last_login_at: new Date(),
                            }
                        });
                    }

                    // Store the DB user id for the jwt callback
                    user.id = dbUser.id.toString();
                    user.name = dbUser.name || user.name;
                } catch (error) {
                    console.error('Error in Google signIn callback:', error);
                    return false;
                }
            }
            return true;
        },
        async jwt({ token, user }) {
            if (user) {
                token.id = user.id;
                token.name = user.name;
            }
            return token;
        },
        async session({ session, token }) {
            if (session.user) {
                session.user.id = token.id;
                session.user.name = token.name;
            }
            return session;
        }
    },
    pages: {
        signIn: '/login',
    },
};
