import CredentialsProvider from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import prisma from './db';

export const authOptions = {
    providers: [
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
                };
            }
        })
    ],
    session: {
        strategy: 'jwt',
    },
    callbacks: {
        async jwt({ token, user }) {
            if (user) {
                token.id = user.id;
            }
            return token;
        },
        async session({ session, token }) {
            if (session.user) {
                session.user.id = token.id;
            }
            return session;
        }
    },
    pages: {
        signIn: '/login',
    },
};
