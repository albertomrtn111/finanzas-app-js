import CredentialsProvider from 'next-auth/providers/credentials';
import GoogleProvider from 'next-auth/providers/google';
import bcrypt from 'bcryptjs';
import prisma from './db';
import { LIMITS, clientIp, hit, isLimited, minutesText, reset } from './rateLimit';

const INVALID_CREDENTIALS = 'Email o contraseña incorrectos';
const REVOKED = 'Sesión revocada';
// Hash de una contraseña que nadie usa: se compara igualmente cuando el email no existe
// para que la respuesta tarde lo mismo y no delate qué emails tienen cuenta.
const DUMMY_HASH = '$2b$12$.lYHxuQwFRwD3DOC2Uaya.FRa3ROF0dAKArFtLT4LQ35Uk2PzfpxW';

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
            async authorize(credentials, req) {
                const email = String(credentials?.email || '').toLowerCase().trim();
                const password = String(credentials?.password || '');
                if (!email || !password) throw new Error(INVALID_CREDENTIALS);

                const ip = clientIp(req?.headers);
                const limits = [
                    [`login:${email}:${ip}`, LIMITS.loginEmailIp],
                    [`login:${email}`, LIMITS.loginEmail],
                    [`login-ip:${ip}`, LIMITS.loginIp],
                ];
                const blocked = limits.map(([key, limit]) => isLimited(key, limit)).find(result => result.limited);
                if (blocked) throw new Error(`Demasiados intentos. Vuelve a probar dentro de ${minutesText(blocked.retryAfterMs)}.`);

                const user = await prisma.user.findUnique({ where: { email } });
                // Las cuentas creadas con Google no tienen contraseña.
                const valid = await bcrypt.compare(password, user?.password_hash || DUMMY_HASH);
                if (!user?.password_hash || !valid) {
                    for (const [key, limit] of limits) hit(key, limit);
                    throw new Error(INVALID_CREDENTIALS);
                }
                reset(`login:${email}:${ip}`);

                await prisma.user.update({
                    where: { id: user.id },
                    data: { last_login_at: new Date() }
                });

                return {
                    id: user.id.toString(),
                    email: user.email,
                    name: user.name || user.email.split('@')[0],
                    onboardingStep: user.onboarding_step,
                    accountMode: user.account_mode,
                    sessionVersion: user.session_version,
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

                        // Vincular Google si aún no lo está. Google acaba de demostrar que el email es de quien entra;
                        // la contraseña existente la pudo poner cualquiera que registrase antes ese email, así que se
                        // borra y se cierran las demás sesiones. Desde Mi Perfil se puede crear una contraseña nueva.
                        if (!dbUser.google_sub) {
                            updates.google_sub = account.providerAccountId;
                            if (dbUser.password_hash) {
                                updates.password_hash = null;
                                updates.session_version = { increment: 1 };
                            }
                        }

                        // Fill in name if missing
                        if (!dbUser.name) {
                            updates.name = profile?.name
                                || profile?.given_name
                                || user.name
                                || user.email.split('@')[0];
                        }

                        dbUser = await prisma.user.update({
                            where: { id: dbUser.id },
                            data: updates
                        });
                    }

                    // Store the DB user id for the jwt callback
                    user.id = dbUser.id.toString();
                    user.name = dbUser.name || user.name;
                    user.onboardingStep = dbUser.onboarding_step;
                    user.accountMode = dbUser.account_mode;
                    user.sessionVersion = dbUser.session_version;

                } catch (error) {
                    console.error('Error in Google signIn callback:', error);
                    // Return false to deny access with a clear error
                    return false;
                }
            }
            return true;
        },
        async jwt({ token, user }) {
            if (user) {
                token.id = user.id;
                token.name = user.name;
                token.onboardingStep = user.onboardingStep;
                token.accountMode = user.accountMode;
                token.sessionVersion = user.sessionVersion ?? 0;
                return token;
            }
            if (!token.id) return token;

            // En cada lectura de la sesión se refrescan los datos desde la base de datos: así el tipo de
            // cuenta, el nombre y el paso del onboarding nunca se quedan desfasados, y una sesión deja de
            // valer en cuanto se cambia la contraseña o se cierran todas las sesiones.
            const dbUser = await prisma.user.findUnique({
                where: { id: Number(token.id) },
                select: { name: true, onboarding_step: true, account_mode: true, session_version: true },
            });
            if (!dbUser || dbUser.session_version !== (token.sessionVersion ?? 0)) throw new Error(REVOKED);
            token.name = dbUser.name || token.name;
            token.onboardingStep = dbUser.onboarding_step;
            token.accountMode = dbUser.account_mode;
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
    logger: {
        // Una sesión revocada no es un fallo: NextAuth la descarta y el usuario vuelve a iniciar sesión.
        error(code, metadata) {
            if (metadata?.message === REVOKED || metadata?.error?.message === REVOKED) return;
            console.error(`[next-auth][error][${code}]`, metadata);
        },
    },
    debug: process.env.NODE_ENV === 'development',
};
