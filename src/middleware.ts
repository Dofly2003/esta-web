import { NextResponse, type NextRequest } from "next/server";

// Pemeriksaan cepat di edge: hanya cek ada/tidaknya cookie.
// Verifikasi sesungguhnya (Firebase session cookie) dilakukan di requireUser().
export function middleware(req: NextRequest) {
  if (!req.cookies.get("esta_session")?.value) {
    const url = new URL("/login", req.url);
    url.searchParams.set("next", req.nextUrl.pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ["/dashboard/:path*"] };
