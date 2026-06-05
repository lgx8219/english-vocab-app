import { createServerClient } from "@supabase/ssr";
import type { CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isEmailAllowed } from "@/lib/auth/allowed-users";
import { ADMIN_EMAIL } from "@/lib/auth/constants";

const protectedPaths = ["/", "/dashboard", "/vocabulary", "/practice", "/review", "/settings", "/settings/ai", "/chat", "/admin/allowed-users"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isLogin = pathname === "/login";
  const isSignup = pathname === "/signup";
  const isUnauthorized = pathname === "/unauthorized";
  const isAdminPage = pathname === "/admin/allowed-users";
  const isProtected = protectedPaths.some((path) => pathname === path || (path !== "/" && pathname.startsWith(`${path}/`)));

  if (!isProtected && !isLogin && !isSignup && !isUnauthorized) {
    return NextResponse.next();
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    if (isLogin || isSignup || isUnauthorized) return NextResponse.next();
    return NextResponse.redirect(new URL("/login", request.url));
  }

  let response = NextResponse.next({
    request: {
      headers: request.headers
    }
  });

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: Array<{ name: string; value: string; options: CookieOptions }>) {
        cookiesToSet.forEach(({ name, value, options }) => request.cookies.set(name, value));
        response = NextResponse.next({
          request: {
            headers: request.headers
          }
        });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      }
    }
  });

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    if (isLogin || isSignup) return response;
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const allowed = await isEmailAllowed(user.email);

  if (!allowed) {
    if (isUnauthorized) return response;
    return NextResponse.redirect(new URL("/unauthorized", request.url));
  }

  if (isAdminPage && user.email?.toLowerCase() !== ADMIN_EMAIL) {
    return NextResponse.redirect(new URL("/unauthorized", request.url));
  }

  if (isLogin || isSignup || isUnauthorized) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"]
};
