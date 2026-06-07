import { NextResponse } from 'next/server';
export const apiError = (message: string, status = 500): NextResponse =>
    NextResponse.json({ error: message }, { status });
export const notFound = (msg = 'Not found'): NextResponse => apiError(msg, 404);
export const forbidden = (msg = 'Forbidden'): NextResponse => apiError(msg, 403);
export const badRequest = (msg: string): NextResponse => apiError(msg, 400);
