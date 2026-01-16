import { NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';

export async function middleware(request) {
    const { pathname } = request.nextUrl;

    // Skip middleware for these paths - redundant with matcher but good for safety
    const publicPaths = [
        '/login',
        '/register',
        '/api',
        '/_next',
        '/favicon.ico',
        '/manifest.webmanifest',
        '/onboarding'
    ];

    // Check if path is public or is a static file (image, etc)
    if (publicPaths.some(path => pathname.startsWith(path)) || pathname.endsWith('.png')) {
        return NextResponse.next();
    }

    // Get JWT token
    const token = await getToken({
        req: request,
        secret: process.env.NEXTAUTH_SECRET
    });

    // Not authenticated - redirect to login
    if (!token) {
        const loginUrl = new URL('/login', request.url);
        return NextResponse.redirect(loginUrl);
    }

    return NextResponse.next();
}

export const config = {
    matcher: [
        /*
         * Match all request paths except:
         * - api (API routes)
         * - _next/static (static files)
         * - _next/image (image optimization files)
         * - favicon.ico, manifest.webmanifest
         * - standard image extensions (png, jpg, jpeg, svg)
         */
        '/((?!api|_next/static|_next/image|favicon.ico|manifest.webmanifest|.*\\.png$|.*\\.jpg$|.*\\.svg$).*)',
    ],
};
