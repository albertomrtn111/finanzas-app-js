import { NextResponse } from 'next/server';

export function badRequest(message) {
    return NextResponse.json({ error: message }, { status: 400 });
}
