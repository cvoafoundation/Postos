import type { ReactNode } from "react";
import { Outlet } from "react-router-dom";
import { PoweredByMoxom } from "./PoweredByMoxom";
export function PublicPageLayout({ children }: { children?: ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col bg-base">
      <div className="public-page-content flex-1 min-w-0">
        {children ?? <Outlet />}
      </div>
      <PoweredByMoxom />
    </div>
  );
}
