import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";

/**
 * Middleware que:
 *  1) Renova a sessão do Supabase a cada request (cookies são atualizados);
 *  2) Redireciona não-logados / não-aprovados para as telas corretas.
 *
 * Rotas:
 *   /studio        → precisa logar + estar aprovado
 *   /admin/*       → precisa logar + role='admin'
 *   /login, /signup, /pending, /rejected → públicas
 *   /              → pública
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  // Sem Supabase config: deixa passar (modo dev sem auth).
  if (!url || !key) return response;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // Refresh session
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isProtected =
    path.startsWith("/studio") || path.startsWith("/admin") || path.startsWith("/api/generate");
  const isAuthPage =
    path === "/login" || path === "/signup" || path === "/pending" || path === "/rejected";

  if (!user && isProtected) {
    const to = request.nextUrl.clone();
    to.pathname = "/login";
    to.searchParams.set("redirect", path);
    return NextResponse.redirect(to);
  }

  if (user && (isProtected || isAuthPage)) {
    // fetch profile status
    const { data: profile } = await supabase
      .from("profiles")
      .select("role, status")
      .eq("id", user.id)
      .maybeSingle();

    // Se logado e na tela de login/signup, manda pro destino certo
    if (isAuthPage && profile) {
      const to = request.nextUrl.clone();
      to.pathname =
        profile.status === "approved"
          ? profile.role === "admin"
            ? "/admin"
            : "/studio"
          : profile.status === "rejected"
            ? "/rejected"
            : "/pending";
      to.search = "";
      // não redireciona se já estamos na tela certa
      if (to.pathname !== path) return NextResponse.redirect(to);
    }

    // Bloqueia /studio se não aprovado
    if (path.startsWith("/studio") && profile?.status !== "approved") {
      const to = request.nextUrl.clone();
      to.pathname = profile?.status === "rejected" ? "/rejected" : "/pending";
      return NextResponse.redirect(to);
    }

    // Bloqueia /admin se não for admin aprovado
    if (path.startsWith("/admin") && (profile?.role !== "admin" || profile?.status !== "approved")) {
      const to = request.nextUrl.clone();
      to.pathname = "/studio";
      return NextResponse.redirect(to);
    }
  }

  return response;
}
