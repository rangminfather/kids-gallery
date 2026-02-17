import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // ✅ /manage만 별도로 다루기
  if (!pathname.startsWith("/manage")) {
    return NextResponse.next();
  }

  // 지금은 통과만 (로그인 체크는 layout에서)
  return NextResponse.next();
}

export const config = {
  matcher: ["/manage/:path*"],
};
