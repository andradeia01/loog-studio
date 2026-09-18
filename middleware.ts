import { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    /**
     * roda em todas rotas exceto:
     *  - _next/static, _next/image, favicon, brand/, templates/, api/upload
     *  - api routes que precisam validar sozinhas
     */
    "/((?!_next/static|_next/image|favicon.ico|brand|templates|icon\\.png|api/upload).*)",
  ],
};
